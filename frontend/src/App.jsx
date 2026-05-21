import { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { useAudioCapture } from './hooks/useAudioCapture';
import { useTTS } from './hooks/useTTS';
import ChatPanel from './components/ChatPanel';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [loading, setLoading] = useState(true);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  const {
    isConnected,
    sessionId,
    messages,
    language,
    transcript,
    incomingCall,
    latencies,
    sendText,
    changeLanguage,
    acceptCall,
    declineCall,
    socket
  } = useSocket();

  const { isRecording, audioLevel, startRecording, stopRecording } = useAudioCapture(socket);
  const { speak, stop: stopTTS } = useTTS();

  // Speak agent response when it arrives
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === 'assistant') {
        speak(lastMsg.text, lastMsg.language || 'en');
      }
    }
  }, [messages, speak]);

  // Barge-in: Stop TTS speaking when user starts recording
  useEffect(() => {
    if (isRecording) {
      stopTTS();
    }
  }, [isRecording, stopTTS]);

  async function checkBackendHealth() {
    try {
      await fetch(`${API_URL}/api/health`);
    } catch (err) {
      console.warn('Backend health check failed:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkBackendHealth();
  }, []);

  // Seeding mock appointment
  async function handleSeedMock() {
    setSeedLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/mock/book-test`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotice('🌱 Seeded test appointment successfully!');
      }
    } catch (err) {
      console.error('Seeding error:', err);
      showNotice('❌ Seeding failed. Make sure backend is running.');
    } finally {
      setSeedLoading(false);
    }
  }

  // Trigger outbound reminder campaign
  async function handleTriggerCampaign() {
    setCampaignLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/outbound/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialty: 'Cardiologist' })
      });
      const data = await res.json();
      if (data.callsTriggered > 0) {
        showNotice(`📞 Campaign triggered! Active calls sent to ${data.callsTriggered} patient(s).`);
      } else {
        showNotice('ℹ️ Campaign executed, but no booked appointments found. Try seeding first!');
      }
    } catch (err) {
      console.error('Campaign error:', err);
      showNotice('❌ Failed to trigger campaign.');
    } finally {
      setCampaignLoading(false);
    }
  }

  function showNotice(msg) {
    setNotification(msg);
    setTimeout(() => setNotification(null), 5000);
  }

  return (
    <div className="app">
      {/* Toast Notification */}
      {notification && <div className="toast-notification">{notification}</div>}

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

      {/* Campaign & Testing Control Bar */}
      <div className="container campaign-control-container animate-fade-in-delay-1">
        <div className="campaign-panel">
          <div className="campaign-info">
            <h3>📞 Simulated Outbound Calling Campaign</h3>
            <p>Seed a test booking first, then trigger the campaign to receive a simulated reminder call.</p>
          </div>
          <div className="campaign-actions">
            <button
              onClick={handleSeedMock}
              disabled={seedLoading || !isConnected}
              className="action-btn seed-btn"
            >
              {seedLoading ? 'Seeding...' : '1. Seed Demo Appointment'}
            </button>
            <button
              onClick={handleTriggerCampaign}
              disabled={campaignLoading || !isConnected}
              className="action-btn trigger-btn"
            >
              {campaignLoading ? 'Running Campaign...' : '2. Trigger Outbound Call'}
            </button>
          </div>
        </div>
      </div>

      {/* Chat Panel */}
      <div className="container animate-fade-in-delay-1">
        <ChatPanel
          messages={messages}
          onSendText={sendText}
          language={language}
          onChangeLanguage={changeLanguage}
          isConnected={isConnected}
          sessionId={sessionId}
          isRecording={isRecording}
          audioLevel={audioLevel}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          transcript={transcript}
        />
      </div>

      {/* Latency Dashboard (Step 10) */}
      <div className="container latency-dashboard-container animate-fade-in-delay-2">
        <div className="latency-dashboard">
          <div className="latency-summary">
            <h3>⚡ Real-Time Pipeline Latency</h3>
            <div className="total-latency-metric">
              <span className="metric-val">{latencies.total}ms</span>
              <span className="metric-label">Total Latency</span>
            </div>
          </div>
          <div className="latency-stages">
            <div className="stage-card">
              <span className="stage-title">🎙️ Audio STT</span>
              <span className="stage-time">{latencies.stt}ms</span>
              <div className="stage-bar-container">
                <div className="stage-bar stt" style={{ width: `${Math.min(100, (latencies.stt / 450) * 100)}%` }}></div>
              </div>
            </div>
            <div className="stage-card">
              <span className="stage-title">🧠 Gemini LLM</span>
              <span className="stage-time">{latencies.llm}ms</span>
              <div className="stage-bar-container">
                <div className="stage-bar llm" style={{ width: `${Math.min(100, (latencies.llm / 450) * 100)}%` }}></div>
              </div>
            </div>
            <div className="stage-card">
              <span className="stage-title">🛠️ Tool Call</span>
              <span className="stage-time">{latencies.tool}ms</span>
              <div className="stage-bar-container">
                <div className="stage-bar tool" style={{ width: `${Math.min(100, (latencies.tool / 450) * 100)}%` }}></div>
              </div>
            </div>
            <div className="stage-card">
              <span className="stage-title">🔊 Client TTS</span>
              <span className="stage-time">0ms</span>
              <div className="stage-bar-container">
                <div className="stage-bar tts" style={{ width: '5%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Outbound Incoming Call Pulsing Overlay */}
      {incomingCall && (
        <div className="incoming-call-overlay">
          <div className="incoming-call-card">
            <div className="call-avatar">🏥</div>
            <h2>Incoming VoiceAI Reminder</h2>
            <div className="call-info">
              <p className="patient-name">Patient: <strong>{incomingCall.patientName}</strong></p>
              <p className="doctor-reminder">Reminder: <strong>Dr. {incomingCall.doctorName}</strong> ({incomingCall.specialty})</p>
              <p className="time-details">Date: <strong>{incomingCall.date}</strong> at <strong>{incomingCall.slot}</strong></p>
            </div>
            <div className="call-pulse-ring"></div>
            <div className="call-actions">
              <button onClick={() => acceptCall(incomingCall)} className="accept-call-btn">
                📞 Answer & Talk
              </button>
              <button onClick={declineCall} className="decline-call-btn">
                ❌ Decline
              </button>
            </div>
          </div>
        </div>
      )}

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
