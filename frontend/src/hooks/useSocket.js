import { useState, useEffect, useCallback } from 'react';
import { getSocket } from '../services/socket';

/**
 * Custom hook for Socket.IO connection management
 * Provides connection state, session info, transcript, and message sending
 */
export function useSocket() {
  const socket = getSocket();
  const [isConnected, setIsConnected] = useState(() => socket.connected);
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [language, setLanguage] = useState('en');
  const [transcript, setTranscript] = useState({ text: '', isFinal: false });
  const [incomingCall, setIncomingCall] = useState(null);
  const [latencies, setLatencies] = useState({ total: 0, stt: 0, llm: 0, tool: 0 });

  useEffect(() => {
    // Connection events
    function onConnect() {
      setIsConnected(true);
    }

    // Handshake session restoration
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

      if (data.latency) {
        setLatencies({
          total: data.latency.total || 0,
          stt: data.latency.breakdown?.stt || 0,
          llm: data.latency.breakdown?.llm || 0,
          tool: data.latency.breakdown?.tool || 0
        });
      }
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

    // Outbound campaign call handler
    function onOutboundCall(data) {
      console.log('📞 Outbound reminder campaign triggered call:', data);
      setIncomingCall(data);
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
    socket.on('outbound:call', onOutboundCall);
    socket.on('language:updated', onLanguageUpdated);

    // Set initial state statefully in timeout to ensure no render warnings
    if (socket.connected) {
      setTimeout(() => setIsConnected(true), 0);
    }

    // Cleanup on unmount
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session:init', onSessionInit);
      socket.off('response:text', onResponseText);
      socket.off('transcript', onTranscript);
      socket.off('stt:error', onSttError);
      socket.off('outbound:call', onOutboundCall);
      socket.off('language:updated', onLanguageUpdated);
    };
  }, [socket]);

  /**
   * Send text message to the agent
   */
  const sendText = useCallback((text) => {
    if (socket && text.trim()) {
      const message = { role: 'user', text, timestamp: new Date().toISOString() };
      setMessages(prev => [...prev, message]);
      socket.emit('text:input', { text });
    }
  }, [socket]);

  /**
   * Change active language
   */
  const changeLanguage = useCallback((lang) => {
    if (socket) {
      socket.emit('language:set', { language: lang });
    }
  }, [socket]);

  /**
   * Clear message history
   */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  /**
   * Accept an incoming simulated outbound call
   */
  const acceptCall = useCallback((callData) => {
    if (socket && callData) {
      const lang = callData.language || 'en';
      setLanguage(lang);
      socket.emit('language:set', { language: lang });

      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `[Call Connected] Outbound Campaign: Reminder for ${callData.patientName} regarding their appointment with Dr. ${callData.doctorName}.`,
        timestamp: new Date().toISOString()
      }]);

      // Trigger reminder greetings in correct language
      const introPrompt = `Hello, this is VoiceAI Clinic. I am calling to remind ${callData.patientName} about their appointment with Dr. ${callData.doctorName} (${callData.specialty}) on ${callData.date} at ${callData.slot}. Please greet them and confirm.`;
      socket.emit('text:input', { text: introPrompt });

      setIncomingCall(null);
    }
  }, [socket]);

  /**
   * Decline outbound call
   */
  const declineCall = useCallback(() => {
    setIncomingCall(null);
  }, []);

  return {
    isConnected,
    sessionId,
    messages,
    language,
    transcript,
    incomingCall,
    latencies,
    sendText,
    changeLanguage,
    clearMessages,
    acceptCall,
    declineCall,
    socket
  };
}
