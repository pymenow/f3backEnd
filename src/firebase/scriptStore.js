const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const db = getFirestore();

const ALLOWED_ANALYSIS_TYPES = [
  "moderation",
  "categories",
  "entities",
  "scriptInfo",
  "brandAnalysis",
  "scriptSummary",
  "rating",
  "emotionAnalysis",
  "sceneAnalysis",
  "shotList",
  "promptGenerator",
  "storyPlot",
];

/**
 * Extracts dialogues from scene analysis results.
 * @param {Array|Object} sceneAnalysisResults - Scene analysis result(s).
 * @returns {Array} - An array of all dialogues extracted from the scenes.
 */
const extractDialogues = (sceneAnalysisResults) => {
  const dialogues = [];

  // Ensure sceneAnalysisResults is an array for consistency
  const scenes = Array.isArray(sceneAnalysisResults)
    ? sceneAnalysisResults
    : Object.values(sceneAnalysisResults);

  scenes.forEach((scene) => {
    if (scene.dialogues && Array.isArray(scene.dialogues)) {
      dialogues.push(...scene.dialogues);
    }
  });

  return dialogues;
};

/**
 * Checks if an analysis of the specified type already exists for a script version.
 * @param {string} userId - The ID of the user.
 * @param {string} scriptId - The ID of the script.
 * @param {string} versionId - The ID of the script version.
 * @param {string} analysisType - The type of analysis to check.
 * @returns {Promise<boolean>} - Returns true if the analysis exists, otherwise false.
 */
const checkIfAnalysisExists = async (
  userId,
  scriptId,
  versionId,
  analysisType
) => {
  try {
    // Reference to the analyses subcollection
    const analysesRef = db
      .collection("users")
      .doc(userId)
      .collection("scripts")
      .doc(scriptId)
      .collection("versions")
      .doc(versionId)
      .collection("analyses");

    // Query for the specified analysis type
    const existingAnalysis = await analysesRef
      .where("analysisType", "==", analysisType)
      .get();

    // Return true if the analysis exists, otherwise false
    return !existingAnalysis.empty;
  } catch (error) {
    console.error(
      `Error checking if analysis exists for analysisType: ${analysisType}, versionId: ${versionId}`,
      error.message
    );
    throw new Error(`Failed to check analysis existence: ${error.message}`);
  }
};

