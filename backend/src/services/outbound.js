const dbService = require('./db');
const { getIO } = require('../socket');

/**
 * OutboundCampaignService — Manages proactive patient reaching and reminders
 * 
 * Simulates an outbound calling system.
 * When a campaign is triggered, it selects target patients (e.g. needing tomorrow's appointment confirmation),
 * and triggers an outbound call notification to connected clients to simulate the call.
 */
class OutboundCampaignService {
  constructor() {
    this.activeCampaigns = [];
  }

  /**
   * Trigger an outbound appointment reminder campaign
   * @param {string} specialty - Optional specialty to filter doctors
   */
  async triggerReminderCampaign(specialty = 'Cardiologist') {
    console.log(`📞 Triggering Outbound Campaign: ${specialty} appointment reminders...`);

    // Fetch doctors matching specialty
    const doctors = await dbService.doctors.find(specialty ? { specialty } : {});
    const doctorIds = doctors.map(d => d._id);

    // Fetch booked appointments with these doctors
    const appointments = await dbService.appointments.find({
      doctorId: { $in: doctorIds },
      status: 'booked'
    });

    if (appointments.length === 0) {
      console.log('ℹ️ No active appointments found for this campaign.');
      return { success: true, message: 'Campaign executed. No target patients found.', callsTriggered: 0 };
    }

    const io = getIO();
    let callsTriggered = 0;

    // Trigger calls for each target appointment
    for (const app of appointments) {
      const patient = app.patientId;
      const doctor = app.doctorId;

      if (!patient) continue;

      console.log(`📱 Initiating outbound call to ${patient.name} (${patient.phone}) for Dr. ${doctor.name}`);

      // Broadcast an outbound:call event to all connected sockets
      // In a real system, this would trigger a telephony API like Twilio
      if (io) {
        io.emit('outbound:call', {
          patientName: patient.name,
          patientPhone: patient.phone,
          doctorName: doctor.name,
          specialty: doctor.specialty,
          date: app.date,
          slot: app.slot,
          appointmentId: app._id,
          language: patient.preferredLanguage || 'en',
          message: `Hello ${patient.name}, this is a reminder for your appointment with Dr. ${doctor.name} on ${app.date} at ${app.slot}.`
        });
        callsTriggered++;
      }
    }

    return {
      success: true,
      campaignName: `${specialty} Reminders`,
      callsTriggered,
      timestamp: new Date().toISOString()
    };
  }
}

const outboundService = new OutboundCampaignService();

module.exports = outboundService;
