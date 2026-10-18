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

test("진태양시 보정은 출생 지역을 명시적으로 선택했을 때만 적용한다", async()=>{
  const params=[];
  const lib=library(),base=lib.calculateFourPillars;
  lib.calculateFourPillars=(p)=>{params.push(p);return base(p);};
  const baseProfile={date:"1973-07-04",calendar:"solar",time:"18:20",gender:"남성"};
  const defaultChart=await engine.calculate(baseProfile,lib);
  assert.equal(defaultChart.input.correctionApplied,false);
  assert.equal(params[0].trueSolarTime,undefined);
  params.length=0;
  const corrected=await engine.calculate({...baseProfile,birthplace:"daegu"},lib);
  assert.equal(corrected.input.correctionApplied,true);
  assert.equal(corrected.input.placeLabel,"대구");
  assert.equal(params[0].trueSolarTime.longitude,128.6014);
  assert.equal(params[0].trueSolarTime.applyEquationOfTime,true);
  assert.equal(params[0].trueSolarTime.applyHistoricalDst,true);
});
test("지역 경도 직접 입력은 한국 범위 외 값을 거부한다",()=>{
  for(const longitude of ["",null,-10,123.9,132.1,"abc"]){
    assert.throws(()=>engine.normalize({date:"1973-07-04",time:"18:20",birthplace:"custom",longitude}));
  }
  const profile=engine.normalize({date:"1973-07-04",time:"18:20",birthplace:"custom",longitude:128.75});
  assert.equal(profile.longitude,128.75);
});
test("출생 시간을 모르면 선택된 지역으로 시주를 임의 보정하지 않는다",async()=>{
  const params=[];
  const lib=library(),base=lib.calculateFourPillars;
  lib.calculateFourPillars=(p)=>{params.push(p);return base(p);};
  const r=await engine.calculate({date:"1973-07-04",unknown:true,birthplace:"seoul"},lib);
  assert.equal(r.pillars.hour,null);
  assert.equal(r.input.correctionApplied,false);
  assert.ok(params.every(p=>p.trueSolarTime===undefined));
});
test("세운과 일진은 지정한 한국 날짜의 정오 계산을 사용한다",async()=>{
  const params=[],lib=library(),base=lib.calculateFourPillars;
  lib.calculateFourPillars=(p)=>{params.push(p);return base(p);};
  const natal=await engine.calculate({date:"1992-10-24",time:"05:30"},lib);
  const flow=await engine.calculateFlows(natal,lib,"2026-10-18");
  assert.equal(flow.date,"2026-10-18");
  assert.equal(flow.year,"을사");
  assert.equal(flow.day,"계유");
  assert.equal(flow.basis,"한국 표준시 정오 기준");
  assert.equal(params.at(-1).hour,12);
  assert.equal(params.at(-1).minute,0);
  assert.equal(params.at(-1).trueSolarTime,undefined);
  assert.match(engine.flowReading(natal,flow,"daily"),/오늘 일진/);
  assert.match(engine.flowReading(natal,flow,"daily"),/올해 세운/);
});
test("일진 계산은 존재하지 않는 날짜를 거부한다",async()=>{
  const lib=library();
  const natal=await engine.calculate({date:"1992-10-24",time:"05:30"},lib);
  await assert.rejects(engine.calculateFlows(natal,lib,"2026-02-30"));
  await assert.rejects(engine.calculateFlows(natal,lib,"2026-13-01"));
  await assert.rejects(engine.calculateFlows(natal,lib,"foo"));
});

test("궁합은 두 사람의 실제 일간 오행을 비교하며 점수·예언을 만들지 않는다",async()=>{
  const first=await engine.calculate({date:"1992-10-24",calendar:"solar",time:"05:30"},library());
  const second=await engine.calculate({date:"1992-05-04",calendar:"solar",time:"09:15"},library());
  const out=engine.compatibility(first,second);
  assert.match(out,/본인 일간 계\(수\)/);
  assert.match(out,/상대 일간 계\(수\)/);
  assert.match(out,/같은 오행/);
  assert.match(out,/예측하지 않아/);
  assert.doesNotMatch(out,/100점|\d+점/);
});
test("두 번째 사람의 사주 없이 궁합을 생성하지 않는다",async()=>{
  const chart=await engine.calculate({date:"1992-10-24",calendar:"solar",time:"05:30"},library());
  assert.throws(()=>engine.compatibility(chart,null));
});

