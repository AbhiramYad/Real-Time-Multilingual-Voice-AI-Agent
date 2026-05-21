# 🏥 VoiceAI Clinic — Real-Time Multilingual Voice AI Agent

> Clinical Appointment Booking through Natural Voice Conversations

A real-time voice AI agent that books, reschedules, and manages clinical appointments through natural voice conversations in **English**, **Hindi**, and **Tamil** — with end-to-end response latency under **450ms**.

---

## 🏗️ Architecture Overview

```
User Speech → Deepgram STT → Gemini AI Agent → Tool Execution → Socket.IO → Web Speech TTS
                (streaming)     (function calling)   (appointments)              (client-side)
```

### Pipeline Latency Budget

| Stage | Target | Technology |
|-------|--------|------------|
| Speech-to-Text | ~100ms | Deepgram (streaming) |
| Language Detection | ~0ms | Deepgram metadata |
| Agent Reasoning | ~150-200ms | Google Gemini (function calling) |
| Tool Execution | ~20-50ms | MongoDB queries |
| Response Transport | ~10-20ms | Socket.IO |
| Text-to-Speech | ~0ms server | Web Speech API (client-side) |
| **Total** | **~280-370ms** | ✅ Under 450ms |

---

## 🛠️ Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Frontend | React.js (Vite) | Fast HMR, modern tooling |
| Backend | Node.js + Express | Shared language with frontend, excellent WebSocket support |
| Real-time | Socket.IO | Auto-reconnect, rooms, polling fallback |
| STT | Deepgram | Free streaming STT with Hindi/Tamil support |
| LLM | Google Gemini | Free tier, native function calling, multilingual |
| TTS | Web Speech API | Zero latency (client-side), free, all 3 languages |
| Database | MongoDB Atlas | Free tier, flexible schema, no expiry |
| Cache | Upstash Redis | Free serverless Redis with TTL |
| Deployment | Render | Free tier, auto-deploy from GitHub |

---

## 📂 Project Structure

```
voice-ai-agent/
├── backend/
│   └── src/
│       └── index.js          # Express server entry
├── frontend/
│   └── src/
│       ├── App.jsx            # Main application
│       ├── App.css            # App-specific styles
│       ├── index.css          # Design system & globals
│       └── main.jsx           # React entry point
├── .env.example               # Environment variable template
├── .gitignore
├── package.json               # Monorepo root (concurrently)
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- npm v9+

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd voice-ai-agent

# Copy environment variables
cp .env.example .env
# Fill in your API keys in .env

# Install all dependencies
npm run install:all

# Start both servers
npm run dev
```

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/health

---

## 📋 Build Progress

- [x] Step 1: Project scaffold + monorepo setup
- [ ] Step 2: Socket.IO real-time communication
- [ ] Step 3: Speech-to-Text (Deepgram streaming)
- [ ] Step 4: Text-to-Speech (Web Speech API)
- [ ] Step 5: MongoDB models + appointment engine
- [ ] Step 6: Redis session memory
- [ ] Step 7: AI Agent (Gemini + tool calling)
- [ ] Step 8: Full pipeline integration + latency measurement
- [ ] Step 9: Outbound campaign engine
- [ ] Step 10: UI polish + documentation + deployment

---

## ⚠️ Known Limitations

- (will be updated as development progresses)

---

## 📄 License

MIT
