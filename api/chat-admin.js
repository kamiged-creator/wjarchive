const crypto = require('crypto');
const { supabaseAdminRequest } = require('../lib/supabase-admin');

function clean(value) {
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
function requireAdmin(req) {
  const secret = clean(process.env.CROP_ACCESS_PASSWORD);
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || !verifyToken(token, secret)) {
    const error = new Error('관리자 로그인이 만료되었습니다. 다시 로그인해 주세요.');
    error.statusCode = 401;
    throw error;
  }
}
function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ''), String(salt || ''), 64).toString('hex');
}
async function db(path, options = {}) {
  return supabaseAdminRequest(path, options);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  try {
    requireAdmin(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = clean(body.action);

    if (action === 'listRooms') {
      const rooms = await db('chat_rooms?select=id,code,title,is_active,created_at,updated_at&order=created_at.desc');
      res.status(200).json({ ok: true, rooms: Array.isArray(rooms) ? rooms : [] });
      return;
    }

    if (action === 'createRoom') {
      const code = clean(body.code).toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24);
      const title = clean(body.title).slice(0, 50);
      const password = String(body.password || '');
      if (code.length < 3 || !title || password.length < 4) {
        res.status(400).json({ message: '방 코드는 3자 이상, 비밀번호는 4자 이상으로 입력해 주세요.' });
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
          password_hash: hashPassword(password, salt),
          is_active: true
        })
      });
      res.status(200).json({ ok: true, room: Array.isArray(room) ? room[0] : null });
      return;
    }

    if (action === 'setActive') {
      const roomId = clean(body.roomId);
      const isActive = Boolean(body.isActive);
      if (!roomId) {
        res.status(400).json({ message: '방 정보가 없습니다.' });
        return;
      }
      await db(`chat_rooms?id=eq.${encodeURIComponent(roomId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ is_active: isActive, updated_at: new Date().toISOString() })
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'changePassword') {
      const roomId = clean(body.roomId);
      const password = String(body.password || '');
      if (!roomId || password.length < 4) {
        res.status(400).json({ message: '새 비밀번호는 4자 이상으로 입력해 주세요.' });
        return;
      }
      const salt = crypto.randomBytes(16).toString('hex');
      await db(`chat_rooms?id=eq.${encodeURIComponent(roomId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          password_salt: salt,
          password_hash: hashPassword(password, salt),
          updated_at: new Date().toISOString()
        })
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (action === 'listMembers') {
      const roomId = clean(body.roomId);
      const members = await db(`chat_members?room_id=eq.${encodeURIComponent(roomId)}&select=id,nickname,is_blocked,joined_at,last_seen_at&order=joined_at.desc&limit=300`);
      res.status(200).json({ ok: true, members: Array.isArray(members) ? members : [] });
      return;
    }

    if (action === 'setBlocked') {
      const memberId = clean(body.memberId);
      await db(`chat_members?id=eq.${encodeURIComponent(memberId)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ is_blocked: Boolean(body.isBlocked) })
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ message: '지원하지 않는 요청입니다.' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || '채팅 관리자 처리 중 오류가 발생했습니다.' });
  }
};
