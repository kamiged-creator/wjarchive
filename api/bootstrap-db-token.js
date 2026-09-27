const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vefeplfczeztbplowjmj.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_mYAEJ3rvEscEgM3esQi_7Q_1Nv_fRLC';
const INVOKE = 'nIKrFumLYGvTuSC0rlaLydf_DycM73MP';
const BOOTSTRAP = 'fu9cx96a5qJu9YpZo5ggWxCZ7_Zv0nVQw-pA83JgSNM';

function normalize(value) {
  return String(value || '').normalize('NFC').trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }
  if (String(req.query?.run || '') !== INVOKE) {
    res.status(404).json({ message: 'Not found.' });
    return;
  }

  const password = normalize(process.env.CROP_ACCESS_PASSWORD || process.env.STORE_ADMIN_PASSWORD);
  if (!password) {
    res.status(503).json({ message: '관리자 환경변수가 없습니다.' });
    return;
  }

  const token = crypto.createHash('sha256')
    .update('bokjakso-db-v1:' + password)
    .digest('hex');

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bokjakso_register_admin_api_token`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ p_bootstrap: BOOTSTRAP, p_token: token })
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || data !== true) {
    res.status(500).json({ ok: false, message: 'DB 토큰 등록에 실패했습니다.' });
    return;
  }
  res.status(200).json({ ok: true });
};
