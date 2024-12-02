const express = require('express');
const { getFirestore } = require('firebase-admin/firestore');
const { auth } = require('../firebase/firebaseConfig'); // Firebase Admin SDK
const { processScriptWithVertexAI } = require('../AI/google/vertex');
const sentimentInstructions = require('../AI/google/system_instructions/sentiment'); // Default import
const axios = require('axios');
const authenticate = require('../middleware/authMiddleware'); 
const router = express.Router();

console.log('Imported Sentiment Instructions:', sentimentInstructions);

const db = getFirestore();

/**
 * @swagger
 * /scripts/emotion-analysis:
 *   post:
 *     summary: Process a script for emotion analysis using Vertex AI
 *     tags:
 *       - Scripts
 *     security:
 *       - bearerAuth: [] # Ensure the user is authenticated
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 description: Type of script (e.g., AD)
 *                 example: "AD"
 *               region:
 *                 type: string
 *                 description: Primary country or region
 *                 example: "India"
 *               identity:
 *                 type: string
 *                 description: What the script is about (e.g., Product, Marketing, Company)
 *                 example: "Product"
 *               brand:
 *                 type: string
 *                 description: Brand name (optional)
 *                 example: "Lacto Calamine"
 *               script:
 *                 type: string
 *                 description: The content of the script (20 to 2000 words)
 *                 example: "Film opens with Sindhu entering a jogging track in a stadium..."
 *     responses:
 *       200:
 *         description: Script processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Script processed successfully."
 *                 data:
 *                   type: object
 *                   properties:
 *                     Lines:
 *                       type: array
 *                       description: Array of analyzed lines from the script
 *                       items:
 *                         type: object
 *                         properties:
 *                           Line#:
 *                             type: integer
 *                             example: 1
 *                           Content:
 *                             type: string
 *                             example: "The scene opens with a sunset over a quiet beach."
 *                           Language:
 *                             type: string
 *                             example: "English"
 *                           Sentiment/Emotion:
 *                             type: string
 *                             example: "Joy"
 *                           Valence:
 *                             type: number
 *                             example: 9.46
 *                           Arousal:
 *                             type: number
 *                             example: 1.3
 *       400:
 *         description: Invalid input
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Invalid input. Ensure all required fields are provided and script length is between 20 and 2000 words."
 *       401:
 *         description: Unauthorized - No or invalid token provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No token provided."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error."
 */
router.post('/emotion-analysis', authenticate, async (req, res) => {
    const { type, region, identity, brand, script } = req.body;
  
    // Validate input
    if (!type || !region || !identity || !script || script.length < 20 || script.length > 2000) {
      return res.status(400).json({ error: 'Invalid input. Ensure all required fields are provided and script length is between 20 and 2000 words.' });
    }
  
    try {
      const userId = req.user.uid; // Get the authenticated user's ID
  
      // Store script metadata in Firestore
      const scriptRef = db.collection('scripts').doc();
      const scriptData = {
        userId,
        type,
        region,
        identity,
        brand: brand || null,
        script,
        status: 'pending',
        createdAt: new Date(),
      };
  
      await scriptRef.set(scriptData);
  
      // Process the script with Vertex AI to get the final response
      const vertexResponse = await processScriptWithVertexAI(script, sentimentInstructions);
      console.log('Vertex AI Response:', vertexResponse);
  
      // Post-process the Vertex AI response into the desired structure
      const finalOutput = processAggregatedData(vertexResponse);
  
      // Save the final output in Firestore
      await scriptRef.update({
        vertexResponse: finalOutput,
        status: 'processed',
      });
  
      // Respond with the final output
      return res.status(200).json({
        message: 'Processing completed!',
        finalOutput,
      });
    } catch (error) {
      console.error('Error processing script:', error);
  
      // Only send the response if headers are not already sent
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error.' });
      }
    }
  });
  
  
  
  
  const processAggregatedData = (vertexResponse) => {
    const processedData = { Lines: [] };
  
    // Ensure vertexResponse has the expected structure
    if (!vertexResponse || !Array.isArray(vertexResponse.candidates)) {
      throw new Error('Invalid Vertex AI response format');
    }
  
    vertexResponse.candidates.forEach((candidate) => {
      const contentParts = candidate.content?.parts || [];
      const aggregatedText = contentParts.map((part) => part.text).join('');
  
      // Clean up Markdown formatting
      const cleanedText = aggregatedText
        .replace(/```json/g, '') // Remove JSON code block markers
        .replace(/```/g, '') // Remove any leftover backticks
        .trim();
  
      // Attempt to parse JSON from the cleaned text
      try {
        const parsedContent = JSON.parse(cleanedText);
        if (parsedContent && Array.isArray(parsedContent.Lines)) {
          processedData.Lines.push(...parsedContent.Lines);
        }
      } catch (error) {
        console.warn('Failed to parse JSON:', cleanedText);
      }
    });
  
    return processedData;
  };
  
  
  
