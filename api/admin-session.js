const crypto = require('crypto');

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

function normalize(value) {
  return String(value || '').normalize('NFC').trim();
}

function signToken(secret, expire, nonce) {
  return crypto
    .createHmac('sha256', secret)
    .update(`${expire}:${nonce}`)
    .digest('hex');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  const authHeader = String(req.headers.authorization || '');
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!accessToken) {
    res.status(401).json({ message: '로그인 세션이 없습니다.' });
    return;
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/g, '');
  const publishableKey = String(process.env.SUPABASE_ANON_KEY || '').trim();
  const legacySecret = normalize(process.env.CROP_ACCESS_PASSWORD);

  if (!ADMIN_EMAIL || !supabaseUrl || !publishableKey || !legacySecret) {
    res.status(503).json({ message: '관리자 인증 환경변수를 확인해 주세요.' });
    return;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`
      }
    });
    const user = await response.json().catch(() => ({}));

    if (!response.ok) {
      res.status(401).json({ message: '로그인 세션을 확인할 수 없습니다.' });
      return;
    }

    if (normalize(user.email).toLowerCase() !== ADMIN_EMAIL) {
      res.status(403).json({ message: '관리자 계정이 아닙니다.' });
      return;
    }

    const expire = Math.floor(Date.now() / 1000) + TOKEN_LIFETIME_SECONDS;
    const nonce = crypto.randomUUID();
    const signature = signToken(legacySecret, expire, nonce);

    res.status(200).json({
      accessToken: `${expire}:${nonce}:${signature}`,
      expiresAt: expire
    });
  } catch (error) {
    res.status(500).json({ message: '관리자 세션 발급 중 오류가 발생했습니다.' });
  }
};
