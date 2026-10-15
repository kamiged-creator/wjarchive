// Server-enforced membership, approval and private messages for 복작소 클럽.
// General chat API and its existing room passwords are not modified.
const crypto=require('node:crypto');
const {supabaseAdminRequest:db}=require('./supabase-admin');
const memberAccess=require('./member-access');
const {getVapidKeys,validSubscription,sendSignupAdminPush}=require('./chat-push');
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
function validBody(value,allowEmpty=false){const v=clean(value);if((!v&&!allowEmpty)||v.length>1000)throw error('메시지는 1~1000자로 입력해 주세요.');return v}
async function verifiedClubPhoto(fileId,profileId){
  const secret=process.env.IMAGEKIT_PRIVATE_KEY;
  if(!secret||!/^[A-Za-z0-9_-]{10,100}$/.test(String(fileId||'')))throw error('올바른 사진 파일을 확인해 주세요.');
  let response;
  try{response=await fetch('https://api.imagekit.io/v1/files/'+encodeURIComponent(fileId)+'/details',{
    headers:{Authorization:'Basic '+Buffer.from(secret+':').toString('base64')}
  });}catch(_){throw error('사진 확인에 실패했어요. 다시 시도해 주세요.',503)}
  if(!response.ok)throw error('업로드한 사진을 찾지 못했어요.');
  const file=await response.json();
  const prefix='/bokjakso-club/'+profileId+'/messages/';
  const url=String(file.url||'');
  if(!String(file.filePath||'').startsWith(prefix)||
      !['image','IMAGE'].includes(String(file.fileType||''))||
      !Number.isFinite(Number(file.size))||Number(file.size)<1||
      Number(file.size)>6*1024*1024||
      !/^https:\/\//i.test(url) || url.length>2000)
    throw error('클럽 회원이 올린 유효한 사진만 보낼 수 있어요.');
  return url;
}

async function clubMessagesFor(profileId){
    const rows=await db('bokjakso_club_messages?select=id,profile_id,nickname,body,image_url,created_at&order=id.desc&limit=60');
    // Show only the sender's shared profile photo, never tokens, profile IDs
    // or member details. This endpoint is protected by club approval above.
    const messageRows=Array.isArray(rows)?rows:[];
    const profileIds=[...new Set(messageRows.map(row=>row.profile_id).filter(id=>uuid.test(id||'')))];
    const portraits=profileIds.length
      ?await db('chat_profiles?id=in.('+profileIds.map(encodeURIComponent).join(',')+')&select=id,avatar_url&limit=60')
      :[];
    const avatarById=new Map((Array.isArray(portraits)?portraits:[]).map(row=>[row.id,row.avatar_url]));
    const messages=messageRows.reverse().map(row=>{
      const avatar=avatarById.get(row.profile_id);
      return {
        id:row.id,nickname:row.nickname,body:row.body,created_at:row.created_at,
        imageUrl:typeof row.image_url==='string'&&/^https:\/\//i.test(row.image_url)?row.image_url:null,
        isMine:row.profile_id===profileId,
        avatarUrl:typeof avatar==='string'&&/^https:\/\//i.test(avatar)?avatar:null
      };
    });
    return messages;
}
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
    const introduction=clean(body.introduction);
    if(introduction.length>300)throw error('가입 인사는 300자 이내로 작성해 주세요.');
    const member=await clubFor(profile.id);
    if(member?.status==='suspended')throw error('클럽 이용이 제한된 계정입니다.',403);
    if(member?.status==='approved'||member?.status==='pending')return res.status(200).json({ok:true,status:member.status});
    if(member){
      await db('bokjakso_club_members?profile_id=eq.'+encodeURIComponent(profile.id),{
        method:'PATCH',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({nickname:profile.nickname,application_note:introduction,status:'pending',requested_at:new Date().toISOString(),reviewed_at:null,updated_at:new Date().toISOString()})
      });
    }else{
      await db('bokjakso_club_members',{method:'POST',headers:{Prefer:'return=minimal'},
        body:JSON.stringify({profile_id:profile.id,nickname:profile.nickname,application_note:introduction,status:'pending'})});
    }
    await sendSignupAdminPush('club');
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
    const deleted=await db('bokjakso_club_members?profile_id=eq.'+encodeURIComponent(profile.id)+
      '&status=in.(pending,rejected)&select=profile_id',{
        method:'DELETE',headers:{Prefer:'return=representation'}
      });
    if(!Array.isArray(deleted)||!deleted.length){
      throw error('가입 상태가 변경됐어요. 다시 확인해 주세요.',409);
    }
    return res.status(200).json({ok:true,status:'none'});
  }
  if(action==='presence'){
    approved(await clubFor(profile.id));
    // One active record per verified club profile. A stale record expires
    // from the displayed count after 70s, even if a device dies unexpectedly.
    await db('bokjakso_club_presence?on_conflict=profile_id',{
      method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({profile_id:profile.id,last_seen:new Date().toISOString()})
    });
    const cutoff=new Date(Date.now()-70000).toISOString();
    const online=await db('bokjakso_club_presence?select=profile_id&last_seen=gte.'+
      encodeURIComponent(cutoff)+'&limit=1000');
    return res.status(200).json({
      ok:true,onlineCount:Array.isArray(online)?online.length:1
    });
  }
  if(action==='leave'){
    // Leaving the chat is NOT club resignation; keep membership and messages.
    await db('bokjakso_club_presence?profile_id=eq.'+encodeURIComponent(profile.id),{
      method:'DELETE',headers:{Prefer:'return=minimal'}
    });
    return res.status(200).json({ok:true,left:true});
  }
  if(action==='enter'){
    // One round trip for approval and recent messages, still strictly server
    // gated: no private messages returned to unapproved members.
    const member=await clubFor(profile.id);
    const status=member?.status||'none';
    if(status!=='approved')return res.status(200).json({ok:true,status,messages:[]});
    const messages=await clubMessagesFor(profile.id);
    return res.status(200).json({ok:true,status,messages});
  }
  if(action==='messages'){
    approved(await clubFor(profile.id));
    const messages=await clubMessagesFor(profile.id);
    return res.status(200).json({ok:true,messages});
  }
  if(action==='image-auth'){
    approved(await clubFor(profile.id));
    const secret=process.env.IMAGEKIT_PRIVATE_KEY;
    if(!secret)throw error('사진 업로드 준비 중이에요. 관리자에게 문의해 주세요.',503);
    const token=crypto.randomUUID();
    const expire=Math.floor(Date.now()/1000)+600;
    const signature=crypto.createHmac('sha1',secret).update(token+expire).digest('hex');
    return res.status(200).json({ok:true,token,expire,signature,
      publicKey:'public_JqJ2mArAo76reJ0eTsO5qBRQTk4=',
      uploadEndpoint:'https://upload.imagekit.io/api/v1/files/upload',
      folder:'/bokjakso-club/'+profile.id+'/messages'
    });
  }
  if(action==='send'){
    approved(await clubFor(profile.id));
    const hasImage=typeof body.imageFileId==='string'&&body.imageFileId.trim()!=='';
    if(body.imageFileId&&!hasImage)throw error('이미지 정보가 올바르지 않습니다.');
    const bodyText=validBody(body.message,hasImage);
    const imageUrl=hasImage?await verifiedClubPhoto(body.imageFileId,profile.id):null;
    const recent=await db('bokjakso_club_messages?profile_id=eq.'+encodeURIComponent(profile.id)+'&select=created_at&order=created_at.desc&limit=1');
    if(recent?.[0]&&Date.now()-new Date(recent[0].created_at).getTime()<1600)throw error('메시지는 잠시 후 다시 보내 주세요.',429);
    const saved=await db('bokjakso_club_messages?select=id,nickname,body,image_url,created_at',{
      method:'POST',headers:{Prefer:'return=representation'},
      body:JSON.stringify({profile_id:profile.id,nickname:profile.nickname,body:bodyText||'사진',image_url:imageUrl,image_file_id:hasImage?body.imageFileId:null})
    });
    const row=saved?.[0];
    return res.status(200).json({ok:true,message:row?{id:row.id,nickname:row.nickname,body:row.body,created_at:row.created_at,imageUrl:row.image_url||null}:null});
  }
  if(action==='delete-message'){
    // Only the authenticated author may delete their own photo message.
    approved(await clubFor(profile.id));
    const id=Number(body.messageId);
    if(!Number.isSafeInteger(id)||id<1)throw error('사진 메시지 번호가 올바르지 않아요.');
    const filter='bokjakso_club_messages?id=eq.'+id+
      '&profile_id=eq.'+encodeURIComponent(profile.id)+'&image_url=not.is.null';
    const owned=await db(filter+'&select=id,image_file_id,image_url&limit=1');
    if(!Array.isArray(owned)||!owned[0])throw error('본인이 보낸 사진만 삭제할 수 있어요.',403);
    const deleted=await db(filter+'&select=id,image_file_id,image_url',{
      method:'DELETE',headers:{Prefer:'return=representation'}
    });
    if(!Array.isArray(deleted)||!deleted.length)throw error('사진이 이미 삭제됐거나 삭제할 수 없어요.',409);
    const fileId=deleted[0].image_file_id;
    // Remove the uploaded original on a best-effort basis only after DB deletion
    // and only when the trusted ImageKit metadata proves author ownership.
    if(fileId&&/^[A-Za-z0-9_-]{10,100}$/.test(String(fileId))&&process.env.IMAGEKIT_PRIVATE_KEY){
      try{
        const key=process.env.IMAGEKIT_PRIVATE_KEY;
        const auth='Basic '+Buffer.from(key+':').toString('base64');
        const api='https://api.imagekit.io/v1/files/'+encodeURIComponent(fileId);
        const details=await fetch(api+'/details',{headers:{Authorization:auth}});
        if(details.ok){
          const meta=await details.json();
          if(String(meta.filePath||'').startsWith('/bokjakso-club/'+profile.id+'/messages/')&&
             String(meta.url||'')===String(deleted[0].image_url||'')){
            await fetch(api,{method:'DELETE',headers:{Authorization:auth}});
          }
        }
      }catch(_){/* The chat deletion remains committed even if remote cleanup fails. */}
    }
    return res.status(200).json({ok:true,deletedId:id});
  }
  if(action==='admin-push-config'){
    const {publicKey}=await getVapidKeys();
    return res.status(200).json({ok:true,publicKey});
  }
  if(action==='admin-push-status'){
    const endpoint=String(body.endpoint||'');
    if(endpoint.length<20||endpoint.length>2048)return res.status(200).json({ok:true,enabled:false});
    const rows=await db('bokjakso_admin_push_subscriptions?endpoint=eq.'+
      encodeURIComponent(endpoint)+'&select=id&limit=1');
    return res.status(200).json({ok:true,enabled:Array.isArray(rows)&&rows.length>0});
  }
  if(action==='admin-push-subscribe'){
    const subscription=body.subscription;
    if(!validSubscription(subscription))throw error('이 기기의 알림 정보를 확인해 주세요.');
    await db('bokjakso_admin_push_subscriptions?on_conflict=endpoint',{
      method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({endpoint:subscription.endpoint,subscription,updated_at:new Date().toISOString()})
    });
    return res.status(200).json({ok:true,enabled:true});
  }
  if(action==='admin-push-unsubscribe'){
    const endpoint=String(body.endpoint||'');
    if(endpoint.length<20||endpoint.length>2048)throw error('알림 기기 정보를 확인해 주세요.');
    await db('bokjakso_admin_push_subscriptions?endpoint=eq.'+
      encodeURIComponent(endpoint),{method:'DELETE',headers:{Prefer:'return=minimal'}});
    return res.status(200).json({ok:true,enabled:false});
  }
  if(action==='admin-list'){
    const rows=await db('bokjakso_club_members?select=profile_id,nickname,application_note,status,requested_at,reviewed_at&order=requested_at.desc&limit=300');
    const members=Array.isArray(rows)?rows:[];
    // The admin-only member list uses the same saved profile portraits as club
    // chat. Never return profile tokens or other private profile fields.
    const profileIds=[...new Set(members.map(row=>row.profile_id).filter(id=>uuid.test(id||'')))];
    const avatarById=new Map();
    for(let offset=0;offset<profileIds.length;offset+=50){
      const batch=profileIds.slice(offset,offset+50);
      const portraits=await db('chat_profiles?id=in.('+batch.map(encodeURIComponent).join(',')+')&select=id,avatar_url&limit=50');
      for(const row of Array.isArray(portraits)?portraits:[]){
        if(typeof row.avatar_url==='string'&&/^https:\/\//i.test(row.avatar_url)){
          avatarById.set(row.id,row.avatar_url);
        }
      }
    }
    return res.status(200).json({
      ok:true,members:members.map(row=>({...row,avatarUrl:avatarById.get(row.profile_id)||null}))
    });
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
