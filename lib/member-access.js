// General membership access is separate from club membership.
// New users require operator approval; existing profiles and proven historical
// room sessions were snapshotted into additive tables before enforcement.
const crypto=require('node:crypto');
const {supabaseAdminRequest:db}=require('./supabase-admin');
const hash=s=>crypto.createHash('sha256').update(String(s||'')).digest('hex');
let cache={until:0,enabled:false};
async function enforced(){
  if(Date.now()<cache.until)return cache.enabled;
  const rows=await db('bokjakso_registration_config?select=enabled&limit=1');
  if(!Array.isArray(rows)||!rows.length)throw new Error('Membership configuration is missing');
  cache={until:Date.now()+5000,enabled:rows[0].enabled===true};
  return cache.enabled;
}
async function profileStatus(id){
  if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))return null;
  const rows=await db('bokjakso_memberships?profile_id=eq.'+encodeURIComponent(id)+'&select=status,grandfathered&limit=1');
  return Array.isArray(rows)?rows[0]||null:null;
}
async function legacyMember(id){
  if(!/^[0-9a-f-]{36}$/i.test(String(id||'')))return false;
  const rows=await db('bokjakso_legacy_chat_members?member_id=eq.'+encodeURIComponent(id)+'&select=member_id&limit=1');
  return Array.isArray(rows)&&rows.length>0;
}
async function authenticatedMember(memberId,sessionToken){
  if(!/^[0-9a-f-]{36}$/i.test(String(memberId||''))||typeof sessionToken!=='string'||sessionToken.length<32)return null;
  const rows=await db('chat_members?id=eq.'+encodeURIComponent(memberId)+'&token_hash=eq.'+hash(sessionToken)+'&select=id,profile_id,nickname,is_blocked&limit=1');
  return Array.isArray(rows)?rows[0]||null:null;
}
async function canMember(member){
  if(!member||member.is_blocked)return false;
  // Administrator room sessions are generated only by authenticated admin API.
  if(member.nickname==='관리자'&&!member.profile_id)return true;
  if(member.profile_id){
    const record=await profileStatus(member.profile_id);
    if(record)return record.status==='approved';
  }
  return legacyMember(member.id);
}
async function requireSession(memberId,sessionToken){
  if(!await enforced())return;
  const member=await authenticatedMember(memberId,sessionToken);
  if(!await canMember(member)){
    const e=new Error('회원 승인 후 채팅을 이용할 수 있어요. 회원가입·승인 상태를 확인해 주세요.');
    e.statusCode=403;throw e;
  }
}
async function requireJoin(body,profile){
  if(!await enforced())return;
  if(profile){
    const record=await profileStatus(profile.id);
    if(record?.status==='approved')return;
    throw Object.assign(new Error('관리자 승인을 받은 회원만 채팅방에 입장할 수 있어요.'),{statusCode:403});
  }
  const member=await authenticatedMember(body.sourceMemberId,body.sourceSessionToken);
  if(member&&await canMember(member))return;
  throw Object.assign(new Error('회원 등록 후 관리자 승인을 기다려 주세요.'),{statusCode:403});
}
async function grantLegacyProfile(profileId,sourceMember){
  if(!sourceMember||!await legacyMember(sourceMember.id))return;
  await db('bokjakso_memberships?on_conflict=profile_id',{
    method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify({profile_id:profileId,status:'approved',grandfathered:true})
  });
}
module.exports={enforced,profileStatus,legacyMember,authenticatedMember,canMember,requireSession,requireJoin,grantLegacyProfile};
