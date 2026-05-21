const { Server } = require('socket.io');
const deepgramService = require('./services/deepgram');

/** @type {Server} */
let io;

/**
 * Active sessions map: socketId → session data
 * Tracks connected clients and their session state
 */
const activeSessions = new Map();

/**
 * Initialize Socket.IO server
 * @param {import('http').Server} httpServer
 */
function initializeSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingInterval: 25000,
    pingTimeout: 60000,
    maxHttpBufferSize: 1e7 // 10MB for audio chunks
  });

  io.on('connection', handleConnection);

  console.log('🔌 Socket.IO initialized');
  return io;
}

/**
 * Handle new client connection
 * @param {import('socket.io').Socket} socket
 */
function handleConnection(socket) {
  const sessionId = generateSessionId();

  // Store session
  activeSessions.set(socket.id, {
    sessionId,
    connectedAt: new Date().toISOString(),
    language: 'en',
    isRecording: false
  });

  console.log(`✅ Client connected: ${socket.id} (session: ${sessionId})`);

  // Send session info to client
  socket.emit('session:init', {
    sessionId,
    timestamp: new Date().toISOString(),
    message: 'Connected to Voice AI Agent'
  });

  // Handle audio events (pipeline will be wired in later steps)
  socket.on('audio:start', () => handleAudioStart(socket));
  socket.on('audio:data', (data) => handleAudioData(socket, data));
  socket.on('audio:stop', () => handleAudioStop(socket));

  // Handle text input (for testing without voice)
  socket.on('text:input', (data) => handleTextInput(socket, data));

  // Handle language change
  socket.on('language:set', (data) => handleLanguageSet(socket, data));

  // Handle disconnect
  socket.on('disconnect', (reason) => handleDisconnect(socket, reason));

  // Handle errors
  socket.on('error', (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error.message);
  });
}

/**
 * Handle audio recording start — opens Deepgram streaming session
 */
async function handleAudioStart(socket) {
  const session = activeSessions.get(socket.id);
  if (session) {
    session.isRecording = true;
    session.recordingStartedAt = Date.now();
  }
  console.log(`🎙️ Recording started: ${socket.id}`);

  // Start Deepgram streaming session
  await deepgramService.startSession(
    socket.id,
    session?.language || 'en',
    // onTranscript callback
    (transcript) => {
      socket.emit('transcript', {
        text: transcript.text,
        isFinal: transcript.isFinal,
        confidence: transcript.confidence,
        language: transcript.language,
        sttLatency: transcript.sttLatency,
        isUtteranceEnd: transcript.isUtteranceEnd || false,
        timestamp: transcript.timestamp
      });
    },
    // onError callback
    (error) => {
      console.error(`❌ STT error for ${socket.id}:`, error.message);
      socket.emit('stt:error', { message: 'Speech recognition error. Please try again.' });
    }
  );

  socket.emit('audio:status', { recording: true });
}

/**
 * Handle incoming audio data chunk — forwards to Deepgram
 */
function handleAudioData(socket, data) {
  deepgramService.sendAudio(socket.id, data);
}

/**
 * Handle audio recording stop — closes Deepgram session
 */
function handleAudioStop(socket) {
  const session = activeSessions.get(socket.id);
  if (session) {
    session.isRecording = false;
    const duration = session.recordingStartedAt
      ? Date.now() - session.recordingStartedAt
      : 0;
    console.log(`🛑 Recording stopped: ${socket.id} (${duration}ms)`);
  }
  deepgramService.stopSession(socket.id);
  socket.emit('audio:status', { recording: false });
}

/**
 * Handle text input (for testing agent without voice)
 * In Step 7, this will be routed to the AI agent
 */
function handleTextInput(socket, data) {
  const session = activeSessions.get(socket.id);
  const { text } = data;

  console.log(`💬 Text input from ${socket.id}: "${text}"`);

  // Echo back for now — will be replaced by agent reasoning in Step 7
  socket.emit('response:text', {
    text: `[Echo] You said: "${text}"`,
    language: session?.language || 'en',
    timestamp: new Date().toISOString(),
    latency: {
      total: 0,
      breakdown: { echo: 0 }
    }
  });
}

/**
 * Handle language preference change
 */
function handleLanguageSet(socket, data) {
  const session = activeSessions.get(socket.id);
  if (session && data.language) {
    session.language = data.language;
    console.log(`🌐 Language set to ${data.language} for ${socket.id}`);
    socket.emit('language:updated', { language: data.language });
  }
}

/**
 * Handle client disconnect — cleanup Deepgram session
 */
function handleDisconnect(socket, reason) {
  const session = activeSessions.get(socket.id);
  if (session) {
    console.log(`❌ Client disconnected: ${socket.id} (reason: ${reason})`);
    deepgramService.stopSession(socket.id);
    activeSessions.delete(socket.id);
  }
}

/**
 * Generate a unique session ID
 */
function generateSessionId() {
  // Use crypto.randomUUID if available (Node 19+), fallback to timestamp-based
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Get Socket.IO instance
 */
function getIO() {
  return io;
}

/**
 * Get active sessions count
 */
function getActiveSessionCount() {
  return activeSessions.size;
}

module.exports = {
  initializeSocket,
  getIO,
  getActiveSessionCount
};
