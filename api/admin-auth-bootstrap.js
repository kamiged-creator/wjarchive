const crypto = require('crypto');

const ADMIN_EMAIL = 'bokjakso.shop@gmail.com';

function send(res, status, body) {
  res.status(status).json(body);
}

function envConfig() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://vefeplfczeztbplowjmj.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const legacyPassword = String(process.env.CROP_ACCESS_PASSWORD || '').normalize('NFC').trim();
  return { supabaseUrl, serviceKey, legacyPassword };
}

async function supabaseAdminRequest(url, serviceKey, path, options = {}) {
  const response = await fetch(`${url}/auth/v1/admin/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.msg || data?.message || data?.error_description || 'Supabase admin request failed.');
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    send(res, 405, { message: 'Method not allowed.' });
    return;
  }

  const { supabaseUrl, serviceKey, legacyPassword } = envConfig();
  if (!serviceKey || !legacyPassword) {
    send(res, 503, { message: '관리자 인증 서버 설정을 확인해 주세요.', code: 'auth_not_configured' });
    return;
  }

  try {
    const page = await supabaseAdminRequest(supabaseUrl, serviceKey, 'users?page=1&per_page=100');
    const users = Array.isArray(page?.users) ? page.users : [];
    const existing = users.find(user => String(user?.email || '').toLowerCase() === ADMIN_EMAIL);

    if (!existing) {
      await supabaseAdminRequest(supabaseUrl, serviceKey, 'users', {
        method: 'POST',
        body: JSON.stringify({
          email: ADMIN_EMAIL,
          password: legacyPassword,
          email_confirm: true,
          user_metadata: { role: 'site_admin', site: 'bokjakso' }
        })
      });
    }

    send(res, 200, { ok: true, email: ADMIN_EMAIL });
  } catch (error) {
    send(res, error.statusCode || 500, {
      message: error.message || '관리자 계정 준비 중 오류가 발생했습니다.',
      code: 'bootstrap_failed'
    });
  }
};
