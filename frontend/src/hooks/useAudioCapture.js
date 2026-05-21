import { useState, useRef, useCallback } from 'react';

/**
 * Custom hook for browser microphone capture
 * Captures audio in Linear16 format (16kHz, mono) for Deepgram
 * Streams audio chunks via Socket.IO
 */
export function useAudioCapture(socket) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const mediaStreamRef = useRef(null);
  const processorRef = useRef(null);
  const audioContextRef = useRef(null);

  /**
   * Start recording from microphone
   */
  const startRecording = useCallback(async () => {
    if (!socket || isRecording) return;

    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      mediaStreamRef.current = stream;

      // Create audio context for processing
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Use ScriptProcessorNode for audio processing
      // (AudioWorklet is preferred but requires HTTPS in some browsers)
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);

        // Calculate audio level for visual feedback
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        setAudioLevel(Math.min(1, rms * 10));

        // Convert Float32 to Int16 (Linear16 PCM)
        const int16Data = float32ToInt16(inputData);

        // Send audio chunk to server via Socket.IO
        socket.emit('audio:data', int16Data.buffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      // Notify server that recording started
      socket.emit('audio:start');
      setIsRecording(true);

    } catch (error) {
      console.error('❌ Microphone access denied:', error.message);
      throw error;
    }
  }, [socket, isRecording]);

  /**
   * Stop recording
   */
  const stopRecording = useCallback(() => {
    if (!isRecording) return;

    // Stop all media tracks
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Disconnect processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Notify server
    if (socket) {
      socket.emit('audio:stop');
    }

    setIsRecording(false);
    setAudioLevel(0);
  }, [socket, isRecording]);

  return {
    isRecording,
    audioLevel,
    startRecording,
    stopRecording
  };
}

/**
 * Convert Float32 audio samples to Int16 (Linear16 PCM)
 * This is the format Deepgram expects
 */
function float32ToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Array;
}
