import React, { useState } from "react";
import axios from "axios";
import "./FluxPage.css";

const FluxPage = () => {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert("Please enter a prompt!");
      return;
    }

    setLoading(true);
    setImageUrl("");

    try {
      let base64Image = null;
      if (image) {
        const reader = new FileReader();
        reader.onload = async () => {
          base64Image = reader.result;

          const response = await axios.post("http://localhost:3003/api/flux-generate", {
            prompt,
            imageUrl: base64Image,
          });

          setImageUrl(response.data.imageUrl);
          setLoading(false);
        };
        reader.readAsDataURL(image);
      } else {
        const response = await axios.post("http://localhost:3003/api/flux-generate", { prompt });
        setImageUrl(response.data.imageUrl);
        setLoading(false);
      }
    } catch (error) {
      console.error("Error generating image:", error.message);
      alert("Failed to generate the image. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="flux-wrapper">
      <h1 className="flux-title">Flux Image Generator</h1>
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Enter your prompt"
        className="flux-input"
      />
      <label className="flux-label">
        Optional: Upload an image for img2img
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImage(e.target.files[0])}
          className="flux-file-input"
        />
      </label>
      <button onClick={handleGenerate} className="flux-button" disabled={loading}>
        {loading ? "Generating..." : "Generate Image"}
      </button>
      {imageUrl && (
        <div className="flux-result">
          <h2>Generated Image</h2>
          <img src={imageUrl} alt="Generated" className="flux-image" />
        </div>
      )}
    </div>
  );
};

export default FluxPage;
