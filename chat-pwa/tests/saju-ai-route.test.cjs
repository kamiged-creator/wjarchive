"use strict";
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const path=require("node:path");
const handler=require("../api/saju-ai.js");
const originalFetch=global.fetch;
const old={VERCEL_ENV:process.env.VERCEL_ENV,SAJU_AI_ENABLED:process.env.SAJU_AI_ENABLED,
  OPENAI_API_KEY:process.env.OPENAI_API_KEY,SAJU_AI_TEST_PIN:process.env.SAJU_AI_TEST_PIN};
function configure(){
  process.env.VERCEL_ENV="preview";
  process.env.SAJU_AI_ENABLED="1";
  process.env.OPENAI_API_KEY="sk-local-test-not-a-real-secret-1234";
  process.env.SAJU_AI_TEST_PIN="demo-test-pin-123";
}
function mockReq(method="POST",body={},headers={}){
  return {method,body,query:{},headers:{"host":"preview.example.vercel.app","origin":"https://preview.example.vercel.app",
    "x-saju-test-pin":"demo-test-pin-123","x-forwarded-for":"test-ip-"+Math.random(),...headers}};
}
function mockRes(){
  return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this;},
    status(s){this.statusCode=s;return this;},json(data){this.payload=data;return this;},end(){return this;}};
}
const validChart={pillars:{year:"임신",month:"경술",day:"계유",hour:"을묘"},dayMaster:{stem:"계"},
  elements:{목:1,화:0,토:2,금:3,수:2}};
const sample={consent:true,advisor:"ara",topic:"saju",question:"나의 강점을 알려줘",
  chart:validChart,flow:{year:"병오",day:"을축"},history:[]};
test.after(()=>{
  global.fetch=originalFetch;
  for(const [k,v] of Object.entries(old)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
test("API is disabled outside preview even if all credentials exist",async()=>{
  configure();process.env.VERCEL_ENV="production";
  const r=mockRes();await handler(mockReq("GET",{}),Object.assign(r,{query:{}})); // GET status=1 below
  const status=mockRes();await handler({...mockReq("GET"),query:{status:"1"}},status);
  assert.equal(status.payload.ready,false);
  const blocked=mockRes();await handler(mockReq("POST",sample),blocked);
  assert.equal(blocked.statusCode,503);
});
test("API needs explicit feature flag",async()=>{
  configure();delete process.env.SAJU_AI_ENABLED;
  const r=mockRes();await handler({...mockReq("GET"),query:{status:"1"}},r);
  assert.equal(r.payload.ready,false);
});
test("status becomes ready for opted-in private preview setup",async()=>{
  configure();const r=mockRes();await handler({...mockReq("GET"),query:{status:"1"}},r);
  assert.equal(r.statusCode,200);assert.equal(r.payload.ready,true);
  assert.equal(r.headers["Cache-Control"].includes("no-store"),true);
});
test("cross-origin requests rejected before any paid API call",async()=>{
  configure();const r=mockRes();
  await handler(mockReq("POST",sample,{origin:"https://attacker.example.com"}),r);
  assert.equal(r.statusCode,403);
});
test("incorrect PIN rejected without using OpenAI",async()=>{
  configure();const r=mockRes();
  global.fetch=async()=>{throw Error("should not reach upstream");};
  await handler(mockReq("POST",sample,{"x-saju-test-pin":"wrong"}),r);
  assert.equal(r.statusCode,403);
});
test("explicit consent required",async()=>{
  configure();const r=mockRes();
  await handler(mockReq("POST",{...sample,consent:false}),r);
  assert.equal(r.statusCode,400);
});
test("birth date and input time never included in generated model context",async()=>{
  configure();let sent;
  global.fetch=async(url,options)=>{
    assert.equal(url,"https://api.openai.com/v1/chat/completions");
    sent=JSON.parse(options.body);
    return {ok:true,json:async()=>({choices:[{message:{content:"일상에서 실천해 볼 작은 변화부터 시작해 봐."}}]})};
  };
  const r=mockRes();
  await handler(mockReq("POST",{...sample,chart:{...sample.chart,date:"1973-07-04",
    time:"18:20",input:{enteredDate:"1973-07-04",time:"18:20"}},date:"1973-07-04"}),r);
  assert.equal(r.statusCode,200);
  assert.equal(r.payload.mode,"ai");
  assert.equal(sent.model,"gpt-4.1-mini");
  assert.equal(sent.store,false);
  assert.ok(sent.max_completion_tokens<=450);
  assert.equal(JSON.stringify(sent).includes("1973-07-04"),false);
  assert.equal(JSON.stringify(sent).includes("18:20"),false);
  assert.equal(JSON.stringify(sent).includes("demo-test-pin-123"),false);
  assert.equal(JSON.stringify(sent).includes("sk-local-test"),false);
});
test("invalid pillars and fake element counts are rejected",async()=>{
  configure();
  for(const chart of [{...validChart,pillars:{...validChart.pillars,day:"NO"}},
    {...validChart,elements:{...validChart.elements,목:8}},
    {...validChart,dayMaster:{stem:"병"}}]){
    const r=mockRes();
    await handler(mockReq("POST",{...sample,chart}),r);
    assert.equal(r.statusCode,400);
  }
});
test("partner is mandatory for compatibility",async()=>{
  configure();const r=mockRes();
  await handler(mockReq("POST",{...sample,topic:"match"}),r);
  assert.equal(r.statusCode,400);
});
test("frontend always asks for consent and sends sanitized chart only",()=>{
 const html=readFileSync(path.join(__dirname,"..","saju-chat.html"),"utf8");
 assert.match(html,/id="aiConsent" disabled/);
 assert.match(html,/chart:aiChart\(chart\)/);
 assert.match(html,/partner:partner\?aiChart\(partner\):null/);
 assert.match(html,/if\(aiReady && aiConsent.checked\)/);
 assert.match(html,/📜 기본 만세력 풀이/);
 assert.doesNotMatch(html,/sk-proj-/);
});
