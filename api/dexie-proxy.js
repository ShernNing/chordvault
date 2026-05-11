export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, method = "GET", body, headers = {} } = req.body;
  const dexieCloudUrl = process.env.VITE_DEXIE_CLOUD_URL;

  if (!dexieCloudUrl) {
    return res.status(500).json({ error: "VITE_DEXIE_CLOUD_URL not set" });
  }

  if (!url || !url.startsWith(dexieCloudUrl)) {
    return res.status(400).json({ error: "URL must start with configured Dexie Cloud URL" });
  }

  try {
    const response = await fetch(url, {
      method,
      // Pass original headers exactly — do NOT add or override Content-Type
      headers,
      body: body != null ? body : undefined,
    });

    // Stream response body as buffer to avoid double-read issues
    const buffer = await response.arrayBuffer();

    res.status(response.status);

    // Forward content-type header from upstream
    const ct = response.headers.get("content-type");
    if (ct) res.setHeader("content-type", ct);

    res.end(Buffer.from(buffer));
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: error.message });
  }
}