test("네 상담사는 실제 계산 결과를 바탕으로 다른 톤으로 풀이한다",async()=>{
  const chart=await engine.calculate({date:"1992-10-24",calendar:"solar",time:"05:30"},library());
  const cases=[
    ["ara","아라 · 따뜻한 상담"],["doyun","도윤 · 정통 사주 구조 해설"],
    ["seoyun","서윤 · 관계와 연애 상담"],["jian","지안 · 재물과 직장·사업 상담"]
  ];
  const outputs=cases.map(([key,expected])=>{
    const result=engine.advisorReading(chart,"saju",key);
    assert.ok(result.includes(expected));
    assert.ok(result.includes("계(수)"));
    assert.ok(result.includes("예측하지 않아"));
    return result;
  });
  assert.equal(new Set(outputs).size,4);
});
test("지안은 재물과 직장 질문에 맞는 서로 다른 실천 관점을 제공한다",async()=>{
  const chart=await engine.calculate({date:"1992-10-24",calendar:"solar",time:"05:30"},library());
  const wealth=engine.advisorReading(chart,"wealth","jian");
  const career=engine.advisorReading(chart,"career","jian");
  assert.match(wealth,/고정 지출과 위험 허용 범위/);
  assert.match(career,/업무와 성장 목표/);
  assert.doesNotMatch(wealth,/반드시 돈을 벌|투자 성공/);
});
test("출생 시각이 없으면 도윤도 시주를 추측해서 보여주지 않는다",async()=>{
  const chart=await engine.calculate({date:"1992-10-24",calendar:"solar",unknown:true},library());
  const out=engine.advisorReading(chart,"saju","doyun");
  assert.match(out,/시주 미상/);
  assert.match(out,/여섯 글자/);
});
test("잘못된 계산 객체에는 상담 결과를 만들지 않는다",()=>{
  assert.throws(()=>engine.advisorReading({}, "saju", "ara"));
});

test("실제 역법 계산을 통과한 생년월일만 확인한다",async()=>{
  const profile={date:"1992-10-24",calendar:"solar",time:"05:30"};
  const result=await engine.validateProfiles([profile],library(),"2026-10-18");
  assert.equal(result.length,1);
  assert.equal(result[0].pillars.day,"계유");
});
test("두 명 모두 유효해야 궁합용 생일 입력이 확인된다",async()=>{
  const one={date:"1992-10-24",calendar:"solar",time:"05:30"};
  const two={date:"2020-04-01",calendar:"lunar",leap:true,time:"12:00"};
  const result=await engine.validateProfiles([one,two],library(),"2026-10-18");
  assert.equal(result.length,2);
  assert.equal(result[1].solarDate,"2020-05-23");
});
test("음력 윤달이 실제 존재하지 않으면 입력 확인을 차단한다",async()=>{
  const lib=library();
  const real=lib.calculateFourPillars;
  lib.calculateFourPillars=(params)=>{
    if(params.isLunar&&params.isLeapMonth)throw new RangeError("존재하지 않는 윤달");
    return real(params);
  };
  const invalid={date:"2021-04-01",calendar:"lunar",leap:true,time:"12:00"};
  await assert.rejects(engine.validateProfiles([invalid],lib,"2026-10-18"));
});
test("미래의 양력 및 변환된 미래 음력 날짜는 입력 확인을 차단한다",async()=>{
  const futureSolar={date:"2026-10-19",calendar:"solar",time:"12:00"};
  await assert.rejects(engine.validateProfiles([futureSolar],library(),"2026-10-18"));
  const lib=library();
  lib.lunarToSolar=()=>({year:2026,month:10,day:19});
  const futureLunar={date:"2026-09-01",calendar:"lunar",time:"12:00"};
  await assert.rejects(engine.validateProfiles([futureLunar],lib,"2026-10-18"));
});
test("빈 입력 또는 세 명 이상의 입력은 계산하지 않는다",async()=>{
  const sample={date:"1992-10-24",calendar:"solar",time:"05:30"};
  await assert.rejects(engine.validateProfiles([],library(),"2026-10-18"));
  await assert.rejects(engine.validateProfiles([sample,sample,sample],library(),"2026-10-18"));
});
