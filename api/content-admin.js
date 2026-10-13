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


function chatPasswordHash(password, salt) {
  return crypto.scryptSync(String(password || ''), String(salt || ''), 64).toString('hex');
}
function chatTokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function deleteImageKitFile(fileId) {
  const id = normalize(fileId);
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(id) || !privateKey) return false;
  try {
    const response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: {
        Authorization: 'Basic ' + Buffer.from(privateKey + ':').toString('base64')
      }
    });
    return response.ok;
  } catch (_) {
    return false;
  }
}
// Never trust image_file_id from a message record when deleting an entire room.
// In particular, historical messages may contain unverified IDs.
async function deleteImageFromVerifiedRoom(fileId, roomId, imageUrl) {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey || !/^[A-Za-z0-9_-]{10,100}$/.test(String(fileId || ''))) return false;
  try {
    const response = await fetch('https://api.imagekit.io/v1/files/' + encodeURIComponent(fileId) + '/details', {
      headers: { Authorization: 'Basic ' + Buffer.from(privateKey + ':').toString('base64') }
    });
    if (!response.ok) return false;
    const file = await response.json();
    const path = String(file.filePath || '');
    const prefix = '/bokjakso-chat/' + roomId + '/';
    const subpath = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    if (!subpath || subpath.startsWith('avatars/') || subpath.includes('/avatars/') ||
        !['image', 'IMAGE'].includes(String(file.fileType || '')) ||
        String(file.url || '') !== String(imageUrl || '')) return false;
    return deleteImageKitFile(fileId);
  } catch (_) {
    return false;
  }
}

