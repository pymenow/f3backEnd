const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const db = getFirestore();


const ALLOWED_ANALYSIS_TYPES = [
    "moderation",
    "categories",
    "entities",
    "scriptInfo",
    "brandAnalysis",
    "scriptSummary",
    "storyPlot",
    "sentimentAnalysis",
    "visualPrompts",
    "images",
  ];
  
  const addAnalysis = async (userId, scriptId, versionId, analysisType, result) => {
    try {
      // Validate analysisType
      if (!ALLOWED_ANALYSIS_TYPES.includes(analysisType)) {
        throw new Error(
          `Invalid analysisType: ${analysisType}. Allowed types are: ${ALLOWED_ANALYSIS_TYPES.join(", ")}`
        );
      }
  
      // Reference to the analyses subcollection
      const analysesRef = db
        .collection("users")
        .doc(userId)
        .collection("scripts")
        .doc(scriptId)
        .collection("versions")
        .doc(versionId)
        .collection("analyses");
  
      // Check if an analysis of the same type already exists for this version
      const existingAnalysis = await analysesRef.where("analysisType", "==", analysisType).get();
      if (!existingAnalysis.empty) {
        throw new Error(`Analysis of type ${analysisType} already exists for versionId: ${versionId}`);
      }
  
      // Add new analysis document
      const analysisDoc = analysesRef.doc(); // Auto-generate an ID
      await analysisDoc.set({
        analysisType,
        result,
        status: "completed", // Default status
        timestamp: FieldValue.serverTimestamp(),
      });
  
      console.log(`Analysis added successfully for versionId: ${versionId}, analysisType: ${analysisType}`);
      return analysisDoc.id; // Return the new analysis ID
    } catch (error) {
      console.error("Error adding analysis:", error.message);
      throw new Error("Failed to add analysis. Please try again.");
    }
  };

  
const addScript = async (userId, scriptTitle, description, scriptContent = null, fileURL = null) => {
  try {
    // Reference to the user's scripts subcollection
    const scriptsRef = db.collection("users").doc(userId).collection("scripts");
    const scriptDoc = scriptsRef.doc(); // Generate a new script ID
    const scriptId = scriptDoc.id;

    // Reference to the versions subcollection
    const versionRef = scriptDoc.collection("versions").doc(); // Generate a new version ID
    const versionId = versionRef.id;

    // Add the script document
    const scriptData = {
      title: scriptTitle,
      description: description,
      currentVersion: versionId,
      createdAt: FieldValue.serverTimestamp(),
      lastModifiedAt: FieldValue.serverTimestamp(),
    };
    await scriptDoc.set(scriptData);

    // Add the first version document
    const versionData = {
      content: scriptContent, // Text content of the script (null if fileURL is provided)
      fileURL: fileURL || null, // URL to a PDF file (null if content is provided)
      versionNumber: 1, // Initial version number
      createdAt: FieldValue.serverTimestamp(),
      modifiedBy: userId,
    };
    await versionRef.set(versionData);

    console.log(`Script added successfully with scriptId: ${scriptId} and versionId: ${versionId}`);
    return { scriptId, versionId };
  } catch (error) {
    console.error("Error adding script:", error.message);
    throw new Error("Failed to add script. Please try again.");
  }
};

module.exports = { addScript, addAnalysis };
