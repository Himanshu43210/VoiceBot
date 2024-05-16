import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';

const VoiceChatBot = () => {
  const [text, setText] = useState('');
  const [response, setResponse] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const recognitionRef = useRef(null);
  const socket = useRef(null);
  const audioContextRef = useRef(null);
  const audioBufferQueue = useRef([]);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    socket.current = io('http://localhost:8080');

    socket.current.on('connect', () => {
      setIsConnected(true);
    });

    socket.current.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.current.on('response', (data) => {
      setResponse(data);
      setChatHistory((prevHistory) => [
        ...prevHistory,
        { type: 'response', content: data },
      ]);
    });

    socket.current.on('audio-chunk', async (chunk) => {
      try {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }

        const audioData = new Uint8Array(chunk).buffer;
        const audioBuffer = await audioContextRef.current.decodeAudioData(audioData);
        audioBufferQueue.current.push(audioBuffer);
        if (!isPlayingRef.current) {
          playAudioQueue();
        }
      } catch (error) {
        console.error('Error decoding audio data:', error);
      }
    });

    return () => {
      socket.current.disconnect();
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const playAudioQueue = async () => {
    if (audioBufferQueue.current.length > 0) {
      isPlayingRef.current = true;
      const audioBuffer = audioBufferQueue.current.shift();
      const sourceNode = audioContextRef.current.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.connect(audioContextRef.current.destination);
      sourceNode.onended = () => {
        playAudioQueue();
      };
      sourceNode.start();
    } else {
      isPlayingRef.current = false;
    }
  };

  const handleSpeech = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Your browser does not support speech recognition. Please use Chrome.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      console.log('Speech recognition started');
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event);
      alert(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setText(transcript);
      console.log('Speech recognition result:', transcript);
      socket.current.emit('message', transcript);
      setChatHistory((prevHistory) => [
        ...prevHistory,
        { type: 'question', content: transcript },
      ]);
    };

    recognition.start();
    setIsListening(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '50px' }}>
      <div style={{ marginBottom: '20px', color: isConnected ? 'green' : 'red' }}>
        {isConnected ? 'Live' : 'Disconnected'}
      </div>
      <button
        onClick={handleSpeech}
        style={{
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          backgroundColor: isListening ? '#FF5733' : '#4CAF50',
          color: 'white',
          border: 'none',
          fontSize: '16px',
          cursor: 'pointer',
          marginBottom: '20px'
        }}
      >
        {isListening ? 'Stop' : 'Speak'}
      </button>
      <div style={{ width: '80%', maxHeight: '300px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
        {chatHistory.map((chat, index) => (
          <div key={index} style={{
            padding: '5px',
            borderRadius: '5px',
            backgroundColor: chat.type === 'question' ? '#e1f5fe' : '#f1f8e9',
            margin: '5px 0'
          }}>
            <strong>{chat.type === 'question' ? 'You: ' : 'ChatGPT: '}</strong>{chat.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export default VoiceChatBot;
