const axios = require("axios");
const { saveArtifactAndGenerateUrl } = require("../../common/gCloudStorage");
const path = require("path");
const fs = require("fs/promises");
const { v4: uuidv4 } = require("uuid");

const BASE_API_URL = "https://api.bfl.ml/v1"; // Base API URL
const DEFAULT_API_PATH = "flux-dev"; // Default API path

/**
 * Generates an image using the Flux API and saves it to GCS.
 * @param {string} uid - The user ID.
 * @param {string} scriptId - The script ID.
 * @param {string} versionId - The version ID.
 * @param {string} prompt - The prompt for generating the image.
 * @param {string} artifactType - The type of artifact (e.g., "images").
 * @param {object} options - Additional options for the function.
 * @param {string} [options.apiPath=DEFAULT_API_PATH] - The specific API path to use.
 * @param {number} [options.width=1024] - The width of the generated image.
 * @param {number} [options.height=1024] - The height of the generated image.
 * @returns {string} - The signed URL of the uploaded image.
 */
const generateAndSaveImage = async (
    uid,
    scriptId,
    versionId,
    prompt,
    artifactType = "images",
    options = {}
  ) => {
    const { apiPath = DEFAULT_API_PATH, width = 1024, height = 1024 } = options;
  
    try {
      // Construct the API endpoint
      const apiUrl = `${BASE_API_URL}/${apiPath}`;
  
      // Step 1: Send POST request to Flux API
      const payload = {
        prompt,
        width,
        height,
      };
      const headers = {
        accept: "application/json",
        "x-key": process.env.FLUX_API_KEY,
        "Content-Type": "application/json",
      };
  
      console.log(`Sending POST request to Flux API at ${apiUrl}...`);
      const response = await axios.post(apiUrl, payload, { headers });
      const requestId = response.data?.id;
  
      if (!requestId) {
        throw new Error("No request ID received from Flux API.");
      }
  
      console.log(`Flux API request ID: ${requestId}`);
  
      // Step 2: Poll for the result
      let imageUrl = null;
      const pollUrl = `${BASE_API_URL}/get_result`;
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // Poll every 500ms
  
        const pollResponse = await axios.get(pollUrl, {
          headers: {
            accept: "application/json",
            "x-key": process.env.FLUX_API_KEY,
          },
          params: { id: requestId },
        });
  
        const result = pollResponse.data;
        if (result?.status === "Ready") {
          imageUrl = result.result?.sample;
          console.log(`Image URL ready: ${imageUrl}`);
          break;
        } else {
          console.log(`Polling status: ${result?.status || "Unknown"}`);
        }
      }
  
      if (!imageUrl) {
        throw new Error("Failed to retrieve image URL from Flux API.");
      }
  
      // Step 3: Save the image URL to Google Cloud Storage and get a signed URL
      const signedUrl = await saveArtifactAndGenerateUrl(uid, scriptId, versionId, artifactType, imageUrl);
  
      console.log(`Signed URL for the image: ${signedUrl}`);
  
      return signedUrl;
    } catch (error) {
      console.error("Error in generateAndSaveImage:", error.message);
      throw new Error(`Failed to generate and save image: ${error.message}`);
    }
  };

module.exports = { generateAndSaveImage };
