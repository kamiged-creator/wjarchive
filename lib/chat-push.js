'use strict';
const webpush=require('web-push');
const {supabaseAdminRequest}=require('./supabase-admin');

let cachedKeys=null;
let keysFetchedAt=0;
const CONFIG_TTL_MS=10*60*1000;

async function getVapidKeys(){
  if(cachedKeys && Date.now()-keysFetchedAt<CONFIG_TTL_MS)return cachedKeys;
  const keys=await supabaseAdminRequest('rpc/bokjakso_push_vapid_config',{
    method:'POST',
    body:JSON.stringify({})
  });
  const publicKey=String(keys?.bokjakso_push_vapid_public||'');
  const privateKey=String(keys?.bokjakso_push_vapid_private||'');
  if(!publicKey || !privateKey)throw new Error('Push VAPID keys have not been configured.');
  webpush.setVapidDetails('mailto:bokjakso.shop@gmail.com',publicKey,privateKey);
  cachedKeys={publicKey};
  keysFetchedAt=Date.now();
  return cachedKeys;
}

function validPushEndpoint(value){
  try{
    if(typeof value!=='string'||value.length>2048)return false;
    const url=new URL(value);
    if(url.protocol!=='https:'||url.username||url.password||url.port)return false;
    const host=url.hostname.toLowerCase();
    return host==='fcm.googleapis.com'
      ||host==='updates.push.services.mozilla.com'
      ||host==='web.push.apple.com'
      ||host.endsWith('.push.apple.com')
      ||host.endsWith('.notify.windows.com')
      ||host.endsWith('.wns.windows.com');
  }catch(_){return false}
}

function validSubscription(subscription){
  if(!subscription||typeof subscription!=='object'||!validPushEndpoint(subscription.endpoint))return false;
  const keys=subscription.keys||{};
  return ['p256dh','auth'].every(key=>typeof keys[key]==='string'&&
    keys[key].length>=12&&keys[key].length<256&&/^[A-Za-z0-9_\-+/=]+$/.test(keys[key]));
}

async function sendChatPush({roomId,roomCode,roomTitle,senderMemberId,senderNickname}){
  try{
    const subs=await supabaseAdminRequest(
      'chat_push_subscriptions?room_id=eq.'+encodeURIComponent(roomId)+
      '&member_id=neq.'+encodeURIComponent(senderMemberId)+
      '&select=id,subscription&order=created_at.desc&limit=100'
    );
    if(!Array.isArray(subs)||subs.length===0)return;
    await getVapidKeys();
    const payload=JSON.stringify({
      title:'복작소 · '+String(roomTitle||'채팅방').slice(0,50),
      body:String(senderNickname||'참여자').slice(0,20)+'님의 새 메시지가 도착했어요.',
      roomCode:String(roomCode||'')
    });
    const batch=20;
    for(let offset=0;offset<subs.length;offset+=batch){
      await Promise.allSettled(subs.slice(offset,offset+batch).map(async row=>{
        if(!validSubscription(row.subscription))return;
        try{
          await webpush.sendNotification(row.subscription,payload,{TTL:60*60,urgency:'normal',timeout:4500});
        }catch(error){
          if((error.statusCode===404||error.statusCode===410)&&row.id){
            await supabaseAdminRequest(
              'chat_push_subscriptions?id=eq.'+encodeURIComponent(row.id),{
                method:'DELETE',headers:{Prefer:'return=minimal'}
              }
            ).catch(()=>{});
          }
        }
      }));
    }
  }catch(error){
    // Message send succeeds even if an external push provider is unavailable.
    console.error('Bokjakso push delivery failed:',error.message);
  }
}

module.exports={getVapidKeys,validSubscription,sendChatPush};
