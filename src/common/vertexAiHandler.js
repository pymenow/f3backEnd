// Import necessary utilities
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

const {
  validateInput,
  authorizeRequest,
  fetchScript,
  processAndSaveAnalysis,
} = require("./utilityFunctions");

// Generic handler for Vertex AI endpoints
const handleAnalysis = (systemPrompt, fieldName) => {
  return async (req, res) => {
    const { userID, scriptID } = req.body;

    try {
      // Validate and authorize
      validateInput(userID, scriptID);
      const authenticatedUserID = req.user.uid;
      authorizeRequest(authenticatedUserID, userID);

      // Fetch script and process analysis
      const { scriptRef, script } = await fetchScript(
        db,
        scriptID,
        authenticatedUserID
      );
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
