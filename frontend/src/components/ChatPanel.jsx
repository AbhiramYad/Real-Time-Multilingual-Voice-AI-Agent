import { useState, useRef, useEffect } from 'react';
import './ChatPanel.css';

const LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'hi', label: 'Hindi', flag: '🇮🇳' },
  { code: 'ta', label: 'Tamil', flag: '🇮🇳' }
];

/**
 * ChatPanel — Real-time voice + text chat with the voice AI agent
 */
function ChatPanel({
  messages,
  onSendText,
  language,
  onChangeLanguage,
  isConnected,
  sessionId,
  isRecording,
  audioLevel,
  onStartRecording,
  onStopRecording,
  transcript
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, transcript]);

  function handleSubmit(e) {
    e.preventDefault();
    if (input.trim() && isConnected) {
      onSendText(input.trim());
      setInput('');
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      onStopRecording();
    } else {
      try {
        await onStartRecording();
      } catch {
        alert('Microphone access is required for voice input. Please allow microphone access and try again.');
      }
    }
  }

  return (
    <div className="chat-panel">
      {/* Chat Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <h2>💬 Voice AI Agent</h2>
          <span className={`chat-connection ${isConnected ? 'online' : 'offline'}`}>
            <span className="connection-dot"></span>
            {isConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="chat-header-right">
          <div className="language-selector">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                className={`lang-btn ${language === lang.code ? 'active' : ''}`}
                onClick={() => onChangeLanguage(lang.code)}
                title={lang.label}
              >
                {lang.flag} {lang.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Session Info */}
      {sessionId && (
        <div className="session-info">
          Session: {sessionId.substring(0, 8)}...
        </div>
      )}

      {/* Messages Area */}
      <div className="chat-messages">
        {messages.length === 0 && !isRecording && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🏥</div>
            <h3>Welcome to VoiceAI Clinic</h3>
            <p>Type a message or press the microphone to book, reschedule, or cancel appointments.</p>
            <div className="chat-suggestions">
              <button onClick={() => onSendText('Book an appointment with a cardiologist tomorrow')}>
                📅 Book appointment
              </button>
              <button onClick={() => onSendText('Show available doctors')}>
                👨‍⚕️ Available doctors
              </button>
              <button onClick={() => onSendText('Cancel my appointment')}>
                ❌ Cancel appointment
              </button>
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`chat-message ${msg.role}`}>
            <div className="message-avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="message-content">
              <div className="message-text">{msg.text}</div>
              <div className="message-meta">
                {new Date(msg.timestamp).toLocaleTimeString()}
                {msg.source === 'voice' && <span className="message-source">🎙️ Voice</span>}
                {msg.sttLatency && (
                  <span className="message-latency">STT: {msg.sttLatency}ms</span>
                )}
                {msg.latency && msg.latency.total > 0 && (
                  <span className="message-latency">⚡ {msg.latency.total}ms</span>
                )}
              </div>
            </div>
          </div>
        ))}

        {/* Live transcript while recording */}
        {isRecording && transcript?.text && (
          <div className="chat-message user live-transcript">
            <div className="message-avatar">🎙️</div>
            <div className="message-content">
              <div className="message-text">
                {transcript.text}
                {!transcript.isFinal && <span className="typing-indicator">...</span>}
              </div>
              <div className="message-meta">
                Listening...
                {transcript.sttLatency && (
                  <span className="message-latency">STT: {transcript.sttLatency}ms</span>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <form className="chat-input-area" onSubmit={handleSubmit}>
        <button
          type="button"
          className={`mic-btn ${isRecording ? 'recording' : ''}`}
          onClick={toggleRecording}
          disabled={!isConnected}
          id="mic-button"
          title={isRecording ? 'Stop recording' : 'Start recording'}
        >
          <span className="mic-icon">{isRecording ? '⏹' : '🎙️'}</span>
          {isRecording && (
            <span
              className="mic-level"
              style={{ transform: `scale(${1 + audioLevel * 0.8})` }}
            ></span>
          )}
        </button>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isRecording ? 'Listening...' : isConnected ? 'Type a message...' : 'Connecting...'}
          disabled={!isConnected || isRecording}
          className="chat-input"
          id="chat-text-input"
        />
        <button
          type="submit"
          disabled={!isConnected || !input.trim() || isRecording}
          className="chat-send-btn"
          id="chat-send-button"
        >
          Send ➤
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
