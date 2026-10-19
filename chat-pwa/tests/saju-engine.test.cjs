"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const regions = require("../saju-birthplaces.js");
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


test("전국 17개 시도에서 경북·경남·충북·충남의 시군을 선택할 수 있다",()=>{
  assert.equal(regions.provinces.length,17);
  const keys=["KR15/고령군","KR11/밀양시","KR08/천안시","KR01/청주시",
    "KR03/철원군","KR06/전주시","KR05/수원시","KR10/군위군"];
  for(const k of keys){
    assert.ok(regions.locations[k],k+" 누락");
    assert.ok(Number.isFinite(regions.locations[k].longitude),k+" 경도 누락");
  }
});
test("경북 고령군 선택 시 실제 만세력 계산에 경도 보정 파라미터가 전달된다",async()=>{
  const calls=[];const lib=library();const original=lib.calculateFourPillars;
  lib.calculateFourPillars=(p)=>{calls.push(p);return original(p);};
  const profile={date:"1973-07-04",time:"18:20",birthplace:"KR15/고령군"};
  const out=await engine.calculate(profile,lib);
  assert.equal(out.input.correctionApplied,true);
  assert.equal(out.input.placeLabel,"경북 고령군");
  assert.equal(calls[0].trueSolarTime.longitude,128.284);
  assert.equal(calls[0].trueSolarTime.applyEquationOfTime,true);
});
test("출생 지역을 모르면 보정하지 않고, 잘못된 지역 값은 거부한다",async()=>{
  const profile={date:"1973-07-04",time:"18:20"};
  const norm=engine.normalize(profile);
  assert.equal(norm.correctionApplied,false);
  assert.throws(()=>engine.normalize({...profile,birthplace:"KR15/없는군"}));
});


// Guided birth interview regression tests: offline rule-based flow (no GPT/API).
const guidedFs=require("node:fs");
const guidedPath=require("node:path");
const guidedHtml=guidedFs.readFileSync(guidedPath.join(__dirname,"../saju-chat.html"),"utf8");
const guidedFirst=guidedHtml.indexOf("function newGuidedPerson()");
const guidedLast=guidedHtml.indexOf("function makeGuidedIntake()",guidedFirst);
const guidedFns=guidedFirst>=0&&guidedLast>guidedFirst
  ?new Function(guidedHtml.slice(guidedFirst,guidedLast)+
    ";return {newGuidedPerson,guidedProfile,guidedDateLabel};")()
  :null;

test("Guided birth interview regression: HTML inline script parses, conversation replaces full form",()=>{
  const begin=guidedHtml.lastIndexOf("<script>");
  const end=guidedHtml.lastIndexOf("</script>");
  assert.ok(begin>=0&&end>begin);
  assert.doesNotThrow(()=>new Function(guidedHtml.slice(begin+8,end)));
  assert.ok(guidedFns);
  assert.match(guidedHtml,/if\(!guidedManualMode\.has\(key\)&&!birthEditing\.has\(key\)\)return makeGuidedIntake\(\)/);
  assert.match(guidedHtml,/case "calendar":/);
  assert.match(guidedHtml,/case "city":/);
  assert.match(guidedHtml,/case "review":/);
});

test("Guided birth interview regression: solar and lunar date values feed the existing saju engine",()=>{
  const p=guidedFns.newGuidedPerson();
  p.calendar="solar";p.year="1973";p.month="07";p.day="04";p.gender="남성";
  p.unknown=false;p.time="18:20";p.birthplace="KR15/고령군";
  const result=guidedFns.guidedProfile(p);
  assert.deepEqual(result,{date:"1973-07-04",calendar:"solar",leap:false,
    gender:"남성",unknown:false,time:"18:20",birthplace:"KR15/고령군",longitude:null});
  assert.match(guidedFns.guidedDateLabel(p),/1973년 7월 4일/);
  p.calendar="lunar";p.leap=true;
  assert.equal(guidedFns.guidedProfile(p).leap,true);
});

