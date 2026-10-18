/* Magazine comments: public reading, server-approved club-member posting, authenticated deletion. */
(()=>{
  'use strict';
  const endpoint='/api/store-inquiries';
  const PROFILE_KEY='bokjaksoChatSharedProfileV1';
  const ADMIN_KEY='wjarchiveAdminAccessToken';
  const sections=new Map();
  // Short-lived in-memory cache, including when magazine cards get redrawn.
  // Nothing is stored on the server or in persistent browser storage.
  const commentCache=new Map();
  const COMMENTS_FRESH_MS=45000;
  const viewerKey=()=>{
    const profile=profileCredentials();
    return profile.profileId||'guest';
  };

  const profileCredentials=()=>{
    try{
      const stored=JSON.parse(localStorage.getItem(PROFILE_KEY)||'null');
      if(stored?.id&&stored?.token)return {profileId:stored.id,profileToken:stored.token};
    }catch(_){}
    return {};
  };
  async function request(action,extra={}){
    const adminToken=sessionStorage.getItem(ADMIN_KEY);
    const headers={'Content-Type':'application/json'};
    if(adminToken)headers.Authorization='Bearer '+adminToken;
    const response=await fetch(endpoint,{
      method:'POST',cache:'no-store',headers,
      body:JSON.stringify({action:'magazine-'+action,...profileCredentials(),...extra})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.message||'댓글을 불러오지 못했어요. 다시 시도해 주세요.');
    return result;
  }
  function stamp(value){
    const date=new Date(value);
    if(!Number.isFinite(date.getTime()))return '';
    return date.toLocaleString('ko-KR',{
      timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'
    });
  }
  function el(tag,cls,text){
    const node=document.createElement(tag);
    if(cls)node.className=cls;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function buildComment(row,section){
    const outer=el('div','magazine-comment');
    const avatar=el('span','magazine-comment-avatar','👤');
    if(typeof row.avatarUrl==='string'&&/^https:\/\//.test(row.avatarUrl)){
      const image=document.createElement('img');
      image.src=row.avatarUrl;image.alt='';image.loading='lazy';image.decoding='async';
      image.addEventListener('error',()=>{avatar.replaceChildren();avatar.textContent='👤';},{once:true});
      avatar.replaceChildren(image);
    }
    const main=el('div','magazine-comment-main');
    const top=el('div','magazine-comment-top');
    const nick=el('strong','',row.nickname||'회원');
    const date=el('time','',stamp(row.createdAt));
    if(row.createdAt)date.dateTime=row.createdAt;
    top.append(nick,date);
    if(row.canDelete===true){
      const del=el('button','magazine-comment-delete','삭제');
      del.type='button';
      del.setAttribute('aria-label',(row.nickname||'회원')+' 댓글 삭제');
      del.addEventListener('click',async()=>{
        if(del.disabled||!window.confirm('이 댓글을 삭제할까요?'))return;
        del.disabled=true;section.feedback.textContent='댓글을 삭제하고 있어요…';
        try{
          await request('delete',{articleKey:section.key,commentId:row.id});
          section.feedback.textContent='댓글을 삭제했어요.';
          commentCache.delete(section.key);
          await load(section,false,true);
        }catch(error){section.feedback.textContent=error.message;del.disabled=false;}
      });
      top.append(del);
    }
    main.append(top,el('div','magazine-comment-body',row.body||''));
    outer.append(avatar,main);
    return outer;
  }
  function render(section){
    section.list.replaceChildren();
    if(!section.comments.length){
      section.list.append(el('p','magazine-comments-note','아직 댓글이 없어요. 첫 댓글을 남겨보세요!'));
    }else{
      for(const row of section.comments)section.list.append(buildComment(row,section));
    }
    section.count.textContent=section.comments.length+(section.hasMore?'+':'');
    section.hint.hidden=section.comments.length===0;
    section.more.hidden=!section.hasMore;
    section.form.hidden=!section.canComment;
    section.join.hidden=section.canComment;
    if(!section.canComment){
      section.join.textContent='✍️ 댓글 작성은 클럽 승인 정회원만 가능해요. 클럽 가입·상태 확인 ›';
    }
  }
  async function load(section,older=false,force=false){
    if(section.loading)return;
    // A recently opened article is already up to date: show it immediately.
    if(!older&&!force&&section.hasLoaded&&Date.now()-section.lastLoaded<COMMENTS_FRESH_MS)return;
    section.loading=true;
    if(!older){
      // Keep existing comments visible while refreshing outdated information.
      section.feedback.textContent=section.hasLoaded?'':'댓글을 불러오는 중…';
      if(!section.hasLoaded)section.more.hidden=true;
    }else{
      section.more.disabled=true;section.more.textContent='불러오는 중…';
    }
    try{
      const data=await request('list',{
        articleKey:section.key,
        ...(older&&section.nextBeforeId?{beforeId:section.nextBeforeId}:{})
      });
      section.comments=older?section.comments.concat(data.comments||[]):(data.comments||[]);
      section.canComment=data.canComment===true;
      section.hasMore=data.hasMore===true;
      section.nextBeforeId=data.nextBeforeId||null;
      section.hasLoaded=true;
      section.lastLoaded=Date.now();
      commentCache.set(section.key,{
        viewer:viewerKey(),at:section.lastLoaded,
        comments:section.comments.slice(),canComment:section.canComment,
        hasMore:section.hasMore,nextBeforeId:section.nextBeforeId
      });
      render(section);
      section.feedback.textContent='';
    }catch(error){
      section.feedback.textContent=error.message||'댓글을 불러오지 못했어요.';
    }finally{
      section.loading=false;
      section.more.disabled=false;section.more.textContent='이전 댓글 더 보기';
    }
  }
  function install(article){
    const key=article.dataset.magArticle;
    const details=article.querySelector('details');
    if(!key||!details)return;
    const panel=el('section','magazine-comments');
    panel.setAttribute('aria-label','댓글 목록과 작성');
    panel.innerHTML=
      '<h4>댓글 <span class="magazine-comment-count">0</span></h4>'+
      '<p class="magazine-comments-hint" hidden>서로의 생각을 존중하며 이야기를 나눠주세요.</p>'+
      '<div class="magazine-comments-feedback" role="status" aria-live="polite"></div>'+
      '<div class="magazine-comments-list"></div>'+
      '<button class="magazine-comment-more" type="button" hidden>이전 댓글 더 보기</button>'+
      '<form class="magazine-comment-form" hidden>'+
      '  <label>댓글 남기기<textarea maxlength="500" rows="3" required placeholder="따뜻한 한마디를 남겨주세요. (500자 이내)"></textarea></label>'+
      '  <div class="magazine-comment-form-footer"><small>사진 없이 글만 작성해요.</small><button class="magazine-comment-send" type="submit">등록</button></div>'+
      '</form>'+
      '<a class="magazine-comment-join" href="/chat.html?tab=club" hidden>정회원 가입·상태 확인 ›</a>';
    details.append(panel);
    const section={
      key,details,
      count:panel.querySelector('.magazine-comment-count'),
      hint:panel.querySelector('.magazine-comments-hint'),
      feedback:panel.querySelector('.magazine-comments-feedback'),
      list:panel.querySelector('.magazine-comments-list'),
      more:panel.querySelector('.magazine-comment-more'),
      form:panel.querySelector('form'),
      join:panel.querySelector('.magazine-comment-join'),
      input:panel.querySelector('textarea'),
      button:panel.querySelector('.magazine-comment-send'),
      comments:[],hasMore:false,nextBeforeId:null,canComment:false,loading:false,
      hasLoaded:false,lastLoaded:0
    };
    const cached=commentCache.get(key);
    if(cached&&cached.viewer===viewerKey()){
      section.comments=cached.comments.slice();
      section.hasMore=cached.hasMore;
      section.nextBeforeId=cached.nextBeforeId;
      section.canComment=cached.canComment;
      section.hasLoaded=true;
      section.lastLoaded=cached.at;
      render(section);
    }
    section.more.addEventListener('click',()=>{if(section.nextBeforeId)load(section,true);});
    section.form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(section.button.disabled)return;
      const message=section.input.value.trim();
      if(!message||message.length>500){
        section.feedback.textContent='댓글은 1~500자로 입력해 주세요.';
        return;
      }
      section.button.disabled=true;section.button.textContent='저장 중…';
      section.feedback.textContent='댓글 저장 중…';
      try{
        await request('post',{articleKey:key,message});
        section.input.value='';
        commentCache.delete(key);
        await load(section,false,true);
        section.feedback.textContent='댓글을 등록했어요.';
      }catch(error){section.feedback.textContent=error.message;}
      finally{section.button.disabled=false;section.button.textContent='등록';}
    });
    details.addEventListener('toggle',()=>{if(details.open)load(section,false);});
    sections.set(key,section);
  }
  for(const article of document.querySelectorAll('.magazine-story[data-mag-article]'))install(article);

  // Live articles from the highest-administrator CMS. Seed posts reuse their
  // original article keys so the existing saved comments always stay attached.
  const categoryName={culture:'문학·문화',life:'건강·생활',local:'지역 소식',club:'복작소 이야기'};
  const categorySymbol={culture:'📚',life:'☕',local:'🍁',club:'💬'};
  function articleCard(item,isFeatured){
    const article=el('article','magazine-story'+(isFeatured?' magazine-featured':''));
    article.dataset.magArticle=item.articleKey;
    article.dataset.magCategory=item.category;
    const picture=el('div','magazine-story-visual');
    const fallback=el('span','magazine-fallback',categorySymbol[item.category]||'📰');
    fallback.setAttribute('aria-hidden','true');picture.append(fallback);
    if(item.imageUrl&&/^https:\/\//i.test(item.imageUrl)){
      const img=document.createElement('img');
      img.src=item.imageUrl;img.alt=item.title+' 대표 이미지';
      img.loading=isFeatured?'eager':'lazy';img.decoding='async';
      img.referrerPolicy='no-referrer';
      img.addEventListener('error',()=>img.remove(),{once:true});
      picture.append(img);
    }
    if(isFeatured)picture.append(el('span','magazine-feature-tag','이주의 추천 글'));
    const body=el('div','magazine-story-body');
    const sample=['culture-feature','life-rest','local-events','club-welcome'].includes(item.articleKey);
    body.append(el('span','magazine-story-type',(categoryName[item.category]||'매거진')+(sample?' · 시범 글':'')));
    body.append(el(isFeatured?'h2':'h3','',item.title||'제목 없는 글'));
    body.append(el('p','',item.summary||''));
    const details=document.createElement('details');
    const summary=el('summary','',isFeatured?'이야기 자세히 읽기':'글 읽기');details.append(summary);
    const paragraphs=String(item.body||'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);
    for(const p of paragraphs){
      const node=el('p','',p);node.style.whiteSpace='pre-wrap';details.append(node);
    }
    article.append(picture,body,details);
    install(article);
    return article;
  }
  let currentCategory='all';
  let page=1;
  let totalPages=1;
  let articlesLoading=false;
  let lastArticlesCheck=0;
  let lastCategory='all';
  let loadSequence=0;

  function renderArticlePagination(){
    const nav=document.getElementById('magazinePages');
    if(!nav)return;
    nav.replaceChildren();
    nav.hidden=totalPages<=1;
    if(totalPages<=1)return;

    function addButton(label,target,disabled=false,active=false){
      const button=el('button','magazine-page-button',label);
      button.type='button';
      button.disabled=disabled;
      if(active)button.setAttribute('aria-current','page');
      button.setAttribute('aria-label',active?'현재 '+label+'페이지':label+'페이지로 이동');
      button.addEventListener('click',()=>{if(!button.disabled)loadArticles(target,true);});
      nav.append(button);
    }
    addButton('‹ 이전',page-1,page===1);

    let numbers;
    if(totalPages<=5){
      numbers=Array.from({length:totalPages},(_,i)=>i+1);
    }else{
      const chosen=new Set([1,totalPages,page-1,page,page+1]);
      if(page<=2){chosen.add(2);chosen.add(3);}
      if(page>=totalPages-1){chosen.add(totalPages-2);chosen.add(totalPages-1);}
      numbers=[...chosen].filter(n=>n>=1&&n<=totalPages).sort((a,b)=>a-b);
    }
    let previous=0;
    for(const number of numbers){
      if(number-previous>1){
        const dots=el('span','magazine-page-ellipsis','…');
        dots.setAttribute('aria-hidden','true');
        nav.append(dots);
      }
      addButton(String(number),number,number===page,number===page);
      previous=number;
    }
    addButton('다음 ›',page+1,page===totalPages);
  }

  async function loadArticles(targetPage=1,forced=false){
    if(articlesLoading)return;
    const selectedCategory=currentCategory;
    const now=Date.now();
    if(!forced&&targetPage===page&&selectedCategory===lastCategory&&now-lastArticlesCheck<15000)return;
    // Avoid closing the article or comment editor just for a tab refresh.
    if(!forced&&targetPage===page&&selectedCategory===lastCategory&&lastArticlesCheck
       &&Array.from(sections.values()).some(s=>s.details.open))return;
    articlesLoading=true;
    const requestSeq=++loadSequence;
    const nav=document.getElementById('magazinePages');
    nav?.setAttribute('aria-busy','true');
    nav?.querySelectorAll('button').forEach(b=>{b.disabled=true;});
    const previousPage=page;
    try{
      const data=await request('posts-list',{page:targetPage,category:selectedCategory});
      if(loadSequence!==requestSeq||currentCategory!==selectedCategory)return;
      const live=Array.isArray(data.articles)?data.articles:[];
      const panel=document.getElementById('magazinePanel');
      const listing=document.getElementById('magazineStories');
      const subhead=panel?.querySelector('.magazine-subhead');
      if(!panel||!listing||!subhead)return;
      const feature=data.featured&&
        (selectedCategory==='all'||data.featured.category===selectedCategory)
        ?data.featured:null;
      // Replace only after the new page has arrived, never while waiting.
      const hero=panel.querySelector('.magazine-featured');
      sections.clear();
      const featureCard=feature?articleCard(feature,true):null;
      if(hero)hero.remove();
      listing.replaceChildren();
      if(featureCard)subhead.before(featureCard);
      for(const article of live)listing.append(articleCard(article,false));
      if(!listing.children.length&&!feature){
        listing.append(el('p','magazine-comments-note','이 분야에 공개된 글이 아직 없어요.'));
      }
      page=targetPage;
      totalPages=Math.max(1,Number(data.totalPages)||1);
      lastArticlesCheck=Date.now();
      lastCategory=selectedCategory;
      renderArticlePagination();
      if(page!==previousPage)subhead.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){
      console.warn('매거진 글 갱신 실패',error);
      const note=document.querySelector('.magazine-note');
      if(note)note.textContent='최신 매거진 글을 불러오지 못했어요. 잠시 후 다시 열어줘. 기존 글과 댓글 데이터는 보존돼 있어.';
      renderArticlePagination();
    }finally{
      articlesLoading=false;
      nav?.removeAttribute('aria-busy');
      if(currentCategory!==selectedCategory){
        lastArticlesCheck=0;
        loadArticles(1,true);
      }
    }
  }

  // Category selection always opens the first page of that category.
  document.querySelectorAll('[data-mag-filter]').forEach(button=>{
    button.addEventListener('click',()=>{
      const next=button.dataset.magFilter||'all';
      if(currentCategory===next)return;
      currentCategory=next;
      lastArticlesCheck=0;
      loadArticles(1,true);
    });
  });
  loadArticles(1,true);
  document.getElementById('homeTabMagazine')?.addEventListener('click',()=>loadArticles(1,false));
  window.addEventListener('bokjakso:shared-profile-updated',()=>{
    // Cached author permissions must never survive a profile change.
    commentCache.clear();
    for(const section of sections.values()){
      section.hasLoaded=false;
      section.lastLoaded=0;
      section.canComment=false;
      section.form.hidden=true;
      section.join.hidden=true;
      if(section.details.open)load(section,false,true);
    }
  });
})();
