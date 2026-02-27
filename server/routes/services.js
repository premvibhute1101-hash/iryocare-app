const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function extractBase64Image(imageBase64) {
  const input = String(imageBase64 || '').trim();
  if (!input) return '';
  const idx = input.indexOf('base64,');
  if (idx >= 0) return input.slice(idx + 7);
  return input;
}

function normalizeLanguageCode(input) {
  const value = String(input || 'en').trim().toLowerCase();
  if (!value) return 'en';
  return value;
}

async function getGoogleAccessToken(scopes) {
  const auth = new GoogleAuth({ scopes });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token = typeof tokenResponse === 'string'
    ? tokenResponse
    : (tokenResponse && tokenResponse.token) || '';
  return token;
}

async function callGoogleApi(url, token, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) {
    const message = data && data.error && data.error.message
      ? data.error.message
      : 'Google API request failed.';
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }
  return data;
}

router.post('/ocr/vision', authRequired, async (req, res) => {
  try {
    const imageBase64 = extractBase64Image(req.body.imageBase64);
    const languageHints = Array.isArray(req.body.languageHints)
      ? req.body.languageHints.map(v => String(v)).filter(Boolean)
      : [];

    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required.' });
    }

    const token = await getGoogleAccessToken(['https://www.googleapis.com/auth/cloud-platform']);
    if (!token) {
      return res.status(503).json({ error: 'Google Vision is not configured on server.' });
    }

    const data = await callGoogleApi(
      'https://vision.googleapis.com/v1/images:annotate',
      token,
      {
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: languageHints.length ? { languageHints } : undefined
        }]
      }
    );

    const response = data.responses && data.responses[0] ? data.responses[0] : {};
    const text = response.fullTextAnnotation && response.fullTextAnnotation.text
      ? response.fullTextAnnotation.text
      : '';
    return res.json({ text });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ error: err.message || 'Vision OCR failed.' });
  }
});

router.post('/translate', authRequired, async (req, res) => {
  try {
    const target = normalizeLanguageCode(req.body.target || req.body.targetLanguage || 'en');
    const source = normalizeLanguageCode(req.body.source || req.body.sourceLanguage || '');
    const textsInput = Array.isArray(req.body.texts) ? req.body.texts : null;
    const singleText = String(req.body.text || '').trim();
    const texts = textsInput
      ? textsInput.map(t => String(t || '')).filter(Boolean)
      : (singleText ? [singleText] : []);

    if (!texts.length) {
      return res.status(400).json({ error: 'text or texts is required.' });
    }

    const token = await getGoogleAccessToken(['https://www.googleapis.com/auth/cloud-translation']);
    if (!token) {
      return res.status(503).json({ error: 'Google Translate is not configured on server.' });
    }

    const payload = { q: texts, target, format: 'text' };
    if (source) payload.source = source;

    const data = await callGoogleApi(
      'https://translation.googleapis.com/language/translate/v2',
      token,
      payload
    );
    const translations = (data.data && data.data.translations) || [];
    const translatedTexts = translations.map(t => String(t.translatedText || ''));
    return res.json({
      translatedText: translatedTexts[0] || '',
      translatedTexts
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ error: err.message || 'Translation failed.' });
  }
});

router.post('/tts', authRequired, async (req, res) => {
  try {
    const text = String(req.body.text || '').trim();
    const languageCode = String(req.body.languageCode || 'en-US').trim();
    const speakingRate = Number(req.body.speakingRate || 1);
    if (!text) return res.status(400).json({ error: 'text is required.' });

    const token = await getGoogleAccessToken(['https://www.googleapis.com/auth/cloud-platform']);
    if (!token) {
      return res.status(503).json({ error: 'Google TTS is not configured on server.' });
    }

    const data = await callGoogleApi(
      'https://texttospeech.googleapis.com/v1/text:synthesize',
      token,
      {
        input: { text },
        voice: { languageCode },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: Number.isFinite(speakingRate) ? speakingRate : 1
        }
      }
    );
    return res.json({
      audioContent: data.audioContent || '',
      mimeType: 'audio/mpeg'
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ error: err.message || 'Text-to-speech failed.' });
  }
});

router.post('/stt', authRequired, async (req, res) => {
  try {
    const audioBase64 = String(req.body.audioBase64 || '').trim();
    const languageCode = String(req.body.languageCode || 'en-US').trim();
    const sampleRateHertz = Number(req.body.sampleRateHertz || 16000);
    const encoding = String(req.body.encoding || 'LINEAR16').trim();

    if (!audioBase64) {
      return res.status(400).json({ error: 'audioBase64 is required.' });
    }

    const token = await getGoogleAccessToken(['https://www.googleapis.com/auth/cloud-platform']);
    if (!token) {
      return res.status(503).json({ error: 'Google STT is not configured on server.' });
    }

    const data = await callGoogleApi(
      'https://speech.googleapis.com/v1/speech:recognize',
      token,
      {
        config: {
          encoding,
          sampleRateHertz: Number.isFinite(sampleRateHertz) ? sampleRateHertz : 16000,
          languageCode
        },
        audio: { content: audioBase64 }
      }
    );

    const results = Array.isArray(data.results) ? data.results : [];
    const transcript = results
      .map(r => (r.alternatives && r.alternatives[0] && r.alternatives[0].transcript) || '')
      .filter(Boolean)
      .join(' ')
      .trim();
    return res.json({ transcript, results });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ error: err.message || 'Speech-to-text failed.' });
  }
});

module.exports = router;
