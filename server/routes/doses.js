const express = require('express');
const Dose = require('../models/Dose');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/', authRequired, async (req, res) => {
  try {
    const query = { userId: req.user.id };
    if (req.query.startIso || req.query.endIso) {
      query.scheduled_at = {};
      if (req.query.startIso) query.scheduled_at.$gte = req.query.startIso;
      if (req.query.endIso) query.scheduled_at.$lt = req.query.endIso;
    }
    if (req.query.status) {
      query.status = req.query.status;
    }

    const doses = await Dose.find(query).sort({ scheduled_at: 1 });
    return res.json({ doses: doses.map(d => ({
      id: String(d._id),
      medication_id: String(d.medicationId),
      medication_name: d.medication_name,
      dosage: d.dosage,
      scheduled_at: d.scheduled_at,
      taken_at: d.taken_at,
      status: d.status
    })) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load doses.' });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    const dose = await Dose.create({
      userId: req.user.id,
      medicationId: req.body.medication_id,
      medication_name: req.body.medication_name || 'Medication',
      dosage: req.body.dosage || '1 dose',
      scheduled_at: req.body.scheduled_at,
      status: req.body.status || 'upcoming',
      taken_at: req.body.taken_at || null
    });

    return res.status(201).json({
      dose: {
        id: String(dose._id),
        medication_id: String(dose.medicationId),
        medication_name: dose.medication_name,
        dosage: dose.dosage,
        scheduled_at: dose.scheduled_at,
        taken_at: dose.taken_at,
        status: dose.status
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to create dose.' });
  }
});

router.put('/:id', authRequired, async (req, res) => {
  try {
    const dose = await Dose.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      {
        status: req.body.status,
        taken_at: req.body.taken_at === undefined ? null : req.body.taken_at
      },
      { new: true }
    );

    if (!dose) {
      return res.status(404).json({ error: 'Dose not found.' });
    }

    return res.json({
      dose: {
        id: String(dose._id),
        medication_id: String(dose.medicationId),
        medication_name: dose.medication_name,
        dosage: dose.dosage,
        scheduled_at: dose.scheduled_at,
        taken_at: dose.taken_at,
        status: dose.status
      }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update dose.' });
  }
});

module.exports = router;
