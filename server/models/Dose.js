const mongoose = require('mongoose');

const doseSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  medicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Medication', required: true, index: true },
  medication_name: { type: String, default: 'Medication' },
  dosage: { type: String, default: '1 dose' },
  scheduled_at: { type: String, required: true, index: true },
  taken_at: { type: String, default: null },
  status: { type: String, enum: ['upcoming', 'taken', 'missed', 'partial'], default: 'upcoming', index: true }
}, { timestamps: true });

module.exports = mongoose.model('Dose', doseSchema);
