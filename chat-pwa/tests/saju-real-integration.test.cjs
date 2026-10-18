"use strict";
// This suite must be run with the real, pinned calculator; a fake is not accepted.
// Preparation (in chat-pwa/): npm install --no-save manseryeok@2.0.0
// Run: node --test tests/saju-real-integration.test.cjs
const {test}=require("node:test");
const assert=require("node:assert/strict");
const lib=require("manseryeok");
const engine=require("../saju-engine.js");
function pillars(input){return lib.calculateFourPillars(input).toObject();}
function koreaWall(instant){
  const date=new Date(instant.getTime()+9*60*60*1000);
  return {year:date.getUTCFullYear(),month:date.getUTCMonth()+1,day:date.getUTCDate(),
    hour:date.getUTCHours(),minute:date.getUTCMinutes()};
}
test("원본 공개 사례: 1992-10-24 05:30 양력 사주팔자",async()=>{
  const original=pilars1992();
  assert.deepEqual(original,{year:"임신",month:"경술",day:"계유",hour:"을묘"});
  const chart=await engine.calculate({date:"1992-10-24",calendar:"solar",time:"05:30"},lib);
  assert.deepEqual(chart.pillars,original);
  assert.equal(chart.hanja.day,"癸酉");
  assert.equal(chart.dayMaster.stem,"계");
});
function pilars1992(){return pillars({year:1992,month:10,day:24,hour:5,minute:30});}
test("같은 날의 음력 생일은 같은 네 기둥",async()=>{
  const solar=await engine.calculate({date:"1992-10-24",calendar:"solar",time:"05:30"},lib);
  const lunar=await engine.calculate({date:"1992-09-29",calendar:"lunar",time:"05:30"},lib);
  assert.equal(lunar.solarDate,"1992-10-24");
  assert.deepEqual(lunar.pillars,solar.pillars);
});
test("윤4월1일은 2020-05-23으로 환산",async()=>{
  assert.deepEqual(lib.lunarToSolar(2020,4,1,true),{year:2020,month:5,day:23});
  const leap=await engine.calculate({date:"2020-04-01",calendar:"lunar",leap:true,time:"12:00"},lib);
  assert.equal(leap.solarDate,"2020-05-23");
  assert.deepEqual(leap.pillars,pillars({year:2020,month:5,day:23,hour:12,minute:0}));
});
test("존재하지 않는 윤달은 실제 달력 단계에서 오류",async()=>{
  await assert.rejects(()=>engine.calculate({date:"2021-04-01",calendar:"lunar",leap:true,time:"12:00"},lib));
});
test("2024년 입춘 절입 전후는 연주·월주가 달라진다",()=>{
  const instant=lib.getSolarTerm(2024,2).date;
  const before=koreaWall(new Date(instant.getTime()-120000));
  const after=koreaWall(new Date(instant.getTime()+120000));
  assert.notEqual(pillars(before).year,pillars(after).year);
  assert.notEqual(pillars(before).month,pillars(after).month);
});
test("오늘과 올해의 간지는 실제 계산기와 같고 1월1일에 강제로 변경되지 않는다",async()=>{
  const natal=await engine.calculate({date:"1992-10-24",calendar:"solar",time:"05:30"},lib);
  const today=await engine.calculateFlows(natal,lib,"2026-10-18");
  const expected=pillars({year:2026,month:10,day:18,hour:12,minute:0});
  assert.equal(today.year,expected.year);
  assert.equal(today.day,expected.day);
  const jan=await engine.calculateFlows(natal,lib,"2026-01-01");
  const late=await engine.calculateFlows(natal,lib,"2026-02-10");
  assert.notEqual(jan.year,late.year);
});
test("출생시각 미상에는 시주를 표시하지 않는다",async()=>{
  const unknown=await engine.calculate({date:"1973-07-04",calendar:"solar",unknown:true},lib);
  assert.equal(unknown.pillars.hour,null);
  assert.equal(Object.values(unknown.elements).reduce((a,b)=>a+b,0),6);
});
test("출생지 시간 보정은 opt-in이며 실제 엔진의 계산 결과에 일치",async()=>{
  const p={date:"1973-07-04",calendar:"solar",time:"18:20",birthplace:"daegu"};
  const c=await engine.calculate(p,lib);
  const corrected=lib.calculateFourPillars({
    year:1973,month:7,day:4,hour:18,minute:20,
    isLunar:false,isLeapMonth:false,dayBoundary:"midnight",
    trueSolarTime:{longitude:128.6014,applyEquationOfTime:true,applyHistoricalDst:true}
  }).toObject();
  assert.equal(c.input.correctionApplied,true);
  assert.deepEqual(c.pillars,corrected);
});