/**
 * @swagger
 * /scripts/emotion-analysis:
 *   get:
 *     summary: Retrieve scripts and associated data for the authenticated user
 *     tags:
 *       - Scripts
 *     security:
 *       - bearerAuth: [] # Ensure the user is authenticated
 *     responses:
 *       200:
 *         description: Scripts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Scripts retrieved successfully."
 *                 scripts:
 *                   type: array
 *                   description: Array of scripts created by the authenticated user
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Document ID in Firestore
 *                         example: "documentId123"
 *                       userId:
 *                         type: string
 *                         description: UID of the user who created the script
 *                         example: "userUid123"
 *                       type:
 *                         type: string
 *                         description: Type of script (e.g., AD)
 *                         example: "AD"
 *                       region:
 *                         type: string
 *                         description: Primary country or region
 *                         example: "India"
 *                       identity:
 *                         type: string
 *                         description: What the script is about (e.g., Product, Marketing, Company)
 *                         example: "Product"
 *                       brand:
 *                         type: string
 *                         description: Brand name (optional)
 *                         example: "Lacto Calamine"
 *                       script:
 *                         type: string
 *                         description: Original script content
 *                         example: "Film opens with Sindhu entering a jogging track in a stadium..."
 *                       status:
 *                         type: string
 *                         description: Status of the script (e.g., pending, processed)
 *                         example: "processed"
 *                       vertexResponse:
 *                         type: object
 *                         description: Analysis results returned by Vertex AI
 *                         properties:
 *                           Lines:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 Line#:
 *                                   type: integer
 *                                   example: 1
 *                                 Content:
 *                                   type: string
 *                                   example: "The scene opens with a sunset over a quiet beach."
 *                                 Language:
 *                                   type: string
 *                                   example: "English"
 *                                 Sentiment/Emotion:
 *                                   type: string
 *                                   example: "Joy"
 *                                 Valence:
 *                                   type: number
 *                                   example: 9.46
 *                                 Arousal:
 *                                   type: number
 *                                   example: 1.3
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         description: Timestamp when the script was created
 *                         example: "2024-12-01T12:00:00.000Z"
 *       404:
 *         description: No scripts found for the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "No scripts found for the user."
 *       401:
 *         description: Unauthorized - No or invalid token provided
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "No token provided."
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Internal server error."
 */
router.get('/emotion-analysis', authenticate, async (req, res) => {
  try {
    const userId = req.user.uid;

    // Query Firestore for scripts created by the authenticated user
    const snapshot = await db.collection('scripts').where('userId', '==', userId).get();

    if (snapshot.empty) {
      return res.status(404).json({ message: 'No scripts found for the user.' });
    }

    const scripts = [];
    snapshot.forEach((doc) => {
      scripts.push({ id: doc.id, ...doc.data() });
    });

    res.status(200).json({ message: 'Scripts retrieved successfully.', scripts });
  } catch (error) {
    console.error('Error retrieving scripts:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
