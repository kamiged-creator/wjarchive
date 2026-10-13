// Server-enforced membership, approval and private messages for 복작소 클럽.
// General chat API and its existing room passwords are not modified.
const crypto=require('node:crypto');
const {supabaseAdminRequest:db}=require('./supabase-admin');
const memberAccess=require('./member-access');
const ADMIN_SECRET=()=>String(process.env.CROP_ACCESS_PASSWORD||'').normalize('NFC').trim();
const clean=v=>String(v??'').normalize('NFC').trim();
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function error(message,statusCode=400){const e=new Error(message);e.statusCode=statusCode;return e}
function validateAdmin(req){
  const secret=ADMIN_SECRET();
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const [expiry,nonce,signature]=token.split(':');
  if(!secret||!expiry||!nonce||!signature||!/^\d+$/.test(expiry)||Number(expiry)<=Date.now()/1000)throw error('관리자 로그인이 필요합니다.',401);
  const expected=crypto.createHmac('sha256',secret).update(expiry+':'+nonce).digest('hex');
  const left=Buffer.from(signature),right=Buffer.from(expected);
  if(left.length!==right.length||!crypto.timingSafeEqual(left,right))throw error('관리자 로그인이 만료되었습니다.',401);
}
async function profileFor(body){
  const id=clean(body.profileId),token=body.profileToken;
  if(!uuid.test(id)||typeof token!=='string'||token.length<32||token.length>256)throw error('내 정보에서 프로필을 먼저 만들어 주세요.',401);
  const rows=await db('chat_profiles?id=eq.'+encodeURIComponent(id)+'&token_hash=eq.'+hash(token)+'&select=id,nickname,avatar_url&limit=1');
  if(!Array.isArray(rows)||!rows[0])throw error('프로필 인증이 만료되었습니다. 프로필을 확인해 주세요.',401);
  return rows[0];
}
async function clubFor(profileId){
  const rows=await db('bokjakso_club_members?profile_id=eq.'+encodeURIComponent(profileId)+'&select=profile_id,nickname,status,requested_at,reviewed_at&limit=1');
  return Array.isArray(rows)?rows[0]||null:null;
}
function approved(member){if(!member||member.status!=='approved')throw error('승인된 복작소 클럽 회원만 이용할 수 있어요.',403)}
function validBody(value){const v=clean(value);if(!v||v.length>1000)throw error('메시지는 1~1000자로 입력해 주세요.');return v}
async function respond(action,body,res,req){
  const adminAction=action.startsWith('admin-');
  if(adminAction)validateAdmin(req);
  const profile=adminAction?null:await profileFor(body);
  if(profile&&await memberAccess.enforced()){
    const membership=await memberAccess.profileStatus(profile.id);
    if(membership?.status!=='approved')throw error('일반 회원 승인 후 복작소 클럽을 이용할 수 있어요.',403);
  }
  if(action==='status'){
    const member=await clubFor(profile.id);
    return res.status(200).json({ok:true,status:member?.status||'none',requestedAt:member?.requested_at||null,reviewedAt:member?.reviewed_at||null});
  }
  if(action==='apply'){
    const member=await clubFor(profile.id);
    if(member?.status==='suspended')throw error('클럽 이용이 제한된 계정입니다.',403);
    if(member?.status==='approved'||member?.status==='pending')return res.status(200).json({ok:true,status:member.status});
    if(member){
      await db('bokjakso_club_members?profile_id=eq.'+encodeURIComponent(profile.id),{
        method:'PATCH',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({nickname:profile.nickname,status:'pending',requested_at:new Date().toISOString(),reviewed_at:null,updated_at:new Date().toISOString()})
      });
    }else{
      await db('bokjakso_club_members',{method:'POST',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({profile_id:profile.id,nickname:profile.nickname,status:'pending'})});
    }
    return res.status(200).json({ok:true,status:'pending'});
  }
  if(action==='withdraw'){
    // Self-service reset: only the token-verified applicant can withdraw a
    // still-pending club request. Never delete approved/suspended membership.
    const member=await clubFor(profile.id);
    if(!member)return res.status(200).json({ok:true,status:'none'});
    if(member.status!=='pending'&&member.status!=='rejected'){
      throw error('승인 완료 또는 이용 제한 회원은 관리자를 통해 처리해 주세요.',403);
    }
    await db('bokjakso_club_members?profile_id=eq.'+encodeURIComponent(profile.id)+
      '&status=in.(pending,rejected)',{method:'DELETE',headers:{Prefer:'return=minimal'}});
    return res.status(200).json({ok:true,status:'none'});
  }
  if(action==='messages'){
    approved(await clubFor(profile.id));
    const rows=await db('bokjakso_club_messages?select=id,nickname,body,created_at&order=id.desc&limit=60');
    return res.status(200).json({ok:true,messages:(Array.isArray(rows)?rows:[]).reverse()});
  }
  if(action==='send'){
    approved(await clubFor(profile.id));
    const bodyText=validBody(body.message);
    const recent=await db('bokjakso_club_messages?profile_id=eq.'+encodeURIComponent(profile.id)+'&select=created_at&order=created_at.desc&limit=1');
    if(recent?.[0]&&Date.now()-new Date(recent[0].created_at).getTime()<1600)throw error('메시지는 잠시 후 다시 보내 주세요.',429);
    const saved=await db('bokjakso_club_messages?select=id,nickname,body,created_at',{
      method:'POST',headers:{Prefer:'return=representation'},
      body:JSON.stringify({profile_id:profile.id,nickname:profile.nickname,body:bodyText})
    });
    return res.status(200).json({ok:true,message:saved?.[0]||null});
  }
  if(action==='admin-list'){
    const rows=await db('bokjakso_club_members?select=profile_id,nickname,status,requested_at,reviewed_at&order=requested_at.desc&limit=300');
    return res.status(200).json({ok:true,members:Array.isArray(rows)?rows:[]});
  }
  if(action==='admin-review'){
    const profileId=clean(body.profileId),status=clean(body.status);
    if(!uuid.test(profileId)||!['approved','rejected','suspended'].includes(status))throw error('회원 또는 처리 상태가 올바르지 않습니다.');
    const existing=await clubFor(profileId);
    if(!existing)throw error('신청한 회원을 찾지 못했습니다.',404);
    const rows=await db('bokjakso_club_members?profile_id=eq.'+encodeURIComponent(profileId)+'&select=profile_id,status',{
      method:'PATCH',headers:{Prefer:'return=representation'},
      body:JSON.stringify({status,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()})
    });
    if(!rows?.[0])throw error('승인 상태를 변경하지 못했습니다.',500);
    return res.status(200).json({ok:true,member:rows[0]});
  }
  if(action==='admin-delete-message'){
    const id=Number(body.messageId);
    if(!Number.isSafeInteger(id)||id<1)throw error('메시지 정보를 확인해 주세요.');
    await db('bokjakso_club_messages?id=eq.'+id,{method:'DELETE',headers:{Prefer:'return=minimal'}});
    return res.status(200).json({ok:true});
  }
  throw error('지원하지 않는 클럽 요청입니다.');
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({message:'POST 요청만 허용됩니다.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=clean(body.action).replace(/^club-/,'');
    await respond(action,body,res,req);
  }catch(e){
    // Hide internal data-store error details from unauthorized visitors.
    const status=e.statusCode||500;
    const message=status>=500?'클럽 서버를 확인하고 다시 시도해 주세요.':e.message;
    res.status(status).json({message});
  }
};
