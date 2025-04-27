// api/generate-meme.js
import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";
import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";

/** 1) SETUP ENVIRONMENT */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** 2) HELPER: Parse "Top:" / "Bottom:" lines */
function formatResponse(responseText) {
  try {
    const lines = responseText.split("\n");
    const topText =
      lines.find((line) => line.toLowerCase().startsWith("top:"))?.replace(/top:/i, "").trim() ||
      "No top text";
    const bottomText =
      lines
        .find((line) => line.toLowerCase().startsWith("bottom:"))
        ?.replace(/bottom:/i, "")
        .trim() || "No bottom text";
    return { topText, bottomText };
  } catch (error) {
    return { topText: "Parsing error", bottomText: "Parsing error" };
  }
}

/** 3) SERVERLESS HANDLER */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    // Only allow POST
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    console.log("[INFO] Received prompt:", prompt);

    // Step 1: Generate captions with OpenAI
    console.log("[INFO] Generating captions...");
    const textResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a witty assistant specializing in creating short, funny, and clever meme captions. ALL WITH CAPSLOCK. " +
            "Always respond exactly in this format:\n" +
            "Top: [Caption with 4 words max]\n" +
            "Bottom: [Caption with 4 words max]\n" +
            "The captions must be humorous, relevant to the prompt, and very concise.",
        },
        {
          role: "user",
          content: `Create a funny meme caption WITH CAPSLOCK for this prompt: "${prompt}".`,
        },
      ],
      temperature: 0.9,
    });

    const rawText = textResponse.choices[0].message.content.trim();
    const { topText, bottomText } = formatResponse(rawText);
    console.log("[DEBUG] topText:", topText, " bottomText:", bottomText);

    // Step 2: Use the captions to create a more descriptive prompt
    console.log("[INFO] Generating descriptive image prompt...");
    const detailedImagePrompt = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that creates descriptive prompts for generating high-quality, very funny, meme images. Avoid adding text in the image.",
        },
        {
          role: "user",
          content: `Based on "${prompt}",  create a highly descriptive prompt for an illustration based on the prompt given.`,
        },
      ],
      temperature: 0.9,
    });

    const imagePrompt = detailedImagePrompt.choices[0].message.content.trim();
    console.log("[INFO] Image prompt from OpenAI:", imagePrompt);

    // Step 3: Generate the image with Replicate (flux-schnell)
    console.log("[INFO] Generating image using flux-schnell...");
    const output = await replicate.run("black-forest-labs/flux-schnell", {
      input: { prompt: imagePrompt },
    });

    // Step 3a: Process the ReadableStream
    if (!output || !(output[0] instanceof ReadableStream)) {
      console.error("[ERROR] Invalid output from flux-schnell");
      return res.status(500).json({ error: "Invalid output from flux-schnell" });
    }

    console.log("[INFO] Processing ReadableStream...");
    const readableStream = output[0];
    const reader = readableStream.getReader();
    const chunks = [];
    let done = false;

    while (!done) {
      const { value, done: isDone } = await reader.read();
      if (value) {
        chunks.push(value);
      }
      done = isDone;
    }

    console.log("[INFO] Combining chunks...");
    const imageBuffer = Buffer.concat(chunks);
    const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;

    console.log("[INFO] Meme generation successful.");
    return res.status(200).json({
      imageUrl: base64Image,
      topText,
      bottomText,
    });
  } catch (error) {
    console.error("[ERROR] generate-meme:", error.message);
    return res.status(500).json({ error: "Failed to generate meme" });
  }
}
