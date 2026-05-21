import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/**
 * Socket.IO client singleton
 * Manages connection to the Voice AI backend
 */
let socket = null;

/**
 * Initialize and return the Socket.IO connection
 * Returns existing connection if already connected
 */
export function getSocket() {
  if (socket && socket.connected) {
    return socket;
  }

  socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
    autoConnect: true
  });

  // Connection lifecycle logging
  socket.on('connect', () => {
    console.log('🔌 Connected to Voice AI backend:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('🔴 Connection error:', error.message);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('🔄 Reconnected after', attemptNumber, 'attempts');
  });

  socket.on('reconnect_attempt', (attemptNumber) => {
    console.log('🔄 Reconnection attempt:', attemptNumber);
  });

  return socket;
}

/**
 * Disconnect and cleanup
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
