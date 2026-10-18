// Magazine comments: publicly readable, writable only by approved Bokjakso Club members.
// No client can access the database directly. Shared profiles and admin tokens are
// verified on the server for every write/delete operation.
const crypto=require('node:crypto');
const {supabaseAdminRequest:db}=require('./supabase-admin');
const memberAccess=require('./member-access');

const KEY_RE=/^[a-z0-9-]{3,70}$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean=v=>String(v??'').normalize('NFC').trim();
const hash=v=>crypto.createHash('sha256').update(String(v||'')).digest('hex');
const fail=(message,statusCode=400)=>Object.assign(new Error(message),{statusCode});
const ADMIN_SECRET=()=>String(process.env.CROP_ACCESS_PASSWORD||'').normalize('NFC').trim();

function adminVerified(req){
  const secret=ADMIN_SECRET();
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const [expiry,nonce,signature]=token.split(':');
  if(!secret||!expiry||!nonce||!signature||!/^[0-9]+$/.test(expiry)||Number(expiry)<=Date.now()/1000)return false;
  if(!/^[0-9a-f]{64}$/i.test(signature))return false;
  const expected=crypto.createHmac('sha256',secret).update(expiry+':'+nonce).digest('hex');
  const a=Buffer.from(signature,'hex'),b=Buffer.from(expected,'hex');
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function verifyProfile(body,optional=false){
  const id=clean(body.profileId),token=body.profileToken;
  if(!id&&!token&&optional)return null;
  if(!UUID.test(id)||typeof token!=='string'||token.length<32||token.length>256){
    if(optional)return null;
    throw fail('내 정보에서 프로필을 먼저 확인해 주세요.',401);
  }
  const rows=await db('chat_profiles?id=eq.'+encodeURIComponent(id)+
    '&token_hash=eq.'+hash(token)+'&select=id,nickname,avatar_url&limit=1');
  if(!rows?.[0]){
    if(optional)return null;
    throw fail('프로필 인증이 만료되었습니다. 내 정보에서 확인해 주세요.',401);
  }
  return rows[0];
}
async function approvedMember(profile){
  if(!profile)return false;
  const rows=await db('bokjakso_club_members?profile_id=eq.'+encodeURIComponent(profile.id)+
    '&select=status&limit=1');
  if(rows?.[0]?.status!=='approved')return false;
  if(await memberAccess.enforced()){
    const status=await memberAccess.profileStatus(profile.id);
    if(status?.status!=='approved')return false;
  }
  return true;
}
async function articleFrom(body,allowHidden=false){
  const key=clean(body.articleKey);
  if(!KEY_RE.test(key))throw fail('매거진 글 정보를 확인해 주세요.');
  const rows=await db('bokjakso_magazine_articles?article_key=eq.'+encodeURIComponent(key)+
    '&select=article_key,published&limit=1');
  if(!rows?.[0]||(!allowHidden&&!rows[0].published))throw fail('현재 공개 중인 매거진 글이 아니에요.',404);
  return key;
}
function commentId(body){
  const id=Number(body.commentId);
  if(!Number.isSafeInteger(id)||id<1)throw fail('댓글 정보를 확인해 주세요.');
  return id;
}
function dbPath(articleKey,beforeId){
  let p='bokjakso_magazine_comments?article_key=eq.'+encodeURIComponent(articleKey);
  if(beforeId!==null)p+='&id=lt.'+beforeId;
  return p;
}
async function list(body,req,res){
  const key=clean(body.articleKey);
  if(!KEY_RE.test(key))throw fail('매거진 글 정보를 확인해 주세요.');
  const beforeId=body.beforeId===undefined||body.beforeId===null?null:commentId({commentId:body.beforeId});
  // Independent reads run concurrently. Approval is still verified server-side
  // on every request; hidden articles are rejected before any data is returned.
  const [articleKey,profile,rows]=await Promise.all([
    articleFrom(body),
    verifyProfile(body,true),
    db(dbPath(key,beforeId)+'&select=id,profile_id,nickname,body,created_at&order=id.desc&limit=31')
  ]);
  const admin=adminVerified(req);
  const subset=(Array.isArray(rows)?rows:[]).slice(0,30);
  const authors=[...new Set(subset.map(r=>r.profile_id).filter(id=>UUID.test(id||'')))];
  const portraitsPromise=authors.length
    ?db('chat_profiles?id=in.('+authors.map(encodeURIComponent).join(',')+
      ')&select=id,nickname,avatar_url&limit=30')
    :Promise.resolve([]);
  const [canComment,portraits]=await Promise.all([
    approvedMember(profile),portraitsPromise
  ]);
  const people=new Map((Array.isArray(portraits)?portraits:[]).map(r=>[r.id,r]));
  return res.status(200).json({
    ok:true,
    canComment,canModerate:admin,
    comments:subset.map(row=>{
      const author=people.get(row.profile_id);
      const image=author?.avatar_url;
      return {
        id:row.id,
        nickname:author?.nickname||row.nickname||'회원',
        avatarUrl:typeof image==='string'&&/^https:\/\//i.test(image)?image:null,
        body:row.body,
        createdAt:row.created_at,
        canDelete:admin||Boolean(profile&&row.profile_id===profile.id)
      };
    }),
    hasMore:Array.isArray(rows)&&rows.length>30,
    nextBeforeId:subset.length?subset[subset.length-1].id:null
  });
}
async function post(body,res){
  const articleKey=await articleFrom(body);
  const profile=await verifyProfile(body);
  if(!await approvedMember(profile))throw fail('복작소 클럽 승인 정회원만 댓글을 작성할 수 있어요.',403);
  const message=clean(body.message);
  if(!message||message.length>500)throw fail('댓글을 1~500자로 입력해 주세요.');
  const recent=await db('bokjakso_magazine_comments?profile_id=eq.'+encodeURIComponent(profile.id)+
    '&select=created_at&order=created_at.desc&limit=1');
  if(recent?.[0]?.created_at&&Date.now()-new Date(recent[0].created_at).getTime()<10000){
    throw fail('댓글은 10초 간격으로 작성할 수 있어요.',429);
  }
  const inserted=await db('bokjakso_magazine_comments?select=id',{
    method:'POST',headers:{Prefer:'return=representation'},
    body:JSON.stringify({article_key:articleKey,profile_id:profile.id,
      nickname:profile.nickname,body:message})
  });
  if(!inserted?.[0]?.id)throw fail('댓글을 저장하지 못했어요.',500);
  return res.status(200).json({ok:true,id:inserted[0].id});
}
async function remove(body,req,res){
  const articleKey=await articleFrom(body,true),id=commentId(body);
  const admin=adminVerified(req);
  let profile=null;
  if(!admin)profile=await verifyProfile(body);
  const existing=await db(dbPath(articleKey,null)+'&id=eq.'+id+
    '&select=id,profile_id&limit=1');
  if(!existing?.[0])throw fail('이미 삭제된 댓글이거나 찾을 수 없어요.',404);
  if(!admin&&(!profile||existing[0].profile_id!==profile.id)){
    throw fail('본인이 작성한 댓글만 삭제할 수 있어요.',403);
  }
  let path=dbPath(articleKey,null)+'&id=eq.'+id;
  if(!admin)path+='&profile_id=eq.'+encodeURIComponent(profile.id);
  const deleted=await db(path+'&select=id',{
    method:'DELETE',headers:{Prefer:'return=representation'}
  });
  if(!deleted?.[0])throw fail('댓글 상태가 변경됐어요. 다시 확인해 주세요.',409);
  return res.status(200).json({ok:true});
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({message:'POST 요청만 허용됩니다.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=clean(body.action);
    if(action==='magazine-list')return await list(body,req,res);
    if(action==='magazine-post')return await post(body,res);
    if(action==='magazine-delete')return await remove(body,req,res);
    throw fail('지원하지 않는 매거진 요청입니다.');
  }catch(e){
    const status=e.statusCode||500;
    return res.status(status).json({
      message:status>=500?'댓글 서버에 잠시 문제가 있어요. 다시 시도해 주세요.':e.message
    });
  }
};