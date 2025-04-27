  import express from "express";
  import cors from "cors";
  import OpenAI from "openai";
  import dotenv from "dotenv";
  import axios from "axios";
  import multer from "multer";
  import Replicate from "replicate";
  import { createClient } from "@supabase/supabase-js";

  dotenv.config();

  // Initialize Supabase directly in this file  
  const supabaseUrl = "https://mivxbkbqlpwfkrlgcvqt.supabase.co";
  const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1pdnhia2JxbHB3ZmtybGdjdnF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjkxNzkxMjMsImV4cCI6MjA0NDc1NTEyM30.LuOK6Z0p4I3RAS-_HprsoHcsRZaXc-sW2Em9A_Mxg5I";
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase environment variables.");
    process.exit(1); // Exit if the variables are missing
  }
  
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  

  dotenv.config();

  const app = express();
  const port = 3003;

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: "10mb" })); // Increase payload limit to 10MB
  app.use(express.urlencoded({ limit: "10mb", extended: true })); // For URL-encoded form data
  // OpenAI configuration
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // API key stored in .env
  });


  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });


  // Helper function to parse OpenAI response for captions
  function formatResponse(responseText) {
    try {
      const lines = responseText.split("\n");
      const topText =
        lines.find((line) => line.toLowerCase().startsWith("top:"))?.replace(/top:/i, "").trim().replace(/["']/g, "") ||
        "No top text";
      const bottomText =
        lines
          .find((line) => line.toLowerCase().startsWith("bottom:"))
          ?.replace(/bottom:/i, "")
          .trim()
          .replace(/["']/g, "") || "No bottom text";
      return { topText, bottomText };
    } catch (error) {
      return { topText: "Parsing error", bottomText: "Parsing error" };
    }
  }
  

  // Proxy route to fetch DALL·E image with CORS headers
  app.get("/api/proxy-image", async (req, res) => {
    try {
      const { url } = req.query;

      if (!url) {
        return res.status(400).json({ error: "Image URL is required" });
      }

      // Fetch the image using axios
      const response = await axios.get(url, { responseType: "arraybuffer" });

      // Set proper headers
      res.set("Content-Type", "image/png");
      res.set("Cache-Control", "no-store");

      res.send(response.data); // Send the image data to the frontend
    } catch (error) {
      console.error("Error fetching image:", error.message);
      res.status(500).json({ error: "Failed to fetch image", details: error.message });
    }
  });


  app.post("/api/flux-generate", async (req, res) => {
    try {
      const { prompt, imageUrl } = req.body;
  
      if (!prompt) {
        console.error("[ERROR] No prompt provided.");
        return res.status(400).json({ error: "Prompt is required." });
      }
  
      console.log("[INFO] Generating image with prompt:", prompt);
  
      const input = {
        prompt,
        disable_safety_checker: true,
      };
  
      if (imageUrl) {
        console.log("[INFO] Using uploaded image for img2img generation.");
        input.image = imageUrl;
      }
  
      const output = await replicate.run("black-forest-labs/flux-schnell", { input });
  
      if (output && output[0] instanceof ReadableStream) {
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
  
        // Combine all chunks into a single buffer
        const imageBuffer = Buffer.concat(chunks);
  
        // Convert the buffer to a Base64 string
        const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
  
        console.log("[INFO] Successfully processed image.");
        return res.json({ imageUrl: base64Image });
      } else if (Array.isArray(output) && output[0]) {
        console.log("[INFO] Generated direct image URL:", output[0]);
        return res.json({ imageUrl: output[0] });
      } else {
        console.error("[ERROR] Unexpected output format from Replicate:", output);
        throw new Error("Unexpected output format from Replicate.");
      }
    } catch (error) {
      console.error("[ERROR] Failed to generate image:", error.message);
      res.status(500).json({ error: "Failed to generate image.", details: error.message });
    }
  });
  
  
  


  // Example: POST /api/save-meme
app.post("/api/save-meme", async (req, res) => {
  try {
    const { prompt, imgUrl, walletAddress } = req.body;

    if (!imgUrl || !prompt) {
      return res.status(400).json({ error: "Missing imgUrl or prompt" });
    }

    // Example insert into `meme_gen` table
    // Columns: id, created_at, wallet_address, credits, img_url, prompt
    const { data, error } = await supabase
      .from("meme_gen")
      .insert([
        {
          prompt: prompt,
          img_url: imgUrl,
          wallet_address: walletAddress || null, // If you want to store user's wallet
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      throw error;
    }

    // Return the newly inserted row
    return res.json({ meme: data[0] });
  } catch (err) {
    console.error("Error saving meme:", err.message);
    res.status(500).json({ error: "Failed to save meme in Supabase" });
  }
});


  // Start Fine-Tune Job

// Multer configuration
const upload = multer({ dest: "uploads/" }); // Temporary upload folder

// Route to handle file upload and create a job
app.post("/train", upload.single("zipFile"), async (req, res) => {
  console.log("[INFO] Received request at /train");

  try {
    const { finetuneComment, userId, prompt } = req.body;
    console.log("[DEBUG] Request body:", { finetuneComment, userId, prompt });

    if (!req.file) {
      console.error("[ERROR] No file uploaded.");
      return res.status(400).json({ error: "No file uploaded." });
    }

    console.log("[INFO] File uploaded successfully:", req.file);

    const publicUrl = `https://example.com/uploads/${req.file.filename}`;
    console.log("[INFO] Generated public URL:", publicUrl);

    const jobDetails = {
      id: crypto.randomUUID(), // Generate a unique UUID
      user_id: userId || null, // Optional user ID
      replicate_job_id: null, // Set null initially
      status: "pending", // Default status
      progress: 0, // Default progress
      model_url: null, // Initially null
      updated_at: new Date().toISOString(), // Current timestamp
      prompt: prompt || "Default Prompt", // Prompt or fallback
      images_zip_url: publicUrl, // URL for uploaded file
    };

    console.log("[DEBUG] Job details to insert:", jobDetails);

    const { data, error } = await supabase
      .from("fine_tuning_jobs")
      .insert(jobDetails)
      .select();

    if (error) {
      console.error("[ERROR] Supabase insert error:", error.message);
      return res.status(500).json({ error: "Failed to save job in Supabase.", details: error.message });
    }

    console.log("[INFO] Job saved successfully:", data);

    const jobId = data[0].id;
    res.json({
      message: "Job created successfully.",
      jobId,
      zipUrl: publicUrl,
    });
  } catch (error) {
    console.error("[ERROR] Unexpected error in /train:", error.message);
    res.status(500).json({ error: "Failed to handle file upload." });
  }
});


// Function to start fine-tuning
const startFineTuneJob = async (jobId, zipUrl) => {
  try {
    console.log(`[INFO] Starting fine-tuning for Job ID: ${jobId}`);

    // Update job status to "in_progress"
    await supabase
      .from("fine_tuning_jobs")
      .update({ status: "in_progress" })
      .eq("id", jobId);

    // Run fine-tuning with Replicate
    const result = await replicate.run("replicate/dreambooth", {
      input: {
        instance_data: zipUrl,
        instance_prompt: "a custom avatar",
        class_prompt: "a person",
        num_train_epochs: 2,
      },
    });

    console.log(`[INFO] Fine-tuning completed for Job ID: ${jobId}`);

    // Update job with result
    await supabase
      .from("fine_tuning_jobs")
      .update({
        status: "completed",
        result_url: result[0],
      })
      .eq("id", jobId);
  } catch (error) {
    console.error(`[ERROR] Fine-tuning failed for Job ID: ${jobId}`, error.message);

    // Update job status to "failed"
    await supabase
      .from("fine_tuning_jobs")
      .update({ status: "failed" })
      .eq("id", jobId);
  }
};

// API to check job status
app.get("/status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;

    const { data, error } = await supabase
      .from("fine_tuning_jobs")
      .select("*")
      .eq("id", jobId)
      .single();

    if (error) {
      console.error("[ERROR] Fetching job status:", error.message);
      return res.status(404).json({ error: "Job not found." });
    }

    res.json(data);
  } catch (error) {
    console.error("[ERROR] Fetching job status:", error.message);
    res.status(500).json({ error: "Failed to fetch job status." });
  }
});


app.post("/midjourney", async (req, res) => {
  try {
    const { prompt, imageUrl } = req.body;

    if (!prompt) {
      console.error("[ERROR] No prompt provided for MidJourney route.");
      return res.status(400).json({ error: "Prompt is required." });
    }

    console.log("[INFO] Generating image with MidJourney prompt:", prompt);

    // Prepare input for Replicate model
    const input = {
      prompt: `mdjrny-v4 style ${prompt}`, // Add MidJourney v4 style tag
      guidance_scale: 7, // Adjust guidance scale
      num_inference_steps: 50, // Adjust steps for finer quality
      disable_safety_checker: true, // Disable safety checker
    };

    // Add image to input if provided
    if (imageUrl) {
      console.log("[INFO] Using image for img2img generation:", imageUrl);
      input.image = imageUrl; // Pass image URL to the model
    }

    // Request to the Replicate model
    const output = await replicate.run("prompthero/openjourney", { input });

    console.log("[INFO] Raw output from Replicate (MidJourney):", output);

    if (Array.isArray(output) && output[0]) {
      // Return the first generated image URL
      return res.json({ imageUrl: output[0] });
    } else {
      console.error("[ERROR] Unexpected output format from Replicate (MidJourney):", output);
      throw new Error("Unexpected output format from Replicate.");
    }
  } catch (error) {
    console.error("[ERROR] Failed to generate MidJourney image:", error.message);
    res.status(500).json({ error: "Failed to generate image.", details: error.message });
  }
});



  // Endpoint to generate image and captions
  app.post("/api/generate-meme", async (req, res) => {
    try {
      const { prompt } = req.body;
      console.log("[INFO] Received prompt:", prompt);
  
      // Step 1: Generate captions
      console.log("[INFO] Generating captions...");
      const textResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a witty assistant specializing in creating short, funny, and clever meme captions. " +
              "Always respond exactly in this format:\n" +
              "Top: [Caption with 4 words max]\n" +
              "Do not include quotation marks (\" \") in the captions. " +
              "Bottom: [Caption with 4 words max]\n" +
              "The captions must be humorous, relevant to the prompt, and very concise.",
          },
          {
            role: "user",
            content: `Create a funny meme caption for this prompt: "${prompt}".`,
          },
        ],
        temperature: 0.9,
      });
  
      console.log("[INFO] Captions generated by OpenAI:", textResponse.choices[0].message.content.trim());
      const rawText = textResponse.choices[0].message.content.trim();
      const { topText, bottomText } = formatResponse(rawText);
  
      console.log("[DEBUG] Parsed top text:", topText);
      console.log("[DEBUG] Parsed bottom text:", bottomText);
  
      // Step 2: Generate image prompt using captions
      console.log("[INFO] Generating descriptive image prompt...");
      const detailedImagePromptResponse = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are an assistant that creates descriptive prompts for generating high-quality, very funny, meme cartoonish images with vibrant and colorful 2D-style visuals. Avoid adding text in the image.",
          },
          {
            role: "user",
            content: `Based on the captions:\nTop: "${topText}"\nBottom: "${bottomText}", create a highly descriptive prompt inspired on the captions for a cartoon meme illustration.`,
          },
        ],
        temperature: 0.9,
      });
  
      const imagePrompt = detailedImagePromptResponse.choices[0].message.content.trim();
      console.log("[INFO] Generated image prompt:", imagePrompt);
  
      // Step 3: Generate image using Flux Schnell (Replicate)
      console.log("[INFO] Sending request to Flux Schnell on Replicate...");
      const output = await replicate.run("black-forest-labs/flux-schnell", {
        input: { prompt: imagePrompt },
      });
  
      console.log("[INFO] Received output from Flux Schnell:", output);
  
      // Process ReadableStream output
      if (!output || !(output[0] instanceof ReadableStream)) {
        console.error("[ERROR] Invalid output from Flux Schnell. Expected ReadableStream.");
        throw new Error("Invalid output from Flux Schnell");
      }
  
      console.log("[INFO] Processing ReadableStream...");
      const readableStream = output[0];
      const reader = readableStream.getReader();
      const chunks = [];
      let done = false;
  
      while (!done) {
        const { value, done: isDone } = await reader.read();
        if (value) {
          console.log("[DEBUG] Received chunk of size:", value.byteLength);
          chunks.push(value);
        }
        done = isDone;
      }
  
      console.log("[INFO] Concatenating chunks into a single buffer...");
      const imageBuffer = Buffer.concat(chunks);
  
      console.log("[INFO] Converting buffer to Base64 image URL...");
      const base64Image = `data:image/png;base64,${imageBuffer.toString("base64")}`;
  
      console.log("[INFO] Meme generation successful. Sending response...");
      // Send the Base64 image URL back to the frontend
      res.json({ imageUrl: base64Image, topText, bottomText });
    } catch (error) {
      console.error("[ERROR] Failed to generate meme:", error.message);
      res.status(500).json({ error: "Failed to generate meme" });
    }
  });
  
  




  // Start the server
  app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
  });
