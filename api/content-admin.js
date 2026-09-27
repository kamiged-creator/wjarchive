const crypto = require('crypto');
const { supabaseAdminRequest } = require('../lib/supabase-admin');

const LIST_TABLES = {
  contact: 'contact_items',
  exhibition: 'exhibitions',
  news: 'news_items'
};

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
  return supabaseAdminRequest(path, options);
}) {
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
    const error = new Error(data?.message || data?.hint || '관리자 저장소를 확인해 주세요.');
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = canonical(value[key]);
      return out;
    }, {});
  }
  return value;
}

function same(a, b) {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function cleanLines(value) {
  return Array.isArray(value)
    ? value.map(item => normalize(item)).filter(Boolean)
    : [];
}

function normalizeWorkUrl(url) {
  const value = normalize(url);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (/drive\.google\.com$/i.test(parsed.hostname) && parsed.searchParams.get('id')) {
      return `${parsed.origin}${parsed.pathname}?id=${parsed.searchParams.get('id')}`;
    }
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '').toLowerCase();
  } catch (_) {
    return value.replace(/[?&]tr=[^&]+/g, '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

function cleanWork(value = {}) {
  return {
    title: normalize(value.title) || '새 작품',
    category: normalize(value.category) || '기타',
    year_text: normalize(value.year_text),
    medium: normalize(value.medium),
    description: normalize(value.description),
    image_url: normalize(value.image_url),
    large_image_url: normalize(value.large_image_url),
    youtube_url: normalize(value.youtube_url),
    is_visible: value.is_visible !== false
  };
}

function comparableWork(value = {}) {
  const clean = cleanWork(value);
  return {
    title: clean.title,
    category: clean.category,
    year_text: clean.year_text,
    medium: clean.medium,
    description: clean.description,
    image_url: clean.image_url,
    large_image_url: clean.large_image_url,
    youtube_url: clean.youtube_url,
    is_visible: clean.is_visible
  };
}

async function readListSnapshot() {
  const result = {};
  for (const [key, table] of Object.entries(LIST_TABLES)) {
    const rows = await db(`${table}?select=content,sort_order,is_visible&order=sort_order.asc`, { method: 'GET' });
    result[key] = (rows || [])
      .filter(row => row && row.is_visible !== false)
      .map(row => normalize(row.content))
      .filter(Boolean);
  }
  return result;
}

async function replaceListTable(table, lines) {
  await db(`${table}?id=not.is.null`, { method: 'DELETE' });
  if (!lines.length) return;
  const rows = lines.map((content, index) => ({
    content,
    sort_order: (index + 1) * 10,
    is_visible: true
  }));
  await db(table, {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(rows)
  });
}

async function handleReplaceLists(body, res) {
  if (!body.base || typeof body.base !== 'object') {
    res.status(409).json({
      code: 'STALE_ADMIN_STATE',
      message: '이 관리자 화면은 이전 버전입니다. 새로고침 후 최신 내용을 확인하고 다시 저장해 주세요.'
    });
    return;
  }

  const next = {
    contact: cleanLines(body.values?.contact),
    exhibition: cleanLines(body.values?.exhibition),
    news: cleanLines(body.values?.news)
  };
  if (!next.contact.length || !next.exhibition.length || !next.news.length) {
    res.status(400).json({ message: '문의 내용, 전시 이력, 소식란에 각각 한 줄 이상 필요합니다.' });
    return;
  }

  const current = await readListSnapshot();
  const base = {
    contact: cleanLines(body.base.contact),
    exhibition: cleanLines(body.base.exhibition),
    news: cleanLines(body.base.news)
  };
  if (!same(current, base)) {
    res.status(409).json({
      code: 'STALE_ADMIN_STATE',
      message: '다른 기기나 창에서 문구가 먼저 변경되었습니다. 현재 저장은 취소했습니다. 새로고침 후 최신 내용을 확인해 주세요.'
    });
    return;
  }

  for (const [key, table] of Object.entries(LIST_TABLES)) {
    await replaceListTable(table, next[key]);
  }
  res.status(200).json({ ok: true, values: next, message: '사이트 문구 저장 완료' });
}

async function getWorkById(id) {
  const rows = await db(`works?select=id,title,category,year_text,medium,description,image_url,large_image_url,youtube_url,is_visible,sort_order&id=eq.${encodeURIComponent(id)}&limit=1`, { method: 'GET' });
  return rows?.[0] || null;
}

async function handleSaveWork(body, res) {
  const value = cleanWork(body.value || {});
  const id = normalize(body.id);

  if (id) {
    if (!body.baseValue || typeof body.baseValue !== 'object') {
      res.status(409).json({ code: 'STALE_ADMIN_STATE', message: '이 작품 편집 화면이 오래되었습니다. 새로고침 후 다시 수정해 주세요.' });
      return;
    }
    const current = await getWorkById(id);
    if (!current) {
      res.status(404).json({ message: '수정할 작품을 찾지 못했습니다.' });
      return;
    }
    if (!same(comparableWork(current), comparableWork(body.baseValue))) {
      res.status(409).json({
        code: 'STALE_ADMIN_STATE',
        message: '다른 기기나 창에서 이 작품이 먼저 변경되었습니다. 현재 저장은 취소했습니다. 새로고침 후 다시 수정해 주세요.'
      });
      return;
    }
    const rows = await db(`works?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(value)
    });
    res.status(200).json({ ok: true, dbId: rows?.[0]?.id || id, message: `${value.title} 작품이 수정 저장되었습니다.` });
    return;
  }

  const all = await db('works?select=id,image_url,large_image_url,is_visible', { method: 'GET' });
  const targets = [normalizeWorkUrl(value.image_url), normalizeWorkUrl(value.large_image_url)].filter(Boolean);
  const duplicate = (all || []).find(row => {
    const urls = [normalizeWorkUrl(row.image_url), normalizeWorkUrl(row.large_image_url)].filter(Boolean);
    return urls.some(url => targets.includes(url));
  });
  if (duplicate) {
    res.status(200).json({ ok: true, skipped: true, dbId: duplicate.id, message: `${value.title} 이미지는 이미 등록되어 있어 새로 추가하지 않았습니다.` });
    return;
  }

  const top = await db('works?select=sort_order&order=sort_order.desc&limit=1', { method: 'GET' });
  const payload = { ...value, sort_order: Number(top?.[0]?.sort_order || 0) + 10 };
  const rows = await db('works', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload)
  });
  res.status(200).json({ ok: true, dbId: rows?.[0]?.id || '', message: `${value.title} 작품이 새로 등록되었습니다.` });
}

async function handleHideWork(body, res) {
  const id = normalize(body.id);
  if (!id || !body.baseValue || typeof body.baseValue !== 'object') {
    res.status(400).json({ message: '삭제할 작품 정보가 올바르지 않습니다.' });
    return;
  }
  const current = await getWorkById(id);
  if (!current) {
    res.status(404).json({ message: '삭제할 작품을 찾지 못했습니다.' });
    return;
  }
  if (!same(comparableWork(current), comparableWork(body.baseValue))) {
    res.status(409).json({
      code: 'STALE_ADMIN_STATE',
      message: '다른 기기나 창에서 이 작품이 먼저 변경되었습니다. 삭제를 취소했습니다. 새로고침 후 다시 확인해 주세요.'
    });
    return;
  }
  await db(`works?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ is_visible: false })
  });
  res.status(200).json({ ok: true, message: '작품을 숨김 처리했습니다.' });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  try {
    requireAdmin(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = normalize(body.action);

    if (action === 'replace-lists') return await handleReplaceLists(body, res);
    if (action === 'save-work') return await handleSaveWork(body, res);
    if (action === 'hide-work') return await handleHideWork(body, res);

    res.status(400).json({ message: '지원하지 않는 관리자 저장 작업입니다.' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || '관리자 저장 중 오류가 발생했습니다.' });
  }
};
