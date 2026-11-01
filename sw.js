const C="memo-v8",SHELL=["./","./index.html","./manifest.json","./icon.svg","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!=="memo-n").map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET"||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request)));
});
// 通知は中身なし。「メモ / 更新があります」とだけ表示する
// 1通ごとに届く。バッジは1通=+1。音・バナーは最初の1回(以後10分あけるまで)だけ、あとは静かに差し替え
async function pushed(){
  const c=await caches.open("memo-n"),g=async k=>{const r=await c.match(k);return r?+await r.text():0};
  const n=(await g("n"))+1,now=Date.now(),loud=now-(await g("t"))>6e5;
  await c.put("n",new Response(String(n)));
  if(loud)await c.put("t",new Response(String(now)));
  if(self.navigator.setAppBadge)await self.navigator.setAppBadge(n).catch(()=>{});
  await self.registration.showNotification("メモ",{body:"更新があります",icon:"icon-192.png",tag:"memo",silent:!loud,renotify:loud});
}
self.addEventListener("push",e=>e.waitUntil(pushed()));
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window"}).then(l=>l.length?l[0].focus():clients.openWindow("./index.html")))});
