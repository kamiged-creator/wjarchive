const crypto = require('crypto');

const defaults = {
  announcement_visible: 'true',
  announcement_text: '신규 고객 첫 주문 시 맞춤 복주머니 포장 패키지 증정',
  announcement_guide_text: '주문 제작 가이드',
  announcement_guide_url: '#order-guide',
  announcement_support_text: '고객센터 070-8065-0210',
  announcement_support_url: '#faq',
  hero_pc_image: 'assets/store-desktop-hero-clean.webp',
  hero_mobile_image: 'assets/store-mobile-hero-clean.webp',
  hero_label: '손에 담는 작은 예술',
  hero_title: '일상을 빛내는\n작은 디테일, 복작소',
  hero_description: '나무와 천연석에 새긴 고유한 이야기,\n소중한 분과 나 자신만을 위해 정성으로 완성되는 1:1 맞춤 수제 키링',
  hero_primary_text: '신상품 보러가기', hero_primary_url: '#new-section',
  hero_secondary_text: '맞춤 각인 제작 문의', hero_secondary_url: '#guide-section',
  story_pc_image: 'assets/bokjakso-story-desktop.webp',
  story_mobile_image: 'assets/bokjakso-story-mobile.webp',
  story_label: '복작소 이야기',
  story_title: '오랜 시간 정성으로\n완성되는 작은 작품',
  story_mobile_title: '오랜 시간\n완성되는 작품',
  story_description: '좋은 나무와 돌, 그리고 손끝의 온기만을 고집합니다.\n수없이 칼을 벼리고 다듬어 세상에 단 하나뿐인 당신의 이름과 마음을 새깁니다.',
  story_button_text: '장인의 제작 공정 보기', story_button_url: '#',
  story_stat_text: '누적 제작 12,000+ 건 돌파',
  shipping_fee: '3,000원', free_shipping_threshold: '50,000원'
};

function env(){ return {url:process.env.SUPABASE_URL || 'https://vefeplfczeztbplowjmj.supabase.co', key:process.env.SUPABASE_SERVICE_ROLE_KEY, password:String(process.env.CROP_ACCESS_PASSWORD||'').normalize('NFC').trim()}; }
function verify(token, secret){ const [expire,nonce,signature]=String(token||'').split(':'); if(!expire||!nonce||!signature||Number(expire)<=Date.now()/1000)return false; const expected=crypto.createHmac('sha256',secret).update(`${expire}:${nonce}`).digest('hex'); const a=Buffer.from(signature),b=Buffer.from(expected); return a.length===b.length&&crypto.timingSafeEqual(a,b); }
function admin(req){ const {password}=env(); const token=String(req.headers.authorization||'').replace(/^Bearer /,''); if(!password||!verify(token,password)){ const e=new Error('관리자 로그인이 필요합니다.');e.statusCode=401;throw e; } }
async function db(path,options={}){ const {url,key}=env(); if(!key){const e=new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');e.statusCode=500;throw e;} const response=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation',...(options.headers||{})}}); const text=await response.text(); const data=text?JSON.parse(text):null; if(!response.ok){const e=new Error(data?.message||'스토어 설정 저장소를 확인해 주세요.');e.statusCode=response.status;throw e;} return data; }
function clean(body){ const result={}; Object.keys(defaults).forEach(key=>{ if(Object.prototype.hasOwnProperty.call(body,key)) result[key]=String(body[key]??'').trim(); }); return result; }

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Methods','GET, PUT, OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
  if(req.method==='OPTIONS'){res.status(204).end();return;}
  try{
    if(req.method==='GET'){
      try{ const rows=await db('store_settings?select=settings&id=eq.main&limit=1',{method:'GET'}); res.status(200).json({settings:{...defaults,...(rows?.[0]?.settings||{})}}); }
      catch(error){ res.status(200).json({settings:defaults,usingDefaults:true}); }
      return;
    }
    if(req.method!=='PUT'){res.status(405).json({message:'Method not allowed.'});return;}
    admin(req); const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{}); const settings={...defaults,...clean(body)};
    await db('store_settings?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:'main',settings})});
    res.status(200).json({settings});
  }catch(error){res.status(error.statusCode||500).json({message:error.message||'스토어 설정 처리 실패'});}
};
