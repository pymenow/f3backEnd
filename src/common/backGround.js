const { synthesizeSpeechAndSave } = require("./gCloudStorage");
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();
const { getAnalyses } = require("../firebase/scriptStore");

/**
 * Process audio for each dialogue in scene analysis and update Firestore efficiently.
 * @param {string} userId - The user ID.
 * @param {string} scriptId - The script ID.
 * @param {string} versionId - The version ID.
 */
const audioProcessing = async (userId, scriptId, versionId) => {
  try {
    console.log("Starting audio processing...");

    // Fetch sceneAnalysis
    const analysisType = "sceneAnalysis";
    const analyses = await getAnalyses(
      userId,
      scriptId,
      versionId,
      analysisType
    );

    if (!analyses || analyses.length === 0) {
      console.log(`No analyses found for analysis type: ${analysisType}`);
      return;
    }

    const sceneAnalysis = analyses[0].data.scenes; // Assuming the first result is the required analysis
    const analysisId = analyses[0].id; // Firestore document ID for the analysis

    // Set `audioProcessing` to 0 (in progress)
    const docRef = db
      .collection("users")
      .doc(userId)
      .collection("scripts")
      .doc(scriptId)
      .collection("versions")
      .doc(versionId)
      .collection("analyses")
      .doc(analysisId);

    await docRef.update({ audioProcessing: 0 });

    // Array to store audio paths sequentially
    const audioPlaylist = [];

    // Process scenes and dialogues and update sceneAnalysis in-memory
    for (const sceneKey in sceneAnalysis) {
      if (!sceneAnalysis.hasOwnProperty(sceneKey)) continue;

      const scene = sceneAnalysis[sceneKey];
      const dialogues = scene.dialogues;

      // Generate audio for the scene summary
      const sceneAudioName = `scene_${sceneKey}`;
      try {
        const sceneFilePath = await synthesizeSpeechAndSave(
          scene.sceneSummary,
          userId,
          scriptId,
          versionId,
          sceneAudioName,
          "MALE",
          true
        );

        // Add the audio object for the scene
        scene.audio = {
          processing: 2,
          path: sceneFilePath,
        };

        // Add the path to the playlist
        audioPlaylist.push(sceneFilePath);

        console.log(`Audio processed for scene: ${scene.sceneSummary}`);
      } catch (error) {
        console.error(
          `Error processing scene audio: ${scene.sceneSummary}`,
          error.message
        );

        // Mark scene audio as failed
        scene.audio = {
          processing: -1,
          path: "",
        };
      }

      if (!dialogues || !Array.isArray(dialogues) || dialogues.length === 0)
        continue;

      for (let i = 0; i < dialogues.length; i++) {
        const dialogue = dialogues[i];
        const audioName = `scene_${sceneKey}_dialogue_${i}`;

        try {
          // Mark dialogue as in-progress
          dialogue.audio = {
            processing: 1,
            path: "",
          };

          // Synthesize speech and get the file path
          const filePath = await synthesizeSpeechAndSave(
            dialogue.dialogueContent,
            userId,
            scriptId,
            versionId,
            audioName,
            dialogue.gender || "MALE"
          );

          // Update the dialogue with the audio path
          dialogue.audio = {
            processing: 2,
            path: filePath,
          };

          // Add the path to the playlist
          audioPlaylist.push(filePath);

          console.log(
            `Audio processed for dialogue: ${dialogue.dialogueContent}`
          );
        } catch (error) {
          console.error(
            `Error processing dialogue: ${dialogue.dialogueContent}`,
            error.message
          );

          // Mark dialogue as failed
          dialogue.audio = {
            processing: -1,
            path: "",
          };
        }
      }
    }

    // Update the entire sceneAnalysis and the audioPlaylist in Firestore
    await docRef.update({
      "data.scenes": sceneAnalysis,
      "data.audioPlaylist": audioPlaylist, // Save the playlist
      audioProcessing: 1, // Mark processing as completed
    });

    console.log("Audio processing completed.");
  } catch (error) {
    console.error("Error in audio processing:", error.message);

    // Mark processing as failed
    try {
      const docRef = db
        .collection("users")
        .doc(userId)
        .collection("scripts")
        .doc(scriptId)
        .collection("versions")
        .doc(versionId)
        .collection("analyses")
        .doc(analysisId);

      await docRef.update({ audioProcessing: -1 });
    } catch (updateError) {
      console.error(
        "Error updating Firestore with processing failure:",
        updateError.message
      );
    }
  }
};

module.exports = { audioProcessing };
