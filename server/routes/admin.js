const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const AdminUser = require('../models/AdminUser');
const User = require('../models/User');
const Medication = require('../models/Medication');
const Dose = require('../models/Dose');
const { adminRequired } = require('../middleware/adminAuth');

const router = express.Router();

function buildAdminToken(admin) {
  return jwt.sign(
    {
      sub: String(admin._id),
      role: 'admin',
      email: admin.email || '',
      credentialId: admin.credentialId || ''
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function toMonthBounds(year, monthIndex) {
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0));
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    days: new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  };
}

function parseIsoDay(iso) {
  const date = new Date(String(iso || ''));
  if (Number.isNaN(date.getTime())) return null;
  return date.getUTCDate();
}

function statusCodeFromDoses(dayDoses) {
  if (!dayDoses.length) return 0;
  const hasMissed = dayDoses.some(d => d.status === 'missed');
  const hasTaken = dayDoses.some(d => d.status === 'taken');
  const hasPartial = dayDoses.some(d => d.status === 'partial');
  if (hasTaken && !hasMissed && !hasPartial) return 1;
  if (hasMissed && !hasTaken && !hasPartial) return 0;
  return 2;
}

async function buildMonthHistory(userId, year, monthIndex) {
  const { startIso, endIso, days } = toMonthBounds(year, monthIndex);
  const doses = await Dose.find({
    userId,
    scheduled_at: { $gte: startIso, $lt: endIso }
  }).select('scheduled_at status').lean();

  const byDay = new Map();
  for (let day = 1; day <= days; day += 1) byDay.set(day, []);
  doses.forEach(d => {
    const day = parseIsoDay(d.scheduled_at);
    if (!day || !byDay.has(day)) return;
    byDay.get(day).push(d);
  });
  const history = [];
  for (let day = 1; day <= days; day += 1) {
    history.push(statusCodeFromDoses(byDay.get(day) || []));
  }
  return history;
}

async function buildPatientSummary(user, yearForHistory) {
  const [medications, histories] = await Promise.all([
    Medication.find({ userId: user._id }).sort({ createdAt: -1 }).lean(),
    Promise.all([0, 1, 2].map(monthIndex => buildMonthHistory(user._id, yearForHistory, monthIndex)))
  ]);

  return {
    id: String(user._id),
    name: user.name,
    age: user.age || '-',
    bg: user.bloodGroup || '-',
    email: user.email,
    meds: medications.map(m => ({
      n: m.name,
      d: m.dosage || '1 dose',
      f: m.time || m.frequency || 'Daily',
      name: m.name,
      dosage: m.dosage || '1 dose',
      frequency: m.frequency || 'Daily',
      time: m.time || '08:00 AM'
    })),
    histories
  };
}

