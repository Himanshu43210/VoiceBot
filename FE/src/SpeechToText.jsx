import React, { useState, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';

const SpeechToText = () => {
  const [text, setText] = useState('');
  const [response, setResponse] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const recognitionRef = useRef(null);
  const socket = useRef(null);
  const mediaSource = useRef(new MediaSource());
  const audioRef = useRef(new Audio());
  const bufferQueue = useRef([]);
  const sourceBufferRef = useRef(null);

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

    socket.current.on('audio-chunk', (chunk) => {
      console.log('Received audio chunk');
      bufferQueue.current.push(new Uint8Array(chunk));
      appendBuffer();
    });

    mediaSource.current.addEventListener('sourceopen', () => {
      console.log('MediaSource opened');
      const sourceBuffer = mediaSource.current.addSourceBuffer('audio/mpeg');
      sourceBufferRef.current = sourceBuffer;
      sourceBuffer.mode = 'sequence';
      sourceBuffer.addEventListener('updateend', () => {
        console.log('SourceBuffer updateend');
        if (bufferQueue.current.length > 0) {
          appendBuffer();
        }
      });
    });

    audioRef.current.src = URL.createObjectURL(mediaSource.current);
    audioRef.current.volume = 1.0; // Ensure volume is up
    audioRef.current.load();

    return () => {
      socket.current.disconnect();
    };
  }, []);

  const appendBuffer = () => {
    const sourceBuffer = sourceBufferRef.current;
    if (sourceBuffer && !sourceBuffer.updating && bufferQueue.current.length > 0) {
      const chunk = bufferQueue.current.shift();
      console.log('Appending buffer');
      try {
        sourceBuffer.appendBuffer(chunk);
      } catch (error) {
        console.error('Error appending buffer:', error);
      }
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

    // Ensure audio playback is initiated by user interaction
    audioRef.current.play().then(() => {
      console.log('Audio playback started');
    }).catch(error => {
      console.error('Playback failed:', error);
    });
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
      {/* Hide the audio element */}
      <audio ref={audioRef} style={{ display: 'none' }}></audio>
    </div>
  );
};

export default SpeechToText;
