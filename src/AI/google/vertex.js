const { VertexAI } = require('@google-cloud/vertexai');

// Initialize Vertex AI
const vertexAI = new VertexAI({ project: 'auth-fa6e5', location: 'asia-south1' }); // Ensure correct project and location
const model = 'gemini-1.5-pro-002'; // Ensure the correct model is used

/**
 * Process a script with Vertex AI
 * @param {string} script - The script to process
 * @param {string} systemInstructions - The system instructions to guide Vertex AI
 * @returns {Promise<object>} - The processed result from Vertex AI
 */
const processScriptWithVertexAI = async (script, systemInstructions) => {
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
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'OFF',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'OFF',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'OFF',
        },
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'OFF',
        },
      ],
      systemInstruction: {
        parts: [textsi_1],
      },
    });

    // Prepare request with formatted contents
    const req = {
      contents: [
        {
          role: 'user', // Specify the role
          parts: [{ text: script }], // Include the script as a single part
        },
      ],
    };

    const response = await generativeModel.generateContent(req);
    console.log('Received final response from Vertex AI:', response);
    return response.response;

    // return aggregatedResponse;
  } catch (error) {
    console.error('Error processing script with Vertex AI:', error);
    throw new Error('Failed to process the script with Vertex AI.');
  }
};

const processScriptWithVertexAIStream = async (script, systemInstructions, res) => {
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

    // Enable streaming response
    const streamingResp = await generativeModel.generateContentStream(req);

    // Iterate over the async iterable `stream`
    for await (const chunk of streamingResp.stream) {
      const chunkData = JSON.stringify(chunk);
      res.write(chunkData + '\n'); // Send each chunk to the client
    }

    // Close the response after streaming is done
    res.end();
  } catch (error) {
    console.error('Error during streaming:', error);
    res.status(500).send('Error during streaming.');
  }
};



module.exports = { processScriptWithVertexAI,  processScriptWithVertexAIStream};