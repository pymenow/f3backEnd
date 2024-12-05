// Import necessary utilities
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

const {
  validateInput,
  authorizeRequest,
  fetchScript,
  processAndSaveAnalysis,
} = require("./utilityFunctions");

const handleAnalysis = (
  systemPrompt,
  fieldName,
  options = { stream: false }
) => {
  return async (req, res) => {
    const { userID, scriptID } = req.body;

    try {
      // Validate and authorize
      validateInput(userID, scriptID);
      const authenticatedUserID = req.user.uid;
      authorizeRequest(authenticatedUserID, userID);

      // Fetch script
      const { scriptRef, script } = await fetchScript(
        db,
        scriptID,
        authenticatedUserID
      );

      if (options.stream) {
        // Streaming mode
        res.setHeader("Content-Type", "application/x-ndjson");

        // Stream content from Vertex AI to the client
        await processAndSaveAnalysis(
          script,
          systemPrompt,
          scriptRef,
          fieldName,
          res
        );

        // Update Firestore with the processed status in a background task
        scriptRef.update({ status: "processed" }).catch((updateError) => {
          console.error(
            "Failed to update Firestore after streaming:",
            updateError
          );
        });
      } else {
        // Non-streaming mode
        const finalOutput = await processAndSaveAnalysis(
          script,
          systemPrompt,
          scriptRef,
          fieldName
        );

        // Respond with the final output
        return res.status(200).json({
          message: "Analysis completed!",
          finalOutput,
        });
      }
    } catch (error) {
      console.error("Error during analysis:", error);

      if (!res.headersSent) {
        const status = error.status || 500;
        res
          .status(status)
          .json({ error: error.message || "Internal server error." });
      }
    }
  };
};

module.exports = handleAnalysis;
