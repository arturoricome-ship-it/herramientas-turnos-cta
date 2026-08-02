import {
  buildSnapshot,prepareSnapshot,snapshotRecordCount,restoreSnapshot,describeChange
} from './firebase-storage-codec.js?v=1';
import {installUi,setFileStatus,setLastChange} from './firebase-storage-ui.js?v=1';

const SCHEMA=2;
const VERSION_FOLDER='file-sync/versions';
const LEGACY_PATH='file-sync/indexeddb-snapshot-v1.json';
const LOCAL_POLL_MS=4000;
const DEVICE_KEY='herramientas_storage_device_id_v1';
const HASH_KEY='herramientas_storage_last_hash_v2';
const REVISION_KEY='herramientas_storage_last_revision_v2';
const CHANGE_KEY='herramientas_storage_last_change_v2';

let fb=null,user=null,timer=null,unsubscribe=null,queue=Promise.resolve(),busy=false,applying=false;
let lastHash='',lastRevision=0,lastPath='',baseline=null,candidate=null;

const errorText=error=>String(error&&(error.code||error.message)||error||'Error desconocido');
function deviceId(){
  try{
    let value=localStorage.getItem(DEVICE_KEY);
    if(!value){
      value=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(DEVICE_KEY,value);
    }
    return value;
  }catch(_){return `device-${Date.now()}`;}
}
function deviceLabel(){
  const ua=navigator.userAgent||'';
  if(/iPad|Tablet|SM-T|Tab/i.test(ua)) return 'Tablet';
  return /Android|iPhone|Mobile/i.test(ua)?'Móvil':'Ordenador';
}
function key(base,current=user){return `${base}:${current?.uid||'sin-usuario'}`;}
function read(keyName,fallback=''){try{return localStorage.getItem(keyName)??fallback;}catch(_){return fallback;}}
function write(keyName,value){try{localStorage.setItem(keyName,String(value));}catch(_){}}
function device(){return {id:deviceId(),label:deviceLabel()};}
function generic(text,type='sync'){
  const current=device();
  return {type,text,deviceId:current.id,deviceLabel:current.label,atClient:new Date().toISOString()};
}
function rememberChange(change,current=user){
  if(!change?.text) return;
  write(key(CHANGE_KEY,current),JSON.stringify(change));
  setLastChange(change,deviceId());
}
function restoreChange(current){
  try{
    const value=JSON.parse(read(key(CHANGE_KEY,current),'null'));
    if(value) setLastChange(value,deviceId());
  }catch(_){}
}
function firebaseVersion(){
  const source=[...document.scripts].map(script=>`${script.src||''}\n${script.textContent||''}`).join('\n');
  return source.match(/https:\/\/www\.gstatic\.com\/firebasejs\/([^/]+)\/firebase-app\.js/)?.[1]||'';
}
async function loadFirebase(){
  const version=firebaseVersion();
  if(!version) throw new Error('No se ha podido detectar la versión de Firebase.');
  const base=`https://www.gstatic.com/firebasejs/${version}`;
  const [appSdk,authSdk,storageSdk,firestoreSdk]=await Promise.all([
    import(`${base}/firebase-app.js`),import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-storage.js`),import(`${base}/firebase-firestore.js`)
  ]);
  const app=appSdk.getApp();
  return {
    auth:authSdk.getAuth(app),onAuth:authSdk.onAuthStateChanged,
    storage:storageSdk.getStorage(app),ref:storageSdk.ref,getMetadata:storageSdk.getMetadata,
    upload:storageSdk.uploadBytes,getBlob:storageSdk.getBlob,remove:storageSdk.deleteObject,
    db:firestoreSdk.getFirestore(app),doc:firestoreSdk.doc,getDoc:firestoreSdk.getDoc,
    listen:firestoreSdk.onSnapshot,transaction:firestoreSdk.runTransaction,
    serverTimestamp:firestoreSdk.serverTimestamp
  };
}
const storageRef=(current,path)=>fb.ref(fb.storage,`users/${current.uid}/${path}`);
const signalRef=current=>fb.doc(fb.db,'users',current.uid,'fileSync','status');
async function metadata(current,path){
  try{return await fb.getMetadata(storageRef(current,path));}
  catch(error){if(String(error?.code)==='storage/object-not-found') return null;throw error;}
}
async function download(current,path){
  return JSON.parse(await (await fb.getBlob(storageRef(current,path))).text());
}
function saveState(current,{hash,revision,path}){
  if(hash){lastHash=hash;write(key(HASH_KEY,current),hash);}
  if(revision!==undefined){lastRevision=Number(revision)||0;write(key(REVISION_KEY,current),lastRevision);}
  if(path) lastPath=path;
}
function versionPath(){
  const token=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${VERSION_FOLDER}/${Date.now()}-${deviceId()}-${token}.json`;
}
async function publish(current,snapshot,prepared,change){
  const path=versionPath(),count=snapshotRecordCount(snapshot);
  setFileStatus('subiendo cambios…','work');
  await fb.upload(storageRef(current,path),new Blob([prepared.json],{type:'application/json'}),{
    contentType:'application/json',
    customMetadata:{schema:String(SCHEMA),hash:prepared.hash,deviceId:deviceId(),recordCount:String(count),updatedAt:new Date().toISOString()}
  });
  let previous='',revision=0;
  try{
    await fb.transaction(fb.db,async transaction=>{
      const reference=signalRef(current),old=await transaction.get(reference),data=old.exists()?old.data():{};
      previous=data.storagePath||'';
      revision=(Number(data.revision)||0)+1;
      transaction.set(reference,{
        schema:SCHEMA,revision,hash:prepared.hash,storagePath:path,recordCount:count,
        deviceId:deviceId(),deviceLabel:deviceLabel(),lastChange:change,
        updatedAtClient:new Date().toISOString(),updatedAt:fb.serverTimestamp()
      },{merge:true});
    });
  }catch(error){
    try{await fb.remove(storageRef(current,path));}catch(_){}
    throw error;
  }
  saveState(current,{hash:prepared.hash,revision,path});
  baseline=snapshot;
  candidate=null;
  rememberChange(change,current);
  setFileStatus(`${count} registros sincronizados`,'ok');
  if(previous&&previous!==path&&previous.startsWith(`${VERSION_FOLDER}/`)){
    setTimeout(()=>fb.remove(storageRef(current,previous)).catch(()=>{}),60000);
  }
}
async function applySignal(current,data,reason='remote'){
  if(!data?.storagePath||!data?.hash) return;
  rememberChange(data.lastChange||generic('Cambio recibido desde otro dispositivo'),current);
  const local=await buildSnapshot(deviceId()),prepared=await prepareSnapshot(local);
  if(prepared.hash===data.hash){
    saveState(current,{hash:data.hash,revision:data.revision,path:data.storagePath});
    baseline=local;
    setFileStatus(`${snapshotRecordCount(local)} registros sincronizados`,'ok');
    return;
  }
  setFileStatus('descargando cambios…','work');
  applying=true;
  try{await restoreSnapshot(await download(current,data.storagePath),{replace:true});}
  finally{applying=false;}
  const restored=await buildSnapshot(deviceId()),verified=await prepareSnapshot(restored);
  if(verified.hash!==data.hash) throw new Error('La copia descargada no coincide con la versión anunciada.');
  saveState(current,{hash:data.hash,revision:data.revision,path:data.storagePath});
  baseline=restored;
  candidate=null;
  const count=snapshotRecordCount(restored);
  setFileStatus(`${count} registros sincronizados`,'ok');
  window.dispatchEvent(new CustomEvent('herramientas-storage-synced',{
    detail:{reason,records:count,revision:Number(data.revision)||0,lastChange:data.lastChange||null}
  }));
}
function enqueue(task){
  const run=queue.catch(()=>{}).then(async()=>{
    busy=true;
    try{return await task();}finally{busy=false;}
  });
  queue=run;
  return run;
}
async function migrate(current){
  if(!await metadata(current,LEGACY_PATH)) return false;
  setFileStatus('preparando sincronización en tiempo real…','work');
  applying=true;
  try{await restoreSnapshot(await download(current,LEGACY_PATH),{replace:false});}
  finally{applying=false;}
  const merged=await buildSnapshot(deviceId()),prepared=await prepareSnapshot(merged);
  await publish(current,merged,prepared,generic('Activada la sincronización en tiempo real'));
  return true;
}
async function start(current){
  restoreChange(current);
  lastHash=read(key(HASH_KEY,current),'');
  lastRevision=Number(read(key(REVISION_KEY,current),'0'))||0;
  lastPath='';
  candidate=null;
  baseline=await buildSnapshot(deviceId());
  setFileStatus('comprobando versión actual…','work');
  const reference=signalRef(current),signal=await fb.getDoc(reference);
  if(signal.exists()){
    const data=signal.data();
    rememberChange(data.lastChange||generic('Sincronización disponible'),current);
    await applySignal(current,data,'login');
  }else if(!await migrate(current)){
    const prepared=await prepareSnapshot(baseline),count=snapshotRecordCount(baseline);
    if(count) await publish(current,baseline,prepared,generic('Publicada la copia inicial de archivos','import'));
    else{
      saveState(current,{hash:prepared.hash,revision:0,path:''});
      setFileStatus('todavía no hay Excel o PDF','ok');
    }
  }
  unsubscribe=fb.listen(reference,snapshot=>{
    if(!snapshot.exists()||user?.uid!==current.uid) return;
    const data=snapshot.data(),revision=Number(data.revision)||0;
    rememberChange(data.lastChange||generic('Sincronización actualizada'),current);
    if(data.hash===lastHash&&data.storagePath===lastPath&&revision<=lastRevision) return;
    enqueue(()=>applySignal(current,data,'firestore-realtime')).catch(showError);
  },showError);
  timer=setInterval(()=>{
    if(user?.uid!==current.uid||applying||busy||document.hidden||!navigator.onLine) return;
    enqueue(async()=>{
      const snapshot=await buildSnapshot(deviceId()),prepared=await prepareSnapshot(snapshot);
      if(prepared.hash===lastHash){candidate=null;return;}
      if(candidate?.hash!==prepared.hash){candidate={hash:prepared.hash,snapshot,prepared};return;}
      const change=describeChange(baseline,candidate.snapshot,device());
      await publish(current,candidate.snapshot,candidate.prepared,change);
    }).catch(showError);
  },LOCAL_POLL_MS);
}
function stop(){
  if(timer) clearInterval(timer);
  timer=null;
  try{unsubscribe?.();}catch(_){}
  unsubscribe=null;queue=Promise.resolve();busy=false;applying=false;
  lastHash='';lastRevision=0;lastPath='';baseline=null;candidate=null;
}
function showError(error){
  console.error('[StorageSync]',error);
  setFileStatus(`error: ${errorText(error)}`,'error');
}
async function manualSync(){
  if(!user) return;
  return enqueue(async()=>{
    const snapshot=await buildSnapshot(deviceId()),prepared=await prepareSnapshot(snapshot);
    if(prepared.hash===lastHash){
      setFileStatus(`${snapshotRecordCount(snapshot)} registros sincronizados`,'ok');
      return;
    }
    await publish(user,snapshot,prepared,describeChange(baseline,snapshot,device()));
  });
}
async function initialize(){
  try{
    installUi();
    fb=await loadFirebase();
    fb.onAuth(fb.auth,current=>{
      stop();
      user=current||null;
      if(!current){setFileStatus('inicia sesión con Google');return;}
      enqueue(()=>start(current)).catch(showError);
    });
    addEventListener('online',()=>{
      if(!user) return;
      enqueue(async()=>{
        const signal=await fb.getDoc(signalRef(user));
        if(signal.exists()) await applySignal(user,signal.data(),'online');
      }).catch(showError);
    });
    addEventListener('offline',()=>setFileStatus('sin conexión','error'));
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden||!user||!navigator.onLine) return;
      enqueue(async()=>{
        const signal=await fb.getDoc(signalRef(user));
        if(signal.exists()) await applySignal(user,signal.data(),'visible');
      }).catch(showError);
    });
    window.FirebaseStorageSync={
      syncNow:manualSync,
      status:()=>({user:user?.email||'',syncing:busy,lastSyncedHash:lastHash,lastSignalRevision:lastRevision,lastStoragePath:lastPath})
    };
  }catch(error){showError(error);}
}
document.readyState==='loading'
  ?document.addEventListener('DOMContentLoaded',initialize,{once:true})
  :initialize();
