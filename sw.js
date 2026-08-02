/* HERRAMIENTAS SW V71 - FIRESTORE EN TIEMPO REAL Y MENU COMPACTO */
const CACHE='herramientas-turnos-v71';
const CORE=['./','./index.html','./perentorias.html','./firebase-storage-sync.js','./firebase-storage-codec.js','./firebase-storage-ui.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const STORAGE_SCRIPT='<script type="module" src="./firebase-storage-sync.js?v=3"></script>';

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE).catch(()=>{})));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

function cleanHeaders(original){
  const headers=new Headers(original);
  headers.delete('content-length');
  headers.delete('content-encoding');
  return headers;
}

async function withStorageSync(response,url){
  if(!response || !response.ok || url.pathname.endsWith('/perentorias.html')) return response;
  const contentType=response.headers.get('content-type')||'';
  if(!contentType.includes('text/html')) return response;

  const html=await response.text();
  if(html.includes('firebase-storage-sync.js')){
    return new Response(html,{
      status:response.status,
      statusText:response.statusText,
      headers:cleanHeaders(response.headers)
    });
  }

  const injected=/<\/body>/i.test(html)
    ? html.replace(/<\/body>/i,STORAGE_SCRIPT+'\n</body>')
    : html+'\n'+STORAGE_SCRIPT;

  return new Response(injected,{
    status:response.status,
    statusText:response.statusText,
    headers:cleanHeaders(response.headers)
  });
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  const request=event.request;
  const url=new URL(request.url);
  const sameOrigin=url.origin===self.location.origin;

  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const network=await fetch(request,{cache:'no-store'});
        const response=sameOrigin ? await withStorageSync(network,url) : network;
        if(response&&response.ok&&sameOrigin){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,copy));
        }
        return response;
      }catch(error){
        let cached=await caches.match(request,{ignoreSearch:true});
        if(!cached && url.pathname.endsWith('/perentorias.html')) cached=await caches.match('./perentorias.html');
        if(!cached) cached=(await caches.match('./index.html')) || (await caches.match('./'));
        if(!cached) return Response.error();
        return sameOrigin ? withStorageSync(cached,url) : cached;
      }
    })());
    return;
  }

  event.respondWith(
    fetch(request,{cache:url.pathname.endsWith('/firebase-storage-sync.js')?'no-store':'default'})
      .then(response=>{
        if(response&&response.ok&&sameOrigin){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,copy));
        }
        return response;
      })
      .catch(()=>caches.match(request,{ignoreSearch:true}))
  );
});
