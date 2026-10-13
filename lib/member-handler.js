// 복작소 일반 회원가입 (SMS 미사용): 서버 검증, 관리자 승인, 개인정보 암호화.
const crypto=require('node:crypto');
const {supabaseAdminRequest:db}=require('./supabase-admin');
const access=require('./member-access');
const clean=x=>String(x??'').normalize('NFC').trim();
const hash=x=>crypto.createHash('sha256').update(String(x||'')).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
function adminSecret(){return clean(process.env.CROP_ACCESS_PASSWORD);}
function dataKey(){
  // A dedicated random 256-bit key, independent of the administrator password,
  // is mandatory. Missing Vercel secret must fail closed before PII collection.
  const secret=String(process.env.BOKJAKSO_MEMBER_DATA_KEY||'');
  if(!/^[a-f0-9]{64}$/i.test(secret))throw fail('회원 개인정보 암호화 설정을 확인해 주세요.',503);
  return Buffer.from(secret,'hex');
}
function encrypt(value){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',dataKey(),iv);
  const bytes=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv.toString('base64'),cipher.getAuthTag().toString('base64'),bytes.toString('base64')].join('.');
}
function decrypt(value){
  const [iv,tag,body]=String(value||'').split('.');
  const cipher=crypto.createDecipheriv('aes-256-gcm',dataKey(),Buffer.from(iv,'base64'));
  cipher.setAuthTag(Buffer.from(tag,'base64'));
  return Buffer.concat([cipher.update(Buffer.from(body,'base64')),cipher.final()]).toString('utf8');
}
function verifyAdmin(req){
  const secret=adminSecret(),token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const [expiry,nonce,sig]=token.split(':');
  if(!secret||!expiry||!nonce||!sig||!/^\d+$/.test(expiry)||Number(expiry)<=Date.now()/1000)throw fail('관리자 로그인이 필요합니다.',401);
  const expect=crypto.createHmac('sha256',secret).update(expiry+':'+nonce).digest('hex');
  if(expect.length!==sig.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expect)))throw fail('관리자 로그인이 만료됐어요.',401);
}
async function profile(body){
  if(!uuid.test(clean(body.profileId))||typeof body.profileToken!=='string'||body.profileToken.length<32)throw fail('프로필을 먼저 만들어 주세요.',401);
  const r=await db('chat_profiles?id=eq.'+encodeURIComponent(body.profileId)+'&token_hash=eq.'+hash(body.profileToken)+'&select=id,nickname,avatar_url&limit=1');
  if(!Array.isArray(r)||!r[0])throw fail('프로필을 확인할 수 없어요. 다시 로그인해 주세요.',401);
  return r[0];
}
function phoneNumber(raw){
  const value=clean(raw).replace(/[\s()-]/g,'');
  if(!/^01[016789]\d{7,8}$/.test(value))throw fail('휴대전화 번호를 확인해 주세요.');
  return value;
}
function clientIp(req){
  const value=req.headers['x-vercel-forwarded-for']||req.headers['x-real-ip']||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown';
  const source=String(Array.isArray(value)?value[0]:value).split(',')[0].trim().slice(0,128);
  return crypto.createHmac('sha256',adminSecret()||'unconfigured').update('member-registration:'+source).digest('hex');
}
async function limitRegistration(req){
  const key=clientIp(req),after=new Date(Date.now()-24*3600*1000).toISOString();
  const r=await db('bokjakso_registration_attempts?ip_hmac=eq.'+key+'&attempted_at=gt.'+encodeURIComponent(after)+'&select=id&limit=6');
  if(!Array.isArray(r))throw fail('회원 신청 서버를 확인해 주세요.',503);
  if(r.length>=5)throw fail('가입 신청 횟수가 많아요. 하루 뒤 다시 이용해 주세요.',429);
  await db('bokjakso_registration_attempts',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({ip_hmac:key})});
}
async function statusFor(body){
  let user=null;
  if(body.profileId||body.profileToken)user=await profile(body);
  if(user){
    const record=await access.profileStatus(user.id);
    return {status:record?.status||'new',nickname:user.nickname,profileId:user.id};
  }
  const member=await access.authenticatedMember(body.memberId,body.sessionToken);
  if(member&&await access.canMember(member))return {status:'approved',legacy:true};
  return {status:'new'};
}
async function handle(req,res){
  const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
  const action=clean(body.action);
  const adminAction=action.startsWith('member-admin-');
  if(adminAction)verifyAdmin(req);
  if(action==='member-status'){
    return res.status(200).json({ok:true,enforced:await access.enforced(),...await statusFor(body)});
  }
  if(action==='member-register'){
    // Never accept personal data before the operator enables the privacy-reviewed rollout.
    if(!await access.enforced())throw fail('복작소 신규 회원 신청은 아직 준비 중이에요.',503);
    dataKey(); // Validate encryption key before accepting any private information.
    const existingProfile=await profile(body);
    const membership=await access.profileStatus(existingProfile.id);
    if(membership?.status==='approved')return res.status(200).json({ok:true,status:'approved'});
    if(membership?.status==='suspended')throw fail('이용이 제한된 계정입니다. 관리자에게 문의해 주세요.',403);
    if(membership?.status==='rejected')throw fail('가입이 거절된 계정입니다. 관리자에게 문의해 주세요.',403);
    if(membership?.status==='pending')return res.status(200).json({ok:true,status:'pending'});
    const name=clean(body.legalName),nickname=clean(body.nickname),phone=phoneNumber(body.phone);
    if(name.length<2||name.length>40||/[\u0000-\u001f<>]/.test(name))throw fail('이름은 2~40자로 입력해 주세요.');
    if(!nickname||nickname.length>20||nickname==='관리자')throw fail('채팅 닉네임은 1~20자로 입력해 주세요.');
    if(body.consent!==true||body.consentVersion!=='bokjakso-registration-v1')throw fail('개인정보 수집 안내를 확인하고 동의해 주세요.');
    await limitRegistration(req);
    // Only matching profile credentials authorize a new application.
    await db('chat_profiles?id=eq.'+encodeURIComponent(existingProfile.id),{
      method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({nickname,updated_at:new Date().toISOString()})
    });
    const p={profile_id:existingProfile.id,legal_name_cipher:encrypt(name),phone_cipher:encrypt(phone),phone_last4:phone.slice(-4),phone_verified:false};
    await db('bokjakso_member_private?on_conflict=profile_id',{
      method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(p)
    });
    const now=new Date().toISOString();
    await db('bokjakso_memberships?on_conflict=profile_id',{
      method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify({profile_id:existingProfile.id,status:'pending',grandfathered:false,requested_at:now,updated_at:now,consent_at:now,consent_version:'bokjakso-registration-v1'})
    });
    const finalized=await access.profileStatus(existingProfile.id);
    return res.status(200).json({ok:true,status:finalized?.status||'pending',notice:'문자 인증을 사용하지 않아 전화번호는 확인되지 않았습니다.'});
  }
  if(action==='member-admin-list'){
    const [members,profiles,details]=await Promise.all([
      db('bokjakso_memberships?select=profile_id,status,requested_at,reviewed_at,grandfathered&order=requested_at.desc&limit=300'),
      db('chat_profiles?select=id,nickname,avatar_url&limit=500'),
      db('bokjakso_member_private?select=profile_id,legal_name_cipher,phone_last4,phone_verified&limit=500')
    ]);
    const profileMap=new Map((profiles||[]).map(x=>[x.id,x]));
    const privateMap=new Map((details||[]).map(x=>[x.profile_id,x]));
    const rows=(members||[]).map(x=>{
      const p=privateMap.get(x.profile_id),publicInfo=profileMap.get(x.profile_id);
      let name='';
      if(p){try{name=decrypt(p.legal_name_cipher)}catch(_){name='확인 필요'}}
      return {profileId:x.profile_id,nickname:publicInfo?.nickname||'',avatarUrl:publicInfo?.avatar_url||null,
        name,phoneMask:p?'010-****-'+p.phone_last4:'기존 회원',
        phoneVerified:Boolean(p?.phone_verified),status:x.status,requestedAt:x.requested_at,
        reviewedAt:x.reviewed_at,grandfathered:x.grandfathered};
    });
    return res.status(200).json({ok:true,members:rows});
  }
  if(action==='member-admin-review'){
    const id=clean(body.profileId),next=clean(body.status);
    if(!uuid.test(id)||!['approved','rejected','suspended'].includes(next))throw fail('승인 처리 정보가 올바르지 않아요.');
    const current=await access.profileStatus(id);
    if(!current)throw fail('회원을 찾을 수 없어요.',404);
    // Existing grandfathered users should not be accidentally rejected through the new-applicant workflow.
    if(current.grandfathered&&next==='rejected')throw fail('기존 회원의 가입 신청은 거절할 수 없어요.',403);
    const updated=await db('bokjakso_memberships?profile_id=eq.'+encodeURIComponent(id)+'&select=profile_id,status',{
      method:'PATCH',headers:{Prefer:'return=representation'},
      body:JSON.stringify({status:next,updated_at:new Date().toISOString(),reviewed_at:new Date().toISOString()})
    });
    if(!updated?.[0])throw fail('승인 상태를 변경하지 못했습니다.',500);
    return res.status(200).json({ok:true,member:updated[0]});
  }
  throw fail('지원하지 않는 회원 관리 요청입니다.',400);
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({message:'POST 요청만 허용돼요.'});
  try{await handle(req,res)}
  catch(e){const status=e.statusCode||500;
    if(status>=500)console.error('member-api',e.message);
    res.status(status).json({message:status>=500?'회원 서버 연결을 확인해 주세요.':e.message});
  }
};
