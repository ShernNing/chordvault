/**
 * Dexie Cloud Proxy Client
 * Provides CORS-safe fetch wrapper for Dexie Cloud requests
 */

const API_PROXY = "/api/dexie-proxy";

export async function proxiedFetch(endpoint, options = {}) {
  const { method = "POST", body, headers = {} } = options;

  try {
    const response = await fetch(API_PROXY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        endpoint,
        method,
        body,
        headers,
      }),
    });

    if (!response.ok) {
      throw new Error(`Proxy request failed: ${response.status}`);
    }

    return response;
  } catch (error) {
    console.error("Proxied fetch error:", error);
    throw error;
  }
}

/**
 * Intercept Dexie Cloud fetch requests
 * Replaces direct browser fetch with proxy-based fetch
 */
export function setupDexieCloudProxy() {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = function (...args) {
    const [url, options] = args;

    // Check if this is a Dexie Cloud request
    if (
      typeof url === "string" &&
      url.includes("dexie.cloud") &&
      import.meta.env.VITE_DEXIE_CLOUD_ENABLED === "true"
    ) {
      // Extract endpoint from full URL
      const urlObj = new URL(url);
      const endpoint = urlObj.pathname + urlObj.search;

      // Use proxy instead
      return proxiedFetch(endpoint, options);
    }

    // For all other requests, use original fetch
    return originalFetch.apply(this, args);
  };
}
