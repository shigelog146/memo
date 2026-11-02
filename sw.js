const C="memo-v11",SHELL=["./","./index.html","./manifest.json","./icon.svg","./icon-192.png","./icon-512.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!=="memo-n"&&x!=="memo-g").map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET"||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(C).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request)));
});
// 通知: 名前も中身も出さない(全グループの合計件数だけ)。グループ別の件数は、アプリのメモ画面に表示するために数えておく
async function pushed(e){
  let g="";try{if(e.data)g=String(e.data.json().g||"")}catch{}
  const c=await caches.open("memo-n"),num=async k=>{const r=await c.match(k);return r?+await r.text():0};
  const n=(await num("n-"+g))+1,now=Date.now(),loud=now-(await num("t-all"))>6e5;
  await c.put("n-"+g,new Response(String(n)));if(loud)await c.put("t-all",new Response(String(now)));
  let tot=0;for(const k of await c.keys()){if(new URL(k.url).pathname.split("/").pop().startsWith("n-"))tot+=+await(await c.match(k)).text()}
  if(self.navigator.setAppBadge)await self.navigator.setAppBadge(tot).catch(()=>{});
  await self.registration.showNotification("メモ",{body:tot>1?`更新が${tot}件あります`:"更新があります",icon:"icon-192.png",tag:"memo",silent:!loud,renotify:loud});
}
self.addEventListener("push",e=>e.waitUntil(pushed(e)));
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window"}).then(l=>l.length?l[0].focus():clients.openWindow("./index.html")))});
