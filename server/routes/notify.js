const express = require('express');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '');
}

router.post('/caregiver-missed', authRequired, async (req, res) => {
  try {
    const apiKey = String(process.env.VONAGE_API_KEY || '').trim();
    const apiSecret = String(process.env.VONAGE_API_SECRET || '').trim();
    const from = String(process.env.VONAGE_FROM || '').trim();
    const toRaw = String(req.body.to || '').trim();
    const message = String(req.body.message || '').trim();
    const to = normalizePhone(toRaw);
    if (!to) {
      return res.status(400).json({ error: 'Caregiver phone number is required.' });
    }
    if (!message) {
      return res.status(400).json({ error: 'SMS message is required.' });
    }

    if (!apiKey || !apiSecret || !from) {
      return res.status(503).json({ error: 'SMS service is not configured on server.' });
    }

    const payload = new URLSearchParams({
      api_key: apiKey,
      api_secret: apiSecret,
      from,
      to,
      text: message
    });

    const response = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString()
    });
    const data = await response.json();
    const first = data && data.messages && data.messages[0] ? data.messages[0] : null;
    if (!response.ok || !first || first.status !== '0') {
      const msg = first && first['error-text'] ? first['error-text'] : 'Vonage SMS failed.';
      return res.status(500).json({ error: msg });
    }

    return res.json({ ok: true, messageId: first['message-id'] || null });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to send caregiver SMS.' });
  }
});

router.post('/caregiver-call', authRequired, async (req, res) => {
  try {
    const sid = String(process.env.EXOTEL_SID || '').trim();
    const apiKey = String(process.env.EXOTEL_API_KEY || '').trim();
    const apiToken = String(process.env.EXOTEL_API_TOKEN || '').trim();
    const callerId = String(process.env.EXOTEL_CALLER_ID || '').trim();
    const region = String(process.env.EXOTEL_REGION || 'api.exotel.com').trim();
    const appId = String(process.env.EXOTEL_APP_ID || '').trim();
    const toRaw = String(req.body.to || '').trim();
    const text = String(req.body.text || '').trim();
    const to = normalizePhone(toRaw);

    if (!to) {
      return res.status(400).json({ error: 'Caregiver phone number is required.' });
    }
    if (!text) {
      return res.status(400).json({ error: 'Call text is required.' });
    }
    if (!sid || !apiKey || !apiToken || !callerId || !appId) {
      return res.status(503).json({ error: 'Exotel call service is not configured on server.' });
    }

    const endpoint = `https://${region}/v1/Accounts/${sid}/Calls/connect.json`;
    const basic = Buffer.from(`${apiKey}:${apiToken}`).toString('base64');
    const flowUrl = `https://my.exotel.com/${sid}/exoml/start_voice/${appId}`;
    const payload = new URLSearchParams({
      // For automated reminder call, call caregiver first and connect to Exotel flow/app.
      From: to,
      CallerId: callerId,
      Url: flowUrl,
      TimeLimit: '45',
      TimeOut: '30',
      CallType: 'trans'
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString()
    });

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (e) {
      data = { raw };
    }
    if (!response.ok) {
      const msg = (data && (data.exception || data.message || data.error)) || 'Exotel call failed.';
      return res.status(500).json({ error: msg });
    }

    const callSid =
      data && data.Call && data.Call.Sid ? data.Call.Sid :
      data && data.sid ? data.sid : null;
    return res.json({ ok: true, callSid });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to place caregiver call.' });
  }
});

module.exports = router;
