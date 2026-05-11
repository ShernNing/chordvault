/**
 * Dexie Cloud Proxy
 * Forwards requests to Dexie Cloud to bypass CORS issues
 */

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { endpoint, method = "POST", body, headers = {} } = req.body;
  const dexieUrl = process.env.VITE_DEXIE_CLOUD_URL;

  if (!dexieUrl) {
    return res.status(500).json({ error: "Dexie Cloud URL not configured" });
  }

  if (!endpoint) {
    return res.status(400).json({ error: "Endpoint is required" });
  }

  try {
    // Handle body - support both string and object formats
    let requestBody;
    if (body) {
      requestBody = typeof body === "string" ? body : JSON.stringify(body);
    }

    const response = await fetch(`${dexieUrl}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: requestBody,
    });

    const data = await response.json().catch(() => ({}));

    // Forward response status and data
    res.status(response.status).json(data);
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: error.message });
  }
}
