const { Storage } = require("@google-cloud/storage");
const path = require("path");
const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const sharp = require("sharp");
const watermarkPath = path.join(__dirname, "../common/wm.png");
const watermarkPath1024 = path.join(__dirname, "../common/wm1024.png");
const { Translate } = require("@google-cloud/translate").v2;
const textToSpeech = require("@google-cloud/text-to-speech");

// Initialize Google Cloud Storage
// Application Default Credentials will be used (no key file required)
const storage = new Storage();
const BUCKET_NAME = "fram3"; // Your bucket name

// Initialize clients
const translateClient = new Translate();
const textToSpeechClient = new textToSpeech.TextToSpeechClient();

/**
 * Save an artifact from a URL to Google Cloud Storage and return its signed URL.
 * @param {string} uid - The user ID.
 * @param {string} scriptId - The script ID.
 * @param {string} versionId - The version ID of the script.
 * @param {string} artifactType - The type of artifact (e.g., images, pdfs).
 * @param {string} fileUrl - The URL of the file to be uploaded.
 * @returns {string} - The signed URL for accessing the uploaded artifact.
 */
const saveArtifactAndGenerateUrl = async (
  uid,
  scriptId,
  versionId,
  artifactType,
  fileUrl,
  width,
  height
) => {
  try {
    // Extract the file name from the URL
    // Extract the file extension from the URL
    const fileExtension = path.extname(new URL(fileUrl).pathname);
    const watermark = height === 1024 ? watermarkPath1024 : watermarkPath;

    // Generate a unique filename using UUID
    const uniqueFileName = `${uuidv4()}${fileExtension}`;
    const destinationPath = `${uid}/${scriptId}/${versionId}/${artifactType}/${uniqueFileName}`;

    console.log(`Downloading file from URL: ${fileUrl}`);

    // Fetch the file as a stream
    const response = await axios({
      url: fileUrl,
      method: "GET",
      responseType: "stream",
    });

    console.log(`Uploading file to GCS at: ${destinationPath}`);

    // Transform the stream with Sharp to add watermark
    const transformer = sharp().composite([
      { input: watermark, gravity: "southeast" },
    ]); // Overlay the watermark

    // Create a writable stream to Google Cloud Storage
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(destinationPath);
    const stream = file.createWriteStream();

    // Pipe the file stream to GCS
    await new Promise((resolve, reject) => {
      response.data
        .pipe(transformer)
        .pipe(stream)
        .on("finish", resolve)
        .on("error", (err) => {
          console.error("Error uploading to GCS:", err.message);
          reject(err);
        });
    });

    console.log(`File uploaded successfully to ${destinationPath}`);

    // Calculate expiration time for the signed URL
    const expirationDate = new Date();
    expirationDate.setMinutes(expirationDate.getMinutes() + 10); // Set expiration time to 10 minutes in the future

    // Generate signed URL
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: expirationDate.toISOString(), // Use ISO 8601 format
    });

    console.log(`Generated Signed URL: ${url}`);
    return url; // Return the signed URL
  } catch (error) {
    console.error(
      "Error saving artifact and generating signed URL:",
      error.message
    );
    throw new Error(
      `Failed to save artifact and generate signed URL: ${error.message}`
    );
  }
};

/**
 * Save an artifact to Google Cloud Storage.
 * @param {string} uid - The user ID.
 * @param {string} scriptId - The script ID.
 * @param {string} versionId - The version ID of the script.
 * @param {string} artifactType - The type of artifact (e.g., images, pdfs).
 * @param {string} localFilePath - The local path to the file to be uploaded.
 * @returns {string} - The GCS path of the uploaded artifact.
 */
const saveArtifact = async (
  uid,
  scriptId,
  versionId,
  artifactType,
  localFilePath
) => {
  try {
    const fileName = path.basename(localFilePath);
    const destinationPath = `${uid}/${scriptId}/${versionId}/${artifactType}/${fileName}`;

    const [file] = await storage.bucket(BUCKET_NAME).upload(localFilePath, {
      destination: destinationPath,
      public: false, // Default to private files
    });

    console.log(`File uploaded to ${destinationPath}`);
    return `gs://${BUCKET_NAME}/${destinationPath}`; // Return the GCS path
  } catch (error) {
    console.error("Error saving artifact:", error.message);
    throw new Error(`Failed to save artifact: ${error.message}`);
  }
};

