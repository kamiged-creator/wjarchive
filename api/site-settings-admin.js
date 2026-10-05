const crypto = require('crypto');
const { supabaseAdminRequest } = require('../lib/supabase-admin');

const ALLOWED_SECTIONS = new Set(['hero', 'about', 'note', 'popup', 'books', 'papers']);
const HOMEPAGE_SECTIONS = new Set(['hero', 'about', 'note']);

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

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = canonicalize(value[key]);
        return result;
      }, {});
  }
  return value;
}

function sameValue(a, b) {
  return JSON.stringify(canonicalize(a || {})) === JSON.stringify(canonicalize(b || {}));
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

    if (body.action === 'restore-latest-homepage-backup') {
      const rows = await db(
        'site_settings?select=key,value&key=in.(hero,about,note,homepage_backups)',
        { method: 'GET' }
      );
      const rowMap = Object.fromEntries((rows || []).map(row => [row.key, valueObject(row.value)]));
      const backupValue = rowMap.homepage_backups || {};
      const items = Array.isArray(backupValue.items) ? backupValue.items : [];
      const target = items[0];

      if (!target) {
        res.status(404).json({ message: '아직 복원할 홈페이지 백업이 없습니다.' });
        return;
      }

      const safety = {
        createdAt: new Date().toISOString(),
        reason: '백업 복원 직전',
        hero: rowMap.hero || {},
        about: rowMap.about || {},
        note: rowMap.note || {}
      };
      const nextItems = [safety, ...items].slice(0, 10);
      const payload = [
        { key: 'homepage_backups', value: { items: nextItems } },
        { key: 'hero', value: target.hero || {} },
        { key: 'about', value: target.about || {} },
        { key: 'note', value: target.note || {} }
      ];

      await db('site_settings?on_conflict=key', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(payload)
      });

      res.status(200).json({
        ok: true,
        restoredAt: target.createdAt || null,
        message: '최근 홈페이지 백업으로 복원했습니다.'
      });
      return;
    }

    const section = String(body.section || '').trim();
    const value = body.value && typeof body.value === 'object' && !Array.isArray(body.value) ? body.value : null;
    const hasBaseValue = Object.prototype.hasOwnProperty.call(body, 'baseValue')
      && body.baseValue
      && typeof body.baseValue === 'object'
      && !Array.isArray(body.baseValue);
    const baseValue = hasBaseValue ? body.baseValue : null;

    if (!ALLOWED_SECTIONS.has(section) || !value) {
      res.status(400).json({ message: '저장할 항목이 올바르지 않습니다.' });
      return;
    }

    const rows = await db(
      'site_settings?select=key,value&key=in.(hero,about,note,popup,books,papers,homepage_backups)',
      { method: 'GET' }
    );

    const rowMap = Object.fromEntries((rows || []).map(row => [row.key, valueObject(row.value)]));
    const labels = { hero: '상단', about: '작가소개', note: '작가노트', popup: '팝업', books: '책소개', papers: '논문' };
    const currentSectionValue = rowMap[section] || {};

    if (!hasBaseValue) {
      res.status(409).json({
        ok: false,
        code: 'STALE_ADMIN_STATE',
        message: '이 관리자 화면은 이전 버전입니다. 새로고침 후 최신 내용을 확인하고 다시 저장해 주세요.'
      });
      return;
    }

    let resolvedValue = value;

    if (!sameValue(currentSectionValue, baseValue)) {
      if (section === 'papers') {
        const currentItems = Array.isArray(currentSectionValue.items) ? currentSectionValue.items : [];
        const baseItems = Array.isArray(baseValue.items) ? baseValue.items : [];
        const requestedItems = Array.isArray(value.items) ? value.items : [];

        const keyOf = item => JSON.stringify(canonicalize(item));
        const currentKeys = currentItems.map(keyOf);
        const baseKeys = baseItems.map(keyOf);
        const requestedKeys = requestedItems.map(keyOf);

        const addedItems = requestedItems.filter(item => !baseKeys.includes(keyOf(item)));
        const removedKeys = baseItems
          .filter(item => !requestedKeys.includes(keyOf(item)))
          .map(keyOf);

        const mergedItems = currentItems
          .filter(item => !removedKeys.includes(keyOf(item)));

        for (const item of addedItems) {
          const itemKey = keyOf(item);
          if (!mergedItems.some(existing => keyOf(existing) === itemKey)) {
            mergedItems.push(item);
          }
        }

        resolvedValue = { ...currentSectionValue, ...value, items: mergedItems };
      } else {
        res.status(409).json({
          ok: false,
          code: 'STALE_ADMIN_STATE',
          message: '다른 기기나 창에서 더 최신 내용이 저장되었습니다. 현재 저장은 취소했습니다. 새로고침 후 최신 내용을 확인해 주세요.'
        });
        return;
      }
    }

    let items = [];
    let payload = [{ key: section, value: resolvedValue }];

    if (HOMEPAGE_SECTIONS.has(section)) {
      const current = {
        createdAt: new Date().toISOString(),
        reason: `${labels[section]} 저장 전`,
        hero: rowMap.hero || {},
        about: rowMap.about || {},
        note: rowMap.note || {}
      };

      const backupValue = rowMap.homepage_backups || {};
      items = Array.isArray(backupValue.items) ? backupValue.items : [];
      if (!items.length || !sameSnapshot(items[0], current)) {
        items = [current, ...items].slice(0, 10);
      }

      payload = [
        { key: 'homepage_backups', value: { items } },
        { key: section, value }
      ];
    }

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
