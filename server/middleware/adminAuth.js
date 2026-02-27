const jwt = require('jsonwebtoken');

function adminRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    return res.status(401).json({ error: 'Missing admin token.' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    req.admin = {
      id: payload.sub,
      email: payload.email || '',
      credentialId: payload.credentialId || ''
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired admin token.' });
  }
}

module.exports = { adminRequired };
