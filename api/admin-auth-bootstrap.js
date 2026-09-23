const ADMIN_EMAIL = 'bokjakso.shop@gmail.com';

function normalize(value) {
  return String(value || '').normalize('NFC').trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://vefeplfczeztbplowjmj.supabase.co';
  const publishableKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_mYAEJ3rvEscEgM3esQi_7Q_1Nv_fRLC';
  const legacyPassword = normalize(process.env.CROP_ACCESS_PASSWORD);

  if (!legacyPassword) {
    res.status(503).json({
      message: '기존 관리자 비밀번호 설정을 확인해 주세요.',
      code: 'legacy_password_not_configured'
    });
    return;
  }

  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: legacyPassword,
        data: { role: 'site_admin', site: 'bokjakso' }
      })
    });

    const data = await response.json().catch(() => ({}));

    // Existing users may be intentionally obscured by Supabase.
    // For password recovery we only need to make sure signup was attempted safely.
    if (!response.ok) {
      const message = String(data?.msg || data?.message || data?.error_description || '');
      const alreadyExists = /already|registered|exists|user.*found/i.test(message);
      if (!alreadyExists) {
        throw new Error(message || '관리자 계정 준비에 실패했습니다.');
      }
    }

    res.status(200).json({ ok: true, email: ADMIN_EMAIL });
  } catch (error) {
    res.status(500).json({
      message: error.message || '관리자 계정 준비 중 오류가 발생했습니다.',
      code: 'bootstrap_failed'
    });
  }
};
