/* HERRAMIENTAS SW V68 - INDEX ORIGINAL + PERENTORIAS SEPARADA */
const CACHE='herramientas-turnos-v68';
const CORE=['./','./index.html','./perentorias.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE).catch(()=>{})));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;

  const request=event.request;
  const url=new URL(request.url);
  const sameOrigin=url.origin===self.location.origin;

  if(request.mode==='navigate'){
    event.respondWith(
      fetch(request,{cache:'no-store'}).then(response=>{
        if(response&&response.ok&&sameOrigin){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,copy));
        }
        return response;
      }).catch(async()=>{
        const exact=await caches.match(request,{ignoreSearch:true});
        if(exact) return exact;
        if(url.pathname.endsWith('/perentorias.html')){
          return (await caches.match('./perentorias.html')) || Response.error();
        }
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      })
    );
    return;
  }

  event.respondWith(
    fetch(request).then(response=>{
      if(response&&response.ok&&sameOrigin){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(request,copy));
      }
      return response;
    }).catch(()=>caches.match(request,{ignoreSearch:true}))
  );
});
