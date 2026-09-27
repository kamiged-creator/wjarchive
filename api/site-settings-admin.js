const crypto = require('crypto');

const ALLOWED_SECTIONS = new Set(['hero', 'about', 'note']);

function normalize(value) {
  return String(value || '').normalize('NFC').trim();
}

function verifyToken(token, secret) {
  const [expire, nonce, signature] = String(token || '').split(':');
  if (!expire || !nonce || !signature || Number(expire) <= Date.now() / 1000) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${expire}:${nonce}`).digest('hex');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function env() {
  return {
    url: process.env.SUPABASE_URL || 'https://vefeplfczeztbplowjmj.supabase.co',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    adminSecret: normalize(process.env.CROP_ACCESS_PASSWORD)
  };
}

function requireAdmin(req) {
  const { adminSecret } = env();
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!adminSecret || !verifyToken(token, adminSecret)) {
    const error = new Error('관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.');
    error.statusCode = 401;
    throw error;
  }
}

async function db(path, options = {}) {
  const { url, serviceKey } = env();
  if (!serviceKey) {
    const error = new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }

  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || '사이트 문구 저장소를 확인해 주세요.');
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

function valueObject(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

function sameSnapshot(a, b) {
  return JSON.stringify({
    hero: a?.hero || {},
    about: a?.about || {},
    note: a?.note || {}
  }) === JSON.stringify({
    hero: b?.hero || {},
    about: b?.about || {},
    note: b?.note || {}
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'PUT') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  try {
    requireAdmin(req);

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const section = String(body.section || '').trim();
    const value = body.value && typeof body.value === 'object' ? body.value : null;

    if (!ALLOWED_SECTIONS.has(section) || !value) {
      res.status(400).json({ message: '저장할 항목이 올바르지 않습니다.' });
      return;
    }

    const rows = await db(
      'site_settings?select=key,value&key=in.(hero,about,note,homepage_backups)',
      { method: 'GET' }
    );

    const rowMap = Object.fromEntries((rows || []).map(row => [row.key, valueObject(row.value)]));
    const labels = { hero: '상단', about: '작가소개', note: '작가노트' };

    const current = {
      createdAt: new Date().toISOString(),
      reason: `${labels[section]} 저장 전`,
      hero: rowMap.hero || {},
      about: rowMap.about || {},
      note: rowMap.note || {}
    };

    const backupValue = rowMap.homepage_backups || {};
    let items = Array.isArray(backupValue.items) ? backupValue.items : [];
    if (!items.length || !sameSnapshot(items[0], current)) {
      items = [current, ...items].slice(0, 10);
    }

    const payload = [
      { key: 'homepage_backups', value: { items } },
      { key: section, value }
    ];

    await db('site_settings?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload)
    });

    res.status(200).json({
      ok: true,
      section,
      backupCount: items.length,
      message: `${labels[section]} 저장 완료`
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || '사이트 문구 저장 중 오류가 발생했습니다.'
    });
  }
};
