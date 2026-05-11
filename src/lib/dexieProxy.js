const API_PROXY = "/api/dexie-proxy";

export function setupDexieCloudProxy() {
  const dexieCloudUrl = import.meta.env.VITE_DEXIE_CLOUD_URL;
  if (!dexieCloudUrl || import.meta.env.VITE_DEXIE_CLOUD_ENABLED !== "true") return;

  const originalFetch = globalThis.fetch;

  globalThis.fetch = function (input, init = {}) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input?.url;

    if (url?.startsWith(dexieCloudUrl)) {
      // Normalise headers to plain object
      const headers = {};
      if (init.headers instanceof Headers) {
        init.headers.forEach((val, key) => { headers[key] = val; });
      } else if (init.headers) {
        Object.assign(headers, init.headers);
      }

      // Normalise body to string or null
      let body = null;
      if (init.body != null) {
        if (typeof init.body === "string") {
          body = init.body;
        } else if (init.body instanceof URLSearchParams) {
          body = init.body.toString();
          if (!headers["content-type"] && !headers["Content-Type"]) {
            headers["content-type"] = "application/x-www-form-urlencoded";
          }
        } else {
          body = String(init.body);
        }
      }

      return originalFetch(API_PROXY, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, method: init.method || "GET", headers, body }),
      });
    }

    return originalFetch.call(this, input, init);
  };
}
