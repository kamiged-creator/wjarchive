/* The installable shell caches no chat messages or authentication responses. */
self.addEventListener('install', event => {
  event.waitUntil(caches.open('bokjakso-chat-shell-v1')
    .then(cache => cache.addAll(['/offline.html','/icon-192.png','/icon-512.png'])));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!=='bokjakso-chat-shell-v1').map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  if(event.request.mode!=='navigate')return;
  event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));
});
/* Bokjakso Web Push: notifications only, no page caching or fetch interception. */
self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const roomCode = typeof data.roomCode === 'string' ? data.roomCode : '';
  const url = '/chat.html?room=' + encodeURIComponent(roomCode);
  const title = typeof data.title === 'string' ? data.title : '복작소 새 메시지';
  const body = typeof data.body === 'string' ? data.body : '새 메시지가 도착했습니다.';
  event.waitUntil((async () => {
    const windows = await clients.matchAll({type:'window',includeUncontrolled:true});
    // A focused chat page already polls and can play its own foreground sound.
    if (windows.some(client => client.focused && new URL(client.url).pathname === '/chat.html')) return;
    await self.registration.showNotification(title, {
      body,
      icon:'/icon-192.png',
      badge:'/icon-192.png',
      tag:'bokjakso-room-' + roomCode,
      renotify:true,
      data:{url},
      timestamp:Date.now()
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const destination=new URL(event.notification.data?.url || '/chat.html',self.location.origin).href;
  event.waitUntil((async ()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    const existing=windows.find(client=>new URL(client.url).origin===self.location.origin &&
      new URL(client.url).pathname==='/chat.html');
    if(existing){
      await existing.navigate(destination);
      await existing.focus();
    }else if(clients.openWindow){
      await clients.openWindow(destination);
    }
  })());
});
