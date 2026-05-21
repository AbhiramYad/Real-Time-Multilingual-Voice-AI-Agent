import { useState, useEffect, useCallback, useRef } from 'react';
import { getSocket, disconnectSocket } from '../services/socket';

/**
 * Custom hook for Socket.IO connection management
 * Provides connection state, session info, transcript, and message sending
 */
export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [language, setLanguage] = useState('en');
  const [transcript, setTranscript] = useState({ text: '', isFinal: false });
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // Connection events
    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    // Session initialization from server
    function onSessionInit(data) {
      setSessionId(data.sessionId);
      localStorage.setItem('voice_ai_session_id', data.sessionId);
      console.log('📋 Session initialized:', data.sessionId);
    }

    // Agent text response
    function onResponseText(data) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: data.text,
        language: data.language,
        timestamp: data.timestamp,
        latency: data.latency
      }]);
    }

    // Real-time transcript from Deepgram STT
    function onTranscript(data) {
      setTranscript({
        text: data.text,
        isFinal: data.isFinal,
        confidence: data.confidence,
        language: data.language,
        sttLatency: data.sttLatency
      });

      // When we get a final transcript, add it as a user message
      if (data.isFinal && data.text && !data.isUtteranceEnd) {
        setMessages(prev => [...prev, {
          role: 'user',
          text: data.text,
          timestamp: data.timestamp,
          source: 'voice',
          sttLatency: data.sttLatency
        }]);
      }
    }

    // STT error
    function onSttError(data) {
      console.error('🔴 STT Error:', data.message);
    }

    // Language update confirmation
    function onLanguageUpdated(data) {
      setLanguage(data.language);
    }

    // Register listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session:init', onSessionInit);
    socket.on('response:text', onResponseText);
    socket.on('transcript', onTranscript);
    socket.on('stt:error', onSttError);
    socket.on('language:updated', onLanguageUpdated);

    // Set initial state
    if (socket.connected) {
      setIsConnected(true);
    }

    // Cleanup on unmount
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session:init', onSessionInit);
      socket.off('response:text', onResponseText);
      socket.off('transcript', onTranscript);
      socket.off('stt:error', onSttError);
      socket.off('language:updated', onLanguageUpdated);
    };
  }, []);

  /**
   * Send text message to the agent
   */
  const sendText = useCallback((text) => {
    if (socketRef.current && text.trim()) {
      const message = { role: 'user', text, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, message]);
      socketRef.current.emit('text:input', { text });
    }
  }, []);

  /**
   * Change active language
   */
  const changeLanguage = useCallback((lang) => {
    if (socketRef.current) {
      socketRef.current.emit('language:set', { language: lang });
    }
  }, []);

  /**
   * Clear message history
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    isConnected,
    sessionId,
    messages,
    language,
    transcript,
    sendText,
    changeLanguage,
    clearMessages,
    socket: socketRef.current
  };
}
