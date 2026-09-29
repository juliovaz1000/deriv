// Deixa instalar como app no celular. Sempre busca a versão nova na internet; o cache só serve se estiver sem rede.
const CACHE='dpi-v1';
self.addEventListener('install',e=>{ self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['/','/index.html','/icon.svg','/manifest.webmanifest'])).catch(()=>{})); });
self.addEventListener('activate',e=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET' || u.origin!==location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r=>{ const c=r.clone(); caches.open(CACHE).then(x=>x.put(e.request,c)).catch(()=>{}); return r; }).catch(()=>caches.match(e.request).then(r=>r||caches.match('/index.html'))));
});
