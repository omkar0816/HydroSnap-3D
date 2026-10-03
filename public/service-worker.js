const CACHE_NAME = "hydrosnap-shell-v1"
const APP_SHELL = ["/", "/manifest.webmanifest"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)),
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      ),
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  if (
    event.request.method !== "GET" ||
    new URL(event.request.url).origin !== self.location.origin
  ) {
    return
  }
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request)
        const url = new URL(event.request.url)
        if (
          response.ok &&
          (event.request.mode === "navigate" ||
            url.pathname.startsWith("/assets/") ||
            url.pathname === "/manifest.webmanifest")
        ) {
          const cache = await caches.open(CACHE_NAME)
          await cache.put(event.request, response.clone())
        }
        return response
      } catch {
        const cached = await caches.match(event.request)
        if (cached) return cached
        if (event.request.mode === "navigate") {
          const appShell = await caches.match("/")
          if (appShell) return appShell
        }
        throw new Error("This page is not available offline.")
      }
    })(),
  )
})
