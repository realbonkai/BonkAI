import React, { useState } from "react";
import "./Midjourney.css";

const Midjourney = () => {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState(null);
  const [generatedImage, setGeneratedImage] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Create FormData to send the image if available
      const formData = new FormData();
      formData.append("prompt", prompt);

      if (image) {
        const reader = new FileReader();
        reader.onload = async () => {
          formData.append("imageUrl", reader.result); // Base64 encode the image
          const response = await fetch("http://localhost:3003/midjourney", {
            method: "POST",
            body: JSON.stringify({
              prompt,
              imageUrl: reader.result,
            }),
            headers: { "Content-Type": "application/json" },
          });

          const data = await response.json();
          if (response.ok) {
            setGeneratedImage(data.imageUrl);
          } else {
            console.error(data.error);
            alert("Error generating image");
          }
          setLoading(false);
        };
        reader.readAsDataURL(image);
      } else {
        // Call API without image
        const response = await fetch("http://localhost:3003/midjourney", {
          method: "POST",
          body: JSON.stringify({ prompt }),
          headers: { "Content-Type": "application/json" },
        });

        const data = await response.json();
        if (response.ok) {
          setGeneratedImage(data.imageUrl);
        } else {
          console.error(data.error);
          alert("Error generating image");
        }
        setLoading(false);
      }
    } catch (error) {
      console.error("[ERROR] Image generation failed:", error.message);
      alert("Failed to generate image.");
      setLoading(false);
    }
  };

  return (
    <div className="midjourney-container">
      <h1>MidJourney Style Image Generator</h1>
      <form onSubmit={handleGenerate}>
        <label>
          Enter Prompt:
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe your image..."
            required
          />
        </label>
        <label>
          Upload Image (Optional for img2img):
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImage(e.target.files[0])}
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Generating..." : "Generate Image"}
        </button>
      </form>
      {generatedImage && (
        <div className="generated-image">
          <h2>Generated Image:</h2>
          <img src={generatedImage} alt="Generated" />
        </div>
      )}
    </div>
  );
};

export default Midjourney;
