/* Magazine comments: public reading, server-approved club-member posting, authenticated deletion. */
(()=>{
  'use strict';
  const endpoint='/api/store-inquiries';
  const PROFILE_KEY='bokjaksoChatSharedProfileV1';
  const ADMIN_KEY='wjarchiveAdminAccessToken';
  const sections=new Map();

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
      timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'
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
          await load(section,false);
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
    section.title.textContent='댓글 '+section.comments.length+(section.hasMore?'+':'');
    section.more.hidden=!section.hasMore;
    section.form.hidden=!section.canComment;
    section.join.hidden=section.canComment;
    if(!section.canComment){
      section.join.textContent='✍️ 댓글 작성은 클럽 승인 정회원만 가능해요. 클럽 가입·상태 확인 ›';
    }
  }
  async function load(section,older=false){
    if(section.loading)return;
    section.loading=true;
    if(!older){
      section.feedback.textContent='댓글을 불러오는 중…';
      section.more.hidden=true;
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
      '<h4>댓글</h4>'+
      '<p class="magazine-comments-note">서로의 생각을 존중하며 이야기를 나눠주세요.</p>'+
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
      title:panel.querySelector('h4'),
      feedback:panel.querySelector('.magazine-comments-feedback'),
      list:panel.querySelector('.magazine-comments-list'),
      more:panel.querySelector('.magazine-comment-more'),
      form:panel.querySelector('form'),
      join:panel.querySelector('.magazine-comment-join'),
      input:panel.querySelector('textarea'),
      button:panel.querySelector('.magazine-comment-send'),
      comments:[],hasMore:false,nextBeforeId:null,canComment:false,loading:false
    };
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
        await load(section,false);
        section.feedback.textContent='댓글을 등록했어요.';
      }catch(error){section.feedback.textContent=error.message;}
      finally{section.button.disabled=false;section.button.textContent='등록';}
    });
    details.addEventListener('toggle',()=>{if(details.open)load(section,false);});
    sections.set(key,section);
  }
  for(const article of document.querySelectorAll('.magazine-story[data-mag-article]'))install(article);
  window.addEventListener('bokjakso:shared-profile-updated',()=>{
    for(const section of sections.values())if(section.details.open)load(section,false);
  });
})();
