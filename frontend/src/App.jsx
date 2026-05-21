import { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import ChatPanel from './components/ChatPanel';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [backendStatus, setBackendStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const { isConnected, sessionId, messages, language, sendText, changeLanguage } = useSocket();

  useEffect(() => {
    checkBackendHealth();
  }, []);

  async function checkBackendHealth() {
    try {
      const res = await fetch(`${API_URL}/api/health`);
      const data = await res.json();
      setBackendStatus(data);
    } catch {
      setBackendStatus(null);
    } finally {
      setLoading(false);
    }
  }

  const isOnline = backendStatus?.status === 'running';

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="app-logo">
          <div className="app-logo-icon">🏥</div>
          <span className="app-logo-text">VoiceAI Clinic</span>
        </div>
        <div className={`app-status ${isConnected ? '' : 'offline'}`}>
          <span className="status-dot"></span>
          {loading ? 'Connecting...' : isConnected ? 'System Online' : 'Backend Offline'}
        </div>
      </header>

      {/* Hero */}
      <section className="hero animate-fade-in">
        <div className="hero-badge">
          ⚡ Real-Time Voice AI • Under 450ms Latency
        </div>
        <h1>
          Clinical Appointments via{' '}
          <span className="gradient-text">Voice AI</span>
        </h1>
        <p>
          A real-time multilingual voice agent that books, reschedules, and manages
          clinical appointments through natural conversations in English, Hindi, and Tamil.
        </p>
      </section>

      {/* Chat Panel */}
      <div className="container animate-fade-in-delay-1">
        <ChatPanel
          messages={messages}
          onSendText={sendText}
          language={language}
          onChangeLanguage={changeLanguage}
          isConnected={isConnected}
          sessionId={sessionId}
        />
      </div>

      {/* Features */}
      <div className="features-grid">
        <div className="feature-card animate-fade-in-delay-1">
          <div className="feature-icon purple">🎙️</div>
          <h3>Real-Time Voice Pipeline</h3>
          <p>
            Streaming STT with Deepgram, AI reasoning with Gemini,
            and instant client-side TTS. Full duplex via Socket.IO.
          </p>
        </div>

        <div className="feature-card animate-fade-in-delay-2">
          <div className="feature-icon green">🌐</div>
          <h3>Multilingual Support</h3>
          <p>
            Auto-detects and sustains conversations in English, Hindi,
            and Tamil. Language preference persists across sessions.
          </p>
        </div>

        <div className="feature-card animate-fade-in-delay-3">
          <div className="feature-icon amber">🧠</div>
          <h3>Contextual Memory</h3>
          <p>
            Redis session memory with TTL for active conversations.
            MongoDB persistent memory for patient history and preferences.
          </p>
        </div>

        <div className="feature-card animate-fade-in-delay-1">
          <div className="feature-icon cyan">📅</div>
          <h3>Appointment Management</h3>
          <p>
            Full lifecycle: book, reschedule, cancel. Conflict detection,
            double-booking prevention, and smart alternative suggestions.
          </p>
        </div>

        <div className="feature-card animate-fade-in-delay-2">
          <div className="feature-icon red">📞</div>
          <h3>Outbound Campaigns</h3>
          <p>
            Proactive reminders and follow-up calls. The agent initiates
            conversations and handles responses naturally.
          </p>
        </div>

        <div className="feature-card animate-fade-in-delay-3">
          <div className="feature-icon blue">⚡</div>
          <h3>Latency Measurement</h3>
          <p>
            Every pipeline stage is timestamped. Real-time latency dashboard
            shows STT, reasoning, tool execution, and TTS breakdown.
          </p>
        </div>
      </div>

      {/* Tech Stack */}
      <div className="tech-bar animate-fade-in-delay-2">
        {['React', 'Node.js', 'Socket.IO', 'Deepgram', 'Gemini AI', 'MongoDB', 'Redis', 'Vite'].map(tech => (
          <span className="tech-chip" key={tech}>
            {tech}
          </span>
        ))}
      </div>
    </div>
  );
}

export default App;
