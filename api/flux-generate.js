// api/flux-generate.js
import dotenv from "dotenv";
dotenv.config();

import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, imageUrl } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required." });
    }

    const input = {
      prompt,
      disable_safety_checker: true,
    };
    if (imageUrl) {
      input.image = imageUrl;
    }

    const output = await replicate.run("black-forest-labs/flux-schnell", { input });
    // ... same logic: check if output is a ReadableStream, then read and return the base64
    // or if it’s a direct URL array, return that
    // ...
  } catch (err) {
    console.error("[ERROR] flux-generate:", err);
    return res.status(500).json({ error: "Failed to generate image" });
  }
}
