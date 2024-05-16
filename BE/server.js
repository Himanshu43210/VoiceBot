const express = require('express');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
require('dotenv').config();

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

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const PROMPT_PREFIX = "I need a very short and crisp answer:";

io.on('connection', (socket) => {
  console.log('Client connected');

  socket.on('message', async (message) => {
    console.log('Received:', message);

    try {
      const response = await openai.createChatCompletion({
        model: 'gpt-4',
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
