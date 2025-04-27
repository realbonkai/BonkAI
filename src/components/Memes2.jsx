import React, { useRef, useState, useEffect } from "react";
import "./Memes.css";
import axios from "axios";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { supabase } from "../supabaseClient";
import { PayForCredits } from "./PayForCredits";
import { FaTwitter, FaFacebook, FaInstagram } from "react-icons/fa";
import Header from "./Header";
import memeplaceholder from "../assets/meme-placeholder.png";

/** 1) Utility to convert base64 to File */
function dataURLToFile(dataUrl, filename) {
  const arr = dataUrl.split(",");
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) {
    throw new Error("Invalid data URL");
  }
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/** 2) Imgur upload function */
const IMGUR_API_URL = "https://api.imgur.com/3/image";
const CLIENT_ID = "6edca67137f0998"; // Your Imgur Client ID

async function uploadImageToImgur(file) {
  const formData = new FormData();
  formData.append("image", file);

  try {
    const response = await fetch(IMGUR_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Client-ID ${CLIENT_ID}`,
        Accept: "application/json",
      },
      body: formData,
    });
    const data = await response.json();

    if (data.success) {
      console.log("Image uploaded to Imgur:", data.data.link);
      return data.data.link; // The Imgur link
    } else {
      throw new Error("Failed to upload image to Imgur");
    }
  } catch (error) {
    console.error("Error uploading image to Imgur:", error);
    return null;
  }
}

const Memes2 = () => {
  const { publicKey } = useWallet();
  const [credits, setCredits] = useState(10);
  const [customPrompt, setCustomPrompt] = useState("");
  const [topText, setTopText] = useState("");
  const [bottomText, setBottomText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // We'll store the final Imgur link after uploading for share
  const [imgurLink, setImgurLink] = useState("");

  const canvasRef = useRef(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  /** Draw text helper */
  const drawText = (ctx, text, x, y, maxWidth) => {
    const words = text.split(" ");
    let line = "";
    const lineHeight = 40;

    words.forEach((word, i) => {
      const testLine = line + word + " ";
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;

      if (testWidth > maxWidth && i > 0) {
        ctx.fillText(line, x, y);
        ctx.strokeText(line, x, y);
        line = word + " ";
        y += lineHeight;
      } else {
        line = testLine;
      }
    });

    ctx.fillText(line, x, y);
    ctx.strokeText(line, x, y);
  };

  /**
   * After "imageUrl" or "topText"/"bottomText" changes,
   * we draw the meme on the canvas.
   */
  useEffect(() => {
    if (!imageUrl) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    img.onload = async () => {
      // Adjust canvas to half image size for convenience
      canvas.width = img.width / 2;
      canvas.height = img.height / 2;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      ctx.font = "42px Impact";
      ctx.fillStyle = "white";
      ctx.strokeStyle = "black";
      ctx.lineWidth = 2;
      ctx.textAlign = "center";

      const maxWidth = canvas.width * 0.8;

      // Draw top/bottom text
      if (topText) {
        drawText(ctx, topText, canvas.width / 2, 70, maxWidth);
      }
      if (bottomText) {
        const yPosition = canvas.height - 60;
        drawText(ctx, bottomText, canvas.width / 2, yPosition, maxWidth);
      }

      // ===== After drawing is done, automatically upload + save to Supabase =====
      // 1. Convert canvas to a File
      const base64Image = canvas.toDataURL("image/png");
      const memeFile = dataURLToFile(base64Image, "meme.png");

      // 2. Upload to Imgur
      const uploadedUrl = await uploadImageToImgur(memeFile);
      if (!uploadedUrl) {
        console.error("Failed to upload to Imgur. Meme not saved.");
        return;
      }

      setImgurLink(uploadedUrl); // So user can share from Imgur link

      // 3. Save to Supabase
      try {
        const saveResponse = await axios.post(`/api/generate-meme2`, {
          prompt: customPrompt,
          imgUrl: uploadedUrl,
          walletAddress: "SAMPLE_WALLET_ADDRESS", // Or actual user wallet
        });
        if (saveResponse.data.meme) {
          console.log("Meme saved in Supabase, ID:", saveResponse.data.meme.id);
        }
      } catch (err) {
        console.error("Error saving meme to Supabase:", err);
      }
    };

    img.onerror = () => {
      console.error("Failed to load the image from base64 URL.");
    };
  }, [imageUrl, topText, bottomText]);

  /** Save user's wallet address and initial credits */
  useEffect(() => {
    const saveWalletToDatabase = async () => {
      if (!publicKey) return;

      const walletAddress = publicKey.toBase58();

      try {
        // Check if the wallet exists in Supabase
        const { data: user, error: fetchError } = await supabase
          .from("meme_gen")
          .select("credits")
          .eq("wallet_address", walletAddress)
          .single();

        if (fetchError && fetchError.code !== "PGRST116") {
          // Ignore "Row not found" errors
          throw new Error(`Error fetching wallet: ${fetchError.message}`);
        }

        if (user) {
          // Wallet exists, set the existing credits
          setCredits(user.credits);
          console.log("User found in Supabase with credits:", user.credits);
        } else {
          // Add a new wallet with initial credits (10)
          const { error: insertError } = await supabase
            .from("meme_gen")
            .insert([
              {
                wallet_address: walletAddress,
                credits: 10,
              },
            ]);

          if (insertError) {
            throw new Error(`Error adding wallet: ${insertError.message}`);
          }

          console.log("New wallet added with 10 credits:", walletAddress);
          setCredits(10); // Set initial credits for new users
        }
      } catch (error) {
        console.error("Error saving wallet to Supabase:", error.message);
      }
    };

    saveWalletToDatabase();
  }, [publicKey]);

  /**
   * 1) Call /api/generate-meme to get base64 image, top/bottom text
   * 2) Deduct credits
   * 3) Set state => triggers re-draw + Imgur upload + saving
   */
  const generateMeme = async () => {
    if (!customPrompt.trim()) {
      alert("Please enter a meme prompt!");
      return;
    }

    if (credits <= 0) {
      alert("Not enough credits! Please buy more to generate memes.");
      return;
    }

    setIsGenerating(true);

    try {
      const response = await axios.post(`/api/generate-meme2`, {
        prompt: customPrompt,
      });

      const { imageUrl, topText, bottomText } = response.data;

      console.log("Meme generated by server:", {
        imageUrl,
        topText,
        bottomText,
      });
      setImageUrl(imageUrl);
      setTopText(topText);
      setBottomText(bottomText);

      setCredits((prevCredits) => prevCredits - 1);
    } catch (error) {
      console.error("Error generating meme:", error.message);
      alert("Failed to generate the meme. Please try again.");
    } finally {
      setIsGenerating(false); // Reset the state when the process is complete
    }
  };

  const handleCreditsUpdate = (newCredits) => {
    setCredits((prevCredits) => prevCredits + newCredits);
    alert(`You successfully purchased ${newCredits} credits!`);
  };

  /** Allows user to directly download the canvas as a PNG */
  const handleDownload = () => {
    const canvas = canvasRef.current;
  
    if (!canvas) {
      alert("No meme available to download!");
      return;
    }
  
    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (blob) {
        const link = document.createElement("a");
        link.download = "meme.png";
        link.href = URL.createObjectURL(blob);
  
        // Trigger download
        link.click();
  
        // Clean up the object URL
        URL.revokeObjectURL(link.href);
      } else {
        console.error("Failed to generate blob from canvas.");
        alert("Failed to download the meme. Please try again.");
      }
    }, "image/png");
  };
  

  /**
   * Share: Re-upload or reuse the last known Imgur link (imgurLink).
   * For best previews, consider using the full Imgur page link if available.
   */
  const handleShare = async (platform) => {
    if (!imgurLink) {
      alert("No Imgur link found. Generate a meme first!");
      return;
    }

    // For best social previews, you might want `https://imgur.com/<imageId>`
    // But we'll use direct link here.
    const shareUrl = encodeURIComponent(imgurLink);

    if (platform === "twitter") {
      const url = `https://twitter.com/intent/tweet?text=Check%20out%20my%20meme!&url=${shareUrl}`;
      window.open(url, "_blank");
    } else if (platform === "facebook") {
      const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`;
      window.open(fbUrl, "_blank");
    } else if (platform === "instagram") {
      alert(
        "Instagram sharing is not supported directly. Download and share manually."
      );
    }
  };

  return (
    <>
      <Header />
      <div className="page-wrapper">
        <div className="columns">
          {/* Left Column: Meme Canvas or Placeholder */}
          <div className="left-column">
            {imageUrl ? (
              <canvas ref={canvasRef} className="meme-canvas" />
            ) : (
              <img
                src={memeplaceholder}
                alt="Meme Placeholder"
                className="meme-placeholder"
              />
            )}
          </div>

          {/* Right Column: Input, Buttons, and Credits */}
          <div className="right-column">
            <div className="input-section">
              <h1 className="title-meme">AI Meme Generator</h1>
              <h3 className="subtitle">
                Add your prompts and start creating memes. Buy more with SOL
              </h3>
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter your meme description"
                className="meme-input"
              />
              <div className="buttons">
                <button
                  onClick={generateMeme}
                  className="btn generate"
                  disabled={isGenerating} // Disable the button while generating
                >
                  {isGenerating ? "Generating..." : "Generate Meme"}{" "}
                  {/* Conditional text */}
                </button>
                <button onClick={handleDownload} className="btn download">
                  Download Meme
                </button>
              </div>
            </div>

            <div className="credits-container">
              <span>Credits Left:</span>
              <span className="credits-badge">{credits}</span>
              <div className="pay-credits-button">
                <PayForCredits onCreditsPurchase={handleCreditsUpdate} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Memes2;
