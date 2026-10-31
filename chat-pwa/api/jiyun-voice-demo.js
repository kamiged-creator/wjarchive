"use strict";
const crypto=require("node:crypto");
const SAMPLE="안녕하세요. 저는 복작소 지윤 상담사입니다. 오늘은 재물과 사업의 흐름을 차분히 살펴볼게요. 오래된 이야기를 들려드리듯, 하나씩 천천히 말씀드리겠습니다.";
const VOICES={
  coral:"Speak in natural Korean. A warm, calm Korean woman counselor with a gentle smile. Conversational pace, real pauses between sentences, never robotic, no exaggerated mysticism.",
  shimmer:"Speak in natural Korean. A soft, comforting female-sounding Korean advisor. Unhurried but clear, soothing and intimate, not theatrical. Keep a natural conversational rhythm.",
  marin:"Speak in natural Korean. A composed, mature and trustworthy counselor. Calm, refined expression, subtle warmth and natural breathing pauses. Do not over-act."
};
function send(res,status,message){return res.status(status).json({error:message});}
function redisConfig(){
  for(const [url,token] of [
    [process.env.KV_REST_API_URL,process.env.KV_REST_API_TOKEN],
    [process.env.UPSTASH_REDIS_REST_URL,process.env.UPSTASH_REDIS_REST_TOKEN]
  ])if(typeof url==="string"&&/^https:\/\//.test(url)&&typeof token==="string"&&token.length>10)
    return {url:url.replace(/\/$/,""),token};
  return null;
}
async function consumeQuota(req,redis){
  const ip=String(req.headers["x-forwarded-for"]||req.socket?.remoteAddress||"unknown").split(",")[0].trim();
  const day=new Date().toISOString().slice(0,10);
  const who=crypto.createHmac("sha256",redis.token).update(ip).digest("hex");
  async function count(key){
    const url=redis.url+"/incr/"+encodeURIComponent(key);
    const response=await fetch(url,{headers:{Authorization:"Bearer "+redis.token},signal:AbortSignal.timeout(3500)});
    if(!response.ok)throw new Error("quota_storage_unavailable");
    const data=await response.json();
    if(!Number.isSafeInteger(data.result))throw new Error("quota_storage_invalid");
    return data.result;
  }
  // Persistent, fail-closed limits across serverless instances. Testing only.
  if((await count("saju:voice-demo:ip:v1:"+day+":"+who))>6)return false;
  return (await count("saju:voice-demo:global:v1:"+day))<=75;
}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store, private");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Robots-Tag","noindex, nofollow");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return send(res,405,"POST 방식만 지원합니다.");}
  const origin=req.headers.origin;
  if(origin){try{
    const url=new URL(origin);
    if(url.protocol!=="https:"||url.host!==req.headers.host)return send(res,403,"현재 미리보기 사이트에서만 이용할 수 있습니다.");
  }catch(_){return send(res,403,"요청 출처를 확인하지 못했습니다.");}}
  if(process.env.VERCEL_ENV!=="preview"||process.env.SAJU_AI_ENABLED!=="1"||
     !process.env.OPENAI_API_KEY||process.env.OPENAI_API_KEY.length<20)
    return send(res,503,"음성 시험 API가 미리보기 환경에 아직 설정되지 않았습니다.");
  const redis=redisConfig();
  if(!redis)return send(res,503,"음성 시험의 사용량 제한 저장소가 설정되지 않았습니다.");
  if(Number(req.headers["content-length"]||0)>400)return send(res,413,"요청이 너무 큽니다.");
  const input=typeof req.body==="string"?(()=>{try{return JSON.parse(req.body)}catch(_){return null}})():req.body;
  const voice=input&&typeof input==="object"&&!Array.isArray(input)?input.voice:null;
  if(typeof voice!=="string"||!Object.hasOwn(VOICES,voice))return send(res,400,"지원하지 않는 목소리입니다.");
  try{if(!await consumeQuota(req,redis))return send(res,429,"오늘 음성 미리듣기 횟수가 모두 사용되었습니다.");}
  catch(_){return send(res,503,"사용량 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.");}
  try{
    const upstream=await fetch("https://api.openai.com/v1/audio/speech",{
      method:"POST",
      headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({model:"gpt-4o-mini-tts",voice,input:SAMPLE,instructions:VOICES[voice],response_format:"mp3",speed:1}),
      signal:AbortSignal.timeout(25000)
    });
    if(!upstream.ok){
      console.error("Jiyun voice demo upstream HTTP",upstream.status);
      return send(res,502,"AI 목소리를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    const bytes=Buffer.from(await upstream.arrayBuffer());
    if(!bytes.length||bytes.length>1800000)return send(res,502,"생성된 음성 데이터를 읽지 못했습니다.");
    res.setHeader("Content-Type","audio/mpeg");
    res.setHeader("Content-Length",String(bytes.length));
    return res.status(200).send(bytes);
  }catch(error){
    console.error("Jiyun voice demo request failed",error?.name||"error");
    return send(res,504,"음성 생성 연결이 지연됐습니다. 잠시 후 다시 시도해 주세요.");
  }
};
