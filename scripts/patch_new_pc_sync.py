from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: se esperaban 1 coincidencia y hay {count}")
    return text.replace(old, new, 1)


sync_path = Path("firebase-storage-sync.js")
sync = sync_path.read_text(encoding="utf-8")

sync = replace_once(
    sync,
    """    upload:storageSdk.uploadBytes,getBlob:storageSdk.getBlob,remove:storageSdk.deleteObject,""",
    """    upload:storageSdk.uploadBytes,uploadResumable:storageSdk.uploadBytesResumable,\n    getBlob:storageSdk.getBlob,getDownloadURL:storageSdk.getDownloadURL,remove:storageSdk.deleteObject,""",
    "imports de Storage",
)

sync = replace_once(
    sync,
    """async function download(current,path){
  return JSON.parse(await (await fb.getBlob(storageRef(current,path))).text());
}
""",
    """const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function idbResult(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Error de IndexedDB'));
  });
}
async function databaseExists(name){
  if(typeof indexedDB.databases!=='function') return true;
  try{return (await indexedDB.databases()).some(item=>item?.name===name);}catch(_){return true;}
}
async function hoursMapHasData(){
  const name='cta_herramientas_solo_independiente_v2';
  if(!await databaseExists(name)) return false;
  let database;
  try{
    database=await new Promise((resolve,reject)=>{
      const request=indexedDB.open(name);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('No se pudo abrir Horas plantilla'));
    });
    if(!database.objectStoreNames.contains('heavy')) return false;
    const value=await idbResult(database.transaction('heavy','readonly').objectStore('heavy').get('cta_hp_grupo_2026_map'));
    return !!(value&&typeof value==='object'&&Object.keys(value).length);
  }catch(_){return false;}
  finally{try{database?.close();}catch(_){}}
}
async function sharedExcelRecords(){
  const name='herramientas_importaciones_compartidas_v1';
  if(!await databaseExists(name)) return [];
  let database;
  try{
    database=await new Promise((resolve,reject)=>{
      const request=indexedDB.open(name);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||new Error('No se pudo abrir la base común'));
    });
    if(!database.objectStoreNames.contains('files')) return [];
    const rows=await idbResult(database.transaction('files','readonly').objectStore('files').getAll());
    return (rows||[])
      .filter(row=>row&&row.kind==='excel'&&row.data)
      .sort((a,b)=>String(a.updatedAt||'').localeCompare(String(b.updatedAt||'')));
  }catch(_){return [];}
  finally{try{database?.close();}catch(_){}}
}
function installHoursRecovery(){
  const hub=window.HerramientasHub;
  if(!hub||hub.__hoursNewDeviceRecovery||typeof hub.listPending!=='function') return;
  const original=hub.listPending.bind(hub);
  hub.listPending=async function(kind,consumer){
    const pending=await original(kind,consumer);
    if(kind!=='excel'||consumer!=='horas'||pending.length) return pending;
    if(await hoursMapHasData()) return pending;
    return sharedExcelRecords();
  };
  hub.__hoursNewDeviceRecovery=true;
}
function refreshOpenTools(){
  installHoursRecovery();
  setTimeout(()=>{
    try{window.HerramientasHub?.notifyCurrent?.();}catch(_){}
    try{
      const frame=document.getElementById('frame'),inner=frame?.contentWindow;
      if(!inner||typeof inner._hpEnsureMapLoaded!=='function') return;
      inner._hpMapCache=null;
      inner._hpMapLoadPromise=null;
      Promise.resolve(inner._hpEnsureMapLoaded()).then(()=>{
        try{
          if(inner.document?.body?.classList?.contains('personal-hours')&&typeof inner.abrirHorasPlantilla==='function')
            inner.abrirHorasPlantilla();
        }catch(_){}
      }).catch(()=>{});
    }catch(_){}
  },250);
}
async function fetchTextWithTimeout(url,timeoutMs=180000){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const response=await fetch(url,{cache:'no-store',mode:'cors',signal:controller.signal});
    if(!response.ok) throw new Error(`Descarga HTTP ${response.status}`);
    return await response.text();
  }finally{clearTimeout(timeout);}
}
async function download(current,path){
  const reference=storageRef(current,path);
  let lastError=null;
  if(fb.getDownloadURL){
    for(let attempt=1;attempt<=3;attempt++){
      try{
        const url=await fb.getDownloadURL(reference);
        return JSON.parse(await fetchTextWithTimeout(url));
      }catch(error){
        lastError=error;
        if(attempt<3){
          setFileStatus(`descargando cambios… reintento ${attempt+1}/3`,'work');
          await pause(attempt*1500);
        }
      }
    }
  }
  try{return JSON.parse(await (await fb.getBlob(reference)).text());}
  catch(error){throw lastError||error;}
}
function uploadSnapshotBlob(reference,blob,metadata){
  if(!fb.uploadResumable) return fb.upload(reference,blob,metadata);
  return new Promise((resolve,reject)=>{
    const task=fb.uploadResumable(reference,blob,metadata);
    task.on('state_changed',snapshot=>{
      const total=Number(snapshot.totalBytes)||0,done=Number(snapshot.bytesTransferred)||0;
      if(total) setFileStatus(`subiendo cambios… ${Math.min(100,Math.round(done*100/total))}%`,'work');
    },reject,()=>resolve(task.snapshot));
  });
}
""",
    "descarga resistente y recuperación de Horas plantilla",
)

