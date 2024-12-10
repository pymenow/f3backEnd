const { fal } = require("@fal-ai/client");
const { saveArtifactAndGenerateUrl } = require("../../common/gCloudStorage");

// Configure FAL client with credentials
fal.config({
  credentials: process.env.FAL_KEY, // Ensure FAL_KEY is set in your environment
});

/**
 * Generates an image using the FAL API and saves it to GCS.
 * @param {string} uid - The user ID.
 * @param {string} scriptId - The script ID.
 * @param {string} versionId - The version ID.
 * @param {string} prompt - The prompt for generating the image.
 * @param {string} artifactType - The type of artifact (e.g., "images").
 * @param {object} options - Additional options for the function.
 * @param {number} [options.width=1024] - The width of the generated image.
 * @param {number} [options.height=1024] - The height of the generated image.
 * @returns {string} - The signed URL of the uploaded image.
 */
const generateAndSaveImageWithFAL = async (
  uid,
  scriptId,
  versionId,
  prompt,
  artifactType = "images",
  options = {}
) => {
  const { width = 1280, height = 720 } = options;

  try {
    console.log(`Sending request to FAL API at endpoint: fal-ai/flux/schnell`);

    // Step 1: Submit the request to FAL API
    const result = await fal.subscribe("fal-ai/flux/schnell", {
      input: {
        prompt,
        image_size: {
            width,
            height,
          },
        num_images: 1,
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          console.log("Processing Update:", update.logs.map((log) => log.message).join("\n"));
        }
      },
    });

    const imageUrl = result.data?.images?.[0]?.url;
    const requestId = result.requestId;

    if (!imageUrl) {
      throw new Error("Failed to retrieve image URL from FAL API.");
    }

    console.log(`FAL API image URL ready: ${imageUrl}`);
    console.log(`FAL API Request ID: ${requestId}`);

    // Step 2: Save the image URL to Google Cloud Storage and get a signed URL
    const signedUrl = await saveArtifactAndGenerateUrl(uid, scriptId, versionId, artifactType, imageUrl, width, height);

    console.log(`Signed URL for the image: ${signedUrl}`);

    return signedUrl;
  } catch (error) {
    console.error("Error in generateAndSaveImageWithFAL:", error.message);
    throw new Error(`Failed to generate and save image using FAL API: ${error.message}`);
  }
};

module.exports = { generateAndSaveImageWithFAL };