/**
 * Generate a signed URL for accessing an artifact.
 * @param {string} uid - The user ID.
 * @param {string} scriptId - The script ID.
 * @param {string} versionId - The version ID of the script.
 * @param {string} artifactType - The type of artifact (e.g., images, pdfs).
 * @param {string} fileName - The name of the file.
 * @returns {string} - The signed URL for accessing the artifact.
 */
const getSignedUrl = async (
  uid,
  scriptId,
  versionId,
  artifactType,
  fileName
) => {
  const filePath = `${uid}/${scriptId}/${versionId}/${artifactType}/${fileName}`;

  try {
    // Check if the file exists
    const [exists] = await storage.bucket(BUCKET_NAME).file(filePath).exists();
    if (!exists) {
      throw new Error(`File not found: gs://${BUCKET_NAME}/${filePath}`);
    }

    // Calculate expiration time using Date object
    const expirationDate = new Date();
    expirationDate.setMinutes(expirationDate.getMinutes() + 10); // Set expiration time to 10 minutes in the future

    // Generate signed URL
    const [url] = await storage
      .bucket(BUCKET_NAME)
      .file(filePath)
      .getSignedUrl({
        action: "read",
        expires: expirationDate.toISOString(), // Use ISO 8601 format
      });

    return url;
  } catch (error) {
    console.error("Error generating signed URL:", error.message);
    throw new Error(`Failed to retrieve artifact: ${error.message}`);
  }
};

/**
 * Delete an artifact from Google Cloud Storage.
 * @param {string} uid - The user ID.
 * @param {string} scriptId - The script ID.
 * @param {string} versionId - The version ID of the script.
 * @param {string} artifactType - The type of artifact (e.g., images, pdfs).
 * @param {string} fileName - The name of the file.
 * @returns {boolean} - Returns true if the file was successfully deleted.
 */
const deleteArtifact = async (
  uid,
  scriptId,
  versionId,
  artifactType,
  fileName
) => {
  const filePath = `${uid}/${scriptId}/${versionId}/${artifactType}/${fileName}`;
  try {
    await storage.bucket(BUCKET_NAME).file(filePath).delete();
    console.log(`File ${filePath} deleted successfully.`);
    return true;
  } catch (error) {
    console.error("Error deleting artifact:", error.message);
    throw new Error(`Failed to delete artifact: ${error.message}`);
  }
};

/**
 * Uploads a file from a URL to Google Cloud Storage with a unique filename.
 * @param {string} url - The URL of the file to upload.
 * @param {string} destinationPath - The base destination path in the bucket.
 * @returns {string} - The GCS path of the uploaded file.
 */
const uploadFileFromUrl = async (url, destinationPath) => {
  try {
    // Extract file extension from the URL
    const fileExtension = path.extname(new URL(url).pathname);

    // Generate a unique filename using UUID
    const uniqueFileName = `${uuidv4()}${fileExtension}`;
    const uniqueDestinationPath = `${destinationPath}/${uniqueFileName}`;

    console.log(`Downloading file from URL: ${url}`);

    // Fetch the file as a stream
    const response = await axios({
      url,
      method: "GET",
      responseType: "stream",
    });

    console.log(`Uploading file to GCS at: ${uniqueDestinationPath}`);

    // Create a writable stream to Google Cloud Storage
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(uniqueDestinationPath);
    const stream = file.createWriteStream();

    // Pipe the file stream to GCS
    await new Promise((resolve, reject) => {
      response.data
        .pipe(stream)
        .on("finish", resolve)
        .on("error", (err) => {
          console.error("Error uploading to GCS:", err.message);
          reject(err);
        });
    });

    console.log("File uploaded successfully!");
    return `gs://${BUCKET_NAME}/${uniqueDestinationPath}`;
  } catch (error) {
    console.error("Error uploading file from URL:", error.message);
    throw new Error(`Failed to upload file from URL: ${error.message}`);
  }
};

/**
 * Stream a file from Google Cloud Storage.
 * @param {string} filePath - The path of the file in the GCS bucket.
 * @param {object} res - The response object to stream the file.
 * @returns {Promise<void>}
 */