test("Guided birth interview regression: unknown time never applies location correction",()=>{
  const p=guidedFns.newGuidedPerson();
  p.calendar="solar";p.year="1988";p.month="11";p.day="02";
  p.unknown=true;p.time="12:30";p.birthplace="KR11/밀양시";
  const result=guidedFns.guidedProfile(p);
  assert.equal(result.time,"");
  assert.equal(result.birthplace,"none");
  assert.equal(result.unknown,true);
  assert.equal(result.longitude,null);
  assert.match(guidedHtml,/태어난 시간 모름/);
  assert.match(guidedHtml,/지역을 잘 몰라요/);
  assert.match(guidedHtml,/← 이전 질문/);
});


test("Saju chat defaults to dark mode on first visit and preserves light preference",()=>{
  assert.match(guidedHtml,/let savedSajuTheme="dark"/);
  assert.match(guidedHtml,/getItem\(sajuThemeKey\)==="light"\?"light":"dark"/);
  assert.match(guidedHtml,/document\.documentElement\.classList\.toggle\("dark",dark\)/);
});
test("AI preview setup is collapsed by default but consent and status remain accessible",()=>{
  assert.match(guidedHtml,/<details class="saju-ai-details" id="aiSettingsDetails">/);
  assert.doesNotMatch(guidedHtml,/<details class="saju-ai-details" id="aiSettingsDetails" open/);
  assert.match(guidedHtml,/<summary aria-label="무료 만세력 및 AI 시험 설정 펼치기 또는 접기">/);
  assert.match(guidedHtml,/id="aiConsent"/);
  assert.match(guidedHtml,/id="aiStatus"/);
  assert.match(guidedHtml,/#chatView\.harin-chat \.saju-ai-details\{display:none\}/);
});


test("Saju result scroll regression: guide and manual confirmations target result heading",()=>{
 const guided=guidedHtml.slice(guidedHtml.indexOf("function makeGuidedIntake()"),guidedHtml.indexOf("function makeIntake()"));
 const manual=guidedHtml.slice(guidedHtml.indexOf("function makeIntake()"),guidedHtml.indexOf("function renderMessages("));
 const renderer=guidedHtml.slice(guidedHtml.indexOf("function renderMessages("),guidedHtml.indexOf("function renderAll("));
 assert.match(guided,/birthProfiles\[key\]=profiles;[\s\S]{0,140}renderMessages\("result"\)/);
 assert.match(manual,/birthProfiles\[key\]=profiles;[\s\S]{0,140}renderMessages\("result"\)/);
 assert.match(renderer,/scrollToEnd==="result"/);
 assert.match(renderer,/feed\.querySelector\("\.intake-card"\)/);
 assert.match(renderer,/feed\.scrollTop=Math\.max\(0,feed\.scrollTop\+offset-12\)/);
 assert.match(renderer,/feed\.scrollTop=scrollToEnd===true\?feed\.scrollHeight:0/);
});


test("Soft welcome regression: fades in complete phrases on initial chat entry only",()=>{
  const renderer=guidedHtml.slice(guidedHtml.indexOf("function renderSoftWelcome("),guidedHtml.indexOf("function renderAll()"));
  const view=guidedHtml.slice(guidedHtml.indexOf("function syncChatView()"),guidedHtml.indexOf("function openHarinWindow()"));
  assert.match(renderer,/text\.split\("\\n"\)/);
  assert.match(renderer,/line\.style\.animationDelay=Math\.min\(index\*850,1700\)/);
  assert.match(renderer,/bubble\.classList\.add\("intro-soft-bubble"\)/);
  assert.match(renderer,/scrollToEnd==="intro"&&conversation\.length===1/);
  assert.match(renderer,/renderSoftWelcome\(bubble,item\.text\)/);
  assert.doesNotMatch(renderer,/typeIntroMessage|requestAnimationFrame\(tick\)|intro-typed-copy/);
  assert.match(renderer,/scrollToEnd==="result"/);
  assert.match(renderer,/feed\.scrollTop=scrollToEnd===true\?feed\.scrollHeight:0/);
  assert.match(view,/const justOpened=open&&!chatPreviouslyOpen/);
  assert.match(view,/if\(justOpened\)\{renderMessages\("intro"\)\}/);
});

test("Soft welcome regression: full text remains accessible and reduced-motion is respected",()=>{
  assert.match(guidedHtml,/\.intro-soft-line\{display:block;white-space:pre-wrap;animation:welcome-soft-fade 1100ms/);
  assert.match(guidedHtml,/@keyframes welcome-soft-fade/);
  assert.match(guidedHtml,/\.intro-soft-line\{animation:none!important\}/);
  assert.match(guidedHtml,/prefers-reduced-motion:reduce/);
  assert.match(guidedHtml,/makeEl\("span","intro-soft-line",lines\[index\]\)/);
  assert.doesNotMatch(guidedHtml,/\"전체 문장 보기\"|intro-skip/);
});


test("Messenger saju intake uses speech bubbles and a bottom quick-choice bar instead of a large card",()=>{
  const guided=guidedHtml.slice(guidedHtml.indexOf("function makeGuidedIntake()"),guidedHtml.indexOf("function makeIntake()"));
  const render=guidedHtml.slice(guidedHtml.indexOf("function renderMessages("),guidedHtml.indexOf("function renderAll("));
  assert.match(guidedHtml,/<div class="guided-quickbar" id="guidedQuickbar"[^>]* hidden><\/div>/);
  assert.match(guided,/const card=makeEl\("div","guided-chat-flow"\)/);
  assert.match(guided,/const quickbar=\$\("guidedQuickbar"\)/);
  assert.match(guided,/quickbar\.append\(controls\)/);
  assert.match(guided,/makeEl\("div","message user"\)/);
  assert.match(guided,/wizard\.replies\.push\(\{question:activeQuestion,answer\}\)/);
  assert.match(guided,/ask\(titlePerson\+" 생일은 양력이세요, 음력이세요\?"/);
  assert.match(guided,/btn\("☀️ 양력"/);
  assert.match(guided,/btn\("🌙 음력"/);
  assert.match(guided,/btn\("잘 모르겠어요"/);
  assert.match(render,/quickbar\.replaceChildren\(\);quickbar\.hidden=true/);
  assert.match(render,/if\(index===0\)feed\.append\(makeIntake\(\)\)/);
});

test("Messenger intake preserves match, answer backtracking and result scroll without toolbar",()=>{
  const guided=guidedHtml.slice(guidedHtml.indexOf("function makeGuidedIntake()"),guidedHtml.indexOf("function makeIntake()"));
  const intake=guidedHtml.slice(guidedHtml.indexOf("function makeIntake()"),guidedHtml.indexOf("function renderSoftWelcome("));
  assert.match(guided,/quickbar\.append\(back\)/);
  assert.match(guided,/wizard\.back\.pop\(\)/);
  assert.match(guided,/wizard\.replies\.push\(\{note:"첫 번째 분의 정보/);
  assert.doesNotMatch(guided,/guided-tools|guided-status|한눈에 입력하기|progressList/);
  assert.doesNotMatch(guidedHtml,/\.guided-quickbar \.guided-tools/);
  assert.match(guidedHtml,/\.guided-quickbar \.guided-error:empty\{display:none\}/);
  assert.match(guided,/birthProfiles\[key\]=profiles;[\s\S]{0,140}renderMessages\("result"\)/);
  assert.match(intake,/if\(!guidedManualMode\.has\(key\)&&!birthEditing\.has\(key\)\)return makeGuidedIntake\(\)/);
  assert.match(guidedHtml,/\.guided-quickbar\[hidden\]\{display:none!important\}/);
});


test("Opening greeting finishes before the next saju question appears",()=>{
  const renderer=guidedHtml.slice(guidedHtml.indexOf("function renderMessages("),guidedHtml.indexOf("function renderAll()"));
  assert.match(renderer,/const sequenceWelcome=animateWelcome&&/);
  assert.match(renderer,/const phraseCount=conversation\[0\]\.text\.split\("\\n"\)\.length/);
  assert.match(renderer,/const greetingMs=Math\.min\(\(phraseCount-1\)\*850,1700\)\+1100\+140/);
  assert.match(renderer,/feed\.classList\.add\("intro-await-question"\)/);
  assert.match(renderer,/quickbar\.classList\.add\("intro-await-question"\)/);
  assert.match(renderer,/quickbar\.inert=true/);
  assert.match(renderer,/quickbar\.setAttribute\("aria-hidden","true"\)/);
  assert.match(renderer,/setTimeout\(\(\)=>\{/);
  assert.match(renderer,/if\(currentRun!==introTypingRun\|\|!feed\.isConnected\|\|location\.hash!=="#chat"\)return/);
  assert.match(renderer,/feed\.classList\.add\("intro-question-enter"\)/);
  assert.match(renderer,/quickbar\.classList\.add\("intro-choices-enter"\)/);
});
test("New saju question and controls reveal gently; re-render or reduced motion skips delay",()=>{
  const renderer=guidedHtml.slice(guidedHtml.indexOf("function renderMessages("),guidedHtml.indexOf("function renderAll()"));
  assert.match(renderer,/quickbar\.inert=false/);
  assert.match(renderer,/feed\.classList\.remove\("intro-await-question","intro-question-enter"\)/);
  assert.match(renderer,/prefers-reduced-motion: reduce/);
  assert.match(guidedHtml,/\.messages\.intro-await-question \.guided-current\{visibility:hidden\}/);
  assert.match(guidedHtml,/\.guided-quickbar\.intro-await-question\{visibility:hidden;pointer-events:none\}/);
  assert.match(guidedHtml,/@keyframes guided-following-fade/);
  assert.match(guidedHtml,/\.guided-quickbar\.intro-choices-enter\{animation:guided-following-fade/);
});


test("Calculated saju results are individual chat bubbles rather than one large card",()=>{
 const results=guidedHtml.slice(guidedHtml.indexOf("function sajuResultRow("),guidedHtml.indexOf("function makeIntake()"));
 const intake=guidedHtml.slice(guidedHtml.indexOf("function makeIntake()"),guidedHtml.indexOf("function renderSoftWelcome("));
 assert.match(results,/const root=makeEl\("div","saju-chat-results"\)/);
 assert.match(results,/root\.append\(sajuResultRow\("user","제 사주를 봐주세요/);
 assert.match(results,/makeEl\("div","message "\+role\+" saju-chat-msg"\)/);
 assert.match(results,/messages\.push\("🔮 "\+label\+"의 사주팔자/);
 assert.match(results,/messages\.push\("🌿 일간과 오행/);
 assert.match(results,/engine\.advisorReading\(chart,topic\[0\],selected\.id\)/);
 assert.match(results,/engine\.flowReading\(chart,flow,topic\[0\]\)/);
 assert.match(results,/engine\.compatibility\(charts\[0\],charts\[1\]\)/);
 assert.match(results,/setTimeout\(next,1000\)/);
 assert.match(results,/root\.append\(actions\)/);
 assert.match(intake,/if\(existing&&!birthEditing\.has\(key\)\)return makeSajuChatResults\(existing,key\)/);
 assert.doesNotMatch(intake,/makeEl\("section","saju-result"\)/);
 assert.match(guidedHtml,/\.saju-chat-results\{display:flex;flex-direction:column/);
});

test("Saju chat re-render shows cached bubbles and does not replay calculation or disclose data to an API",()=>{
 const results=guidedHtml.slice(guidedHtml.indexOf("function sajuResultRow("),guidedHtml.indexOf("function makeIntake()"));
 assert.match(guidedHtml,/const sajuResultCache=Object\.create\(null\)/);
 assert.match(results,/if\(cached\?\.source===profiles\)/);
 assert.match(results,/for\(const message of cached\.messages\)root\.append\(sajuResultRow\("bot",message\)\)/);
 assert.match(results,/sajuResultCache\[key\]=\{source:profiles,messages\}/);
 assert.match(results,/birthProfiles\[key\]===profiles/);
 assert.match(guidedHtml,/delete sajuResultCache\[key\]/);
 assert.doesNotMatch(results,/fetch\(|AI_ENDPOINT|localStorage|sessionStorage/);
 assert.match(results,/edit\.addEventListener\("click",\(\)=>\{birthEditing\.add\(key\);renderMessages\(false\);\}\)/);
});

test("Saju result chat keeps the start-of-result scroll behavior and reduced-motion support",()=>{
 const renderer=guidedHtml.slice(guidedHtml.indexOf("function renderMessages("),guidedHtml.indexOf("function renderAll()"));
 assert.match(renderer,/feed\.querySelector\("\.saju-chat-results"\)\|\|feed\.querySelector\("\.intake-card"\)/);
 assert.match(guidedHtml,/@keyframes saju-chat-reveal/);
 assert.match(guidedHtml,/@media\(prefers-reduced-motion:reduce\)\{\.saju-chat-msg\{animation:none\}/);
 assert.match(guidedHtml,/const reduce=window\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\?\.matches/);
 assert.match(guidedHtml,/if\(!animate\|\|reduce\)\{revealAll\(\);return;\}/);
});


test("Ara emotional support uses a free chat input without the birth-date wizard",()=>{
 const intake=guidedHtml.slice(guidedHtml.indexOf("function makeIntake()"),guidedHtml.indexOf("function renderSoftWelcome("));
 const render=guidedHtml.slice(guidedHtml.indexOf("function renderMessages("),guidedHtml.indexOf("function renderAll("));
 const respond=guidedHtml.slice(guidedHtml.indexOf("async function response("),guidedHtml.indexOf("async function send()"));
 assert.match(guidedHtml,/id:"ara",name:"아라",specialty:"마음·고민 상담",topics:\[\["talk"/);
 assert.match(guidedHtml,/selected\.id==="ara"\?"편안하게 마음을 들려줘/);
 assert.match(intake,/if\(selected\.id==="ara"\)return document\.createDocumentFragment\(\)/);
 assert.match(render,/const ready=selected\.id==="ara"\|\|Boolean\(birthProfiles\[birthKey\(\)\]\)/);
 assert.match(respond,/if\(selected\.id==="ara"\)\{/);
 assert.match(respond,/const payload=\{consent:true,question,advisor:"ara",topic:"talk",\s*chart:null,partner:null,flow:null/);
 assert.match(respond,/if\(aiReady&&aiConsent\.checked\)/);
 assert.match(respond,/지금은 GPT API가 활성화되지 않아/);
});
test("Ara refers technical topics to the correct adviser but listens to emotional worries",()=>{
 const start=guidedHtml.indexOf("function araSpecialistReferral(");
 const end=guidedHtml.indexOf("async function response(",start);
 const referral=new Function(guidedHtml.slice(start,end)+";return araSpecialistReferral;")();
 assert.match(referral("내 사주팔자 오행을 분석해줘"),/도윤/);
 assert.match(referral("궁합 알려줘"),/서윤/);
 assert.match(referral("사업운은 어때"),/지안/);
 assert.equal(referral("연애 때문에 속상하고 마음이 아파"),null);
 assert.equal(referral("돈 때문에 너무 힘들어"),null);
 assert.equal(referral("요즘 마음이 불안해"),null);
});
test("Preview-only Ara API does not require birth data while specialist readings still do",()=>{
 const apiSource=guidedFs.readFileSync(guidedPath.join(__dirname,"../api/saju-ai.js"),"utf8");
 assert.match(apiSource,/const TOPICS = new Set\(\["talk"/);
 assert.match(apiSource,/advisor==="ara"\?\(topic==="talk"\?\(data\.chart!=null/);
 assert.match(apiSource,/\(!chart\|\|topic==="talk"\)/);
 assert.match(apiSource,/마음·인생 고민 대화에 집중하는 상담사/);
 assert.match(apiSource,/감정과 상황을 듣고 공감/);
 assert.match(apiSource,/chart \? "사주팔자 원국/);
 assert.match(apiSource,/process\.env\.VERCEL_ENV==="preview"/);
 assert.match(apiSource,/process\.env\.SAJU_AI_ENABLED==="1"/);
});


test("Advisor selection main uses user chosen four portraits and preserves existing chat view",()=>{
 const sprite=guidedFs.readFileSync(guidedPath.join(__dirname,"../saju-advisor-cards.js"),"utf8");
 const match=sprite.match(/data:image\/webp;base64,([A-Za-z0-9+/=]+)/);
 assert.ok(match,"the portrait sprite must be embedded");
 const bytes=Buffer.from(match[1],"base64");
 assert.equal(bytes.length,6784);
 assert.equal(require("node:crypto").createHash("sha256").update(bytes).digest("hex"),
   "deb95097f29bb41ae58cd54998ed2e80226ac72e1307414d9309eb1c82ed4464");
 assert.match(guidedHtml,/<strong class="saju-main-brand">복작소 사주<\/strong>/);
 assert.match(guidedHtml,/<div class="hero"><h1>상담사 선택<\/h1>/);
 assert.match(guidedHtml,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 for(const id of ["ara","doyun","seoyun","jian"]){
   assert.match(guidedHtml,new RegExp("advisor-card-"+id+"\\{background-position:"));
 }
 assert.match(guidedHtml,/window\.SAJU_CARD_SPRITE\)image\.style\.backgroundImage/);
 assert.match(guidedHtml,/<div id="chatView" class="chat-view" hidden>/);
 assert.match(guidedHtml,/<div class="messages" id="messages"/);
 assert.match(guidedHtml,/<form class="composer" id="composer">/);
});

test("Advisor cards enter existing chat after short animation; voice opens immediately",()=>{
 const cardCode=guidedHtml.slice(guidedHtml.indexOf("function selectAdvisorCard("),guidedHtml.indexOf("function renderTopics()"));
 assert.match(cardCode,/selected=advisor;/);
 assert.match(cardCode,/topic=advisor\.topics\[0\]/);
 assert.match(cardCode,/conversation=read\(\)/);
 assert.match(cardCode,/if\(advisor\.id==="harin"\)\{/);
 assert.match(cardCode,/openHarinWindow\(\)/);
 assert.match(cardCode,/setTimeout\(\(\)=>\{/);
 assert.match(cardCode,/renderAll\(\);\s*openChat\(\)/);
 assert.match(cardCode,/reduced\?0:340/);
 assert.match(cardCode,/a\.name\+" 상담방"/);
 assert.match(cardCode,/따뜻한 마음·인생 상담/);
 assert.match(cardCode,/정통 사주·대운·세운/);
 assert.match(cardCode,/연애운·궁합/);
 assert.match(cardCode,/재물운·사업운/);
 assert.match(guidedHtml,/@media\(prefers-reduced-motion:reduce\)\{body:not\(\.chat-active\) \.selection-view \.avatar/);
});


test("Temporary selected four-portrait image is linked with embedded fallback",()=>{
 const sprite=guidedFs.readFileSync(guidedPath.join(__dirname,"../saju-advisor-cards.js"),"utf8");
 assert.match(sprite,/window\.SAJU_CARD_FALLBACK = window\.SAJU_CARD_SPRITE/);
 assert.match(sprite,/window\.SAJU_CARD_SPRITE = "https:\/\/aicreatortrends\.wordpress\.com\/wp-content\/uploads\/2026\/10\/bokjakso-saju-advisors-temporary\.webp"/);
 assert.match(guidedHtml,/if\(window\.SAJU_CARD_FALLBACK\)image\.style\.backgroundImage\+=",url\("\+window\.SAJU_CARD_FALLBACK\+"\)"/);
 assert.match(guidedHtml,/aspect-ratio:300\/318/);
 assert.match(guidedHtml,/body:not\(\.chat-active\) \.selection-view \.avatar:not\(\.avatar-featured\)/);
});
