(function (root) {
  "use strict";
  // Runtime dependency is pinned. This browser-only adapter sends no birth data
  // to the CDN; the imported calculation runs locally in the user's browser.
  const ENGINE_URL = "https://esm.sh/manseryeok@2.0.0?bundle";
  const STEM_ELEMENT = {갑:"목",을:"목",병:"화",정:"화",무:"토",기:"토",경:"금",신:"금",임:"수",계:"수"};
  const BRANCH_ELEMENT = {자:"수",축:"토",인:"목",묘:"목",진:"토",사:"화",오:"화",미:"토",신:"금",유:"금",술:"토",해:"수"};
  // Opt-in longitude presets for Korean birth locations (degrees East).
  // Default "none" retains the person's entered civil birth time.
  const BIRTHPLACES = Object.freeze({
    seoul:{label:"서울",longitude:126.9780},
    incheon:{label:"인천",longitude:126.7052},
    daegu:{label:"대구",longitude:128.6014},
    busan:{label:"부산",longitude:129.0756},
    daejeon:{label:"대전",longitude:127.3845},
    gwangju:{label:"광주",longitude:126.8526},
    jeju:{label:"제주",longitude:126.5312}
  });
  const ELEMENT_GENERATES={목:"화",화:"토",토:"금",금:"수",수:"목"};
  const ELEMENT_CONTROLS={목:"토",화:"금",토:"수",금:"목",수:"화"};
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
    const birthplace=typeof profile.birthplace==="string"?profile.birthplace:"none";
    if(birthplace!=="none"&&birthplace!=="custom"&&!BIRTHPLACES[birthplace]){
      throw new Error("출생 지역을 다시 선택해 줘.");
    }
    let longitude=null,placeLabel="보정 안 함";
    if(birthplace==="custom"){
      longitude=Number(profile.longitude);
      if(profile.longitude===""||profile.longitude==null||!Number.isFinite(longitude)||longitude<124||longitude>132){
        throw new Error("직접 입력하는 경도는 국내 기준 124~132도 범위여야 해.");
      }
      placeLabel="직접 입력 ("+longitude.toFixed(3)+"°E)";
    } else if(BIRTHPLACES[birthplace]){
      longitude=BIRTHPLACES[birthplace].longitude;
      placeLabel=BIRTHPLACES[birthplace].label;
    }
    return {year,month,day,hour,minute,isLunar,isLeapMonth,unknown,gender,
      calendar:isLunar?"음력":"양력",birthplace,longitude,placeLabel,
      correctionApplied:longitude!==null&&!unknown};
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
    if (input.correctionApplied) {
      params.trueSolarTime={
        longitude:input.longitude,applyEquationOfTime:true,applyHistoricalDst:true
      };
    }
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
        enteredDate:profile.date,leap:input.isLeapMonth,time:input.unknown?null:profile.time,
        birthplace:input.birthplace,placeLabel:input.placeLabel,
        longitude:input.longitude,correctionApplied:input.correctionApplied},
      solarDate,lunarDate:lunar,pillars,
      hanja:{year:hanja.year?.hanja||"",month:hanja.month?.hanja||"",day:hanja.day?.hanja||"",hour:input.unknown?"":(hanja.hour?.hanja||"")},
      dayMaster:{stem:master,element:STEM_ELEMENT[master],yinYang:result.dayYinYang?.stem||null},
      elements,uncertain,tenGods:result.tenGods||null,
      luckPillars:input.unknown?null:(result.luckPillars||null)
    };
  }
  // Flow pillars use *today's Korean civil date*, noon to avoid day-boundary
  // ambiguity. Year pillar is based on seasonal term (Ipchun), not Jan 1.
  function kstDate(now) {
    return new Intl.DateTimeFormat("sv-SE",{
      timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"
    }).format(now||new Date());
  }
  // Validate before accepting a birth profile, rather than confirming a
  // nonexistent lunar month / leap month and failing only in the result card.
  // The engine runs locally; this helper does not persist input or call an API.
  async function validateProfiles(profiles, injectedLibrary, dateLimit) {
    if(!Array.isArray(profiles)||profiles.length<1||profiles.length>2) {
      throw new Error("확인할 출생 정보는 한 명 또는 두 명이어야 해.");
    }
    const today=dateLimit===undefined?kstDate():dateLimit;
    if(typeof today!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      throw new Error("한국 기준 오늘 날짜를 확인하지 못했어.");
    }
    const lib=injectedLibrary||await loadEngine();
    const charts=await Promise.all(profiles.map(profile=>calculate(profile,lib)));
    for(const chart of charts) {
      if(chart.solarDate>today) {
        throw new Error("아직 오지 않은 날짜야. 음력·양력과 윤달을 다시 확인해 줘.");
      }
    }
    return charts;
  }
  async function calculateFlows(chart, injectedLibrary, dateOverride) {
    if(!chart?.pillars?.day || !chart?.dayMaster?.element){
      throw new Error("사주 원국을 먼저 계산해 줘.");
    }
    const date=typeof dateOverride==="string"?dateOverride:kstDate(dateOverride);
    const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if(!match)throw new Error("오늘의 날짜를 확인할 수 없어.");
    const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]);
    if(y<1900||y>2100||m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate()){
      throw new Error("세운·일진을 계산할 수 없는 날짜야.");
    }
    const lib=injectedLibrary||await loadEngine();
    const v=lib.calculateFourPillars({
      year:y,month:m,day:d,hour:12,minute:0,isLunar:false,dayBoundary:"midnight"
    }).toObject();
    if(!v || !["year","month","day"].every(key=>isPillar(v[key]))) {
      throw new Error("세운·일진의 계산 결과를 확인할 수 없어.");
    }
    return {date,year:v.year,month:v.month,day:v.day,basis:"한국 표준시 정오 기준"};
  }
  function elementRelation(me,other) {
    if(!me||!other) return "관계를 판단할 수 없음";
    if(me===other)return "같은 오행";
    if(ELEMENT_GENERATES[me]===other)return "내 오행이 생하는 관계";
    if(ELEMENT_GENERATES[other]===me)return "나를 생하는 관계";
    if(ELEMENT_CONTROLS[me]===other)return "내 오행이 극하는 관계";
    if(ELEMENT_CONTROLS[other]===me)return "상대 오행이 나를 극하는 관계";
    return "관계를 판단할 수 없음";
  }
  function flowReading(chart,flow,topic) {
    const mine=chart.dayMaster.element,day=STEM_ELEMENT[flow.day[0]],year=STEM_ELEMENT[flow.year[0]];
    const themes={
      daily:"오늘은 진행할 일의 우선순위 한 가지를 점검해 보는 참고 질문으로 활용해 봐.",
      saju:"사주 원국과 오늘의 상징을 함께 비교하는 보조 자료로 활용해 봐.",
      decade:"올해의 간지와 대운은 서로 다른 시간 단위야. 대운도 함께 보려면 정확한 생시와 성별이 필요해.",
      match:"관계의 결과를 단정하기보다 서로의 생각을 확인할 질문으로 활용해 봐.",
      love:"관계에 관한 중요한 선택은 실제 대화와 상대방의 의사를 우선해 줘.",
      wealth:"수입·투자 판단에는 실제 계약과 자금 계획을 우선해 줘.",
      career:"업무 계획은 현재의 역량과 여건을 기준으로 결정해 줘."
    };
    return "오늘 일진 "+flow.day+"("+day+") · 일간 "+chart.dayMaster.stem+"("+mine+")과 "+elementRelation(mine,day)+"\n"+
      "올해 세운 "+flow.year+"("+year+") · 일간과 "+elementRelation(mine,year)+"\n"+
      (themes[topic]||themes.saju)+"\n"+
      "※ 일진·세운은 전통 명리 계산값이고, 그 관계는 상징적 해석이야. 실제 운이나 사건의 발생을 검증하거나 보장하지 않아.";
  }
  // Advisor-specific responses use only calculated facts and reflective prompts.
  // They are not LLM responses and do not predict events or diagnose conditions.
  function advisorReading(chart,topic,advisorId){
    if(!chart?.pillars?.day||!chart?.dayMaster?.element) {
      throw new Error("사주팔자를 먼저 계산해 줘.");
    }
    const stem=chart.dayMaster.stem,element=chart.dayMaster.element,p=chart.pillars;
    const base=reading(chart,topic);
    const leading=Object.entries(chart.elements).sort((a,b)=>b[1]-a[1])[0][0];
    const theme={
      saju:"타고난 성향을 탐색하는 질문",
      daily:"오늘 선택할 행동 한 가지",
      decade:"인생 시기의 변화에 대한 관점",
      match:"서로의 차이를 존중하는 방법",
      love:"관계에서 원하는 가치",
      wealth:"소비·저축·위험 관리의 우선순위",
      career:"일과 성장의 방향"
    }[topic]||"지금 중요하게 여기는 가치";
    if(advisorId==="ara"){
      return "🌸 아라 · 따뜻한 상담\n"+stem+"("+element+") 일간을 중심으로 차근차근 살펴볼게. "+
        "지금은 "+theme+"을(를) 생각해 보는 게 좋겠어.\n\n"+base+
        "\n\n아라의 질문: 이번 주에 실천해 볼 작은 변화는 무엇일까?";
    }
    if(advisorId==="doyun"){
      return "☯️ 도윤 · 정통 사주 구조 해설\n"+
        "원국: 년주 "+p.year+" / 월주 "+p.month+" / 일주 "+p.day+
        " / 시주 "+(p.hour||"미상")+"\n"+
        "월주는 계절적 배경, 일간 "+stem+"은 해석 기준이야. "+
        "겉글자 오행 중 "+leading+"의 빈도가 가장 높아. 지장간의 분포는 포함하지 않았어.\n\n"+
        base+"\n\n절입 시각과 출생시각에 따라 일부 간지가 달라질 수 있어.";
    }
    if(advisorId==="seoyun"){
      return "💕 서윤 · 관계와 연애 상담\n"+
        "명리학에서 일간 "+stem+"("+element+")은 자신을 바라보는 한 가지 상징적 출발점이야. "+
        "이 정보만으로 인연의 성사나 상대의 마음을 판단하지는 않아.\n\n"+
        base+"\n\n서윤의 질문: 관계에서 가장 중요하게 지키고 싶은 경계와 바람은 무엇일까?";
    }
    if(advisorId==="jian"){
      const action=topic==="career"?"지금 맡은 업무와 성장 목표를 정리":topic==="wealth"?"고정 지출과 위험 허용 범위를 먼저 점검":"이번 달 실행할 한 가지 목표를 정리";
      return "💰 지안 · 재물과 직장·사업 상담\n"+
        "일간 "+stem+"("+element+")과 원국에서 드러난 "+leading+" 오행을 전통 상징으로 읽을 수 있어. "+
        "실제 수익이나 직업 적합성을 보장하는 수치는 아니야.\n\n"+
        base+"\n\n지안의 제안: "+action+"해 봐. 투자·계약 판단은 객관적인 자료를 우선해야 해.";
    }
    return base;
  }
  function compatibility(a,b) {
    if(!a?.pillars?.day||!b?.pillars?.day||!a?.dayMaster?.element||!b?.dayMaster?.element){
      throw new Error("궁합은 두 사람의 출생 정보를 모두 계산해야 확인할 수 있어.");
    }
    const p=a.dayMaster,q=b.dayMaster;
    const relation=elementRelation(p.element,q.element);
    const mirrored=elementRelation(q.element,p.element);
    const sharedElements=Object.keys(a.elements).filter(el=>a.elements[el]>0&&b.elements[el]>0);
    return [
      "💕 두 사람의 명리 관계 참고",
      "본인 일간 "+p.stem+"("+p.element+") · 상대 일간 "+q.stem+"("+q.element+")",
      "본인에서 본 오행 관계: "+relation,
      "상대에서 본 오행 관계: "+mirrored,
      "양쪽 사주에 모두 드러난 오행: "+(sharedElements.join("·")||"없음"),
      "일간과 겉글자만 비교한 기초 분석이야. 지장간·십성·합충형해·대운은 아직 함께 분석하지 않았어.",
      "※ 궁합 점수나 연애·결혼 성패를 예측하지 않아. 서로의 존중과 실제 관계 경험이 가장 중요해."
    ].join("\n");
  }
  function format(chart) {
    if (!chart || !chart.pillars) return "";
    const p=chart.pillars;
    const line=[["year","연주"],["month","월주"],["day","일주"],["hour","시주"]].map(function(entry){const key=entry[0],val=p[key]||"미상",hanja=chart.hanja?.[key];return entry[1]+" "+val+(hanja?"("+hanja+")":"");}).join(" · ");
    const f=Object.entries(chart.elements).map(function(entry){return entry[0]+" "+entry[1]}).join(" / ");
    let result="🔮 만세력 사주팔자\n"+line+"\n"+
      "양력 기준 "+chart.solarDate+" · 일간 "+chart.dayMaster.stem+"("+chart.dayMaster.element+")\n"+
      "오행(겉글자 기준) "+f;
    result+="\n시간 기준: "+(chart.input.correctionApplied
      ?chart.input.placeLabel+" 경도·균시차·역사시각 보정"
      :"입력 시각 그대로(진태양시 미보정)")+".";
    if (chart.input.unknown) result+="\n※ 출생시간 미상: 시주는 계산하지 않았어.";
    if (chart.uncertain.length) result+="\n※ 절기 또는 일진 경계에 걸려 "+chart.uncertain.map(x=>({year:"연주",month:"월주",day:"일주"}[x])).join("·")+"가 출생시각에 따라 달라질 수 있어.";
    return result;
  }
  function reading(chart, topic, question) {
    const p=chart.pillars,head=chart.dayMaster.stem,element=chart.dayMaster.element;
    const counts=Object.entries(chart.elements).sort((a,b)=>b[1]-a[1]);
    const major=counts[0][0],max=counts[0][1];
    const summary="일간 "+head+"("+element+")은 전통 명리에서 "+(STEM_CHARACTER[head]||"개인의 중심을 상징하는 글자")+"로 읽어. "+
      "겉으로 드러난 "+(chart.input.unknown?"여섯":"여덟")+" 글자에서 "+major+" 기운이 "+max+"개로 가장 많이 보여."+
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
  const api={calculate,validateProfiles,calculateFlows,flowReading,compatibility,advisorReading,format,reading,normalize,kstDate,
    BIRTHPLACES,source:"manseryeok@2.0.0"};
  root.BokjaksoSaju=api;
  if (typeof module!=="undefined" && module.exports) module.exports=api;
})(typeof window!=="undefined"?window:globalThis);
