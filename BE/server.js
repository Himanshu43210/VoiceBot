const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
require('dotenv').config();
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const deepgramUrl = "https://api.deepgram.com/v1/speak?model=aura-asteria-en";
const { Configuration, OpenAIApi } = require('openai');

let PROMPT_PREFIX = "I need a very short and crisp answer:";
let model = "gpt-4o";

// Function to update PROMPT_PREFIX and model from the external API
async function updateServerData() {
  try {
    const response = await axios.get('https://api.npoint.io/2cd455b999858d26894d');
    const data = response.data;
    PROMPT_PREFIX = data.prompt;
    model = data.model;
    console.log('Server data updated:', { PROMPT_PREFIX, model });
  } catch (error) {
    console.error('Error fetching data from npoint API:', error.message);
  }
}

// Initial update on server start
updateServerData();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('message', async (message) => {
    console.log('Received:', message);

    try {
      const response = await openai.createChatCompletion({
        model: model,
        messages: [
          { role: 'system', content: PROMPT_PREFIX },
          { role: 'user', content: message }
        ],
      });

      const assistantResponse = response.data.choices[0].message.content;
      socket.emit('response', assistantResponse);

      const data = JSON.stringify({
        text: assistantResponse,
      });

      const options = {
        method: "POST",
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": "application/json",
        },
      };

      const req = https.request(deepgramUrl, options, (res) => {
        if (res.statusCode !== 200) {
          console.error(`HTTP error! Status: ${res.statusCode}`);
          return;
        }

        const audioChunks = [];
        res.on('data', (chunk) => {
          audioChunks.push(chunk);
        });

        res.on('end', () => {
          const audioBuffer = Buffer.concat(audioChunks);
          socket.emit('audio-chunk', audioBuffer);
          console.log('Audio stream complete');
        });
      });

      req.on("error", (error) => {
        console.error("Error making request to Deepgram:", error.message);
        socket.emit('response', 'Error: Unable to process your request to Deepgram.');
      });

      req.write(data);
      req.end();

    } catch (error) {
      console.error('Error making request to OpenAI:', error.message);
      if (error.response) {
        console.error('OpenAI response error:', error.response.status, error.response.data);
      }
      socket.emit('response', 'Error: Unable to process your request to OpenAI.');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Define the /updateServer route
app.get('/updateServer', async (req, res) => {
  try {
    await updateServerData();
    res.status(200).send('Server data updated successfully');
  } catch (error) {
    res.status(500).send('Error updating server data');
  }
});

server.listen(8080, () => {
  console.log('Server is listening on port 8080');
});

// Global error handler to prevent server crash
process.on('uncaughtException', (err) => {
  console.error('There was an uncaught error:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