async function handleChatAdmin(body, res) {
  const action = normalize(body.action);

  if (action === 'chat-get-sound-config') {
    const settings = await db('site_settings?key=eq.chat_sound_default_volume&select=value&limit=1');
    const saved = Number(Array.isArray(settings) ? settings[0]?.value?.level : 0);
    res.status(200).json({ ok: true, level: [30, 60, 100].includes(saved) ? saved : 100 });
    return;
  }

  if (action === 'chat-set-sound-config') {
    const level = Number(body.level);
    if (![30, 60, 100].includes(level)) {
      res.status(400).json({ message: '알림 음량은 작게, 보통, 크게 중에서 선택해 주세요.' });
      return;
    }
    await db('site_settings?on_conflict=key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        key: 'chat_sound_default_volume',
        value: { level },
        updated_at: new Date().toISOString()
      })
    });
    res.status(200).json({ ok: true, level });
    return;
  }

  if (action === 'chat-list-rooms') {
    const rooms = await db('chat_rooms?select=id,code,title,is_active,is_archived,archived_at,created_at,updated_at,last_activity_at&order=created_at.desc');
    res.status(200).json({ ok: true, rooms: Array.isArray(rooms) ? rooms : [] });
    return;
  }

  if (action === 'chat-create-room') {
    const code = normalize(body.code).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
    const title = normalize(body.title).slice(0, 50);
    const password = String(body.password || '');
    if (code.length < 3 || !title || password.length < 8) {
      res.status(400).json({ message: '방 코드는 3자 이상, 비밀번호는 8자 이상으로 입력해 주세요.' });
      return;
    }
    const existing = await db(`chat_rooms?code=eq.${encodeURIComponent(code)}&select=id,code&limit=1`);
    if (Array.isArray(existing) && existing.length) {
      res.status(409).json({ message: '이미 사용 중인 방 코드입니다. 다른 방 코드를 입력해 주세요.' });
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    const room = await db('chat_rooms?select=id,code,title,is_active,created_at', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        code,
        title,
        password_salt: salt,
        password_hash: chatPasswordHash(password, salt),
        is_active: true
      })
    });
    res.status(200).json({ ok: true, room: Array.isArray(room) ? room[0] : null });
    return;
  }

  if (action === 'chat-rename-room') {
    const roomId = normalize(body.roomId);
    const title = normalize(body.title);
    const expectedTitle = String(body.expectedTitle ?? '');
    if (!roomId || !title || title.length > 50) {
      res.status(400).json({ message: '방 이름은 1~50자로 입력해 주세요.' });
      return;
    }
    const updated = await db(
      `chat_rooms?id=eq.${encodeURIComponent(roomId)}&title=eq.${encodeURIComponent(expectedTitle)}&select=id,code,title`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ title, updated_at: new Date().toISOString() })
      }
    );
    if (!Array.isArray(updated) || !updated.length) {
      res.status(409).json({ message: '다른 관리자에게서 방 이름이 변경되었거나 방이 없습니다. 목록을 새로 불러와 주세요.' });
      return;
    }
    res.status(200).json({ ok: true, room: updated[0] });
    return;
  }

  if (action === 'chat-admin-enter-room') {
    const roomId = normalize(body.roomId);
    if (!roomId) {
      res.status(400).json({ message: '입장할 방 정보가 없습니다.' });
      return;
    }
    const rooms = await db(`chat_rooms?id=eq.${encodeURIComponent(roomId)}&is_active=eq.true&is_archived=eq.false&select=id,code,title&limit=1`);
    const room = Array.isArray(rooms) ? rooms[0] : null;
    if (!room) {
      res.status(404).json({ message: '현재 입장할 수 없는 채팅방입니다.' });
      return;
    }
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const members = await db('chat_members?select=id,room_id,nickname', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        room_id: room.id,
        nickname: '관리자',
        token_hash: chatTokenHash(sessionToken),
        last_seen_at: new Date().toISOString()
      })
    });
    const member = Array.isArray(members) ? members[0] : null;
    res.status(200).json({
      ok: true,
      room,
      member: { id: member.id, nickname: member.nickname },
      sessionToken
    });
    return;
  }

  if (action === 'chat-delete-room') {
    const roomId = normalize(body.roomId);
    if (!roomId) {
      res.status(400).json({ message: '삭제할 방 정보가 없습니다.' });
      return;
    }
    const images = await db(
      `chat_messages?room_id=eq.${encodeURIComponent(roomId)}&message_type=eq.image&image_file_id=not.is.null&select=image_file_id,image_url`
    );
    if (Array.isArray(images) && images.length) {
      await Promise.all(images.map(row => deleteImageFromVerifiedRoom(
        row.image_file_id, roomId, row.image_url
      )));
    }
    await db(`chat_rooms?id=eq.${encodeURIComponent(roomId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'chat-set-archived') {
    const roomId = normalize(body.roomId);
    const isArchived = Boolean(body.isArchived);
    if (!roomId) {
      res.status(400).json({ message: '방 정보가 없습니다.' });
      return;
    }
    await db(`chat_rooms?id=eq.${encodeURIComponent(roomId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        is_archived: isArchived,
        archived_at: isArchived ? new Date().toISOString() : null,
        is_active: !isArchived,
        updated_at: new Date().toISOString()
      })
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'chat-set-active') {
    const roomId = normalize(body.roomId);
    if (!roomId) {
      res.status(400).json({ message: '방 정보가 없습니다.' });
      return;
    }
    await db(`chat_rooms?id=eq.${encodeURIComponent(roomId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ is_active: Boolean(body.isActive), updated_at: new Date().toISOString() })
    });
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'chat-change-password') {
    const roomId = normalize(body.roomId);
    const password = String(body.password || '');
    if (!roomId || password.length < 8) {
      res.status(400).json({ message: '새 비밀번호는 8자 이상으로 입력해 주세요.' });
      return;
    }
    const salt = crypto.randomBytes(16).toString('hex');
    // One DB transaction changes password, invalidates sessions, and removes old push subscriptions.
    const changed = await db('rpc/bokjakso_chat_change_password', {
      method: 'POST',
      body: JSON.stringify({
        p_room_id: roomId,
        p_salt: salt,
        p_hash: chatPasswordHash(password, salt)
      })
    });
    if (changed !== true) {
      res.status(404).json({ message: '비밀번호를 변경할 채팅방이 없습니다.' });
      return;
    }
    res.status(200).json({ ok: true, sessionsRevoked: true, pushResubscribeRequired: true });
    return;
  }

  if (action === 'chat-list-members') {
    const roomId = normalize(body.roomId);
    const members = await db(`chat_members?room_id=eq.${encodeURIComponent(roomId)}&select=id,nickname,is_blocked,joined_at,last_seen_at&order=joined_at.desc&limit=300`);
    res.status(200).json({ ok: true, members: Array.isArray(members) ? members : [] });
    return;
  }

  if (action === 'chat-set-blocked') {
    const memberId = normalize(body.memberId);
    if (!memberId) {
      res.status(400).json({ message: '회원 정보가 없습니다.' });
      return;
    }
    await db(`chat_members?id=eq.${encodeURIComponent(memberId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ is_blocked: Boolean(body.isBlocked) })
    });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ message: '지원하지 않는 채팅 관리자 요청입니다.' });
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

    if (action.startsWith('member-admin-')) return await require('../lib/member-handler')(req, res);
    if (action.startsWith('club-')) return await require('../lib/club-handler')(req, res);
    if (action.startsWith('chat-')) return await handleChatAdmin(body, res);
    if (action === 'replace-lists') return await handleReplaceLists(body, res);
    if (action === 'save-work') return await handleSaveWork(body, res);
    if (action === 'hide-work') return await handleHideWork(body, res);

    res.status(400).json({ message: '지원하지 않는 관리자 저장 작업입니다.' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || '관리자 저장 중 오류가 발생했습니다.' });
  }
};
