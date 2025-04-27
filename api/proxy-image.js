// api/proxy-image.js

import axios from "axios";

/**
 * GET /api/proxy-image?url=<IMAGE_URL>
 * Proxies an image from a remote server, returning its binary data.
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use GET" });
  }

  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: "Image URL is required" });
    }

    // Fetch the image using axios
    const response = await axios.get(url, { responseType: "arraybuffer" });

    // Set proper headers
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");

    return res.status(200).send(response.data);
  } catch (error) {
    console.error("Error fetching image:", error.message);
    return res.status(500).json({ error: "Failed to fetch image", details: error.message });
  }
}
