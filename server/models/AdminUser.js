const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema({
  credentialId: { type: String, required: true, unique: true, trim: true, lowercase: true },
  email: { type: String, trim: true, lowercase: true, default: '' },
  passwordHash: { type: String, required: true },
  role: { type: String, default: 'admin' }
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', adminUserSchema);