const addAnalysis = async (
  userId,
  scriptId,
  versionId,
  analysisType,
  result
) => {
  try {
    // Validate analysisType
    if (!ALLOWED_ANALYSIS_TYPES.includes(analysisType)) {
      throw new Error(
        `Invalid analysisType: ${analysisType}. Allowed types are: ${ALLOWED_ANALYSIS_TYPES.join(
          ", "
        )}`
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
    const existingAnalysis = await analysesRef
      .where("analysisType", "==", analysisType)
      .get();
    if (!existingAnalysis.empty) {
      throw new Error(
        `Analysis of type ${analysisType} already exists for versionId: ${versionId}`
      );
    }

    // Add new analysis document
    const analysisDoc = analysesRef.doc(); // Auto-generate an ID
    await analysisDoc.set({
      analysisType,
      ...result, // Flatten all keys from result into the document
      status: "completed", // Default status
      timestamp: FieldValue.serverTimestamp(),
    });
    console.log(
      `Analysis added successfully for versionId: ${versionId}, analysisType: ${analysisType}`
    );
    return analysisDoc.id; // Return the new analysis ID
  } catch (error) {
    console.error("Error adding analysis:", error.message);
    throw new Error("Failed to add analysis. Please try again.");
  }
};

const addScript = async (
  userId,
  scriptTitle,
  description,
  scriptContent = null,
  fileURL = null
) => {
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

    console.log(
      `Script added successfully with scriptId: ${scriptId} and versionId: ${versionId}`
    );
    return { scriptId, versionId };
  } catch (error) {
    console.error("Error adding script:", error.message);
    throw new Error("Failed to add script. Please try again.");
  }
};

const addVersionToScript = async (
  userId,
  scriptId,
  scriptContent = null,
  fileURL = null
) => {
  try {
    // Reference to the script document
    const scriptRef = db
      .collection("users")
      .doc(userId)
      .collection("scripts")
      .doc(scriptId);

    // Check if the script exists
    const scriptDoc = await scriptRef.get();
    if (!scriptDoc.exists) {
      throw new Error(`Script with ID ${scriptId} not found.`);
    }

    // Fetch all versions and determine the highest version number
    const versionsSnapshot = await scriptRef.collection("versions").get();
    let highestVersionNumber = 0;

    versionsSnapshot.forEach((doc) => {
      const versionData = doc.data();
      if (versionData.versionNumber > highestVersionNumber) {
        highestVersionNumber = versionData.versionNumber;
      }
    });

    // Increment the highest version number for the new version
    const newVersionNumber = highestVersionNumber + 1;

    // Generate a new version ID
    const versionsRef = scriptRef.collection("versions");
    const newVersionRef = versionsRef.doc();
    const newVersionId = newVersionRef.id;

    // Create the new version data
    const versionData = {
      content: scriptContent, // Text content of the script (null if fileURL is provided)
      fileURL: fileURL || null, // URL to a file (null if content is provided)
      versionNumber: newVersionNumber, // Increment version number
      createdAt: FieldValue.serverTimestamp(),
      modifiedBy: userId,
    };
    await newVersionRef.set(versionData);

    // Update the script document with the new current version and last modified time
    await scriptRef.update({
      currentVersion: newVersionId,
      currentVersionNumber: newVersionNumber,
      lastModifiedAt: FieldValue.serverTimestamp(),
    });

    console.log(
      `New version added successfully to scriptId: ${scriptId} with versionId: ${newVersionId}`
    );
    return { versionId: newVersionId, versionNumber: newVersionNumber };
  } catch (error) {
    console.error("Error adding new version to script:", error.message);
    throw new Error("Failed to add new version to script. Please try again.");
  }
};

const getScript = async (
  userId,
  scriptId,
  versionId = null,
  includeDetails = false
) => {
  try {
    const scriptDoc = await db
      .collection("users")
      .doc(userId)
      .collection("scripts")
      .doc(scriptId)
      .get();

    if (!scriptDoc.exists) {
      throw new Error(`Script with ID ${scriptId} not found.`);
    }

    const scriptData = scriptDoc.data();
    const versionToFetch = versionId || scriptData.currentVersion;

    const versionDoc = await db
      .collection("users")
      .doc(userId)
      .collection("scripts")
      .doc(scriptId)
      .collection("versions")
      .doc(versionToFetch)
      .get();

    if (!versionDoc.exists) {
      throw new Error(
        `Version ${versionToFetch} not found for script ${scriptId}.`
      );
    }

    const versionData = versionDoc.data();

    const result = {
      scriptId,
      ...scriptData,
      version: {
        versionId: versionToFetch,
        ...versionData,
      },
    };

    if (includeDetails) {
      const versionsSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("scripts")
        .doc(scriptId)
        .collection("versions")
        .get();

      const versions = [];
      versionsSnapshot.forEach((doc) => {
        versions.push({
          versionId: doc.id,
          versionNumber: doc.data().versionNumber,
        });
      });

      const analysesSnapshot = await db
        .collection("users")
        .doc(userId)
        .collection("scripts")
        .doc(scriptId)
        .collection("versions")
        .doc(versionToFetch)
        .collection("analyses")
        .get();

      const analyses = [];
      if (!analysesSnapshot.empty) {
        analysesSnapshot.forEach((doc) => {
          const analysisData = doc.data();
          analyses.push({
            analysisId: doc.id,
            analysisType: analysisData.analysisType,
            status: analysisData.status,
            timestamp: analysisData.timestamp,
          });
        });
      }

      result.versions = versions;
      result.version.analyses = analyses;
    }

    return result;
  } catch (error) {
    console.error("Error retrieving script:", error.message);
    throw new Error("Failed to retrieve script. Please try again.");
  }
};

/**
 * Fetch analyses for a given user, scriptId, versionId, and optionally analysisType.
 * @param {string} userId - The user ID.
 * @param {string} scriptId - The script ID.
 * @param {string} versionId - The version ID.
 * @param {string} [analysisType=null] - The type of analysis (optional).
 * @returns {Array} - An array of analysis documents.
 */
const getAnalyses = async (
  userId,
  scriptId,
  versionId,
  analysisType = null
) => {
  try {
    // Validate analysisType if provided
    if (analysisType && !ALLOWED_ANALYSIS_TYPES.includes(analysisType)) {
      throw new Error(
        `Invalid analysisType. Allowed values are: ${ALLOWED_ANALYSIS_TYPES.join(
          ", "
        )}`
      );
    }

    // Reference to the analyses subcollection
    let analysesRef = db
      .collection("users")
      .doc(userId)
      .collection("scripts")
      .doc(scriptId)
      .collection("versions")
      .doc(versionId)
      .collection("analyses");

    // Apply filter for analysisType if provided
    if (analysisType) {
      analysesRef = analysesRef.where("analysisType", "==", analysisType);
    }

    // Fetch analyses
    const snapshot = await analysesRef.get();

    if (snapshot.empty) {
      console.log(
        `No analyses found for userId: ${userId}, scriptId: ${scriptId}, versionId: ${versionId}, analysisType: ${
          analysisType || "all"
        }`
      );
      return []; // Return an empty array if no analyses found
    }

    // Map the documents to an array of analyses
    const analyses = [];
    snapshot.forEach((doc) => {
      analyses.push({ id: doc.id, ...doc.data() });
    });

    console.log(
      `Fetched ${analyses.length} analyses for userId: ${userId}, scriptId: ${scriptId}, versionId: ${versionId}`
    );
    return analyses;
  } catch (error) {
    console.error("Error fetching analyses:", error.message);
    throw new Error(`Failed to retrieve analyses: ${error.message}`);
  }
};

/**
 * Fetch the result of a specific analysis type for a given user, scriptId, and versionId.
 * @param {string} userId - The user ID.
 * @param {string} scriptId - The script ID.
 * @param {string} versionId - The version ID.
 * @param {string} analysisType - The type of analysis to fetch.
 * @returns {object|null} - The analysis result object or null if not found.
 */
const getAnalysisResult = async (userId, scriptId, versionId, analysisType) => {
  try {
    // Validate analysisType
    if (!ALLOWED_ANALYSIS_TYPES.includes(analysisType)) {
      throw new Error(
        `Invalid analysisType. Allowed types are: ${ALLOWED_ANALYSIS_TYPES.join(
          ", "
        )}`
      );
    }

    // Reference to the specific analysis document
    const analysisRef = db
      .collection("users")
      .doc(userId)
      .collection("scripts")
      .doc(scriptId)
      .collection("versions")
      .doc(versionId)
      .collection("analyses")
      .where("analysisType", "==", analysisType);

    const snapshot = await analysisRef.get();

    if (snapshot.empty) {
      console.log(
        `Analysis of type ${analysisType} not found for userId: ${userId}, scriptId: ${scriptId}, versionId: ${versionId}`
      );
      return null;
    }

    // Return only the data field from the first analysis result
    const analysisDoc = snapshot.docs[0];
    const analysisData = analysisDoc.data();

    if (!analysisData || !analysisData.data) {
      console.log(
        `No data found for analysisType: ${analysisType}, versionId: ${versionId}`
      );
      return null;
    }

    return analysisData.data; // Return only the 'data' field
  } catch (error) {
    console.error(
      `Error fetching analysis result for analysisType: ${analysisType}`,
      error.message
    );
    throw new Error(`Failed to fetch analysis result: ${error.message}`);
  }
};

module.exports = {
  addScript,
  addAnalysis,
  getScript,
  checkIfAnalysisExists,
  getAnalyses,
  addVersionToScript,
  getAnalysisResult,
};
