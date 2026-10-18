"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../saju-engine.js");
function library({boundary=false}={}) {
  return {
    calculateFourPillars(params) {
      let year=params.hour===0&&boundary?"갑진":"을사";
      return {
        toObject(){return {year,month:"경술",day:"계유",hour:"을묘"};},
        toHanjaObject(){return {year:{hanja:"乙巳"},month:{hanja:"庚戌"},day:{hanja:"癸酉"},hour:{hanja:"乙卯"}};},
        dayYinYang:{stem:"음"},
        tenGods:{year:{stem:"상관"}},
        luckPillars:{pillars:[{age:8,korean:"임오"}]}
      };
    },
    lunarToSolar(year,month,day,leap){
      assert.equal(leap,true);
      return {year:2020,month:5,day:23};
    },
    solarToLunar(){return {year:2020,month:4,day:1,isLeapMonth:true};}
  };
}
test("양력 생시 입력은 4주/오행 8글자를 표시한다",async()=>{
  const r=await engine.calculate({date:"1992-10-24",calendar:"solar",unknown:false,time:"05:30",gender:"남성"},library());
  assert.deepEqual(Object.keys(r.pillars),["year","month","day","hour"]);
  assert.equal(r.pillars.day,"계유");
  assert.equal(r.hanja.day,"癸酉");
  assert.equal(r.dayMaster.element,"수");
  assert.equal(Object.values(r.elements).reduce((a,b)=>a+b,0),8);
  assert.match(engine.format(r),/시주 을묘/);
  assert.match(engine.reading(r,"wealth"),/재물/);
});
test("출생 시간을 모르면 시주를 만들지 않는다",async()=>{
  const r=await engine.calculate({date:"1992-10-24",calendar:"solar",unknown:true},library());
  assert.equal(r.pillars.hour,null);
  assert.equal(Object.values(r.elements).reduce((a,b)=>a+b,0),6);
  assert.match(engine.format(r),/시주 미상/);
  assert.equal(r.luckPillars,null);
});
test("절기 경계에 출생 시간이 누락되면 연주 변경 가능성 알림",async()=>{
  const r=await engine.calculate({date:"2025-02-03",calendar:"solar",unknown:true},library({boundary:true}));
  assert.ok(r.uncertain.includes("year"));
  assert.match(engine.format(r),/출생시각에 따라/);
});
test("음력 윤달 입력을 변환하고 입력을 변경하지 않는다",async()=>{
  const original={date:"2020-04-01",calendar:"lunar",leap:true,time:"12:30"};
  const r=await engine.calculate(original,library());
  assert.equal(r.solarDate,"2020-05-23");
  assert.equal(original.date,"2020-04-01");
  assert.equal(r.input.calendar,"음력");
});
test("존재하지 않는 날짜·시간을 거부한다",async()=>{
  for(const entry of [
    {date:"2026-02-30",calendar:"solar",time:"12:00"},
    {date:"2026-13-01",calendar:"solar",time:"12:00"},
    {date:"2020-01-01",calendar:"solar",time:"24:10"},
    {date:"2020-01-01",calendar:"solar",time:"25:10"},
    {date:"abc",calendar:"solar"}
  ])await assert.rejects(engine.calculate(entry,library()));
});
