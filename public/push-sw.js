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
  // 다만 앱을 화면에 띄워 보고 있는 중이면 이미 본 내용이므로, 보여 준 뒤 바로 알림창에서 지운다
  // (안드로이드는 알림창에 남은 알림 개수를 앱 아이콘 숫자로 보이기 때문).
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const watching = windows.some((client) => client.visibilityState === 'visible' && client.url.startsWith(self.registration.scope));
      if (watching) {
        const shown = await self.registration.getNotifications(options.tag ? { tag: options.tag } : undefined);
        shown.forEach((notification) => notification.close());
      }
    })(),
  );
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
