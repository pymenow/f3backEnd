const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/authMiddleware");
const { saveArtifact, getSignedUrl, deleteArtifact, uploadFileFromUrl } = require("../common/gCloudStorage");
const multer = require("multer");

const upload = multer({ dest: "uploads/" });

const ALLOWED_ARTIFACT_TYPES = ["images", "pdfs", "outputs", "logs"];

router.post("/upload-file", authenticate, upload.single("file"), async (req, res) => {
  const { scriptId, versionId, artifactType } = req.body;

  if (!scriptId || !versionId || !artifactType || !req.file) {
    return res.status(400).json({ error: "Missing required fields or file." });
  }

  if (!ALLOWED_ARTIFACT_TYPES.includes(artifactType)) {
    return res.status(400).json({ error: "Invalid artifact type." });
  }

  try {
    const uid = req.user.uid;
    const artifactPath = await saveArtifact(
      uid,
      scriptId,
      versionId,
      artifactType,
      req.file.path
    );

    res.status(200).json({ message: "Artifact uploaded successfully!", artifactPath });
  } catch (error) {
    console.error("Error during artifact upload:", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/upload', authenticate, async (req, res) => {
  const { url, scriptId, versionId, artifactType } = req.body;

  if (!url || !scriptId || !versionId || !artifactType) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const uid = req.user.uid; // Get the authenticated user's UID
    const fileName = new URL(url).pathname.split('/').pop(); // Extract the file name from the URL
    const destinationPath = `${uid}/${scriptId}/${versionId}/${artifactType}/${fileName}`;

    const artifactPath = await uploadFileFromUrl(url, destinationPath);

    res.status(200).json({
      message: 'Artifact uploaded successfully!',
      artifactPath,
    });
  } catch (error) {
    console.error('Error uploading artifact:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get("/retrieve", authenticate, async (req, res) => {
  const { scriptId, versionId, artifactType, fileName } = req.query;

  if (!scriptId || !versionId || !artifactType || !fileName) {
    return res.status(400).json({ error: "Missing required query parameters." });
  }

  try {
    const uid = req.user.uid;
    const signedUrl = await getSignedUrl(uid, scriptId, versionId, artifactType, fileName);

    res.status(200).json({ message: "Artifact retrieved successfully!", signedUrl });
  } catch (error) {
    console.error("Error during artifact retrieval:", error.message);
    res.status(500).json({ error: error.message });
  }
});

router.delete("/delete", authenticate, async (req, res) => {
  const { scriptId, versionId, artifactType, fileName } = req.body;

  if (!scriptId || !versionId || !artifactType || !fileName) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  if (!ALLOWED_ARTIFACT_TYPES.includes(artifactType)) {
    return res.status(400).json({ error: "Invalid artifact type." });
  }

  try {
    const uid = req.user.uid;
    await deleteArtifact(uid, scriptId, versionId, artifactType, fileName);

    res.status(200).json({ message: "Artifact deleted successfully." });
  } catch (error) {
    console.error("Error during artifact deletion:", error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
