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


// One dedicated regular-chat operator: room creation and management only.
// No site content, club administration or irreversible room deletion.
const OPERATOR_SETTING='chat_operator_account_v1';
const OPERATOR_PROFILE_SETTING='chat_operator_profile_v1';
function operatorProfilePublic(profile){
  return {nickname:normalize(profile?.nickname)||'운영진',avatar_url:profile?.avatar_url||null};
}
async function operatorProfileRecord(){
  const rows=await db('site_settings?key=eq.'+OPERATOR_PROFILE_SETTING+'&select=value&limit=1');
  return Array.isArray(rows)&&rows[0]?.value&&typeof rows[0].value==='object'?rows[0].value:{nickname:'운영진',avatar_url:null,avatar_file_id:null,member_ids:[]};
}
async function operatorProfileSave(value){
  await db('site_settings?on_conflict=key',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({key:OPERATOR_PROFILE_SETTING,value,updated_at:new Date().toISOString()})
  });
}
async function operatorPhotoDetails(fileId){
  const privateKey=process.env.IMAGEKIT_PRIVATE_KEY;
  if(!privateKey||!/^[a-zA-Z0-9_-]{10,100}$/.test(String(fileId||'')))return null;
  const response=await fetch('https://api.imagekit.io/v1/files/'+encodeURIComponent(fileId)+'/details',{
    headers:{Authorization:'Basic '+Buffer.from(privateKey+':').toString('base64')}
  });
  if(!response.ok)return null;
  const file=await response.json();
  const url=String(file.url||'');
  if(!String(file.filePath||'').startsWith('/bokjakso-chat-operator/avatars/')||
    !['image','IMAGE'].includes(String(file.fileType||''))||
    Number(file.size||0)>2*1024*1024||!/^https:\/\//i.test(url))return null;
  return {url,fileId};
}
const OPERATOR_ALLOWED=new Map([
  ['operator-list-rooms','chat-list-rooms'],
  ['operator-create-room','chat-create-room'],
  ['operator-admin-enter-room','chat-admin-enter-room'],
  ['operator-set-archived','chat-set-archived'],
  ['operator-rename-room','chat-rename-room'],
  ['operator-set-active','chat-set-active'],
  ['operator-change-password','chat-change-password'],
  ['operator-list-members','chat-list-members']
]);
const operatorError=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
async function operatorSettings(){
  const rows=await db('site_settings?key=eq.'+OPERATOR_SETTING+'&select=value&limit=1');
  return Array.isArray(rows)?rows[0]?.value||null:null;
}
async function operatorSave(value){
  await db('site_settings?on_conflict=key',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({key:OPERATOR_SETTING,value,updated_at:new Date().toISOString()})
  });
}
function operatorSign(expiry,nonce,version){
  const secret=env().adminSecret;
  if(!secret)throw operatorError('운영진 인증 서버 설정이 필요합니다.',503);
  return crypto.createHmac('sha256',secret).update('bokjakso-operator-v1:'+expiry+':'+nonce+':'+version).digest('hex');
}
function secureHexEqual(a,b){
  if(typeof a!=='string'||typeof b!=='string'||!/^([a-f0-9]{64}|[a-f0-9]{128})$/i.test(a)||a.length!==b.length||!/^([a-f0-9]{64}|[a-f0-9]{128})$/i.test(b))return false;
  return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
async function operatorRequire(req){
  const value=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const parts=value.split(':');
  if(parts.length!==5||parts[0]!=='op1'||!/^\d{10}$/.test(parts[1])||
    Number(parts[1])<=Date.now()/1000||Number(parts[1])>Date.now()/1000+30*24*3600+5*60||
    !/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9-]{36}$/.test(parts[3])){
    throw operatorError('운영진 로그인 시간이 만료됐어요. 다시 로그인해 주세요.',401);
  }
  const settings=await operatorSettings();
  if(!settings?.enabled||settings.version!==parts[3]||
     !secureHexEqual(parts[4],operatorSign(parts[1],parts[2],parts[3]))){
    throw operatorError('운영진 로그인을 다시 해 주세요.',401);
  }
}
async function operatorLogin(req,body,res){
  const settings=await operatorSettings();
  if(!settings?.enabled||!settings.salt||!settings.hash||!settings.version){
    throw operatorError('최고관리자가 운영진 계정을 아직 설정하지 않았어요.',503);
  }
  const password=String(body.password||'');
  const secret=env().adminSecret;
  if(!secret)throw operatorError('운영진 인증 서버 설정을 확인해 주세요.',503);
  // Shared database limit keyed to a pseudonymous client address. No IP stored.
  const source=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const key='chat_operator_attempts_'+crypto.createHmac('sha256',secret).update(source).digest('hex').slice(0,24);
  const attempts=await db('site_settings?key=eq.'+key+'&select=value&limit=1');
  const saved=Array.isArray(attempts)?attempts[0]?.value||{}:{};
  const now=Date.now();
  if(Number(saved.until||0)>now)throw operatorError('로그인 시도가 많아요. 15분 후 다시 시도해 주세요.',429);
  const hash=crypto.scryptSync(password.slice(0,256),settings.salt,64).toString('hex');
  if(password.length>256||!secureHexEqual(hash,settings.hash)){
    const validWindow=now-Number(saved.started||0)<15*60*1000;
    const count=(validWindow?Number(saved.count||0):0)+1;
    await db('site_settings?on_conflict=key',{
      method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({key,value:{
        count,started:validWindow?Number(saved.started):now,until:count>=8?now+15*60*1000:0
      },updated_at:new Date().toISOString()})
    });
    throw operatorError('운영진 비밀번호가 올바르지 않아요.',401);
  }
  await db('site_settings?key=eq.'+key,{method:'DELETE',headers:{Prefer:'return=minimal'}});
  // Remember-me is opt-in and extends only the signed session token; never store the password.
  const expiry=Math.floor(Date.now()/1000)+(body.remember===true?30*24*60*60:4*60*60);
  const nonce=crypto.randomBytes(16).toString('hex');
  const version=settings.version;
  res.status(200).json({ok:true,accessToken:['op1',expiry,nonce,version,operatorSign(expiry,nonce,version)].join(':'),expiresAt:expiry});
}
async function operatorConfigure(action,body,res){
  if(action==='operator-status'){
    const settings=await operatorSettings();
    return res.status(200).json({ok:true,enabled:settings?.enabled===true});
  }
  if(action==='operator-disable'){
    await operatorSave({enabled:false,version:crypto.randomUUID()});
    return res.status(200).json({ok:true,enabled:false});
  }
  if(action==='operator-set-password'){
    const password=String(body.password||'');
    if(password.length<12||password.length>128)throw operatorError('운영진 비밀번호는 12~128자로 정해 주세요.');
    const salt=crypto.randomBytes(16).toString('hex');
    await operatorSave({enabled:true,salt,hash:crypto.scryptSync(password,salt,64).toString('hex'),
      version:crypto.randomUUID()});
    return res.status(200).json({ok:true,enabled:true});
  }
  throw operatorError('지원하지 않는 운영진 설정입니다.');
}
async function handleOperator(body,res){
  const action=normalize(body.action);
  if(action==='operator-profile-get'){
    const profile=await operatorProfileRecord();
    return res.status(200).json({ok:true,profile:operatorProfilePublic(profile)});
  }
  if(action==='operator-profile-image-auth'){
    const privateKey=process.env.IMAGEKIT_PRIVATE_KEY;
    if(!privateKey)throw operatorError('프로필 사진 업로드 설정을 확인해 주세요.',503);
    const token=crypto.randomUUID(),expire=Math.floor(Date.now()/1000)+600;
    const signature=crypto.createHmac('sha1',privateKey).update(token+expire).digest('hex');
    return res.status(200).json({ok:true,token,expire,signature,
      publicKey:'public_JqJ2mArAo76reJ0eTsO5qBRQTk4=',
      uploadEndpoint:'https://upload.imagekit.io/api/v1/files/upload',
      folder:'/bokjakso-chat-operator/avatars'});
  }
  if(action==='operator-profile-save'){
    const nickname=normalize(body.nickname);
    if(!nickname||nickname.length>20||nickname==='관리자')throw operatorError('닉네임은 1~20자로 입력해 주세요. 관리자라는 이름은 사용할 수 없어요.');
    const previous=await operatorProfileRecord();
    let url=previous.avatar_url||null,fileId=previous.avatar_file_id||null;
    const changedPhoto=Object.prototype.hasOwnProperty.call(body,'avatarFileId');
    if(changedPhoto){
      const requested=String(body.avatarFileId||'');
      if(requested){
        const file=await operatorPhotoDetails(requested);
        if(!file)throw operatorError('운영진 프로필 사진을 확인하지 못했어. 다시 올려줘.');
        url=file.url;fileId=file.fileId;
      }else{url=null;fileId=null}
    }
    const memberIds=Array.isArray(previous.member_ids)?previous.member_ids.filter(x=>/^[0-9a-f-]{36}$/i.test(x)).slice(-200):[];
    const saved={nickname,avatar_url:url,avatar_file_id:fileId,member_ids:memberIds};
    await operatorProfileSave(saved);
    if(memberIds.length){
      await db('chat_members?id=in.('+memberIds.map(encodeURIComponent).join(',')+')',{
        method:'PATCH',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({nickname,avatar_url:url,avatar_file_id:fileId})
      });
    }
    if(changedPhoto&&previous.avatar_file_id&&previous.avatar_file_id!==fileId){
      await deleteImageKitFile(previous.avatar_file_id);
    }
    return res.status(200).json({ok:true,profile:operatorProfilePublic(saved)});
  }
  const delegate=OPERATOR_ALLOWED.get(action);
  if(delegate)return handleChatAdmin({...body,action:delegate},res,'operator');
  if(action==='operator-set-blocked'){
    const roomId=normalize(body.roomId);
    const memberId=normalize(body.memberId);
    if(!/^[a-f0-9-]{36}$/i.test(roomId)||!/^[a-f0-9-]{36}$/i.test(memberId)){
      throw operatorError('참여자 정보가 올바르지 않아요.');
    }
    const found=await db('chat_members?id=eq.'+encodeURIComponent(memberId)+'&room_id=eq.'+encodeURIComponent(roomId)+'&select=id&limit=1');
    if(!Array.isArray(found)||!found.length)throw operatorError('해당 방의 참여자를 찾지 못했어요.',404);
    await db('chat_members?id=eq.'+encodeURIComponent(memberId)+'&room_id=eq.'+encodeURIComponent(roomId),{
      method:'PATCH',headers:{Prefer:'return=minimal'},
      body:JSON.stringify({is_blocked:body.isBlocked===true})
    });
    return res.status(200).json({ok:true});
  }
  if(action==='operator-list-messages'){
    const roomId=normalize(body.roomId);
    if(!/^[a-f0-9-]{36}$/i.test(roomId))throw operatorError('채팅방을 선택해 주세요.');
    const messages=await db('chat_messages?room_id=eq.'+encodeURIComponent(roomId)+
      '&deleted_at=is.null&select=id,nickname,body,message_type,created_at&order=id.desc&limit=40');
    return res.status(200).json({ok:true,messages:Array.isArray(messages)?messages:[]});
  }
  if(action==='operator-delete-message'){
    const roomId=normalize(body.roomId);
    const messageId=Number(body.messageId);
    if(!/^[a-f0-9-]{36}$/i.test(roomId)||!Number.isSafeInteger(messageId)||messageId<=0){
      throw operatorError('삭제할 메시지 정보가 올바르지 않아요.');
    }
    const rows=await db('chat_messages?id=eq.'+messageId+'&room_id=eq.'+encodeURIComponent(roomId)+
      '&deleted_at=is.null&select=id&limit=1');
    if(!Array.isArray(rows)||!rows.length)throw operatorError('해당 방에서 메시지를 찾을 수 없어요.',404);
    const stamp=new Date().toISOString();
    // Individual soft deletion only. Other chat history remains untouched.
    await db('chat_messages?id=eq.'+messageId+'&room_id=eq.'+encodeURIComponent(roomId),{
      method:'PATCH',headers:{Prefer:'return=minimal'},
      body:JSON.stringify({deleted_at:stamp,updated_at:stamp,body:'삭제된 메시지입니다.',
        message_type:'text',image_url:null,image_file_id:null})
    });
    return res.status(200).json({ok:true});
  }
  throw operatorError('운영진에게 허용되지 않은 기능입니다.',403);
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

async function handleChatAdmin(body, res, role='owner') {
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
    const profile=role==='operator'?await operatorProfileRecord():null;
    const nickname=role==='operator'?operatorProfilePublic(profile).nickname:'관리자';
    const members = await db('chat_members?select=id,room_id,nickname,avatar_url', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        room_id: room.id,
        nickname,
        ...(role==='operator'?{avatar_url:profile.avatar_url||null,avatar_file_id:profile.avatar_file_id||null}:{}),
        token_hash: chatTokenHash(sessionToken),
        last_seen_at: new Date().toISOString()
      })
    });
    const member = Array.isArray(members) ? members[0] : null;
    if(!member)throw new Error('운영진 채팅방 입장 정보를 만들지 못했습니다.');
    if(role==='operator'){
      const ids=Array.isArray(profile.member_ids)?profile.member_ids.filter(x=>/^[0-9a-f-]{36}$/i.test(x)):[];
      await operatorProfileSave({...profile,member_ids:[...new Set([...ids,member.id])].slice(-200)});
    }
    res.status(200).json({
      ok: true,
      room,
      member: { id: member.id, nickname: member.nickname, avatar_url: member.avatar_url||null },
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
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const action = normalize(body.action);
    if(action==='operator-login')return await operatorLogin(req,body,res);
    if(action.startsWith('operator-')){
      if(['operator-status','operator-set-password','operator-disable'].includes(action)){
        requireAdmin(req);
        return await operatorConfigure(action,body,res);
      }
      await operatorRequire(req);
      return await handleOperator(body,res);
    }
    requireAdmin(req);
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
