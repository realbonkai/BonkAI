import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import "./FineTune.css";

const FineTune = () => {
  const [zipFile, setZipFile] = useState(null);
  const [finetuneComment, setFinetuneComment] = useState("");
  const [trainingStatus, setTrainingStatus] = useState("");
  const [finetuneId, setFinetuneId] = useState("");

  const handleTrain = async (e) => {
    e.preventDefault();

    if (!zipFile) {
      alert("Please upload a ZIP file!");
      return;
    }

    try {
      console.log("[DEBUG] Starting upload process...");
      setTrainingStatus("Uploading ZIP file...");
      const formData = new FormData();
      formData.append("zipFile", zipFile);
      formData.append("finetuneComment", finetuneComment);

      console.log("[DEBUG] Sending request to server...");
      const response = await fetch("http://localhost:3003/train", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[ERROR] File upload failed:", errorText);
        alert("Error uploading ZIP file.");
        return;
      }

      const { zipUrl } = await response.json();
      console.log("[DEBUG] Received ZIP URL:", zipUrl);

      setTrainingStatus("Saving job details...");

      const { data: jobData, error: jobError } = await supabase
        .from("fine_tuning_jobs")
        .insert([
          {
            images_zip_url: zipUrl,
            prompt: finetuneComment || "Default Prompt",
            status: "pending",
          },
        ])
        .select();

      if (jobError) {
        console.error("[ERROR] Saving job details failed:", jobError.message);
        alert("Failed to save fine-tuning job details.");
        return;
      }

      console.log("[DEBUG] Fine-tuning job saved:", jobData);
      setFinetuneId(jobData[0].id);
      setTrainingStatus("Fine-tuning job submitted successfully!");
    } catch (error) {
      console.error("[ERROR] Error handling train:", error.message);
      alert("An error occurred. Please try again.");
    }
  };

  return (
    <div className="finetune-container">
      <h1>Fine-Tune Your Model</h1>
      <form onSubmit={handleTrain} className="finetune-form">
        <label>
          Upload ZIP File:
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setZipFile(e.target.files[0])}
            required
          />
        </label>
        <label>
          Fine-Tune Comment:
          <input
            type="text"
            value={finetuneComment}
            onChange={(e) => setFinetuneComment(e.target.value)}
            placeholder="Describe your fine-tune..."
          />
        </label>
        <button type="submit">Start Fine-Tuning</button>
      </form>
      {trainingStatus && <p>{trainingStatus}</p>}
      {finetuneId && <p>Job ID: {finetuneId}</p>}
    </div>
  );
};

export default FineTune;
