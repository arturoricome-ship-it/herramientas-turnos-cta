/* HERRAMIENTAS SW V67 - INDEX ORIGINAL + PERENTORIAS SEPARADA - 2026-07-18 */
const CACHE='herramientas-turnos-v67';
const CORE=['./','./index.html','./perentorias.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];

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

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request,{cache:'no-store'}).then(response=>{
        if(response && response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        }
        return response;
      }).catch(async()=>{
        const exact=await caches.match(event.request,{ignoreSearch:true});
        if(exact) return exact;
        const url=new URL(event.request.url);
        if(url.pathname.endsWith('/perentorias.html')) return caches.match('./perentorias.html');
        return (await caches.match('./index.html')) || (await caches.match('./'));
      })
    );
    return;
  }
  event.respondWith(
    fetch(event.request,{cache:'no-cache'}).then(response=>{
      if(response && response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
      }
      return response;
    }).catch(()=>caches.match(event.request,{ignoreSearch:true}))
  );
});
