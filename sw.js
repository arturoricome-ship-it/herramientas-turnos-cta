/* HERRAMIENTAS SW V78 - MES EN TURNOS MALOS */
const CACHE='herramientas-turnos-v78';
const CORE=['./','./index.html','./perentorias.html','./firebase-storage-sync.js','./firebase-storage-codec.js','./firebase-storage-ui.js','./firebase-storage-ui-fix.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];

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

  let html=await response.text();
  const scripts=[];
  if(!html.includes('firebase-storage-sync.js')) scripts.push('<script type="module" src="./firebase-storage-sync.js?v=5"></script>');
  if(!html.includes('firebase-storage-ui-fix.js')) scripts.push('<script type="module" src="./firebase-storage-ui-fix.js?v=2"></script>');

  if(scripts.length){
    const injected=scripts.join('\n');
    html=/<\/body>/i.test(html)
      ?html.replace(/<\/body>/i,`${injected}\n</body>`)
      :`${html}\n${injected}`;
  }

  return new Response(html,{
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

  const storageModule=/\/firebase-storage-(?:sync|ui|codec|ui-fix)\.js$/i.test(url.pathname);
  event.respondWith(
    fetch(request,{cache:storageModule?'no-store':'default'})
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
