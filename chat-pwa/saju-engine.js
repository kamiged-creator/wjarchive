(function (root) {
  "use strict";
  // Runtime dependency is pinned. This browser-only adapter sends no birth data
  // to the CDN; the imported calculation runs locally in the user's browser.
  const ENGINE_URL = "https://esm.sh/manseryeok@2.0.0?bundle";
  const STEM_ELEMENT = {갑:"목",을:"목",병:"화",정:"화",무:"토",기:"토",경:"금",신:"금",임:"수",계:"수"};
  const BRANCH_ELEMENT = {자:"수",축:"토",인:"목",묘:"목",진:"토",사:"화",오:"화",미:"토",신:"금",유:"금",술:"토",해:"수"};
  const STEM_CHARACTER = {
    갑:"새롭게 시작하고 방향을 세우려는 나무의 상징",
    을:"유연하게 관계를 잇고 자라나는 풀의 상징",
    병:"밝게 드러내고 추진하는 태양의 상징",
    정:"섬세하게 살피고 이어 가는 등불의 상징",
    무:"중심을 잡고 안정시키는 큰 산의 상징",
    기:"살피고 가꾸며 축적하는 밭의 상징",
    경:"원칙을 세우고 결단하는 단단한 금속의 상징",
    신:"세밀하게 다듬고 분별하는 보석의 상징",
    임:"넓게 흐르고 연결하는 큰 물의 상징",
    계:"작은 변화에 반응하며 스며드는 비의 상징"
  };
  const SUBJECT_NOTE = {
    saju:"연주·월주·일주·시주를 함께 보되, 전통 해석에서 일간은 자기 자신을 상징하고 월주는 계절적 배경으로 읽어.",
    daily:"오늘 운세를 따로 단정하려면 오늘의 일진과 원국 관계를 추가로 살펴야 해. 아래는 태어난 사주의 기본 토대야.",
    decade:"대운은 성별·출생시각과 절기 경계를 함께 적용하는 전통 계산이야. 대운 표가 있으면 흐름을 참고하되 미래를 확정하는 예측으로 받아들이지 마.",
    match:"두 사람의 사주를 비교하더라도 실제 관계는 성격과 대화, 선택에 달려 있어. 아래 계산은 두 사람의 기본 사주 자료야.",
    love:"연애운은 한 가지 글자만으로 결정되지 않아. 일간과 사주 전체 배치를 바탕으로 관계에서 중요하게 여길 가치를 탐색할 수 있어.",
    wealth:"재물·사업운은 사주만으로 수입이나 투자 결과를 예측할 수 없어. 일간과 오행 구성을 전통적 성향의 참고자료로 봐.",
    career:"직업이나 사업 성과는 사주만으로 정해지지 않아. 일간과 오행 구성은 선택과 강점을 되돌아보는 참고자료야."
  };
  let modulePromise;
  function loadEngine() {
    if (!modulePromise) modulePromise = import(ENGINE_URL).catch(function (error) {
      modulePromise = null;
      throw new Error("만세력 계산 모듈을 불러오지 못했어. 인터넷 연결을 확인한 뒤 다시 시도해 줘.");
    });
    return modulePromise;
  }
  function pad(n) { return String(n).padStart(2,"0"); }
  function normalize(profile) {
    if (!profile || typeof profile !== "object") throw new Error("생년월일을 먼저 입력해 줘.");
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(profile.date || "");
    if (!match) throw new Error("생년월일은 연도·월·일을 모두 입력해 줘.");
    const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
    const isLunar=profile.calendar==="lunar";
    const isLeapMonth=isLunar && profile.leap===true;
    if (year<1900 || year>2100 || month<1 || month>12 || day<1 || day>(isLunar?30:31)) {
      throw new Error("지원되는 출생 날짜는 1900~2100년 범위야.");
    }
    if (!isLunar && new Date(Date.UTC(year,month,0)).getUTCDate()<day) {
      throw new Error("존재하지 않는 양력 날짜야. 월과 일을 확인해 줘.");
    }
    const unknown=profile.unknown===true || !profile.time;
    let hour=12, minute=0;
    if (!unknown) {
      const time=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(profile.time);
      if (!time) throw new Error("태어난 시간은 00:00~23:59 형식으로 입력해 줘.");
      hour=Number(time[1]);minute=Number(time[2]);
    }
    const gender=profile.gender==="남성"?"male":profile.gender==="여성"?"female":null;
    return {year,month,day,hour,minute,isLunar,isLeapMonth,unknown,gender,calendar:isLunar?"음력":"양력"};
  }
  function isPillar(value) { return typeof value==="string" && /^[가-힣]{2}$/.test(value); }
  async function calculate(profile, injectedLibrary) {
    const input=normalize(profile);
    const lib=injectedLibrary || await loadEngine();
    if (!lib || typeof lib.calculateFourPillars!=="function") {
      throw new Error("만세력 모듈의 계산 기능을 찾지 못했어.");
    }
    const params={
      year:input.year,month:input.month,day:input.day,hour:input.hour,minute:input.minute,
      isLunar:input.isLunar,isLeapMonth:input.isLeapMonth,dayBoundary:"midnight"
    };
    if (input.gender) params.gender=input.gender;
    let result;
    try { result=lib.calculateFourPillars(params); }
    catch (error) { throw new Error("만세력 계산에 실패했어. 음력 윤달 여부와 날짜를 다시 확인해 줘."); }
    const objects=result.toObject();
    if (!objects || !["year","month","day","hour"].every(k=>isPillar(objects[k]))) {
      throw new Error("만세력 계산 결과 형식이 올바르지 않아.");
    }
    const pillars={year:objects.year,month:objects.month,day:objects.day,hour:input.unknown?null:objects.hour};
    const hanja=typeof result.toHanjaObject==="function"?result.toHanjaObject():{};
    const elements={목:0,화:0,토:0,금:0,수:0};
    for (const value of Object.values(pillars)) {
      if (!value) continue;
      const stem=STEM_ELEMENT[value[0]],branch=BRANCH_ELEMENT[value[1]];
      if (stem) elements[stem]++;
      if (branch) elements[branch]++;
    }
    const master=pillars.day[0];
    let solar=input.isLunar?null:{year:input.year,month:input.month,day:input.day};
    let lunar=null;
    if (input.isLunar) {
      if (typeof lib.lunarToSolar!=="function") throw new Error("음력 변환 기능을 사용할 수 없어.");
      solar=lib.lunarToSolar(input.year,input.month,input.day,input.isLeapMonth);
    }
    if (typeof lib.solarToLunar==="function") {
      try { lunar=lib.solarToLunar(solar.year,solar.month,solar.day); }
      catch (_) { /* Optional display data only. */ }
    }
    const uncertain=[];
    if (input.unknown) {
      const earliest=lib.calculateFourPillars({...params,hour:0,minute:0}).toObject();
      const latest=lib.calculateFourPillars({...params,hour:23,minute:59}).toObject();
      for (const key of ["year","month","day"]) {
        if (earliest[key]!==latest[key]) uncertain.push(key);
      }
    }
    const solarDate=[solar.year,pad(solar.month),pad(solar.day)].join("-");
    return {
      source:"manseryeok@2.0.0",
      input:{calendar:input.calendar,unknown:input.unknown,gender:input.gender,
        enteredDate:profile.date,leap:input.isLeapMonth,time:input.unknown?null:profile.time},
      solarDate,lunarDate:lunar,pillars,
      hanja:{year:hanja.year||"",month:hanja.month||"",day:hanja.day||"",hour:input.unknown?"":(hanja.hour||"")},
      dayMaster:{stem:master,element:STEM_ELEMENT[master],yinYang:result.dayYinYang?.stem||null},
      elements,uncertain,tenGods:result.tenGods||null,
      luckPillars:input.unknown?null:(result.luckPillars||null)
    };
  }
  function format(chart) {
    if (!chart || !chart.pillars) return "";
    const p=chart.pillars;
    const line="연주 "+p.year+" · 월주 "+p.month+" · 일주 "+p.day+" · 시주 "+(p.hour||"미상");
    const f=Object.entries(chart.elements).map(function(entry){return entry[0]+" "+entry[1]}).join(" / ");
    let result="🔮 만세력 사주팔자\n"+line+"\n"+
      "양력 기준 "+chart.solarDate+" · 일간 "+chart.dayMaster.stem+"("+chart.dayMaster.element+")\n"+
      "오행(겉글자 기준) "+f;
    if (chart.input.unknown) result+="\n※ 출생시간 미상: 시주는 계산하지 않았어.";
    if (chart.uncertain.length) result+="\n※ 절기 또는 일진 경계에 걸려 "+chart.uncertain.map(x=>({year:"연주",month:"월주",day:"일주"}[x])).join("·")+"가 출생시각에 따라 달라질 수 있어.";
    return result;
  }
  function reading(chart, topic, question) {
    const p=chart.pillars,head=chart.dayMaster.stem,element=chart.dayMaster.element;
    const counts=Object.entries(chart.elements).sort((a,b)=>b[1]-a[1]);
    const major=counts[0][0],max=counts[0][1];
    const summary="일간 "+head+"("+element+")은 전통 명리에서 "+(STEM_CHARACTER[head]||"개인의 중심을 상징하는 글자")+"로 읽어. "+
      "겉으로 드러난 여덟 글자에서 "+major+" 기운이 "+max+"개로 가장 많이 보여."+
      (chart.input.unknown?" 출생시간을 모르므로 시주를 제외한 여섯 글자만 집계했어.":"");
    const note=SUBJECT_NOTE[topic]||SUBJECT_NOTE.saju;
    let extra="";
    if (topic==="decade" && chart.luckPillars && Array.isArray(chart.luckPillars.pillars)) {
      const list=chart.luckPillars.pillars.slice(0,5).map(x=>x.age+"세 "+x.korean).join(" → ");
      extra="\n대운(전통 계산): "+list+"\n대운 시작 나이는 학파별 환산법에 따라 달라질 수 있어.";
    }
    return summary+"\n\n"+note+extra+
      "\n\n※ 명리학의 전통적인 상징 해석이야. 미래 사건·건강·재산을 사실처럼 예측하지 않아.";
  }
  const api={calculate,format,reading,normalize,source:"manseryeok@2.0.0"};
  root.BokjaksoSaju=api;
  if (typeof module!=="undefined" && module.exports) module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
