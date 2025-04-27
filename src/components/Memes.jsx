import React, { useRef, useState, useEffect } from "react";
import "./Memes.css"; // Updated pixelated styling
import axios from "axios";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { supabase } from "../supabaseClient";
import { PayForCredits } from "./PayForCredits";
import { FaTwitter, FaFacebook, FaInstagram } from "react-icons/fa";
import Header from "./Header";
import Footer from "./Footer";
import memeplaceholder from "../assets/meme-placeholder.png";

function dataURLToFile(dataUrl, filename) {
  const arr = dataUrl.split(",");
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) throw new Error("Invalid data URL");
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

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
      return data.data.link;
    } else {
      throw new Error("Failed to upload image to Imgur");
    }
  } catch (error) {
    console.error("Error uploading image to Imgur:", error);
    return null;
  }
}

const Memes = () => {
  const { publicKey } = useWallet();
  const [credits, setCredits] = useState(10);
  const [customPrompt, setCustomPrompt] = useState("");
  const [topText, setTopText] = useState("");
  const [bottomText, setBottomText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [imgurLink, setImgurLink] = useState("");
  const [uploadedImage, setUploadedImage] = useState(null);
  const canvasRef = useRef(null);
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

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

  useEffect(() => {
    if (!imageUrl) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = async () => {
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
      if (topText) drawText(ctx, topText, canvas.width / 2, 70, maxWidth);
      if (bottomText) drawText(ctx, bottomText, canvas.width / 2, canvas.height - 60, maxWidth);
      const base64Image = canvas.toDataURL("image/png");
      const memeFile = dataURLToFile(base64Image, "meme.png");
      const uploadedUrl = await uploadImageToImgur(memeFile);
      if (!uploadedUrl) {
        console.error("Failed to upload to Imgur. Meme not saved.");
        return;
      }
      setImgurLink(uploadedUrl);
      try {
        const saveResponse = await axios.post(`/api/generate-meme`, {
          prompt: customPrompt,
          imgUrl: uploadedUrl,
          walletAddress: publicKey ? publicKey.toBase58() : "SAMPLE_WALLET_ADDRESS",
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
  }, [imageUrl, topText, bottomText, publicKey]);

  useEffect(() => {
    const saveWalletToDatabase = async () => {
      if (!publicKey) return;
      const walletAddress = publicKey.toBase58();
      try {
        const { data: user, error: fetchError } = await supabase
          .from("meme_gen")
          .select("credits")
          .eq("wallet_address", walletAddress)
          .single();
        if (fetchError && fetchError.code !== "PGRST116") {
          throw new Error(`Error fetching wallet: ${fetchError.message}`);
        }
        if (user) {
          setCredits(user.credits);
          console.log("User found in Supabase with credits:", user.credits);
        } else {
          const { error: insertError } = await supabase
            .from("meme_gen")
            .insert([{ wallet_address: walletAddress, credits: 10 }]);
          if (insertError) {
            throw new Error(`Error adding wallet: ${insertError.message}`);
          }
          console.log("New wallet added with 10 credits:", walletAddress);
          setCredits(10);
        }
      } catch (error) {
        console.error("Error saving wallet to Supabase:", error.message);
      }
    };
    saveWalletToDatabase();
  }, [publicKey]);

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
      const response = await axios.post(`/api/generate-meme`, {
        prompt: customPrompt,
        image_prompt: uploadedImage || null,
      });
      const { imageUrl, topText, bottomText } = response.data;
      console.log("Meme generated by server:", { imageUrl, topText, bottomText });
      setImageUrl(imageUrl);
      setTopText(topText);
      setBottomText(bottomText);
      setCredits((prevCredits) => prevCredits - 1);
    } catch (error) {
      console.error("Error generating meme:", error.message);
      alert("Failed to generate the meme. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCreditsUpdate = (newCredits) => {
    setCredits((prevCredits) => prevCredits + newCredits);
    alert(`You successfully purchased ${newCredits} credits!`);
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      alert("No meme available to download!");
      return;
    }
    canvas.toBlob((blob) => {
      if (blob) {
        const link = document.createElement("a");
        link.download = "meme.png";
        link.href = URL.createObjectURL(blob);
        link.click();
        URL.revokeObjectURL(link.href);
      } else {
        console.error("Failed to generate blob from canvas.");
        alert("Failed to download the meme. Please try again.");
      }
    }, "image/png");
  };

 

  return (
    <>
      <Header />
      <div className="page-wrapper">
        <div className="columns">
          <div className="left-column">
            {imageUrl ? (
              <canvas ref={canvasRef} className="meme-canvas" />
            ) : (
              <img src={memeplaceholder} alt="Meme Placeholder" className="meme-placeholder" />
            )}
          </div>
          <div className="right-column">
            <div className="input-section">
              <h1 className="title-meme">AI Meme Generator</h1>
              <h3 className="subtitle">
                Add your prompts and optionally upload an image to create memes. Buy more with SOL
              </h3>
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Add text prompt"
                className="meme-input"
              />
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={handleImageUpload}
                className="meme-image-input"
              />
              {uploadedImage && (
                <div className="uploaded-image-preview">
                  <img src={uploadedImage} alt="Uploaded character" style={{ maxWidth: "100px" }} />
                  <button onClick={() => setUploadedImage(null)}>Remove</button>
                </div>
              )}
              <div className="buttons">
                <button onClick={generateMeme} className="btn generate" disabled={isGenerating}>
                  {isGenerating ? "Generating..." : "Generate"}
                </button>
                <button onClick={handleDownload} className="btn download">
                  Download
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
      <Footer />
    </>
  );
};

export default Memes;
