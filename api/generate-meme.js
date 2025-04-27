import dotenv from "dotenv";
dotenv.config();

import OpenAI from "openai";
import Replicate from "replicate";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import FormData from "form-data"; // npm install form-data

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const IMGUR_API_URL = "https://api.imgur.com/3/image";
const CLIENT_ID = "7bd162baabe49a2"; // Directly embedded client ID

/** Helper: Convert a Web ReadableStream to Buffer */
async function streamToBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Helper: Parse "Top:" / "Bottom:" lines and remove surrounding quotes */
function formatResponse(responseText) {
  // Remove leading/trailing quotes (both " and ') from a string.
  const removeSurroundingQuotes = (str) =>
    str.replace(/^["']+|["']+$/g, "").trim();

  try {
    const lines = responseText.split("\n");
    let topText =
      lines.find((line) => line.toLowerCase().startsWith("top:"))?.replace(/top:/i, "").trim() ||
      "No top text";
    let bottomText =
      lines.find((line) => line.toLowerCase().startsWith("bottom:"))?.replace(/bottom:/i, "").trim() ||
      "No bottom text";

    topText = removeSurroundingQuotes(topText);
    bottomText = removeSurroundingQuotes(bottomText);
    return { topText, bottomText };
  } catch (error) {
    return { topText: "Parsing error", bottomText: "Parsing error" };
  }
}

/** Helper: Upload a base64 image to Imgur and return the URL */
async function uploadImageToImgur(dataUrl) {
  try {
    const formData = new FormData();
    // Remove the "data:image/xxx;base64," header if present.
    const base64Data = dataUrl.split(",")[1];
    formData.append("image", base64Data);

    const response = await axios.post(IMGUR_API_URL, formData, {
      headers: {
        ...formData.getHeaders(),
        Authorization: `Client-ID ${CLIENT_ID}`,
      },
    });

    if (response.data.success) {
      console.log("[INFO] Image uploaded to Imgur:", response.data.data.link);
      return response.data.data.link;
    } else {
      throw new Error("Imgur upload failed");
    }
  } catch (error) {
    console.error("[ERROR] Uploading image to Imgur:", error.message);
    return null;
  }
}

/** SERVERLESS HANDLER */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { prompt, image_prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    console.log("[INFO] Received prompt:", prompt);

    // Step 1: Generate captions with GPT‑4o.
    console.log("[INFO] Generating captions...");
    const textResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant specializing in creating short, highly sarcastic, polemical, dark humour, funny, and clever meme captions. ALL WITH CAPSLOCK. " +
            "Always respond exactly in this format:\n" +
            "Top: [Caption with 4 words max]\n" +
            "Bottom: [Caption with 4 words max]\n" +
            "The captions must be humorous, relevant to the prompt, and very concise.",
        },
        {
          role: "user",
          content: `Create a funny sarcastic humorous meme caption WITH CAPSLOCK for this prompt: "${prompt}".`,
        },
      ],
      temperature: 0.9,
    });

    const rawText = textResponse.choices[0].message.content.trim();
    const { topText, bottomText } = formatResponse(rawText);
    console.log("[DEBUG] topText:", topText, " bottomText:", bottomText);

    // Step 2: Generate a descriptive image prompt with GPT‑4o.
    console.log("[INFO] Generating descriptive image prompt...");
    const detailedImagePrompt = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that creates descriptive prompts for generating high-quality, highly sarcastic, very funny, meme images. Avoid adding text in the image.",
        },
        {
          role: "user",
          content: `Based on "${prompt}", create a highly descriptive prompt for a meme based on the prompt given.`,
        },
      ],
      temperature: 0.9,
    });

    const imagePrompt = detailedImagePrompt.choices[0].message.content.trim();
    console.log("[INFO] Image prompt from OpenAI:", imagePrompt);

    // Step 3: Build the Flux‑Pro input.
    const fluxInput = {
      prompt: imagePrompt,
      width: 1024,
      height: 1024,
      steps: 25,
      guidance: 3,
      interval: 2,
      aspect_ratio: "1:1",
      output_format: "png",
      output_quality: 80,
      safety_tolerance: 2,
      prompt_upsampling: false,
    };

    // If an image was uploaded, upload it to Imgur and pass its URL as image_prompt.
    if (image_prompt) {
      console.log("[INFO] Found image_prompt. Uploading to Imgur...");
      const imgurUrl = await uploadImageToImgur(image_prompt);
      if (imgurUrl) {
        console.log("[INFO] Passing Imgur URL as image_prompt to flux-pro...");
        fluxInput.image_prompt = imgurUrl;
        fluxInput.strength = 0.5; // Adjust strength as needed.
      } else {
        console.warn("[WARN] Image upload to Imgur failed. Proceeding without image_prompt.");
      }
    }

    // Log the final fluxInput before sending.
    console.log("[DEBUG] Flux-Pro input:", JSON.stringify(fluxInput, null, 2));

    // Step 4: Generate the image with Flux‑Pro.
    console.log("[INFO] Generating image using flux-pro...");
    let output;
    try {
      output = await replicate.run("black-forest-labs/flux-pro", {
        input: fluxInput,
      });
    } catch (error) {
      // If we get a 429 error, fall back to using the original base64 image directly.
      if (error.message && error.message.includes("429")) {
        console.warn("[WARN] Received 429 Too Many Requests when using Imgur URL. Falling back to base64 image_prompt.");
        fluxInput.image_prompt = image_prompt; // use the original base64 data URI
        output = await replicate.run("black-forest-labs/flux-pro", {
          input: fluxInput,
        });
      } else {
        throw error;
      }
    }

    if (!output) {
      console.error("[ERROR] Invalid output from flux-pro");
      return res.status(500).json({ error: "Invalid output from flux-pro" });
    }

    console.log("[INFO] Processing flux-pro output...");
    let base64Image;

    if (Buffer.isBuffer(output)) {
      base64Image = `data:image/png;base64,${output.toString("base64")}`;
    } else if (typeof output === "string" && output.startsWith("data:image")) {
      base64Image = output;
    } else if (typeof output === "string") {
      console.log("[INFO] Output is a URL, fetching image data...");
      const response = await axios.get(output, { responseType: "arraybuffer" });
      const buffer = Buffer.from(response.data, "binary");
      base64Image = `data:image/png;base64,${buffer.toString("base64")}`;
    } else if (output && typeof output.getReader === "function") {
      console.log("[INFO] Output is a ReadableStream, converting to Buffer...");
      const buffer = await streamToBuffer(output);
      base64Image = `data:image/png;base64,${buffer.toString("base64")}`;
    } else {
      console.error("[ERROR] Unexpected output format from flux-pro:", output);
      return res.status(500).json({ error: "Unexpected output format" });
    }

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
