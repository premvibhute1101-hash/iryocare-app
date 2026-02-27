const mongoose = require('mongoose');

const medicationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },
  dosage: { type: String, default: '1 dose' },
  frequency: { type: String, default: 'Daily' },
  time: { type: String, default: '08:00 AM' },
  start_date: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Medication', medicationSchema);
