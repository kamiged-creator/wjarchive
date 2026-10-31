"use strict";
// Preview-only TTS of an existing Jiyun interpretation, never the date of birth.
// The voice is fixed to the second option (shimmer) chosen in the listening studio.
const crypto=require("node:crypto");
const MAX_CHARACTERS=3300;
const INSTRUCTIONS="Speak in natural Korean. A soft, comforting female-sounding Korean advisor. Unhurried but clear, soothing and intimate, not theatrical. Keep a natural conversational rhythm.";
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
    const response=await fetch(redis.url+"/incr/"+encodeURIComponent(key),{
      headers:{Authorization:"Bearer "+redis.token},
      signal:AbortSignal.timeout(3500)
    });
    if(!response.ok)throw new Error("quota_storage_unavailable");
    const data=await response.json();
    if(!Number.isSafeInteger(data.result))throw new Error("quota_storage_invalid");
    return data.result;
  }
  // Small, persistent daily budgets; deny on Redis failure. Key scoped to preview feature.
  if((await count("saju:jiyun-voice:ip:v1:"+day+":"+who))>4)return false;
  return (await count("saju:jiyun-voice:global:v1:"+day))<=35;
}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store, private");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Robots-Tag","noindex, nofollow");
  res.setHeader("Referrer-Policy","no-referrer");
  if(req.method!=="POST"){res.setHeader("Allow","POST");return send(res,405,"POST 방식만 지원합니다.");}
  if(req.headers["sec-fetch-site"]&&req.headers["sec-fetch-site"]!=="same-origin")
    return send(res,403,"현재 미리보기 페이지에서만 이용할 수 있습니다.");
  const origin=req.headers.origin;
  if(origin){try{
    const url=new URL(origin);
    if(url.protocol!=="https:"||url.host!==req.headers.host)return send(res,403,"현재 미리보기 페이지에서만 이용할 수 있습니다.");
  }catch(_){return send(res,403,"요청 출처를 확인하지 못했습니다.");}}
  if(process.env.VERCEL_ENV!=="preview"||process.env.SAJU_AI_ENABLED!=="1"||
     typeof process.env.OPENAI_API_KEY!=="string"||process.env.OPENAI_API_KEY.length<20)
    return send(res,503,"AI 음성이 미리보기 환경에 설정되지 않았습니다.");
  const redis=redisConfig();
  if(!redis)return send(res,503,"음성 사용량 제한 저장소가 설정되지 않았습니다.");
  if(Number(req.headers["content-length"]||0)>14000)return send(res,413,"풀이 글이 너무 깁니다.");
  const input=typeof req.body==="string"?(()=>{try{return JSON.parse(req.body);}catch(_){return null;}})():req.body;
  const raw=input&&typeof input==="object"&&!Array.isArray(input)?input.text:null;
  if(typeof raw!=="string")return send(res,400,"풀이 글을 확인하지 못했습니다.");
  // Text-only: never accept caller-provided voices, instructions or model selection.
  const text=raw.normalize("NFC").replace(/\s+/g," ").trim();
  if(text.length<15||text.length>MAX_CHARACTERS)return send(res,400,"풀이 글 길이는 15~3300자까지 지원합니다.");
  try{
    if(!await consumeQuota(req,redis))return send(res,429,"오늘 AI 음성 생성 횟수를 모두 사용했습니다.");
  }catch(_){return send(res,503,"음성 사용량을 확인할 수 없습니다.");}
  try{
    const upstream=await fetch("https://api.openai.com/v1/audio/speech",{
      method:"POST",
      headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"gpt-4o-mini-tts",
        voice:"shimmer",
        input:text,
        instructions:INSTRUCTIONS,
        response_format:"mp3",
        speed:1
      }),
      signal:AbortSignal.timeout(40000)
    });
    if(!upstream.ok){
      // Never print the sent reading or upstream error body (may contain user text).
      console.error("Jiyun reading voice upstream HTTP",upstream.status);
      return send(res,502,"AI 음성 생성이 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
    const bytes=Buffer.from(await upstream.arrayBuffer());
    if(!bytes.length||bytes.length>6500000)return send(res,502,"음성 데이터가 올바르지 않습니다.");
    res.setHeader("Content-Type","audio/mpeg");
    res.setHeader("Content-Length",String(bytes.length));
    return res.status(200).send(bytes);
  }catch(error){
    console.error("Jiyun reading voice request failed",error?.name||"error");
    return send(res,504,"AI 음성 생성이 지연되었습니다. 다시 시도해 주세요.");
  }
};
