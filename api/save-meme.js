// api/save-meme.js

import dotenv from "dotenv";
dotenv.config();

import { createClient } from "@supabase/supabase-js";

/** Initialize Supabase */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * POST /api/save-meme
 * Body: { prompt, imgUrl, walletAddress? }
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST" });
  }

  try {
    const { prompt, imgUrl, walletAddress } = req.body;

    if (!prompt || !imgUrl) {
      return res.status(400).json({ error: "Missing prompt or imgUrl" });
    }

    const { data, error } = await supabase
      .from("meme_gen")
      .insert([
        {
          prompt: prompt,
          img_url: imgUrl,
          wallet_address: walletAddress || null,
          created_at: new Date().toISOString(),
        },
      ])
      .select();

    if (error) {
      throw error;
    }

    console.log("[INFO] Successfully saved meme in Supabase:", data[0]);

    return res.status(200).json({ meme: data[0] });
  } catch (err) {
    console.error("[ERROR] save-meme route:", err.message);
    return res.status(500).json({ error: "Failed to save meme in Supabase" });
  }
}
