self.addEventListener("push", event => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(self.registration.showNotification(data.title || "Daily Money", {
    body: data.body || "",
    icon: "/icon-192.svg",
    badge: "/icon-192.svg",
    tag: data.tag || "daily-money-reminder",
    data: { url: data.url || "/" }
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    const existing = clients.find(client => client.url.startsWith(self.location.origin));
    return existing ? existing.focus() : self.clients.openWindow(event.notification.data?.url || "/");
  }));
});
