const DATABASES=[
  'herramientas_importaciones_compartidas_v1',
  'herramientas_almacen_extendido_v1'
];
const SCHEMA=2;

function bytesToBase64(bytes){
  let out='';
  for(let i=0;i<bytes.length;i+=0x8000) out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(out);
}
function base64ToBytes(value){
  const raw=atob(value),bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
  return bytes;
}
async function encode(value,seen=new WeakSet()){
  if(value===null||value===undefined||['string','number','boolean'].includes(typeof value)) return value;
  if(typeof value==='bigint') return {__hstType:'BigInt',value:String(value)};
  if(value instanceof Date) return {__hstType:'Date',value:value.toISOString()};
  if(value instanceof Blob){
    return {
      __hstType:value instanceof File?'File':'Blob',
      type:value.type||'',
      name:value instanceof File?value.name:'',
      lastModified:value instanceof File?value.lastModified:0,
      data:bytesToBase64(new Uint8Array(await value.arrayBuffer()))
    };
  }
  if(value instanceof ArrayBuffer) return {__hstType:'ArrayBuffer',data:bytesToBase64(new Uint8Array(value))};
  if(ArrayBuffer.isView(value)){
    return {
      __hstType:'TypedArray',
      name:value.constructor?.name||'Uint8Array',
      data:bytesToBase64(new Uint8Array(value.buffer,value.byteOffset,value.byteLength))
    };
  }
  if(typeof value==='object'){
    if(seen.has(value)) throw new Error('No se puede sincronizar una referencia circular.');
    seen.add(value);
    try{
      if(Array.isArray(value)){
        const result=[];
        for(const item of value) result.push(await encode(item,seen));
        return result;
      }
      const result={};
      for(const key of Object.keys(value)) result[key]=await encode(value[key],seen);
      return result;
    }finally{seen.delete(value);}
  }
  return String(value);
}
function decode(value){
  if(!value||typeof value!=='object') return value;
  if(Array.isArray(value)) return value.map(decode);
  if(value.__hstType==='Date') return new Date(value.value);
  if(value.__hstType==='BigInt') return BigInt(value.value);
  if(value.__hstType==='ArrayBuffer') return base64ToBytes(value.data).buffer;
  if(value.__hstType==='Blob') return new Blob([base64ToBytes(value.data)],{type:value.type||''});
  if(value.__hstType==='File'){
    const bytes=base64ToBytes(value.data);
    try{return new File([bytes],value.name||'archivo',{type:value.type||'',lastModified:Number(value.lastModified)||Date.now()});}
    catch(_){
      const blob=new Blob([bytes],{type:value.type||''});
      try{Object.defineProperty(blob,'name',{value:value.name||'archivo'});}catch(_){}
      return blob;
    }
  }
  if(value.__hstType==='TypedArray'){
    const bytes=base64ToBytes(value.data);
    const types={
      Int8Array,Uint8Array,Uint8ClampedArray,Int16Array,Uint16Array,
      Int32Array,Uint32Array,Float32Array,Float64Array,
      BigInt64Array:globalThis.BigInt64Array,BigUint64Array:globalThis.BigUint64Array,DataView
    };
    const Constructor=types[value.name]||Uint8Array;
    return Constructor===DataView?new DataView(bytes.buffer):new Constructor(bytes.buffer);
  }
  const result={};
  for(const [key,item] of Object.entries(value)) result[key]=decode(item);
  return result;
}
function resultOf(request){
  return new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Error de IndexedDB'));
  });
}
function transactionDone(transaction){
  return new Promise((resolve,reject)=>{
    transaction.oncomplete=resolve;
    transaction.onerror=()=>reject(transaction.error||new Error('Error de IndexedDB'));
    transaction.onabort=()=>reject(transaction.error||new Error('Operación de IndexedDB cancelada'));
  });
}
function openDatabase(name,version,onUpgrade){
  return new Promise((resolve,reject)=>{
    const request=version?indexedDB.open(name,version):indexedDB.open(name);
    request.onupgradeneeded=event=>{
      try{onUpgrade?.(request.result,event.oldVersion,event.newVersion,request.transaction);}
      catch(error){try{request.transaction.abort();}catch(_){} reject(error);}
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error(`No se pudo abrir ${name}`));
    request.onblocked=()=>reject(new Error(`La base ${name} está bloqueada por otra pestaña.`));
  });
}
async function knownDatabases(){
  if(typeof indexedDB.databases!=='function') return null;
  try{return new Set((await indexedDB.databases()).map(item=>item?.name).filter(Boolean));}
  catch(_){return null;}
}
async function dumpDatabase(name,known){
  if(known&&!known.has(name)) return null;
  let db;
  try{db=await openDatabase(name);}catch(_){return null;}
  try{
    const dump={name,version:db.version,stores:{}};
    for(const storeName of Array.from(db.objectStoreNames)){
      const transaction=db.transaction(storeName,'readonly');
      const store=transaction.objectStore(storeName);
      const indexes=Array.from(store.indexNames).map(indexName=>{
        const index=store.index(indexName);
        return {name:index.name,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry};
      });
      const done=transactionDone(transaction);
      const [keys,values]=await Promise.all([resultOf(store.getAllKeys()),resultOf(store.getAll())]);
      await done;
      const records=[];
      for(let i=0;i<values.length;i++) records.push({key:await encode(keys[i]),value:await encode(values[i])});
      dump.stores[storeName]={keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes,records};
    }
    return dump;
  }finally{db.close();}
}
export async function buildSnapshot(deviceId=''){
  const known=await knownDatabases(),databases={};
  for(const name of DATABASES){
    const dump=await dumpDatabase(name,known);
    if(dump) databases[name]=dump;
  }
  return {schema:SCHEMA,createdAt:new Date().toISOString(),deviceId,databases};
}
export function snapshotRecordCount(snapshot){
  let count=0;
  for(const database of Object.values(snapshot?.databases||{}))
    for(const store of Object.values(database.stores||{})) count+=(store.records||[]).length;
  return count;
}
export async function prepareSnapshot(snapshot){
  const json=JSON.stringify(snapshot);
  const stable=JSON.stringify({schema:SCHEMA,databases:snapshot?.databases||{}});
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable));
  const hash=Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  return {json,hash};
}
function needsUpgrade(db,dump){
  for(const [storeName,storeDump] of Object.entries(dump.stores||{})){
    if(!db.objectStoreNames.contains(storeName)) return true;
    const store=db.transaction(storeName,'readonly').objectStore(storeName);
    for(const index of storeDump.indexes||[]) if(!store.indexNames.contains(index.name)) return true;
  }
  return false;
}
async function prepareDatabase(dump){
  let current=await openDatabase(dump.name);
  const upgrade=needsUpgrade(current,dump),version=current.version;
  current.close();
  if(!upgrade) return openDatabase(dump.name);
  return openDatabase(dump.name,Math.max(version+1,Number(dump.version)||1),(db,oldV,newV,transaction)=>{
    for(const [storeName,storeDump] of Object.entries(dump.stores||{})){
      const store=db.objectStoreNames.contains(storeName)
        ? transaction.objectStore(storeName)
        : db.createObjectStore(storeName,{keyPath:storeDump.keyPath===undefined?null:storeDump.keyPath,autoIncrement:Boolean(storeDump.autoIncrement)});
      for(const index of storeDump.indexes||[])
        if(!store.indexNames.contains(index.name))
          store.createIndex(index.name,index.keyPath,{unique:Boolean(index.unique),multiEntry:Boolean(index.multiEntry)});
    }
  });
}
async function clearDatabase(name,known){
  if(known&&!known.has(name)) return;
  let db;
  try{db=await openDatabase(name);}catch(_){return;}
  try{
    const stores=Array.from(db.objectStoreNames);
    if(!stores.length) return;
    const transaction=db.transaction(stores,'readwrite');
    for(const name of stores) transaction.objectStore(name).clear();
    await transactionDone(transaction);
  }finally{db.close();}
}
export async function restoreSnapshot(snapshot,{replace=true}={}){
  if(!snapshot?.databases) throw new Error('La copia de archivos tiene un formato incompatible.');
  const known=await knownDatabases();
  if(replace) for(const name of DATABASES) if(!snapshot.databases[name]) await clearDatabase(name,known);
  for(const dump of Object.values(snapshot.databases)){
    const db=await prepareDatabase(dump);
    try{
      const allStores=Array.from(db.objectStoreNames);
      const stores=replace?allStores:Object.keys(dump.stores||{}).filter(name=>db.objectStoreNames.contains(name));
      if(!stores.length) continue;
      const transaction=db.transaction(stores,'readwrite');
      if(replace) for(const name of allStores) transaction.objectStore(name).clear();
      for(const [storeName,storeDump] of Object.entries(dump.stores||{})){
        if(!db.objectStoreNames.contains(storeName)) continue;
        const store=transaction.objectStore(storeName);
        for(const record of storeDump.records||[]){
          const value=decode(record.value),key=decode(record.key);
          store.keyPath===null?store.put(value,key):store.put(value);
        }
      }
      await transactionDone(transaction);
    }finally{db.close();}
  }
}
function flatten(snapshot){
  const map=new Map();
  for(const [databaseName,database] of Object.entries(snapshot?.databases||{}))
    for(const [storeName,store] of Object.entries(database.stores||{}))
      for(const record of store.records||[]){
        const valueJson=JSON.stringify(record.value);
        map.set(`${databaseName}/${storeName}/${JSON.stringify(record.key)}`,{databaseName,storeName,valueJson});
      }
  return map;
}
function fileName(text){
  return text?.match(/"name"\s*:\s*"([^"]+\.(?:xlsx?|pdf|csv))"/i)?.[1]
    || text?.match(/([^"\\/]{2,120}\.(?:xlsx?|pdf|csv))/i)?.[1]||'';
}
function moduleName(entry){
  const text=`${entry.databaseName} ${entry.storeName} ${entry.valueJson}`.toLowerCase();
  if(/errores?.{0,20}turno|turno.{0,20}errores?/.test(text)) return 'Errores de turno';
  if(/perentoria/.test(text)) return 'Perentorias';
  if(/cambio.{0,15}turno/.test(text)) return 'Cambios de turno';
  if(/analizador/.test(text)) return 'Analizador';
  if(/horas.{0,15}plantilla/.test(text)) return 'Horas plantilla';
  if(/jornada/.test(text)) return 'Mi jornada';
  if(/evento/.test(text)) return 'Eventos';
  return 'archivos importados';
}
export function describeChange(before,after,device){
  const oldMap=flatten(before),newMap=flatten(after),added=[],removed=[],changed=[];
  for(const [key,item] of newMap){
    if(!oldMap.has(key)) added.push(item);
    else if(oldMap.get(key).valueJson!==item.valueJson) changed.push(item);
  }
  for(const [key,item] of oldMap) if(!newMap.has(key)) removed.push(item);
  let type='update',items=changed,verb='Actualizado';
  if(removed.length&&!added.length&&!changed.length){type='delete';items=removed;verb='Eliminado';}
  else if(added.length&&!removed.length&&!changed.length){type='import';items=added;verb='Importado';}
  else if(removed.length>added.length+changed.length){type='delete';items=removed;verb='Eliminado';}
  else if(added.length>=removed.length+changed.length&&added.length){type='import';items=added;verb='Importado';}
  else if(!items.length) items=added.length?added:removed;
  const first=items[0],name=first?fileName(first.valueJson):'',module=first?moduleName(first):'archivos importados';
  const total=added.length+removed.length+changed.length;
  let text;
  if(name) text=`${verb} ${name} ${type==='delete'?'de':'en'} ${module}`;
  else if(total===1) text=`${verb} un elemento ${type==='delete'?'de':'en'} ${module}`;
  else if(total>1) text=type==='delete'?`Eliminados ${total} elementos de ${module}`:
    type==='import'?`Importados ${total} elementos en ${module}`:`Actualizados ${total} elementos en ${module}`;
  else text='Sincronización de archivos actualizada';
  return {
    type,text,fileName:name,module,added:added.length,removed:removed.length,changed:changed.length,
    deviceId:device.id,deviceLabel:device.label,atClient:new Date().toISOString()
  };
}
