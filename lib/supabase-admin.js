const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vefeplfczeztbplowjmj.supabase.co';
const PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_mYAEJ3rvEscEgM3esQi_7Q_1Nv_fRLC';
const ADMIN_EMAIL = 'bokjakso.shop@gmail.com';
const PROTECTED_HEADER_NAME = 'x-bokjakso-admin-write';
const PROTECTED_HEADER_VALUE = 'protected-api-v2';

let cachedAccessToken = '';
let cachedExpiresAt = 0;

function normalize(value) {
  return String(value || '').normalize('NFC').trim();
}

async function getDatabaseAuthHeaders() {
  const serviceKey = normalize(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (serviceKey) {
    return {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      [PROTECTED_HEADER_NAME]: PROTECTED_HEADER_VALUE
    };
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedExpiresAt > now + 60) {
    return {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${cachedAccessToken}`,
      [PROTECTED_HEADER_NAME]: PROTECTED_HEADER_VALUE
    };
  }

  const adminPassword = normalize(process.env.CROP_ACCESS_PASSWORD);
  if (!adminPassword) {
    const error = new Error('관리자 DB 인증 설정을 확인해 주세요.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${PUBLISHABLE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: adminPassword
    })
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.access_token) {
    const error = new Error('Supabase 관리자 DB 인증에 실패했습니다. 관리자 비밀번호 설정을 확인해 주세요.');
    error.statusCode = response.status === 400 ? 503 : response.status;
    throw error;
  }

  cachedAccessToken = data.access_token;
  cachedExpiresAt = Number(data.expires_at || 0) || (now + Number(data.expires_in || 3600));

  return {
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${cachedAccessToken}`,
    [PROTECTED_HEADER_NAME]: PROTECTED_HEADER_VALUE
  };
}

async function supabaseAdminRequest(path, options = {}) {
  const authHeaders = await getDatabaseAuthHeaders();
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || 'Supabase 관리자 저장소를 확인해 주세요.');
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

module.exports = {
  SUPABASE_URL,
  PUBLISHABLE_KEY,
  PROTECTED_HEADER_NAME,
  PROTECTED_HEADER_VALUE,
  supabaseAdminRequest
};
