'use strict';
// Highest-administrator magazine CMS. This is not the general chat operator API.
const crypto=require('node:crypto');
const {supabaseAdminRequest:db}=require('./supabase-admin');
const error=(msg,statusCode=400)=>Object.assign(new Error(msg),{statusCode});
const clean=value=>String(value??'').normalize('NFC').trim();
const keyRE=/^[a-z0-9-]{3,70}$/;
const cats=new Set(['culture','life','local','club']);
const fields='article_key,category,title,summary,body,image_url,image_file_id,featured,published,display_order,created_at,updated_at';
function isAdmin(req){
  const secret=clean(process.env.CROP_ACCESS_PASSWORD);
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const [expiry,nonce,sign]=token.split(':');
  if(!secret||!/^\d+$/.test(expiry||'')||Date.now()/1000>=Number(expiry)||!/^[a-f0-9]{64}$/i.test(sign||''))return false;
  const expected=crypto.createHmac('sha256',secret).update(expiry+':'+nonce).digest('hex');
  const a=Buffer.from(sign,'hex'),b=Buffer.from(expected,'hex');
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
function requireAdmin(req){if(!isAdmin(req))throw error('최고관리자 로그인이 필요하거나 만료되었어요.',401);}
function keyFrom(input){const k=clean(input);if(!keyRE.test(k))throw error('올바른 글 ID가 아니에요.');return k}
function publicArticle(a){return {
  articleKey:a.article_key,category:a.category,title:a.title,summary:a.summary,
  body:a.body,imageUrl:a.image_url||null,featured:a.featured===true,
  published:a.published===true,displayOrder:a.display_order,
  updatedAt:a.updated_at,createdAt:a.created_at
};}
function imageUrlAllowed(raw){
  if(!raw)return true;
  if(raw.length>2000)return false;
  try{
    const u=new URL(raw);
    return u.protocol==='https:'&&(u.hostname==='images.unsplash.com'||u.hostname==='ik.imagekit.io');
  }catch(_){return false}
}
async function validateImageFile(fileId){
  const privateKey=process.env.IMAGEKIT_PRIVATE_KEY;
  if(!privateKey||!/^[A-Za-z0-9_-]{10,100}$/.test(fileId||''))throw error('사진 정보를 확인하지 못했어요.');
  const response=await fetch('https://api.imagekit.io/v1/files/'+encodeURIComponent(fileId)+'/details',{
    headers:{Authorization:'Basic '+Buffer.from(privateKey+':').toString('base64')}
  });
  if(!response.ok)throw error('업로드한 사진을 찾지 못했어요.');
  const meta=await response.json();
  if(!String(meta.filePath||'').startsWith('/bokjakso-magazine/articles/')||
     !['image','IMAGE'].includes(String(meta.fileType||''))||
     !Number.isFinite(Number(meta.size))||Number(meta.size)<1||Number(meta.size)>6*1024*1024||
     !imageUrlAllowed(String(meta.url||'')))throw error('매거진 관리 화면에서 올린 유효한 사진만 선택할 수 있어요.');
  return String(meta.url);
}
async function main(req,res,body){
  const action=clean(body.action);
  if(action==='magazine-posts-list'){
    const admin=clean(body.view)==='admin';
    if(admin)requireAdmin(req);
    const filter=admin?'':'published=eq.true&';
    const rows=await db('bokjakso_magazine_articles?'+filter+
      'select='+fields+'&order=featured.desc,display_order.asc,created_at.desc&limit=200');
    return res.status(200).json({ok:true,articles:(Array.isArray(rows)?rows:[]).map(publicArticle)});
  }
  if(action==='magazine-posts-image-auth'){
    requireAdmin(req);
    const privateKey=process.env.IMAGEKIT_PRIVATE_KEY;
    if(!privateKey)throw error('사진 업로드 설정을 확인해 주세요.',503);
    const token=crypto.randomUUID(),expire=Math.floor(Date.now()/1000)+600;
    const signature=crypto.createHmac('sha1',privateKey).update(token+expire).digest('hex');
    return res.status(200).json({ok:true,token,expire,signature,
      publicKey:'public_JqJ2mArAo76reJ0eTsO5qBRQTk4=',
      uploadEndpoint:'https://upload.imagekit.io/api/v1/files/upload',
      folder:'/bokjakso-magazine/articles'});
  }
  if(action==='magazine-posts-save'){
    requireAdmin(req);
    const existingKey=clean(body.articleKey);
    const key=existingKey?keyFrom(existingKey):'art-'+crypto.randomUUID();
    const title=clean(body.title),summary=clean(body.summary),text=clean(body.body);
    const category=clean(body.category);
    if(!cats.has(category))throw error('글 분야를 선택해 주세요.');
    if(!title||title.length>120)throw error('제목은 1~120자로 입력해 주세요.');
    if(!summary||summary.length>400)throw error('소개 글은 1~400자로 입력해 주세요.');
    if(!text||text.length>10000)throw error('본문은 1~10,000자로 입력해 주세요.');
    const count=Number(body.displayOrder);
    if(!Number.isSafeInteger(count)||count<0||count>9999)throw error('정렬 순서는 0~9999 사이로 입력해 주세요.');
    const before=await db('bokjakso_magazine_articles?article_key=eq.'+encodeURIComponent(key)+'&select='+fields+'&limit=1');
    const old=before?.[0]||null;
    if(existingKey&&!old)throw error('수정하려는 글을 찾지 못했어요.',404);
    let imageUrl=null,imageFileId=null;
    if(body.imageFileId){
      imageFileId=clean(body.imageFileId);
      if(old?.image_file_id===imageFileId){
        imageUrl=old.image_url;
      }else{
        imageUrl=await validateImageFile(imageFileId);
      }
    }else if(body.imageUrl){
      imageUrl=clean(body.imageUrl);
      if(!imageUrlAllowed(imageUrl))throw error('사진은 이미지킷 또는 Unsplash의 HTTPS 이미지 주소를 사용해 주세요.');
      if(old?.image_url===imageUrl)imageFileId=old.image_file_id;
    }
    const record={
      category,title,summary,body:text,image_url:imageUrl,image_file_id:imageFileId,
      featured:body.featured===true,published:body.published===true,
      display_order:count,updated_at:new Date().toISOString()
    };
    const endpoint=old
      ?'bokjakso_magazine_articles?article_key=eq.'+encodeURIComponent(key)+'&select='+fields
      :'bokjakso_magazine_articles?select='+fields;
    const rows=await db(endpoint,{
      method:old?'PATCH':'POST',headers:{Prefer:'return=representation'},
      body:JSON.stringify(old?record:{...record,article_key:key})
    });
    if(!rows?.[0])throw error('글 저장에 실패했어요.',500);
    return res.status(200).json({ok:true,article:publicArticle(rows[0])});
  }
  if(action==='magazine-posts-comments'){
    requireAdmin(req);
    const k=keyFrom(body.articleKey);
    const rows=await db('bokjakso_magazine_comments?article_key=eq.'+encodeURIComponent(k)+
      '&select=id,nickname,body,created_at&order=id.desc&limit=200');
    return res.status(200).json({ok:true,comments:(Array.isArray(rows)?rows:[]).map(x=>({
      id:x.id,nickname:x.nickname,body:x.body,createdAt:x.created_at
    }))});
  }
  if(action==='magazine-posts-comment-delete'){
    requireAdmin(req);
    const k=keyFrom(body.articleKey),id=Number(body.commentId);
    if(!Number.isSafeInteger(id)||id<1)throw error('댓글 번호가 올바르지 않아요.');
    const gone=await db('bokjakso_magazine_comments?article_key=eq.'+encodeURIComponent(k)+
      '&id=eq.'+id+'&select=id',{
      method:'DELETE',headers:{Prefer:'return=representation'}
    });
    if(!gone?.[0])throw error('댓글을 찾지 못했어요.',404);
    return res.status(200).json({ok:true});
  }
  throw error('지원하지 않는 매거진 관리 요청이에요.');
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({message:'POST 요청만 허용됩니다.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    return await main(req,res,body);
  }catch(e){
    const code=e.statusCode||500;
    return res.status(code).json({message:code>=500?'매거진 저장소에 문제가 있어요. 잠시 뒤 다시 시도해 주세요.':e.message});
  }
};
