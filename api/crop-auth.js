const crypto = require('crypto');

const tokenLifetimeSeconds = 12 * 60 * 60;

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

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  const password = process.env.CROP_ACCESS_PASSWORD;

  if (!password) {
    res.status(500).json({ message: 'CROP_ACCESS_PASSWORD is not configured.' });
    return;
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (error) {
      body = {};
    }
  }

  if (!safeEqual(body.password || '', password)) {
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
