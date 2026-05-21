const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const { initializeSocket } = require('./socket');
const deepgramService = require('./services/deepgram');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'running',
    service: 'voice-ai-agent',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

const outboundService = require('./services/outbound');

// Trigger Outbound Campaign
app.post('/api/outbound/trigger', async (req, res) => {
  try {
    const { specialty } = req.body;
    const result = await outboundService.triggerReminderCampaign(specialty);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to seed a test appointment for outbound calling demos
app.post('/api/mock/book-test', async (req, res) => {
  try {
    const db = require('./services/db');
    const doctor = (await db.doctors.find())[0];
    const patient = await db.patients.create({
      name: 'Rohan Sharma',
      phone: '+919999999999',
      preferredLanguage: 'en'
    });

    const appointment = await db.appointments.create({
      patientId: patient._id,
      doctorId: doctor._id,
      date: '2026-05-22',
      slot: '10:00 AM',
      status: 'booked'
    });

    res.json({ success: true, message: 'Mock appointment seeded for outbound demo!', appointment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create HTTP server and attach Socket.IO
const server = http.createServer(app);
initializeSocket(server);

const dbService = require('./services/db');
const redisService = require('./services/redis');
const geminiService = require('./services/gemini');

// Initialize services
deepgramService.initialize();
geminiService.initialize();

// Asynchronously connect database and cache
(async () => {
  await dbService.connect();
  redisService.connect();
})();

// Start server
server.listen(PORT, () => {
  console.log(`\n🚀 Voice AI Backend running on http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}\n`);
});

module.exports = { app, server };
