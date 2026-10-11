const crypto = require('crypto');
const { supabaseAdminRequest } = require('../lib/supabase-admin');

function clean(value) {
  return String(value || '').normalize('NFC').trim();
}
function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}
function passwordHash(password, salt) {
  return crypto.scryptSync(String(password || ''), String(salt || ''), 64).toString('hex');
}
function safeEqualHex(a, b) {
  try {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  } catch (_) {
    return false;
  }
}
async function db(path, options = {}) {
  return supabaseAdminRequest(path, options);
}
async function getMember(memberId, sessionToken) {
  const id = clean(memberId);
  const hash = tokenHash(sessionToken);
  if (!id || !sessionToken) return null;
  const rows = await db(`chat_members?id=eq.${encodeURIComponent(id)}&token_hash=eq.${hash}&select=id,room_id,nickname,is_blocked,last_seen_at,last_sent_at`);
  return Array.isArray(rows) ? rows[0] : null;
}
async function touchMember(memberId) {
  await db(`chat_members?id=eq.${encodeURIComponent(memberId)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() })
  });
}
function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, private, max-age=0');
}

module.exports = async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = clean(body.action);

    if (action === 'join') {
      const roomCode = clean(body.roomCode).toUpperCase().replace(/\s+/g, '');
      const password = String(body.password || '');
      const nickname = clean(body.nickname).slice(0, 20);
      if (!roomCode || !password || !nickname) {
        res.status(400).json({ message: '방 코드, 비밀번호, 닉네임을 입력해 주세요.' });
        return;
      }

      const rooms = await db(`chat_rooms?code=eq.${encodeURIComponent(roomCode)}&is_active=eq.true&select=id,title,code,password_salt,password_hash`);
      const room = Array.isArray(rooms) ? rooms[0] : null;
      if (!room) {
        res.status(404).json({ message: '사용할 수 있는 채팅방이 없습니다.' });
        return;
      }
      const candidate = passwordHash(password, room.password_salt);
      if (!safeEqualHex(candidate, room.password_hash)) {
        res.status(401).json({ message: '비밀번호가 맞지 않습니다.' });
        return;
      }

      const sessionToken = crypto.randomBytes(32).toString('hex');
      const members = await db('chat_members?select=id,room_id,nickname', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          room_id: room.id,
          nickname,
          token_hash: tokenHash(sessionToken),
          last_seen_at: new Date().toISOString()
        })
      });
      const member = Array.isArray(members) ? members[0] : null;
      res.status(200).json({
        ok: true,
        room: { id: room.id, title: room.title, code: room.code },
        member: { id: member.id, nickname: member.nickname },
        sessionToken
      });
      return;
    }

    const member = await getMember(body.memberId, body.sessionToken);
    if (!member || member.is_blocked) {
      res.status(401).json({ message: member?.is_blocked ? '채팅방 이용이 제한되었습니다.' : '채팅방에 다시 입장해 주세요.' });
      return;
    }

    if (action === 'list') {
      await touchMember(member.id);
      const after = Math.max(0, Number(body.afterId) || 0);
      const sinceFilter = after > 0 ? `&id=gt.${after}` : '';
      const messages = await db(
        `chat_messages?room_id=eq.${encodeURIComponent(member.room_id)}${sinceFilter}&select=id,member_id,nickname,body,created_at&order=id.asc&limit=100`
      );
      const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const activeMembers = await db(
        `chat_members?room_id=eq.${encodeURIComponent(member.room_id)}&is_blocked=eq.false&last_seen_at=gte.${encodeURIComponent(cutoff)}&select=id`
      );
      res.status(200).json({
        ok: true,
        messages: Array.isArray(messages) ? messages : [],
        activeCount: Array.isArray(activeMembers) ? activeMembers.length : 0
      });
      return;
    }

    if (action === 'send') {
      const message = clean(body.message).slice(0, 1000);
      if (!message) {
        res.status(400).json({ message: '메시지를 입력해 주세요.' });
        return;
      }
      const lastSent = member.last_sent_at ? new Date(member.last_sent_at).getTime() : 0;
      if (lastSent && Date.now() - lastSent < 700) {
        res.status(429).json({ message: '메시지를 너무 빠르게 보내고 있어요.' });
        return;
      }
      const inserted = await db('chat_messages?select=id,member_id,nickname,body,created_at', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          room_id: member.room_id,
          member_id: member.id,
          nickname: member.nickname,
          body: message
        })
      });
      const now = new Date().toISOString();
      await db(`chat_members?id=eq.${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ last_seen_at: now, last_sent_at: now })
      });
      res.status(200).json({ ok: true, message: Array.isArray(inserted) ? inserted[0] : null });
      return;
    }

    if (action === 'leave') {
      await db(`chat_members?id=eq.${encodeURIComponent(member.id)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ message: '지원하지 않는 요청입니다.' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || '채팅 처리 중 오류가 발생했습니다.' });
  }
};
