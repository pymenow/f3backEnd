const { getAnalyses } = require("../firebase/scriptStore");
const { synthesizeSpeechAndSave } = require("./gCloudStorage");
const { getFirestore } = require("firebase-admin/firestore");
const db = getFirestore();

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
  
      for (const sceneKey in sceneAnalysis) {
        if (!sceneAnalysis.hasOwnProperty(sceneKey)) continue;
  
        const scene = sceneAnalysis[sceneKey];
        const dialogues = scene.dialogues;
  
        if (!dialogues || !Array.isArray(dialogues) || dialogues.length === 0)
          continue;
  
        for (let i = 0; i < dialogues.length; i++) {
          const dialogue = dialogues[i];
          const dialoguePath = `data.scenes.${sceneKey}.dialogues.${i}`;
          // Define audio_name in the desired format
          const audio_name = `scene_${sceneKey}_dialogue_${i}`;
  
          try {
            // Mark as in-progress
            const updatedDialogue = {
              ...dialogue,
              audio: {
                processing: 1,
                path: "",
              },
            };
  
            await docRef.update({
              [`${dialoguePath}`]: updatedDialogue,
            });
  
            // Synthesize speech and get the file path
            const filePath = await synthesizeSpeechAndSave(
              dialogue.dialogueContent,
              userId,
              scriptId,
              versionId,
              audio_name,
              dialogue.gender || "MALE"
            );
  
            // Update the full dialogue structure with the audio path
            updatedDialogue.audio = {
              processing: 2,
              path: filePath,
            };
  
            await docRef.update({
              [`${dialoguePath}`]: updatedDialogue,
            });
  
            console.log(
              `Audio processed for dialogue: ${dialogue.dialogueContent}`
            );
          } catch (error) {
            console.error(
              `Error processing dialogue: ${dialogue.dialogueContent}`,
              error.message
            );
  
            // Mark as failed
            const failedDialogue = {
              ...dialogue,
              audio: {
                processing: -1,
                path: "",
              },
            };
  
            await docRef.update({
              [`${dialoguePath}`]: failedDialogue,
            });
          }
        }
      }
  
      // Mark processing as completed
      await docRef.update({ audioProcessing: 1 });
      console.log("Audio processing completed.");
    } catch (error) {
      console.error("Error in audio processing:", error.message);
  
      // Mark processing as failed
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
    }
  };  
  
module.exports = { audioProcessing };
