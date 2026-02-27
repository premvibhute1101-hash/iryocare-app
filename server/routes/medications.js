const express = require('express');
const Medication = require('../models/Medication');
const Dose = require('../models/Dose');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  try {
    const meds = await Medication.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.json({ medications: meds.map(m => ({
      id: String(m._id),
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      time: m.time,
      start_date: m.start_date,
      created_at: m.createdAt
    })) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load medications.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'Medication name is required.' });
    }

    const medication = await Medication.create({
      userId: req.user.id,
      name,
      dosage: req.body.dosage || '1 dose',
      frequency: req.body.frequency || 'Daily',
      time: req.body.time || '08:00 AM',
      start_date: req.body.start_date || ''
    });

    return res.status(201).json({
      medication: {
        id: String(medication._id),
        name: medication.name,
        dosage: medication.dosage,
        frequency: medication.frequency,
        time: medication.time,
        start_date: medication.start_date,
        created_at: medication.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create medication.' });
  }
});

router.put('/:id', authRequired, async (req, res) => {
  try {
    const medication = await Medication.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      {
        name: req.body.name,
        dosage: req.body.dosage || '1 dose',
        frequency: req.body.frequency || 'Daily',
        time: req.body.time || '08:00 AM',
        start_date: req.body.start_date || ''
      },
      { new: true }
    );

    if (!medication) {
      return res.status(404).json({ error: 'Medication not found.' });
    }

    await Dose.updateMany(
      { medicationId: medication._id, userId: req.user.id },
      { medication_name: medication.name, dosage: medication.dosage }
    );

    return res.json({
      medication: {
        id: String(medication._id),
        name: medication.name,
        dosage: medication.dosage,
        frequency: medication.frequency,
        time: medication.time,
        start_date: medication.start_date,
        created_at: medication.createdAt
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update medication.' });
  }
});

router.delete('/:id', authRequired, async (req, res) => {
  try {
    const medication = await Medication.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!medication) {
      return res.status(404).json({ error: 'Medication not found.' });
    }

    await Dose.deleteMany({ medicationId: medication._id, userId: req.user.id });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete medication.' });
  }
});

module.exports = router;
