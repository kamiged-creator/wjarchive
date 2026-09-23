const crypto = require('crypto');

const tokenLifetimeSeconds = 12 * 60 * 60;

function setCors(req, res) {
  const origin = String(req.headers.origin || '');
  const host = String(req.headers.host || '');
  if (origin) {
    try {
      const parsed = new URL(origin);
      if (parsed.host === host) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
      }
    } catch (error) {}
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function signToken(secret, expire, nonce) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${expire}:${nonce}`)
    .digest('hex');
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function normalizePassword(value) {
  return String(value || '').normalize('NFC').trim();
}

module.exports = function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  const password = normalizePassword(process.env.CROP_ACCESS_PASSWORD);
  if (!password) {
    res.status(500).json({ message: 'CROP_ACCESS_PASSWORD is not configured.' });
    return;
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (error) { body = {}; }
  }

  if (!safeEqual(normalizePassword(body.password), password)) {
    res.status(401).json({ message: '비밀번호가 맞지 않습니다.' });
    return;
  }

  const expire = Math.floor(Date.now() / 1000) + tokenLifetimeSeconds;
  const nonce = crypto.randomUUID();
  const signature = signToken(password, expire, nonce);

  res.status(200).json({
    accessToken: `${expire}:${nonce}:${signature}`,
    expiresAt: expire
  });
};
