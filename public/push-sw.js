// 알림(웹 푸시)을 받아 보여 주는 부분. 앱의 서비스 워커(sw.js)가 이 파일을 불러온다.
// 알림 서버는 { title, body, url, tag } 를 data 로 보낸다.

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = { data: { body: event.data ? event.data.text() : '' } };
  }
  const d = payload.data || payload.notification || {};
  const title = d.title || '가족 퀘스트';
  const options = {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    lang: 'ko',
    data: { url: d.url || './' },
  };
  if (d.tag) {
    options.tag = d.tag;
    options.renotify = true;
  }
  // 브라우저는 받은 알림을 반드시 보여 주게 되어 있다.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope)) {
          await client.focus();
          try {
            await client.navigate(target);
          } catch (error) {
            // 이동이 막혀도 열려 있는 앱으로 돌아온 것으로 충분하다.
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
