const crypto = require('crypto');

const tokenLifetimeSeconds = 12 * 60 * 60;
const failureWindowMs = 15 * 60 * 1000;
const maxFailures = 5;
const attempts = new Map();
const allowedOrigins = new Set([
  'https://wjarchive.vercel.app',
  'https://ycuve.com',
  'https://www.ycuve.com',
  'https://bokjakso.com',
  'https://www.bokjakso.com'
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
}

function normalizePassword(value) {
  return String(value || '').normalize('NFC').trim();
}

function safeEqual(leftValue, rightValue) {
  const left = Buffer.from(String(leftValue));
  const right = Buffer.from(String(rightValue));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function clientKey(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

function currentAttempt(key) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.startedAt >= failureWindowMs) {
    const fresh = { count: 0, startedAt: now };
    attempts.set(key, fresh);
    return fresh;
  }
  return entry;
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

  const password = normalizePassword(process.env.STORE_ADMIN_PASSWORD || process.env.CROP_ACCESS_PASSWORD);
  if (!password) {
    res.status(500).json({ message: 'STORE_ADMIN_PASSWORD is not configured.' });
    return;
  }

  const key = clientKey(req);
  const attempt = currentAttempt(key);
  if (attempt.count >= maxFailures) {
    const retryAfter = Math.max(1, Math.ceil((failureWindowMs - (Date.now() - attempt.startedAt)) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ message: '로그인 시도가 많습니다. 15분 후 다시 시도해 주세요.' });
    return;
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (error) { body = {}; }
  }

  if (!safeEqual(normalizePassword(body.password), password)) {
    attempt.count += 1;
    res.status(401).json({ message: '비밀번호가 맞지 않습니다.' });
    return;
  }

  attempts.delete(key);
  const expire = Math.floor(Date.now() / 1000) + tokenLifetimeSeconds;
  const nonce = crypto.randomUUID();
  const signature = crypto.createHmac('sha256', password).update(`${expire}:${nonce}`).digest('hex');
  res.status(200).json({ accessToken: `${expire}:${nonce}:${signature}`, expiresAt: expire });
};
