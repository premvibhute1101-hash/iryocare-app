const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const router = express.Router();
const googleClient = new OAuth2Client();

function buildToken(user) {
  return jwt.sign(
    { sub: String(user._id), email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/signup', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const exists = await User.findOne({ email }).lean();
    if (exists) {
      return res.status(409).json({ error: 'Email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });
    const token = buildToken(user);

    return res.status(201).json({
      token,
      user: { id: String(user._id), name: user.name, email: user.email }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Signup failed.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = buildToken(user);
    return res.json({
      token,
      user: { id: String(user._id), name: user.name, email: user.email }
    });
  } catch (err) {
    return res.status(500).json({ error: 'Login failed.' });
  }
});

router.post('/google', async (req, res) => {
  try {
    const idToken = String(req.body.idToken || '').trim();
    const audience = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    if (!idToken) {
      return res.status(400).json({ error: 'Google token is required.' });
    }
    if (!audience) {
      return res.status(500).json({ error: 'Google auth is not configured on server.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience
    });
    const payload = ticket.getPayload();
    const email = String((payload && payload.email) || '').trim().toLowerCase();
    const name =
      String((payload && (payload.name || payload.given_name)) || '').trim() || 'Google User';
    if (!email) {
      return res.status(400).json({ error: 'Google account email not available.' });
    }

    let user = await User.findOne({ email });
    if (!user) {
      const passwordHash = await bcrypt.hash(`google_${Date.now()}_${Math.random()}`, 10);
      user = await User.create({ name, email, passwordHash });
    }

    const token = buildToken(user);
    return res.json({
      token,
      user: { id: String(user._id), name: user.name, email: user.email }
    });
  } catch (err) {
    return res.status(401).json({ error: 'Google authentication failed.' });
  }
});

router.get('/me', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('_id name email');
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }
    return res.json({ user: { id: String(user._id), name: user.name, email: user.email } });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

module.exports = router;
