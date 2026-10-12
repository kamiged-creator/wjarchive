const crypto = require('crypto');
const { supabaseAdminRequest } = require('../lib/supabase-admin');
const { getVapidKeys, validSubscription, sendChatPush } = require('../lib/chat-push');
const allowedOrigins = new Set([
  'https://wjarchive.vercel.app',
  'https://ycuve.com',
  'https://www.ycuve.com',
  'https://bokjakso.com',
  'https://www.bokjakso.com'
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function supabaseRequest(path, options = {}) {
  return supabaseAdminRequest(path, options);
}

function clean(value) {
  return String(value || '').normalize('NFC').trim();
}

function inquiryPayload(body) {
  return {
    name: clean(body.name),
    contact: clean(body.contact),
    product_name: clean(body.product_name),
    quantity: clean(body.quantity),
    message: clean(body.message),
    status: 'new'
  };
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

async function deleteImageKitFile(fileId) {
  const id = clean(fileId);
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!id || !privateKey) return false;
  try {
    const response = await fetch(`https://api.imagekit.io/v1/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: 'Basic ' + Buffer.from(privateKey + ':').toString('base64') }
    });
    return response.ok;
  } catch (_) {
    return false;
  }
}

async function verifiedAvatarFromImageKit(fileId, roomId, profileId = null) {
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  if (!privateKey || !/^[\w-]{10,100}$/.test(fileId)) return null;
  const response = await fetch('https://api.imagekit.io/v1/files/' + encodeURIComponent(fileId) + '/details', {
    headers: { Authorization: 'Basic ' + Buffer.from(privateKey + ':').toString('base64') }
  });
  if (!response.ok) return null;
  const file = await response.json();
  const folder = profileId ? '/bokjakso-chat-profiles/' + profileId + '/' : '/bokjakso-chat/' + roomId + '/avatars/';
  const imageUrl = String(file.url || '');
  if (!String(file.filePath || '').startsWith(folder) ||
      !/^https:\/\//i.test(imageUrl) ||
      !['image','IMAGE'].includes(String(file.fileType || '')) ||
      Number(file.size || 0) > 2 * 1024 * 1024) return null;
  return imageUrl;
}

async function getSharedChatProfile(profileId, profileToken) {
  const id = clean(profileId);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !profileToken || typeof profileToken !== 'string') return null;
  const rows = await supabaseRequest('chat_profiles?id=eq.' + encodeURIComponent(id) +
    '&token_hash=eq.' + tokenHash(profileToken) + '&select=id,nickname,avatar_url,avatar_file_id&limit=1');
  return Array.isArray(rows) ? rows[0] : null;
}

async function getChatMember(memberId, sessionToken) {
  const id = clean(memberId);
  const hash = tokenHash(sessionToken);
  if (!id || !sessionToken) return null;
  const rows = await supabaseRequest(`chat_members?id=eq.${encodeURIComponent(id)}&token_hash=eq.${hash}&select=id,room_id,nickname,is_blocked,last_seen_at,last_sent_at,avatar_url,avatar_file_id,profile_id`);
  return Array.isArray(rows) ? rows[0] : null;
}

async function handleChat(body, res) {
  const action = clean(body.action);

  // A saved profile belongs to this browser's private profile token, not to a room.
  if (action === 'chat-profile-create') {
    const nickname = clean(body.nickname).slice(0,20);
    if (!nickname || nickname === '관리자') {
      res.status(400).json({message:'프로필 닉네임을 입력해 주세요. 관리자 이름은 사용할 수 없습니다.'});return;
    }
    const profileToken = crypto.randomBytes(32).toString('hex');
    const source = await getChatMember(body.sourceMemberId, body.sourceSessionToken);
    const values = {nickname,token_hash:tokenHash(profileToken)};
    if (source && !source.is_blocked) {
      values.avatar_url=source.avatar_url||null;
      values.avatar_file_id=source.avatar_file_id||null;
    }
    const saved = await supabaseRequest('chat_profiles?select=id,nickname,avatar_url', {
      method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(values)
    });
    const profile = saved?.[0];
    if(!profile){res.status(500).json({message:'프로필을 만들지 못했습니다.'});return}
    res.status(200).json({ok:true,profile,profileToken});
    return;
  }

  if (action === 'chat-profile-read' || action === 'chat-profile-save' || action === 'chat-profile-image-auth' || action === 'chat-profile-delete') {
    const profile = await getSharedChatProfile(body.profileId, body.profileToken);
    if (!profile) {res.status(401).json({message:'프로필을 확인할 수 없습니다. 다시 만들어 주세요.'});return}

    if (action === 'chat-profile-read') {
      res.status(200).json({ok:true,profile:{id:profile.id,nickname:profile.nickname,avatar_url:profile.avatar_url||null}});
      return;
    }
    if (action === 'chat-profile-delete') {
      // The shared profile is removed, but individual room memberships,
      // message history and invitation/room credentials must remain untouched.
      // Detach room references before deleting the profile to avoid FK issues.
      await supabaseRequest('chat_members?profile_id=eq.' + encodeURIComponent(profile.id), {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          profile_id: null,
          avatar_url: null,
          avatar_file_id: null
        })
      });
      await supabaseRequest('chat_profiles?id=eq.' + encodeURIComponent(profile.id) +
        '&token_hash=eq.' + tokenHash(body.profileToken), {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      // Removing a photo is independent of preserving the user's chat messages.
      const imageRemoved = profile.avatar_file_id
        ? await deleteImageKitFile(profile.avatar_file_id)
        : true;
      res.status(200).json({ok:true, imageRemoved});
      return;
    }

    if (action === 'chat-profile-image-auth') {
      const privateKey=process.env.IMAGEKIT_PRIVATE_KEY;
      if(!privateKey){res.status(503).json({message:'사진 업로드 설정을 확인해 주세요.'});return}
      const token=crypto.randomUUID(),expire=Math.floor(Date.now()/1000)+600;
      const signature=crypto.createHmac('sha1',privateKey).update(token+expire).digest('hex');
      res.status(200).json({ok:true,token,expire,signature,
        publicKey:'public_JqJ2mArAo76reJ0eTsO5qBRQTk4=',
        uploadEndpoint:'https://upload.imagekit.io/api/v1/files/upload',
        folder:'/bokjakso-chat-profiles/'+profile.id});
      return;
    }

    const changeNickname=Object.prototype.hasOwnProperty.call(body,'nickname');
    const changePhoto=Object.prototype.hasOwnProperty.call(body,'avatarFileId');
    const nextNickname=changeNickname?clean(body.nickname).slice(0,20):profile.nickname;
    if(!nextNickname||nextNickname==='관리자'){
      res.status(400).json({message:'올바른 닉네임을 입력해 주세요.'});return;
    }
    let avatarUrl=profile.avatar_url||null,avatarFileId=profile.avatar_file_id||null;
    if(changePhoto){
      avatarFileId=clean(body.avatarFileId).slice(0,150)||null;
      avatarUrl=avatarFileId?await verifiedAvatarFromImageKit(avatarFileId,null,profile.id):null;
      if(avatarFileId&&!avatarUrl){res.status(400).json({message:'프로필 사진을 확인하지 못했습니다.'});return}
    }
    const modified=await supabaseRequest('chat_profiles?id=eq.'+encodeURIComponent(profile.id)+
      '&select=id,nickname,avatar_url',{
        method:'PATCH',headers:{Prefer:'return=representation'},
        body:JSON.stringify({nickname:nextNickname,avatar_url:avatarUrl,avatar_file_id:avatarFileId,updated_at:new Date().toISOString()})
    });
    // Keep all rooms connected to this profile in sync without changing admin role names.
    await supabaseRequest('chat_members?profile_id=eq.'+encodeURIComponent(profile.id),{
      method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({avatar_url:avatarUrl,avatar_file_id:avatarFileId})
    });
    await supabaseRequest('chat_members?profile_id=eq.'+encodeURIComponent(profile.id)+'&nickname=neq.'+encodeURIComponent('관리자'),{
      method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({nickname:nextNickname})
    });
    if(changePhoto&&profile.avatar_file_id&&profile.avatar_file_id!==avatarFileId) {
      await deleteImageKitFile(profile.avatar_file_id);
    }
    res.status(200).json({ok:true,profile:modified?.[0]||{id:profile.id,nickname:nextNickname,avatar_url:avatarUrl}});
    return;
  }

  if (action === 'chat-sound-config') {
    const settings = await supabaseRequest('site_settings?key=eq.chat_sound_default_volume&select=value&limit=1');
    const saved = Number(Array.isArray(settings) ? settings[0]?.value?.level : 0);
    res.status(200).json({ ok: true, level: [30, 60, 100].includes(saved) ? saved : 100 });
    return;
  }

  if (action === 'chat-push-config') {
    const { publicKey } = await getVapidKeys();
    res.status(200).json({ ok: true, publicKey });
    return;
  }

  if (action === 'chat-public-list-rooms') {
    const rooms = await supabaseRequest('chat_rooms?is_active=eq.true&is_archived=eq.false&select=id,code,title,created_at&order=created_at.desc,id.desc');
    res.status(200).json({ ok: true, rooms: Array.isArray(rooms) ? rooms : [] });
    return;
  }

  // Only return the latest non-deleted message DATE for active public rooms.
  // Limit each request to the five rooms currently visible in the page.
  if (action === 'chat-public-last-activity') {
    const ids = [...new Set((Array.isArray(body.roomIds) ? body.roomIds : [])
      .filter(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 5);
    if (!ids.length) {
      res.status(200).json({ok:true,latest:[]});return;
    }
    const activeRooms = await supabaseRequest(
      'chat_rooms?id=in.(' + ids.map(id => encodeURIComponent(id)).join(',') + ')' +
      '&is_active=eq.true&is_archived=eq.false&select=id'
    );
    const latest = await Promise.all((Array.isArray(activeRooms) ? activeRooms : []).map(async room => {
      const messages = await supabaseRequest(
        'chat_messages?room_id=eq.' + encodeURIComponent(room.id) +
        '&deleted_at=is.null&select=created_at&order=created_at.desc&limit=1'
      );
      return {roomId:room.id,lastMessageAt:Array.isArray(messages) ? (messages[0]?.created_at||null) : null};
    }));
    res.status(200).json({ok:true,latest});
    return;
  }

  if (action === 'chat-join') {
    const roomCode = clean(body.roomCode).toUpperCase().replace(/\s+/g, '');
    const password = String(body.password || '');
    const requestedNickname = clean(body.nickname).slice(0, 20);
    const profile = body.profileId || body.profileToken
      ? await getSharedChatProfile(body.profileId,body.profileToken) : null;
    if ((body.profileId || body.profileToken) && !profile) {
      res.status(401).json({message:'저장된 프로필을 확인할 수 없습니다. 다시 설정해 주세요.'});return;
    }
    const nickname = profile?.nickname || requestedNickname;
    if (!roomCode || !password || !nickname) {
      res.status(400).json({ message: '방 코드, 비밀번호, 닉네임을 입력해 주세요.' });
      return;
    }
    // Keep the dedicated administrator display name distinguishable from visitor accounts.
    if (nickname === '관리자') {
      res.status(400).json({ message: '관리자는 사용할 수 없는 닉네임입니다. 다른 이름을 입력해 주세요.' });
      return;
    }

    const rooms = await supabaseRequest(`chat_rooms?code=eq.${encodeURIComponent(roomCode)}&is_active=eq.true&is_archived=eq.false&select=id,title,code,password_salt,password_hash`);
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
    const members = await supabaseRequest('chat_members?select=id,room_id,nickname,avatar_url,profile_id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        room_id: room.id,
        nickname,
        profile_id:profile?.id||null,
        avatar_url:profile?.avatar_url||null,
        avatar_file_id:profile?.avatar_file_id||null,
        token_hash: tokenHash(sessionToken),
        last_seen_at: new Date().toISOString()
      })
    });
    const member = Array.isArray(members) ? members[0] : null;
    res.status(200).json({
      ok: true,
      room: { id: room.id, title: room.title, code: room.code },
      member: { id: member.id, nickname: member.nickname, avatar_url: member.avatar_url || null },
      sessionToken
    });
    return;
  }

  const member = await getChatMember(body.memberId, body.sessionToken);
  if (!member || member.is_blocked) {
    res.status(401).json({ message: member?.is_blocked ? '채팅방 이용이 제한되었습니다.' : '채팅방에 다시 입장해 주세요.' });
    return;
  }
  const roomStateRows = await supabaseRequest(`chat_rooms?id=eq.${encodeURIComponent(member.room_id)}&select=is_active,is_archived,title,code&limit=1`);
  const roomState = Array.isArray(roomStateRows) ? roomStateRows[0] : null;
  if (!roomState || roomState.is_archived || !roomState.is_active) {
    res.status(403).json({ message: roomState?.is_archived ? '보관된 채팅방입니다.' : '현재 닫혀 있는 채팅방입니다.' });
    return;
  }

  if (action === 'chat-profile-link') {
    const profile = await getSharedChatProfile(body.profileId,body.profileToken);
    if(!profile){res.status(401).json({message:'프로필을 확인할 수 없습니다.'});return}
    const adminMember=member.nickname==='관리자';
    const updated=await supabaseRequest('chat_members?id=eq.'+encodeURIComponent(member.id)+
      '&room_id=eq.'+encodeURIComponent(member.room_id)+'&select=id,nickname,avatar_url,profile_id',{
      method:'PATCH',headers:{Prefer:'return=representation'},
      body:JSON.stringify({profile_id:profile.id,nickname:adminMember?'관리자':profile.nickname,
        avatar_url:profile.avatar_url||null,avatar_file_id:profile.avatar_file_id||null})
    });
    res.status(200).json({ok:true,member:updated?.[0]||null});
    return;
  }

  if (action === 'chat-push-subscribe') {
    const subscription=body.subscription;
    if(!validSubscription(subscription)){
      res.status(400).json({message:'휴대폰 푸시 알림 정보가 올바르지 않습니다.'});
      return;
    }
    const record={
      room_id:member.room_id,
      member_id:member.id,
      endpoint:subscription.endpoint,
      subscription:{
        endpoint:subscription.endpoint,
        expirationTime:subscription.expirationTime??null,
        keys:{p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}
      },
      updated_at:new Date().toISOString()
    };
    await supabaseRequest('chat_push_subscriptions?on_conflict=room_id,endpoint',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify(record)
    });
    res.status(200).json({ok:true});
    return;
  }

  if (action === 'chat-push-status') {
    const endpoint=clean(body.endpoint);
    if(!endpoint || endpoint.length>2048){
      res.status(200).json({ok:true,subscribed:false});
      return;
    }
    const registered=await supabaseRequest(
      'chat_push_subscriptions?room_id=eq.'+encodeURIComponent(member.room_id)+
      '&member_id=eq.'+encodeURIComponent(member.id)+
      '&endpoint=eq.'+encodeURIComponent(endpoint)+'&select=id&limit=1'
    );
    res.status(200).json({ok:true,subscribed:Array.isArray(registered)&&registered.length>0});
    return;
  }

  if (action === 'chat-push-unsubscribe') {
    const endpoint=clean(body.endpoint);
    if(!endpoint||endpoint.length>2048){
      res.status(400).json({message:'해제할 알림 정보를 찾지 못했습니다.'});
      return;
    }
    await supabaseRequest(
      'chat_push_subscriptions?room_id=eq.'+encodeURIComponent(member.room_id)+
      '&member_id=eq.'+encodeURIComponent(member.id)+
      '&endpoint=eq.'+encodeURIComponent(endpoint),{
        method:'DELETE',headers:{Prefer:'return=minimal'}
      }
    );
    res.status(200).json({ok:true});
    return;
  }

  if (action === 'chat-update-profile') {
    const avatarFileId = clean(body.avatarFileId).slice(0, 150);
    // An empty file ID removes the optional photo and restores the default icon.
    let avatarUrl = null;
    if (avatarFileId) {
      avatarUrl = await verifiedAvatarFromImageKit(avatarFileId, member.room_id);
      if (!avatarUrl) {
        res.status(400).json({ message: '프로필 사진을 확인하지 못했습니다. 다시 올려 주세요.' });
        return;
      }
    }
    const updated = await supabaseRequest(
      'chat_members?id=eq.' + encodeURIComponent(member.id) + '&room_id=eq.' + encodeURIComponent(member.room_id) + '&select=id,avatar_url,avatar_file_id',
      { method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ avatar_url: avatarUrl, avatar_file_id: avatarFileId || null }) }
    );
    if (!Array.isArray(updated) || !updated.length) {
      res.status(404).json({ message: '프로필을 저장하지 못했습니다.' });
      return;
    }
    if (member.avatar_file_id && member.avatar_file_id !== avatarFileId) {
      await deleteImageKitFile(member.avatar_file_id);
    }
    res.status(200).json({ ok: true, avatarUrl });
    return;
  }

  if (action === 'chat-image-auth') {
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    if (!privateKey) {
      res.status(503).json({ message: '이미지 업로드 설정을 확인해 주세요.' });
      return;
    }
    const token = crypto.randomUUID();
    const expire = Math.floor(Date.now() / 1000) + 10 * 60;
    const signature = crypto.createHmac('sha1', privateKey).update(token + expire).digest('hex');
    res.status(200).json({
      ok: true,
      token,
      expire,
      signature,
      publicKey: 'public_JqJ2mArAo76reJ0eTsO5qBRQTk4=',
      uploadEndpoint: 'https://upload.imagekit.io/api/v1/files/upload',
      folder: `/bokjakso-chat/${member.room_id}${clean(body.purpose) === 'avatar' ? '/avatars' : ''}`
    });
    return;
  }

  if (action === 'chat-list') {
    const now = new Date().toISOString();
    await supabaseRequest(`chat_members?id=eq.${encodeURIComponent(member.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_seen_at: now })
    });
    const after = Math.max(0, Number(body.afterId) || 0);
    const since = after > 0 ? `&id=gt.${after}` : '';
    // Room entry must show the newest messages, not the oldest 100 in the room.
    // Polling after a known id stays chronological for correct append order.
    const initialHistory = after === 0;
    const messages = await supabaseRequest(
      `chat_messages?room_id=eq.${encodeURIComponent(member.room_id)}&deleted_at=is.null${since}&select=id,member_id,nickname,body,message_type,image_url,image_file_id,created_at,updated_at&order=id.${initialHistory ? 'desc' : 'asc'}&limit=100`
    );
    // Profile changes must reach already-displayed messages even when no new
    // messages arrive. Never trust client member IDs without room scoping.
    const visibleMemberIds = Array.isArray(body.visibleMemberIds)
      ? body.visibleMemberIds.filter(id => typeof id === 'string' &&
          /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100)
      : [];
    const membersToRefresh = [...new Set([
      ...(Array.isArray(messages) ? messages : []).map(m => m.member_id).filter(Boolean),
      ...visibleMemberIds
    ])];
    let profiles = [];
    if (membersToRefresh.length) {
      profiles = await supabaseRequest(
        'chat_members?room_id=eq.' + encodeURIComponent(member.room_id) +
        '&id=in.(' + membersToRefresh.map(id => encodeURIComponent(id)).join(',') + ')' +
        '&select=id,avatar_url,nickname'
      );
    }
    const changedSince = clean(body.changedSince);
    let deletedIds = [];
    if (changedSince) {
      const deleted = await supabaseRequest(
        `chat_messages?room_id=eq.${encodeURIComponent(member.room_id)}&deleted_at=not.is.null&updated_at=gt.${encodeURIComponent(changedSince)}&select=id&order=updated_at.asc&limit=100`
      );
      deletedIds = Array.isArray(deleted) ? deleted.map(row => row.id) : [];
    }
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const active = await supabaseRequest(
      `chat_members?room_id=eq.${encodeURIComponent(member.room_id)}&is_blocked=eq.false&last_seen_at=gte.${encodeURIComponent(cutoff)}&select=id`
    );
    res.status(200).json({
      ok: true,
      messages: Array.isArray(messages) ? (initialHistory ? messages.reverse() : messages) : [],
      deletedIds,
      activeCount: Array.isArray(active) ? active.length : 0,
      roomTitle: roomState.title,
      profiles: Array.isArray(profiles) ? profiles : [],
      myAvatarUrl: member.avatar_url || null,
      syncAt: now
    });
    return;
  }

  if (action === 'chat-send') {
    const messageType = clean(body.messageType) === 'image' ? 'image' : 'text';
    const message = clean(body.message).slice(0, 1000);
    const imageUrl = clean(body.imageUrl).slice(0, 2000);
    const imageFileId = clean(body.imageFileId).slice(0, 300);
    if (messageType === 'text' && !message) {
      res.status(400).json({ message: '메시지를 입력해 주세요.' });
      return;
    }
    if (messageType === 'image' && (!imageUrl || !imageFileId || !/^https:\/\//i.test(imageUrl))) {
      res.status(400).json({ message: '이미지 정보가 올바르지 않습니다.' });
      return;
    }
    const lastSent = member.last_sent_at ? new Date(member.last_sent_at).getTime() : 0;
    if (lastSent && Date.now() - lastSent < 700) {
      res.status(429).json({ message: '메시지를 너무 빠르게 보내고 있어요.' });
      return;
    }
    const inserted = await supabaseRequest('chat_messages?select=id,member_id,nickname,body,message_type,image_url,image_file_id,created_at', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        room_id: member.room_id,
        member_id: member.id,
        nickname: member.nickname,
        body: messageType === 'image' ? (message || '사진') : message,
        message_type: messageType,
        image_url: messageType === 'image' ? imageUrl : null,
        image_file_id: messageType === 'image' ? imageFileId : null
      })
    });
    const now = new Date().toISOString();
    await supabaseRequest(`chat_members?id=eq.${encodeURIComponent(member.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_seen_at: now, last_sent_at: now })
    });
    await sendChatPush({
      roomId:member.room_id,
      roomCode:roomState.code,
      roomTitle:roomState.title,
      senderMemberId:member.id,
      senderNickname:member.nickname
    });
    res.status(200).json({ ok: true, message: Array.isArray(inserted) ? inserted[0] : null });
    return;
  }

  if (action === 'chat-delete-message') {
    const messageId = Number(body.messageId);
    if (!Number.isFinite(messageId) || messageId <= 0) {
      res.status(400).json({ message: '삭제할 메시지 정보가 없습니다.' });
      return;
    }
    const rows = await supabaseRequest(
      `chat_messages?id=eq.${encodeURIComponent(messageId)}&room_id=eq.${encodeURIComponent(member.room_id)}&member_id=eq.${encodeURIComponent(member.id)}&deleted_at=is.null&select=id,message_type,image_file_id&limit=1`
    );
    const target = Array.isArray(rows) ? rows[0] : null;
    if (!target) {
      res.status(404).json({ message: '삭제할 수 있는 내 메시지를 찾지 못했습니다.' });
      return;
    }
    if (target.message_type === 'image' && target.image_file_id) {
      await deleteImageKitFile(target.image_file_id);
    }
    const now = new Date().toISOString();
    await supabaseRequest(`chat_messages?id=eq.${encodeURIComponent(messageId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        deleted_at: now,
        updated_at: now,
        body: '삭제된 메시지입니다.',
        message_type: 'text',
        image_url: null,
        image_file_id: null
      })
    });
    res.status(200).json({ ok: true, messageId });
    return;
  }

  if (action === 'chat-leave') {
    await supabaseRequest(`chat_members?id=eq.${encodeURIComponent(member.id)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' }
    });
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ message: '지원하지 않는 채팅 요청입니다.' });
}

module.exports = async function handler(req, res) {
  setCors(req, res);
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (String(body.action || '').startsWith('chat-')) {
      await handleChat(body, res);
      return;
    }

    const payload = inquiryPayload(body);
    if (!payload.name || !payload.contact || !payload.message) {
      res.status(400).json({ message: '이름, 연락처, 문의 내용을 입력해 주세요.' });
      return;
    }

    await supabaseRequest('store_inquiries', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || '요청 처리 실패' });
  }
};
