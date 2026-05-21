const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

/**
 * DeepgramService — Manages streaming Speech-to-Text connections
 * 
 * Creates a persistent WebSocket connection to Deepgram per user session.
 * Audio chunks are streamed in, interim + final transcripts are emitted back.
 * 
 * Supports: English, Hindi, Tamil
 * Latency target: ~100-150ms from audio chunk to transcript
 */
class DeepgramService {
  constructor() {
    this.apiKey = process.env.DEEPGRAM_API_KEY;
    this.client = null;
    this.activeConnections = new Map(); // socketId → deepgram live connection
  }

  /**
   * Initialize Deepgram client
   */
  initialize() {
    if (!this.apiKey) {
      console.warn('⚠️ DEEPGRAM_API_KEY not set — STT will be unavailable');
      return false;
    }
    this.client = createClient(this.apiKey);
    console.log('🎙️ Deepgram STT service initialized');
    return true;
  }

  /**
   * Start a live transcription session for a socket connection
   * @param {string} socketId - The Socket.IO client ID
   * @param {string} language - Language code (en, hi, ta)
   * @param {Function} onTranscript - Callback for transcript results
   * @param {Function} onError - Callback for errors
   */
  async startSession(socketId, language, onTranscript, onError) {
    if (!this.client) {
      onError(new Error('Deepgram not initialized'));
      return null;
    }

    // Close existing connection if any
    this.stopSession(socketId);

    try {
      const dgLanguage = this._mapLanguageCode(language);

      const connection = this.client.listen.live({
        model: 'nova-2',
        language: dgLanguage,
        smart_format: true,
        interim_results: true,
        utterance_end_ms: 1500,
        vad_events: true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1
      });

      // Track timing for latency measurement
      let audioStartTime = null;

      connection.on(LiveTranscriptionEvents.Open, () => {
        console.log(`🎙️ Deepgram session opened for ${socketId}`);
        audioStartTime = Date.now();
      });

      connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0];
        if (!transcript) return;

        const text = transcript.transcript?.trim();
        if (!text) return;

        const isFinal = data.is_final;
        const confidence = transcript.confidence || 0;
        const detectedLanguage = data.channel?.detected_language || language;

        // Calculate STT latency
        const sttLatency = audioStartTime ? Date.now() - audioStartTime : 0;

        onTranscript({
          text,
          isFinal,
          confidence,
          language: detectedLanguage,
          sttLatency,
          timestamp: new Date().toISOString()
        });

        // Reset timing for next utterance
        if (isFinal) {
          audioStartTime = Date.now();
        }
      });

      connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
        onTranscript({
          text: '',
          isFinal: true,
          isUtteranceEnd: true,
          timestamp: new Date().toISOString()
        });
      });

      connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error(`❌ Deepgram error for ${socketId}:`, error.message);
        onError(error);
      });

      connection.on(LiveTranscriptionEvents.Close, () => {
        console.log(`🔇 Deepgram session closed for ${socketId}`);
        this.activeConnections.delete(socketId);
      });

      this.activeConnections.set(socketId, connection);
      return connection;

    } catch (error) {
      console.error(`❌ Failed to start Deepgram session for ${socketId}:`, error.message);
      onError(error);
      return null;
    }
  }

  /**
   * Send audio data to an active transcription session
   * @param {string} socketId
   * @param {Buffer} audioData - Raw audio bytes (Linear16, 16kHz, mono)
   */
  sendAudio(socketId, audioData) {
    const connection = this.activeConnections.get(socketId);
    if (connection) {
      connection.send(audioData);
    }
  }

  /**
   * Stop and cleanup a transcription session
   * @param {string} socketId
   */
  stopSession(socketId) {
    const connection = this.activeConnections.get(socketId);
    if (connection) {
      try {
        connection.requestClose();
      } catch {
        // Ignore close errors
      }
      this.activeConnections.delete(socketId);
    }
  }

  /**
   * Stop all active sessions (for server shutdown)
   */
  stopAll() {
    for (const [socketId] of this.activeConnections) {
      this.stopSession(socketId);
    }
  }

  /**
   * Map our language codes to Deepgram language codes
   */
  _mapLanguageCode(lang) {
    const map = {
      'en': 'en',
      'hi': 'hi',
      'ta': 'ta'
    };
    return map[lang] || 'en';
  }

  /**
   * Get count of active sessions
   */
  getActiveSessionCount() {
    return this.activeConnections.size;
  }
}

// Singleton instance
const deepgramService = new DeepgramService();

module.exports = deepgramService;
