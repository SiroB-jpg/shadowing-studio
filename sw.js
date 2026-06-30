const CACHE_NAME = 'italian-shadowing-studio-v1-0-5';
const APP_SHELL = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install', event => {event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));self.skipWaiting();});
self.addEventListener('activate', event => {event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch', event => {
 const url = new URL(event.request.url);
 if (url.hostname.includes('elevenlabs.io')) return;
 event.respondWith(fetch(event.request,{cache:'no-store'}).then(response => {
  const copy=response.clone();
  if(event.request.method==='GET' && response.ok){caches.open(CACHE_NAME).then(cache=>cache.put(event.request,copy));}
  return response;
 }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match('./index.html'))));
});
