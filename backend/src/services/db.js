const mongoose = require('mongoose');

// Mock memory database fallbacks in case MongoDB Atlas is not connected
const mockDB = {
  doctors: [],
  patients: [],
  appointments: []
};

// Seed initial mock doctors
const INITIAL_DOCTORS = [
  {
    _id: 'doc_cardio_1',
    name: 'Dr. Ramesh Sharma',
    specialty: 'Cardiologist',
    availableSlots: ['09:00 AM', '10:00 AM', '11:00 AM', '02:00 PM', '03:00 PM']
  },
  {
    _id: 'doc_derma_1',
    name: 'Dr. Priya Patel',
    specialty: 'Dermatologist',
    availableSlots: ['10:00 AM', '11:00 AM', '01:00 PM', '04:00 PM']
  },
  {
    _id: 'doc_gp_1',
    name: 'Dr. Ananya Nair',
    specialty: 'General Physician',
    availableSlots: ['09:00 AM', '10:30 AM', '11:30 AM', '03:00 PM', '05:00 PM']
  }
];
mockDB.doctors.push(...INITIAL_DOCTORS);

let isConnected = false;

// -------------------------------------------------------------
// MongoDB Schemas
// -------------------------------------------------------------

const DoctorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  specialty: { type: String, required: true },
  availableSlots: [{ type: String }] // e.g., ["10:00 AM", "11:30 AM"]
});

const PatientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  age: { type: Number },
  preferredLanguage: { type: String, default: 'en' },
  pastAppointments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }]
});

const AppointmentSchema = new mongoose.Schema({
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  date: { type: String, required: true }, // Format: YYYY-MM-DD
  slot: { type: String, required: true }, // e.g., "10:00 AM"
  status: { type: String, enum: ['booked', 'rescheduled', 'cancelled'], default: 'booked' },
  reason: { type: String },
  createdAt: { type: Date, default: Date.now }
});

const Doctor = mongoose.models.Doctor || mongoose.model('Doctor', DoctorSchema);
const Patient = mongoose.models.Patient || mongoose.model('Patient', PatientSchema);
const Appointment = mongoose.models.Appointment || mongoose.model('Appointment', AppointmentSchema);

/**
 * Connects to MongoDB Atlas
 */
async function connectDB() {
  const mongoURI = process.env.MONGODB_URI;
  if (!mongoURI) {
    console.warn('⚠️ MONGODB_URI not set. Running with mock in-memory Database.');
    return false;
  }

  try {
    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 5000
    });
    isConnected = true;
    console.log('💾 Connected to MongoDB Atlas');

    // Seed doctors if DB is empty
    const count = await Doctor.countDocuments();
    if (count === 0) {
      await Doctor.insertMany(INITIAL_DOCTORS.map(({ _id, ...rest }) => rest));
      console.log('🌱 Seeded initial doctors into MongoDB');
    }
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    console.warn('⚠️ Falling back to mock in-memory Database.');
    isConnected = false;
    return false;
  }
}

// -------------------------------------------------------------
// Database Service Interface (Unified Real & Mock DB wrapper)
// -------------------------------------------------------------

const dbService = {
  connect: connectDB,
  isConnected: () => isConnected,

  // Doctor Operations
  doctors: {
    find: async (query = {}) => {
      if (isConnected) return Doctor.find(query);
      return mockDB.doctors.filter(doc => {
        if (query.specialty && doc.specialty.toLowerCase() !== query.specialty.toLowerCase()) return false;
        return true;
      });
    },
    findById: async (id) => {
      if (isConnected) return Doctor.findById(id);
      return mockDB.doctors.find(doc => doc._id === id) || null;
    }
  },

  // Patient Operations
  patients: {
    findOne: async (query) => {
      if (isConnected) return Patient.findOne(query);
      return mockDB.patients.find(p => p.phone === query.phone) || null;
    },
    create: async (data) => {
      if (isConnected) return Patient.create(data);
      const newPatient = { _id: 'pat_' + Date.now(), pastAppointments: [], ...data };
      mockDB.patients.push(newPatient);
      return newPatient;
    },
    findById: async (id) => {
      if (isConnected) return Patient.findById(id);
      return mockDB.patients.find(p => p._id === id) || null;
    }
  },

  // Appointment Operations
  appointments: {
    find: async (query = {}) => {
      if (isConnected) {
        return Appointment.find(query).populate('patientId').populate('doctorId');
      }
      return mockDB.appointments.map(app => ({
        ...app,
        patientId: mockDB.patients.find(p => p._id === app.patientId),
        doctorId: mockDB.doctors.find(d => d._id === app.doctorId)
      })).filter(app => {
        if (query.patientId && app.patientId?._id !== query.patientId) return false;
        if (query.doctorId && app.doctorId?._id !== query.doctorId) return false;
        if (query.date && app.date !== query.date) return false;
        if (query.status && app.status !== query.status) return false;
        return true;
      });
    },
    create: async (data) => {
      if (isConnected) {
        const app = await Appointment.create(data);
        await Patient.findByIdAndUpdate(data.patientId, { $push: { pastAppointments: app._id } });
        return app;
      }
      const newApp = { _id: 'app_' + Date.now(), status: 'booked', createdAt: new Date(), ...data };
      mockDB.appointments.push(newApp);
      const patient = mockDB.patients.find(p => p._id === data.patientId);
      if (patient) {
        patient.pastAppointments.push(newApp._id);
      }
      return newApp;
    },
    findByIdAndUpdate: async (id, update) => {
      if (isConnected) {
        return Appointment.findByIdAndUpdate(id, update, { new: true });
      }
      const app = mockDB.appointments.find(a => a._id === id);
      if (app) {
        Object.assign(app, update);
      }
      return app;
    },
    findById: async (id) => {
      if (isConnected) return Appointment.findById(id).populate('patientId').populate('doctorId');
      const app = mockDB.appointments.find(a => a._id === id);
      if (!app) return null;
      return {
        ...app,
        patientId: mockDB.patients.find(p => p._id === app.patientId),
        doctorId: mockDB.doctors.find(d => d._id === app.doctorId)
      };
    }
  }
};

module.exports = dbService;
