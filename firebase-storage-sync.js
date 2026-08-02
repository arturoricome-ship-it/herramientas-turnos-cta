/* FIREBASE STORAGE: sincronización automática de Excel y PDF entre dispositivos. */

const STORAGE_SYNC_SCHEMA = 1;
const STORAGE_DATABASES = [
  'herramientas_importaciones_compartidas_v1',
  'herramientas_almacen_extendido_v1'
];
const STORAGE_FOLDER = 'file-sync';
const LOCAL_POLL_MS = 6000;
const REMOTE_POLL_MS = 15000;
const DEVICE_KEY = 'herramientas_storage_device_id_v1';

let firebase = null;
let activeUser = null;
let localTimer = null;
let remoteTimer = null;
let syncPromise = null;
let lastSyncedHash = '';
let lastRemoteGeneration = '';
let applyingRemote = false;

function safeError(error) {
  return String(error && (error.code || error.message) || error || 'Error desconocido');
}

function getDeviceId() {
  try {
    let value = localStorage.getItem(DEVICE_KEY);
    if (!value) {
      value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, value);
    }
    return value;
  } catch (_) {
    return `device-${Date.now()}`;
  }
}

function ensureStatusElement() {
  let element = document.getElementById('firebaseStorageStatus');
  if (element) return element;
  const parent = document.getElementById('firebaseCloudMenu') || document.getElementById('firebaseCompact');
  if (!parent) return null;
  element = document.createElement('div');
  element.id = 'firebaseStorageStatus';
  element.className = 'firebase-status';
  element.style.marginTop = '7px';
  element.textContent = 'Archivos: preparando sincronización…';
  const generalStatus = document.getElementById('firebaseStatus');
  if (generalStatus && generalStatus.parentNode === parent) generalStatus.insertAdjacentElement('afterend', element);
  else parent.appendChild(element);
  return element;
}

function setFileStatus(message, type = '') {
  const element = ensureStatusElement();
  if (!element) return;
  element.textContent = `Archivos: ${message}`;
  element.dataset.state = type;
  element.style.color = type === 'error' ? '#fecaca' : type === 'work' ? '#fde68a' : type === 'ok' ? '#bbf7d0' : '';
}

function findFirebaseVersion() {
  const source = Array.from(document.scripts).map(script => `${script.src || ''}\n${script.textContent || ''}`).join('\n');
  const match = source.match(/https:\/\/www\.gstatic\.com\/firebasejs\/([^/]+)\/firebase-app\.js/);
  return match ? match[1] : '';
}

