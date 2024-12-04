const { VertexAI } = require('@google-cloud/vertexai');

// Initialize Vertex AI
const vertexAI = new VertexAI({ project: 'auth-fa6e5', location: 'asia-south1' }); // Ensure correct project and location
const model = 'gemini-1.5-pro-002'; // Ensure the correct model is used

/**
 * Process a script with Vertex AI (supports standard and streaming responses)
 * @param {string} script - The script to process
 * @param {string} systemInstructions - The system instructions to guide Vertex AI
 * @param {object|null} res - The response object for streaming (null for non-streaming)
 * @returns {Promise<object|undefined>} - The processed result from Vertex AI or undefined for streams
 */
const processScriptWithVertexAI = async (script, systemInstructions, res = null) => {
  if (!script || script.length < 20 || script.length > 2000) {
    throw new Error('Script length must be between 20 and 2000 words.');
  }

  try {
    const textsi_1 = { text: systemInstructions };

    const generativeModel = vertexAI.preview.getGenerativeModel({
      model,
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 1,
        topP: 0.95,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
      ],
      systemInstruction: { parts: [textsi_1] },
    });

    const req = {
      contents: [
        {
          role: 'user',
          parts: [{ text: script }],
        },
      ],
    };

    if (res) {
      // Streaming response
      const streamingResp = await generativeModel.generateContentStream(req);

      // Iterate over the async iterable `stream`
      for await (const chunk of streamingResp.stream) {
        const chunkData = JSON.stringify(chunk);
        res.write(chunkData + '\n'); // Send each chunk to the client
      }

      // Close the response after streaming is done
      res.end();
      return; // No return value for streaming
    } else {
      // Standard response
      const response = await generativeModel.generateContent(req);
      console.log('Received final response from Vertex AI:', response);
      return response.response; // Return the standard response
    }
  } catch (error) {
    console.error('Error processing script with Vertex AI:', error);

    if (res) {
      res.status(500).send('Error during streaming.');
    } else {
      throw new Error('Failed to process the script with Vertex AI.');
    }
  }
};

module.exports = { processScriptWithVertexAI };