const streamFileFromGCS = async (filePath, res) => {
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(filePath);

    // Check if the file exists
    const [exists] = await file.exists();
    if (!exists) {
      throw new Error("File not found");
    }

    // Set response headers for audio streaming
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", "inline");

    // Stream the file to the response
    const readStream = file.createReadStream();
    readStream.pipe(res);

    readStream.on("error", (err) => {
      console.error("Error streaming file:", err.message);
      res.status(500).json({ error: "Error streaming file" });
    });

    readStream.on("end", () => {
      console.log("File streamed successfully.");
    });
  } catch (error) {
    throw error;
  }
};

const streamMultipleFilesFromGCS = async (filePaths, res) => {
  try {
    // Set response headers for audio streaming
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Disposition", "inline");

    for (const filePath of filePaths) {
      const bucket = storage.bucket(BUCKET_NAME);
      const file = bucket.file(filePath);

      // Check if the file exists
      const [exists] = await file.exists();
      if (!exists) {
        console.error(`File not found: ${filePath}`);
        throw new Error(`File not found: ${filePath}`);
      }

      // Stream the file to the response sequentially
      const readStream = file.createReadStream();
      await new Promise((resolve, reject) => {
        readStream.pipe(res, { end: false }); // Don't end the response for sequential streaming

        readStream.on("end", () => {
          console.log(`File streamed successfully: ${filePath}`);
          resolve();
        });

        readStream.on("error", (err) => {
          console.error(`Error streaming file ${filePath}:`, err.message);
          reject(err);
        });
      });
    }

    // End the response after all files have been streamed
    res.end();
  } catch (error) {
    console.error("Error streaming multiple files:", error.message);
    res.status(500).json({ error: "Error streaming multiple files" });
  }
};

// Function to detect language using Google Cloud Translation API
const detectLanguage = async (text) => {
  try {
    const [detection] = await translateClient.detect(text);
    if (detection.language) {
      console.log(`Detected language: ${detection.language}`);
      return detection.language;
    }
    throw new Error("Language detection failed.");
  } catch (error) {
    console.error("Error detecting language:", error.message);
    throw new Error("Language detection failed.");
  }
};

const synthesizeSpeechAndSave = async (
  text,
  userId,
  scriptId,
  versionId,
  audio_name = null,
  gender = "MALE",
  scene = false
) => {
  try {
    // Detect the language of the input text
    const languageCode = await detectLanguage(text);
    let request;

    if (scene && languageCode == "en") {
      request = {
        input: { text },
        voice: {
          name: "en-IN-Journey-D",
          languageCode: "en-IN",
        },
        audioConfig: {
          audioEncoding: "MP3",
        },
      };
    } else {
      // Prepare the Text-to-Speech request
      request = {
        input: { text },
        voice: {
          languageCode,
          ssmlGender: gender,
        },
        audioConfig: {
          audioEncoding: "MP3",
        },
      };
    }

    // Perform the Text-to-Speech operation
    const [response] = await textToSpeechClient.synthesizeSpeech(request);

    // Generate a unique file name
    const uniqueFileName = audio_name ? `${audio_name}.mp3` : `${uuidv4()}.mp3`;

    // Construct the file path in GCS
    const filePath = `${userId}/${scriptId}/${versionId}/audio/${uniqueFileName}`;

    // Reference the storage bucket and file
    const bucket = storage.bucket(BUCKET_NAME);
    const file = bucket.file(filePath);

    // Save the synthesized audio to GCS
    await file.save(response.audioContent, {
      metadata: { contentType: "audio/mpeg" },
    });

    console.log(`Audio saved to GCS at: ${filePath}`);
    return `${filePath}`; // Return the GCS file path
  } catch (error) {
    console.error("Error saving synthesized speech:", error.message);
    throw new Error("Failed to synthesize and save speech.");
  }
};

module.exports = {
  saveArtifact,
  getSignedUrl,
  deleteArtifact,
  uploadFileFromUrl,
  saveArtifactAndGenerateUrl,
  streamFileFromGCS,
  streamMultipleFilesFromGCS,
  synthesizeSpeechAndSave,
};