sync = replace_once(
    sync,
    """  await fb.upload(storageRef(current,path),new Blob([prepared.json],{type:'application/json'}),{
    contentType:'application/json',
    customMetadata:{schema:String(SCHEMA),hash:prepared.hash,deviceId:deviceId(),recordCount:String(count),updatedAt:new Date().toISOString()}
  });""",
    """  await uploadSnapshotBlob(storageRef(current,path),new Blob([prepared.json],{type:'application/json'}),{
    contentType:'application/json',
    customMetadata:{schema:String(SCHEMA),hash:prepared.hash,deviceId:deviceId(),recordCount:String(count),updatedAt:new Date().toISOString()}
  });""",
    "subida reanudable",
)

sync = replace_once(
    sync,
    """  window.dispatchEvent(new CustomEvent('herramientas-storage-synced',{
    detail:{reason,records:count,revision:Number(data.revision)||0,lastChange:data.lastChange||null}
  }));""",
    """  window.dispatchEvent(new CustomEvent('herramientas-storage-synced',{
    detail:{reason,records:count,revision:Number(data.revision)||0,lastChange:data.lastChange||null}
  }));
  refreshOpenTools();""",
    "refresco tras descargar archivos",
)

sync = replace_once(
    sync,
    """    installUi();
    fb=await loadFirebase();""",
    """    installUi();
    installHoursRecovery();
    fb=await loadFirebase();""",
    "instalación de recuperación",
)

sync = replace_once(
    sync,
    """    addEventListener('offline',()=>setFileStatus('sin conexión','error'));
    document.addEventListener('visibilitychange',()=>{""",
    """    addEventListener('offline',()=>setFileStatus('sin conexión','error'));
    addEventListener('herramientas-cloud-synced',event=>{
      if(event?.detail?.direction==='download') refreshOpenTools();
    });
    document.addEventListener('visibilitychange',()=>{""",
    "refresco tras descargar datos generales",
)

sync_path.write_text(sync,encoding="utf-8")

sw_path=Path("sw.js")
sw=sw_path.read_text(encoding="utf-8")
sw=replace_once(sw,"/* HERRAMIENTAS SW V75 - PERENTORIAS PRIVADAS EN HORAS PLANTILLA */","/* HERRAMIENTAS SW V76 - RECUPERACION EN EQUIPOS NUEVOS */","cabecera SW")
sw=replace_once(sw,"const CACHE='herramientas-turnos-v75';","const CACHE='herramientas-turnos-v76';","caché SW")
sw=replace_once(sw,'firebase-storage-sync.js?v=4','firebase-storage-sync.js?v=5',"versión módulo Storage")
sw_path.write_text(sw,encoding="utf-8")

print("Parche aplicado correctamente")
