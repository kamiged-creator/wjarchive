const crypto = require('crypto');

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizePassword(value) {
  return String(value || '').normalize('NFC').trim();
}

function verifyAccessToken(token, secret) {
  const parts = String(token || '').split(':');
  if (parts.length !== 3) return false;

  const [expire, nonce, signature] = parts;
  if (Number(expire) <= Math.floor(Date.now() / 1000)) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${expire}:${nonce}`)
    .digest('hex');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

module.exports = function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const accessPasswords = [
    normalizePassword(process.env.CROP_ACCESS_PASSWORD),
    normalizePassword(process.env.STORE_ADMIN_PASSWORD)
  ].filter(Boolean);

  if (!privateKey) {
    res.status(500).json({ message: 'IMAGEKIT_PRIVATE_KEY is not configured.' });
    return;
  }
  if (!accessPasswords.length) {
    res.status(500).json({ message: '관리자 비밀번호가 설정되지 않았습니다.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!accessPasswords.some(secret => verifyAccessToken(accessToken, secret))) {
    res.status(401).json({ message: '관리자 로그인이 필요합니다.' });
    return;
  }

  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + 10 * 60;
  const signature = crypto
    .createHmac('sha1', privateKey)
    .update(token + expire)
    .digest('hex');

  res.status(200).json({ token, expire, signature });
};
