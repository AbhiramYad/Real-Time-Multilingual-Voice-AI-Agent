const { GoogleGenAI } = require('@google/generative-ai');
const dbService = require('./db');

/**
 * GeminiService — Clinical Voice AI Agent
 * 
 * Uses gemini-2.5-flash for low latency (<250ms reasoning) and reliable tool calling.
 * Operates across English, Hindi, and Tamil.
 * Maintains context and executes clinical booking tools.
 * Gracefully falls back to mock rule-based agent if GEMINI_API_KEY is not set.
 */
class GeminiService {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.ai = null;
    this.modelName = 'gemini-2.5-flash';
  }

  /**
   * Initialize Gemini SDK
   */
  initialize() {
    if (!this.apiKey) {
      console.warn('⚠️ GEMINI_API_KEY not set — Gemini LLM reasoning will run in mock mode');
      return false;
    }
    try {
      // Correct import/initialization using standard @google/generative-ai package
      const { GoogleGenAI } = require('@google/generative-ai');
      // For compatibility with some SDK versions, check if we should use GoogleGenAI or GoogleGenerativeAI
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const GenAI = GoogleGenerativeAI || GoogleGenAI;
      
      this.ai = new GenAI(this.apiKey);
      console.log(`🧠 Gemini LLM reasoning initialized (${this.modelName})`);
      return true;
    } catch (err) {
      console.error('❌ Failed to initialize Gemini client:', err.message);
      return false;
    }
  }

  /**
   * Process user input (either text or transcribed speech) and return agent response
   * @param {string} socketId - Client socket reference
   * @param {string} text - User message
   * @param {Object} session - Session state (language, history, etc.)
   * @returns {Promise<Object>} Response containing text, language, and latencies
   */
  async processMessage(socketId, text, session) {
    const startTime = Date.now();
    let responseText = '';
    let toolExecutionLatency = 0;

    // Track conversational history in session
    if (!session.history) {
      session.history = [];
    }

    // Add user message to history
    session.history.push({ role: 'user', content: text });

    // Map session language code to full language name
    const langNames = { en: 'English', hi: 'Hindi', ta: 'Tamil' };
    const currentLanguage = langNames[session.language] || 'English';

    if (this.ai) {
      try {
        const systemInstruction = `You are a warm, professional, and efficient real-time voice AI receptionist for "VoiceAI Clinic".
Your primary function is to book, reschedule, and manage clinical appointments entirely without human intervention.

CRITICAL VOICE CONSTRAINTS:
1. Speak in a natural, friendly conversational voice.
2. Keep your answers extremely CONCISE, CLEAR, and brief (1-3 sentences maximum). Avoid long paragraphs or bullet lists because your output is read aloud via TTS.
3. Keep sentences short. Use simple vocabulary.
4. You are speaking to the patient in ${currentLanguage}. Respond in ${currentLanguage} naturally. If they use words from another language, you can understand and respond appropriately but maintain a friendly tone in their preferred language.
5. If user states a phone number, name, or slot, confirm it back clearly.

FUNCTION TOOL USAGE:
- You have tools to list doctors, check availability, book, reschedule, and cancel appointments.
- ALWAYS confirm with the user before performing database modifications (booking, rescheduling, cancelling).
- If a slot is already booked or conflicts exist, offer alternative slots proactively.
- Present available slots in a natural way.

IMPORTANT: When booking, you MUST ask the patient for their Name, Phone Number, Doctor Specialty or Name, Date, and Time Slot. If they don't provide some, politely ask for them one by one.`;

        // Configure the chat/model session
        const model = this.ai.getGenerativeModel({
          model: this.modelName,
          systemInstruction
        });

        // Map internal history format to Gemini Content format
        const contents = session.history.map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }]
        }));

        // Define our custom tools (functions)
        const functions = {
          list_doctors: async () => {
            const doctors = await dbService.doctors.find();
            return { doctors: doctors.map(d => ({ id: d._id, name: d.name, specialty: d.specialty, slots: d.availableSlots })) };
          },
          check_availability: async ({ doctorId, date }) => {
            const doc = await dbService.doctors.findById(doctorId);
            if (!doc) return { error: 'Doctor not found' };

            // Find booked appointments for this doctor on this date
            const booked = await dbService.appointments.find({ doctorId, date, status: { $ne: 'cancelled' } });
            const bookedSlots = booked.map(b => b.slot);

            // Filter available slots
            const freeSlots = doc.availableSlots.filter(s => !bookedSlots.includes(s));
            return { doctorName: doc.name, date, availableSlots: freeSlots };
          },
          book_appointment: async ({ patientName, patientPhone, doctorId, date, slot }) => {
            // Find or create patient
            let patient = await dbService.patients.findOne({ phone: patientPhone });
            if (!patient) {
              patient = await dbService.patients.create({ name: patientName, phone: patientPhone, preferredLanguage: session.language });
            }

            // Check if slot is already taken
            const conflict = await dbService.appointments.find({ doctorId, date, slot, status: { $ne: 'cancelled' } });
            if (conflict.length > 0) {
              return { error: 'Slot conflict', message: 'This slot is already booked. Please choose another one.' };
            }

            // Book appointment
            const app = await dbService.appointments.create({
              patientId: patient._id,
              doctorId,
              date,
              slot,
              status: 'booked'
            });

            return { success: true, appointmentId: app._id, message: 'Appointment successfully booked!' };
          },
          reschedule_appointment: async ({ appointmentId, newDate, newSlot }) => {
            const app = await dbService.appointments.findById(appointmentId);
            if (!app) return { error: 'Appointment not found' };

            // Check conflict for new time slot
            const conflict = await dbService.appointments.find({
              doctorId: app.doctorId?._id || app.doctorId,
              date: newDate,
              slot: newSlot,
              status: { $ne: 'cancelled' }
            });
            if (conflict.length > 0) {
              return { error: 'Slot conflict', message: 'New slot is unavailable. Please select another.' };
            }

            const updated = await dbService.appointments.findByIdAndUpdate(appointmentId, {
              date: newDate,
              slot: newSlot,
              status: 'rescheduled'
            });

            return { success: true, appointmentId: updated._id, message: 'Appointment rescheduled successfully!' };
          },
          cancel_appointment: async ({ appointmentId }) => {
            const app = await dbService.appointments.findById(appointmentId);
            if (!app) return { error: 'Appointment not found' };

            await dbService.appointments.findByIdAndUpdate(appointmentId, { status: 'cancelled' });
            return { success: true, message: 'Appointment cancelled successfully' };
          }
        };

        const toolDeclaration = [
          {
            functionDeclarations: [
              {
                name: 'list_doctors',
                description: 'Lists all available doctors and their specialties.'
              },
              {
                name: 'check_availability',
                description: 'Checks a specific doctor availability slots for a given date.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    doctorId: { type: 'STRING', description: 'The unique Doctor ID' },
                    date: { type: 'STRING', description: 'Date in YYYY-MM-DD format' }
                  },
                  required: ['doctorId', 'date']
                }
              },
              {
                name: 'book_appointment',
                description: 'Books an appointment for a patient with a doctor.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    patientName: { type: 'STRING', description: 'Full name of the patient' },
                    patientPhone: { type: 'STRING', description: 'Patient phone number' },
                    doctorId: { type: 'STRING', description: 'ID of the doctor' },
                    date: { type: 'STRING', description: 'Date in YYYY-MM-DD' },
                    slot: { type: 'STRING', description: 'Available slot e.g., "10:00 AM"' }
                  },
                  required: ['patientName', 'patientPhone', 'doctorId', 'date', 'slot']
                }
              },
              {
                name: 'reschedule_appointment',
                description: 'Reschedules an existing appointment to a new date and time slot.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    appointmentId: { type: 'STRING', description: 'The ID of the existing booking' },
                    newDate: { type: 'STRING', description: 'New date YYYY-MM-DD' },
                    newSlot: { type: 'STRING', description: 'New slot time e.g. "11:00 AM"' }
                  },
                  required: ['appointmentId', 'newDate', 'newSlot']
                }
              },
              {
                name: 'cancel_appointment',
                description: 'Cancels an existing clinical appointment.',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    appointmentId: { type: 'STRING', description: 'ID of the booking to cancel' }
                  },
                  required: ['appointmentId']
                }
              }
            ]
          }
        ];

        // Generate content call
        const response = await model.generateContent({
          contents,
          tools: toolDeclaration
        });

        // Check for function calls
        const functionCalls = response.response.functionCalls;
        if (functionCalls && functionCalls.length > 0) {
          const call = functionCalls[0];
          const toolStart = Date.now();
          console.log(`🛠️ LLM Tool Invoked: ${call.name} with args:`, call.args);

          let toolResult = {};
          if (functions[call.name]) {
            try {
              toolResult = await functions[call.name](call.args);
            } catch (err) {
              toolResult = { error: err.message };
            }
          }
          toolExecutionLatency = Date.now() - toolStart;

          // Send tool results back to Gemini for final phrasing
          const nextContents = [
            ...contents,
            response.response.candidates[0].content,
            {
              role: 'user',
              parts: [{
                functionResponse: {
                  name: call.name,
                  response: toolResult
                }
              }]
            }
          ];

          const secondResponse = await model.generateContent({
            contents: nextContents,
            tools: toolDeclaration
          });

          responseText = secondResponse.response.text();
        } else {
          responseText = response.response.text();
        }

      } catch (err) {
        console.error('❌ Gemini API Error:', err.message);
        responseText = this._generateMockResponse(text, session);
      }
    } else {
      // Mock Agent Engine fallback for testing without API keys
      responseText = this._generateMockResponse(text, session);
    }

    // Add model response to history
    session.history.push({ role: 'model', content: responseText });

    const totalLatency = Date.now() - startTime;
    const llmLatency = totalLatency - toolExecutionLatency;

    return {
      text: responseText,
      language: session.language,
      timestamp: new Date().toISOString(),
      latency: {
        total: totalLatency,
        breakdown: {
          llm: llmLatency,
          tool: toolExecutionLatency
        }
      }
    };
  }

  /**
   * Rule-based Mock Agent Engine (Zero-dependency backup for perfect developer testing experience)
   */
  _generateMockResponse(text, session) {
    const clean = text.toLowerCase();
    const isHindi = session.language === 'hi';
    const isTamil = session.language === 'ta';

    if (clean.includes('hello') || clean.includes('hi') || clean.includes('नमस्ते') || clean.includes('வணக்கம்')) {
      if (isHindi) return 'नमस्ते! वॉइसएआई क्लिनिक में आपका स्वागत है। मैं आपकी अपॉइंटमेंट बुक करने या प्रबंधित करने में कैसे मदद कर सकती हूँ?';
      if (isTamil) return 'வணக்கம்! வாய்ஸ்ஏஐ கிளினிக்கிற்கு உங்களை வரவேற்கிறோம். உங்களுக்கு அப்பாயிண்ட்மெண்ட் பதிவு செய்ய நான் எவ்வாறு உதவ முடியும்?';
      return 'Hello! Welcome to VoiceAI Clinic. How can I help you book, reschedule, or manage your clinical appointments today?';
    }

    if (clean.includes('book') || clean.includes('अपॉइंटमेंट') || clean.includes('பதிவு')) {
      if (isHindi) return 'जी, मैं अपॉइंटमेंट बुक कर सकती हूँ। क्या आप मुझे अपना नाम, मोबाइल नंबर और किस डॉक्टर (जैसे कार्डियोलॉजिस्ट) से मिलना चाहते हैं, बता सकते हैं?';
      if (isTamil) return 'நிச்சயமாக, நான் அப்பாயிண்ட்மெண்ட் பதிவு செய்ய முடியும். உங்கள் பெயர், மொபைல் எண் மற்றும் எந்த வகையான மருத்துவரை சந்திக்க வேண்டும் என்று கூற முடியுமா?';
      return 'Sure, I can assist with that. Could you please provide your name, phone number, and the specialist you would like to book an appointment with?';
    }

    if (clean.includes('doctor') || clean.includes('डॉक्टर') || clean.includes('மருத்துவர்')) {
      if (isHindi) return 'हमारे पास डॉ. रमेश (कार्डियोलॉजिस्ट) और डॉ. प्रिया (डर्मेटोलॉजिस्ट) उपलब्ध हैं। आप किससे मिलना चाहेंगे?';
      if (isTamil) return 'எங்களிடம் டாக்டர் ரமேஷ் (இதய நிபுணர்) மற்றும் டாக்டர் பிரியா (சரும நிபுணர்) உள்ளனர். நீங்கள் யாரை சந்திக்க விரும்புகிறீர்கள்?';
      return 'We have Dr. Ramesh Sharma (Cardiologist) and Dr. Priya Patel (Dermatologist) available. Which one would you prefer?';
    }

    if (clean.includes('cancel') || clean.includes('रद्द') || clean.includes('ரத்து')) {
      if (isHindi) return 'अपॉइंटमेंट रद्द करने के लिए, कृपया अपनी अपॉइंटमेंट आईडी बताएं।';
      if (isTamil) return 'அப்பாயிண்ட்மெண்டை ரத்து செய்ய, தயவுசெய்து உங்கள் அப்பாயிண்ட்மெண்ட் ஐடியை கூறவும்.';
      return 'To cancel your appointment, could you please provide your Booking ID?';
    }

    // Default friendly assistant fallback
    if (isHindi) return `मैंने आपकी बात समझी: "${text}"। क्या आप अपॉइंटमेंट बुक करना चाहते हैं या डॉक्टर की उपलब्धता देखना चाहते हैं?`;
    if (isTamil) return `உங்கள் கோரிக்கையை நான் புரிந்து கொண்டேன்: "${text}". நீங்கள் அப்பாயிண்ட்மெண்ட் பதிவு செய்ய விரும்புகிறீர்களா அல்லது மருத்துவரை பார்க்க வேண்டுமா?`;
    return `I understood your request: "${text}". Would you like to view our doctors list or schedule an appointment?`;
  }
}

const geminiService = new GeminiService();

module.exports = geminiService;