async function loadFirebase() {
  const version = findFirebaseVersion();
  if (!version) throw new Error('No se ha podido detectar la versión de Firebase usada por la web.');
  const base = `https://www.gstatic.com/firebasejs/${version}`;
  const [appSdk, authSdk, storageSdk] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-storage.js`)
  ]);
  const app = appSdk.getApp();
  return {
    app,
    auth: authSdk.getAuth(app),
    onAuthStateChanged: authSdk.onAuthStateChanged,
    storage: storageSdk.getStorage(app),
    ref: storageSdk.ref,
    getMetadata: storageSdk.getMetadata,
    uploadBytes: storageSdk.uploadBytes,
    getBlob: storageSdk.getBlob
  };
}

function bytesToBase64(bytes) {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encodeValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return { __hstType: 'BigInt', value: value.toString() };
  if (value instanceof Date) return { __hstType: 'Date', value: value.toISOString() };
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    return {
      __hstType: value instanceof File ? 'File' : 'Blob',
      type: value.type || '',
      name: value instanceof File ? value.name : '',
      lastModified: value instanceof File ? value.lastModified : 0,
      data: bytesToBase64(bytes)
    };
  }
  if (value instanceof ArrayBuffer) return { __hstType: 'ArrayBuffer', data: bytesToBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) {
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { __hstType: 'TypedArray', name: value.constructor && value.constructor.name || 'Uint8Array', data: bytesToBase64(bytes) };
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error('No se puede sincronizar una referencia circular.');
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        const result = [];
        for (const item of value) result.push(await encodeValue(item, seen));
        return result;
      }
      const result = {};
      for (const key of Object.keys(value)) result[key] = await encodeValue(value[key], seen);
      return result;
    } finally {
      seen.delete(value);
    }
  }
  return String(value);
}

function decodeValue(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(decodeValue);
  if (value.__hstType === 'Date') return new Date(value.value);
  if (value.__hstType === 'BigInt') return BigInt(value.value);
  if (value.__hstType === 'ArrayBuffer') return base64ToBytes(value.data).buffer;
  if (value.__hstType === 'Blob') return new Blob([base64ToBytes(value.data)], { type: value.type || '' });
  if (value.__hstType === 'File') {
    const bytes = base64ToBytes(value.data);
    try {
      return new File([bytes], value.name || 'archivo', { type: value.type || '', lastModified: Number(value.lastModified) || Date.now() });
    } catch (_) {
      return new Blob([bytes], { type: value.type || '' });
    }
  }
  if (value.__hstType === 'TypedArray') {
    const bytes = base64ToBytes(value.data);
    const constructors = {
      Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array,
      Int32Array, Uint32Array, Float32Array, Float64Array,
      BigInt64Array: globalThis.BigInt64Array, BigUint64Array: globalThis.BigUint64Array, DataView
    };
    const Constructor = constructors[value.name] || Uint8Array;
    if (Constructor === DataView) return new DataView(bytes.buffer);
    return new Constructor(bytes.buffer);
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) result[key] = decodeValue(item);
  return result;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Error de IndexedDB'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Error de IndexedDB'));
    transaction.onabort = () => reject(transaction.error || new Error('Operación de IndexedDB cancelada'));
  });
}

function openDatabase(name, version, onUpgrade) {
  return new Promise((resolve, reject) => {
    const request = version ? indexedDB.open(name, version) : indexedDB.open(name);
    request.onupgradeneeded = event => {
      try {
        if (onUpgrade) onUpgrade(request.result, event.oldVersion, event.newVersion, request.transaction);
      } catch (error) {
        try { request.transaction.abort(); } catch (_) {}
        reject(error);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(`No se pudo abrir ${name}`));
    request.onblocked = () => reject(new Error(`La base ${name} está bloqueada por otra pestaña.`));
  });
}

async function existingDatabaseNames() {
  if (typeof indexedDB.databases === 'function') {
    try {
      const databases = await indexedDB.databases();
      return new Set(databases.map(item => item && item.name).filter(Boolean));
    } catch (_) {}
  }
  return null;
}

async function readStoreRecords(store, transaction) {
  const done = transactionDone(transaction);
  const [keys, values] = await Promise.all([requestResult(store.getAllKeys()), requestResult(store.getAll())]);
  await done;
  const records = [];
  for (let index = 0; index < values.length; index += 1) {
    records.push({ key: await encodeValue(keys[index]), value: await encodeValue(values[index]) });
  }
  return records;
}

async function dumpDatabase(name, knownNames) {
  if (knownNames && !knownNames.has(name)) return null;
  let database;
  try { database = await openDatabase(name); } catch (_) { return null; }
  try {
    const dump = { name, version: database.version, stores: {} };
    for (const storeName of Array.from(database.objectStoreNames)) {
      const transaction = database.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const indexes = Array.from(store.indexNames).map(indexName => {
        const index = store.index(indexName);
        return { name: index.name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
      });
      dump.stores[storeName] = {
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        indexes,
        records: await readStoreRecords(store, transaction)
      };
    }
    return dump;
  } finally {
    database.close();
  }
}

async function buildSnapshot() {
  const knownNames = await existingDatabaseNames();
  const databases = {};
  for (const name of STORAGE_DATABASES) {
    const dump = await dumpDatabase(name, knownNames);
    if (dump) databases[name] = dump;
  }
  return { schema: STORAGE_SYNC_SCHEMA, createdAt: new Date().toISOString(), deviceId: getDeviceId(), databases };
}

function snapshotRecordCount(snapshot) {
  let count = 0;
  for (const database of Object.values(snapshot.databases || {})) {
    for (const store of Object.values(database.stores || {})) count += (store.records || []).length;
  }
  return count;
}

async function snapshotJsonAndHash(snapshot) {
  const json = JSON.stringify(snapshot);
  const stableJson = JSON.stringify({ schema: snapshot.schema, databases: snapshot.databases || {} });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson));
  const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
  return { json, hash };
}

function databaseNeedsUpgrade(database, dump) {
  for (const [storeName, storeDump] of Object.entries(dump.stores || {})) {
    if (!database.objectStoreNames.contains(storeName)) return true;
    const transaction = database.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    for (const indexDump of storeDump.indexes || []) if (!store.indexNames.contains(indexDump.name)) return true;
  }
  return false;
}

async function prepareDatabaseForRestore(dump) {
  let current = await openDatabase(dump.name);
  const needsUpgrade = databaseNeedsUpgrade(current, dump);
  const currentVersion = current.version;
  current.close();
  if (!needsUpgrade) return openDatabase(dump.name);
  const targetVersion = Math.max(currentVersion + 1, Number(dump.version) || 1);
  return openDatabase(dump.name, targetVersion, (database, oldVersion, newVersion, upgradeTransaction) => {
    for (const [storeName, storeDump] of Object.entries(dump.stores || {})) {
      let store;
      if (!database.objectStoreNames.contains(storeName)) {
        store = database.createObjectStore(storeName, {
          keyPath: storeDump.keyPath === undefined ? null : storeDump.keyPath,
          autoIncrement: Boolean(storeDump.autoIncrement)
        });
      } else store = upgradeTransaction.objectStore(storeName);
      for (const indexDump of storeDump.indexes || []) {
        if (!store.indexNames.contains(indexDump.name)) {
          store.createIndex(indexDump.name, indexDump.keyPath, { unique: Boolean(indexDump.unique), multiEntry: Boolean(indexDump.multiEntry) });
        }
      }
    }
  });
}

async function restoreSnapshot(snapshot) {
  if (!snapshot || Number(snapshot.schema) !== STORAGE_SYNC_SCHEMA) throw new Error('La copia de archivos tiene un formato incompatible.');
  applyingRemote = true;
  try {
    for (const dump of Object.values(snapshot.databases || {})) {
      const database = await prepareDatabaseForRestore(dump);
      try {
        for (const [storeName, storeDump] of Object.entries(dump.stores || {})) {
          if (!database.objectStoreNames.contains(storeName)) continue;
          const transaction = database.transaction(storeName, 'readwrite');
          const store = transaction.objectStore(storeName);
          for (const record of storeDump.records || []) {
            const value = decodeValue(record.value);
            const key = decodeValue(record.key);
            if (store.keyPath === null) store.put(value, key);
            else store.put(value);
          }
          await transactionDone(transaction);
        }
      } finally { database.close(); }
    }
  } finally { applyingRemote = false; }
}

function cloudRef(user) {
  return firebase.ref(firebase.storage, `users/${user.uid}/${STORAGE_FOLDER}/indexeddb-snapshot-v1.json`);
}

async function remoteMetadata(user) {
  try { return await firebase.getMetadata(cloudRef(user)); }
  catch (error) {
    if (String(error && error.code) === 'storage/object-not-found') return null;
    throw error;
  }
}

async function downloadSnapshot(user) {
  const blob = await firebase.getBlob(cloudRef(user));
  return JSON.parse(await blob.text());
}

async function uploadSnapshot(user, json, hash, recordCount) {
  const blob = new Blob([json], { type: 'application/json' });
  const result = await firebase.uploadBytes(cloudRef(user), blob, {
    contentType: 'application/json',
    customMetadata: {
      schema: String(STORAGE_SYNC_SCHEMA), hash, deviceId: getDeviceId(),
      recordCount: String(recordCount), updatedAt: new Date().toISOString()
    }
  });
  lastRemoteGeneration = String(result.metadata && result.metadata.generation || '');
  lastSyncedHash = hash;
}

async function synchronize(user, reason = 'manual') {
  if (!user || !navigator.onLine) {
    setFileStatus(user ? 'sin conexión' : 'inicia sesión con Google', user ? 'error' : '');
    return;
  }
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    try {
      setFileStatus('comprobando…', 'work');
      const localSnapshot = await buildSnapshot();
      const localPrepared = await snapshotJsonAndHash(localSnapshot);
      const localCount = snapshotRecordCount(localSnapshot);
      const metadata = await remoteMetadata(user);
      if (!metadata) {
        if (localCount > 0) {
          setFileStatus('subiendo archivos…', 'work');
          await uploadSnapshot(user, localPrepared.json, localPrepared.hash, localCount);
          setFileStatus(`${localCount} registros sincronizados`, 'ok');
        } else {
          lastSyncedHash = localPrepared.hash;
          setFileStatus('todavía no hay Excel o PDF', 'ok');
        }
        return;
      }
      const remoteHash = metadata.customMetadata && metadata.customMetadata.hash || '';
      const remoteGeneration = String(metadata.generation || '');
      if (remoteHash && remoteHash === localPrepared.hash) {
        lastSyncedHash = localPrepared.hash;
        lastRemoteGeneration = remoteGeneration;
        setFileStatus(`${localCount} registros sincronizados`, 'ok');
        return;
      }
      const remoteChanged = remoteGeneration && remoteGeneration !== lastRemoteGeneration;
      const localChanged = localPrepared.hash !== lastSyncedHash;
      if (remoteChanged || !lastSyncedHash) {
        setFileStatus('descargando archivos nuevos…', 'work');
        const remoteSnapshot = await downloadSnapshot(user);
        await restoreSnapshot(remoteSnapshot);
        const mergedSnapshot = await buildSnapshot();
        const mergedPrepared = await snapshotJsonAndHash(mergedSnapshot);
        const mergedCount = snapshotRecordCount(mergedSnapshot);
        if (mergedPrepared.hash !== remoteHash) {
          setFileStatus('unificando archivos…', 'work');
          await uploadSnapshot(user, mergedPrepared.json, mergedPrepared.hash, mergedCount);
        } else {
          lastRemoteGeneration = remoteGeneration;
          lastSyncedHash = mergedPrepared.hash;
        }
        setFileStatus(`${mergedCount} registros sincronizados`, 'ok');
        window.dispatchEvent(new CustomEvent('herramientas-storage-synced', { detail: { reason, records: mergedCount } }));
        return;
      }
      if (localChanged) {
        setFileStatus('subiendo cambios…', 'work');
        await uploadSnapshot(user, localPrepared.json, localPrepared.hash, localCount);
        setFileStatus(`${localCount} registros sincronizados`, 'ok');
        return;
      }
      setFileStatus(`${localCount} registros sincronizados`, 'ok');
    } catch (error) {
      console.error('[StorageSync]', error);
      setFileStatus(`error: ${safeError(error)}`, 'error');
    }
  })().finally(() => { syncPromise = null; });
  return syncPromise;
}

function stopWatchers() {
  if (localTimer) clearInterval(localTimer);
  if (remoteTimer) clearInterval(remoteTimer);
  localTimer = null;
  remoteTimer = null;
  lastSyncedHash = '';
  lastRemoteGeneration = '';
}

async function startWatchers(user) {
  stopWatchers();
  activeUser = user;
  await synchronize(user, 'login');
  localTimer = setInterval(async () => {
    if (!activeUser || applyingRemote || syncPromise || document.hidden) return;
    try {
      const snapshot = await buildSnapshot();
      const prepared = await snapshotJsonAndHash(snapshot);
      if (prepared.hash !== lastSyncedHash) await synchronize(activeUser, 'local-change');
    } catch (error) { console.error('[StorageSync local]', error); }
  }, LOCAL_POLL_MS);
  remoteTimer = setInterval(async () => {
    if (!activeUser || applyingRemote || syncPromise || document.hidden) return;
    try {
      const metadata = await remoteMetadata(activeUser);
      const generation = String(metadata && metadata.generation || '');
      if (generation && generation !== lastRemoteGeneration) await synchronize(activeUser, 'remote-change');
    } catch (error) { console.error('[StorageSync remote]', error); }
  }, REMOTE_POLL_MS);
}

async function initialize() {
  try {
    ensureStatusElement();
    firebase = await loadFirebase();
    firebase.onAuthStateChanged(firebase.auth, user => {
      activeUser = user || null;
      if (user) startWatchers(user);
      else {
        stopWatchers();
        setFileStatus('inicia sesión con Google');
      }
    });
    window.addEventListener('online', () => activeUser && synchronize(activeUser, 'online'));
    window.addEventListener('offline', () => setFileStatus('sin conexión', 'error'));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && activeUser) synchronize(activeUser, 'visible');
    });
    window.FirebaseStorageSync = {
      syncNow: () => activeUser ? synchronize(activeUser, 'manual') : Promise.resolve(),
      status: () => ({ user: activeUser && activeUser.email || '', syncing: Boolean(syncPromise), lastSyncedHash, lastRemoteGeneration })
    };
  } catch (error) {
    console.error('[StorageSync init]', error);
    setFileStatus(`no se pudo iniciar: ${safeError(error)}`, 'error');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initialize(), { once: true });
else initialize();