router.post('/signup', async (req, res) => {
  try {
    const credentialId = String(req.body.credentialId || req.body.email || '').trim().toLowerCase();
    const securityToken = String(req.body.securityToken || req.body.password || '');
    const email = String(req.body.email || '').trim().toLowerCase();
    const signupKey = String(req.body.signupKey || '').trim();
    const requiredKey = String(process.env.ADMIN_SIGNUP_KEY || '').trim();

    if (!credentialId || !securityToken) {
      return res.status(400).json({ error: 'credentialId and securityToken are required.' });
    }
    if (requiredKey && signupKey !== requiredKey) {
      return res.status(403).json({ error: 'Invalid admin signup key.' });
    }

    const exists = await AdminUser.findOne({ credentialId }).lean();
    if (exists) {
      return res.status(409).json({ error: 'Admin credential already exists.' });
    }

    const passwordHash = await bcrypt.hash(securityToken, 10);
    const admin = await AdminUser.create({
      credentialId,
      email,
      passwordHash,
      role: 'admin'
    });
    const token = buildAdminToken(admin);
    return res.status(201).json({
      token,
      admin: { id: String(admin._id), credentialId: admin.credentialId, email: admin.email || '' }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Admin signup failed.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const credentialId = String(req.body.credentialId || req.body.email || '').trim().toLowerCase();
    const securityToken = String(req.body.securityToken || req.body.password || '');

    if (!credentialId || !securityToken) {
      return res.status(400).json({ error: 'credentialId and securityToken are required.' });
    }

    const envCredential = String(process.env.ADMIN_CREDENTIAL_ID || '').trim().toLowerCase();
    const envToken = String(process.env.ADMIN_SECURITY_TOKEN || '').trim();

    let admin = await AdminUser.findOne({ credentialId });
    let authorized = false;

    if (envCredential && envToken && credentialId === envCredential && securityToken === envToken) {
      authorized = true;
      if (!admin) {
        const passwordHash = await bcrypt.hash(securityToken, 10);
        admin = await AdminUser.create({
          credentialId,
          email: credentialId.includes('@') ? credentialId : '',
          passwordHash,
          role: 'admin'
        });
      }
    } else if (admin) {
      authorized = await bcrypt.compare(securityToken, admin.passwordHash);
    }

    if (!authorized || !admin) {
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    const token = buildAdminToken(admin);
    return res.json({
      token,
      admin: { id: String(admin._id), credentialId: admin.credentialId, email: admin.email || '' }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Admin login failed.' });
  }
});

router.get('/patients', adminRequired, async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    const patients = [];
    for (const user of users) {
      // Intentionally serial to keep memory stable on low-tier hosting.
      // eslint-disable-next-line no-await-in-loop
      patients.push(await buildPatientSummary(user, year));
    }
    return res.json({ patients });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load patient registry.' });
  }
});

router.get('/patients/:id/analytics', adminRequired, async (req, res) => {
  try {
    const patientId = String(req.params.id || '').trim();
    const month = Math.max(0, Math.min(11, Number(req.query.month) || 0));
    const year = Number(req.query.year) || new Date().getUTCFullYear();
    const user = await User.findById(patientId).lean();
    if (!user) return res.status(404).json({ error: 'Patient not found.' });

    const [summary, monthHistory, doses] = await Promise.all([
      buildPatientSummary(user, year),
      buildMonthHistory(user._id, year, month),
      (async () => {
        const { startIso, endIso } = toMonthBounds(year, month);
        return Dose.find({
          userId: user._id,
          scheduled_at: { $gte: startIso, $lt: endIso }
        }).sort({ scheduled_at: 1 }).lean();
      })()
    ]);

    const taken = monthHistory.filter(v => v === 1).length;
    const partial = monthHistory.filter(v => v === 2).length;
    const missed = monthHistory.filter(v => v === 0).length;
    const adherence = monthHistory.length ? Math.round((taken / monthHistory.length) * 100) : 0;

    return res.json({
      patient: summary,
      history: monthHistory,
      meds: summary.meds,
      metrics: {
        takenDays: taken,
        partialDays: partial,
        missedDays: missed,
        adherence
      },
      doses: doses.map(d => ({
        id: String(d._id),
        medication_name: d.medication_name,
        dosage: d.dosage,
        scheduled_at: d.scheduled_at,
        taken_at: d.taken_at,
        status: d.status
      }))
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load patient analytics.' });
  }
});

router.get('/notifications', adminRequired, async (req, res) => {
  try {
    const sinceHours = Math.max(1, Math.min(168, Number(req.query.sinceHours) || 24));
    const sinceIso = new Date(Date.now() - (sinceHours * 60 * 60 * 1000)).toISOString();
    const missed = await Dose.find({
      status: 'missed',
      scheduled_at: { $gte: sinceIso }
    }).sort({ scheduled_at: -1 }).limit(100).lean();

    const userIds = [...new Set(missed.map(d => String(d.userId)))];
    const users = await User.find({ _id: { $in: userIds } }).select('_id name email').lean();
    const userMap = new Map(users.map(u => [String(u._id), u]));

    return res.json({
      notifications: missed.map(d => {
        const user = userMap.get(String(d.userId));
        return {
          type: 'missed_dose',
          userId: String(d.userId),
          userName: user ? user.name : 'Unknown',
          userEmail: user ? user.email : '',
          medication: d.medication_name,
          dosage: d.dosage,
          scheduled_at: d.scheduled_at
        };
      })
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

module.exports = router;
