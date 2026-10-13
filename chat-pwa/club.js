/* 복작소 클럽: UI only, authorization is always verified by the server. */
(()=>{
 'use strict';
 const status=document.getElementById('clubStatus');
 const applyBtn=document.getElementById('clubApplyBtn');
 const applyForm=document.getElementById('clubApplyForm');
 const formNickname=document.getElementById('clubApplyNickname');
 const formIntroduction=document.getElementById('clubApplyIntroduction');
 const formConsent=document.getElementById('clubApplyConsent');
 const formFeedback=document.getElementById('clubFormFeedback');
 const formSubmit=document.getElementById('clubApplySubmit');
 const formCancel=document.getElementById('clubApplyCancel');
 const resetBtn=document.getElementById('clubResetBtn');
 const reviewEntry=document.getElementById('clubReviewEntry');
 const pane=document.getElementById('clubChat');
 const actions=document.getElementById('clubActions');
 const feed=document.getElementById('clubMessages');
 const input=document.getElementById('clubMessageInput');
 const sendBtn=document.getElementById('clubSendBtn');
 const adminLink=document.getElementById('clubAdminLink');
 const clubTab=document.getElementById('homeTabClub');
 let membership='none',busy=false;

 async function request(action,extra={}){
   const response=await fetch('/api/store-inquiries',{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({action:'club-'+action,...sharedCredentials(),...extra})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok){
     const error=new Error(data.message||'클럽 요청을 완료하지 못했습니다.');
     error.statusCode=response.status;
     throw error;
   }
   return data;
 }
 function renderMembership(next){
   membership=next;
   const labels={
     none:'아직 클럽 회원이 아니에요. 아래에서 가입 신청을 해 주세요.',
     pending:'가입 신청 완료! 관리자 승인을 기다리고 있어요.',
     approved:'복작소 클럽 정회원이에요. 함께 이야기 나눠요!',
     rejected:'가입이 승인되지 않았어요. 다시 신청할 수 있어요.',
     suspended:'클럽 이용이 제한되었어요. 관리자에게 문의해 주세요.'
   };
   status.textContent=labels[next]||'회원 상태를 확인할 수 없어요.';
   pane.hidden=next!=='approved';
   if(next==='pending'||next==='approved'||next==='suspended')applyForm.hidden=true;
   actions.hidden=next==='approved'||next==='pending'||next==='suspended'||!applyForm.hidden;
   applyBtn.textContent=next==='rejected'?'클럽 가입 다시 하기':'클럽 가입하기';
   resetBtn.hidden=next!=='pending'&&next!=='rejected';
   reviewEntry.hidden=next!=='pending';
 }
 async function refresh(){
   adminLink.hidden=!sessionStorage.getItem(ADMIN_KEY);
   if(!sharedProfile){
     renderMembership('none');
     return;
   }
   try{
     const data=await request('status');
     renderMembership(data.status);
     if(data.status==='approved')await loadMessages();
   }catch(e){
     if(e.statusCode===401){
       // Backend test users were erased: don't keep an invalid profile token.
       sharedProfile=null;
       localStorage.removeItem(SHARED_PROFILE_KEY);
       refreshSharedProfileCard();
       renderMembership('none');
       status.textContent='이전 테스트 프로필이 초기화됐어요. 클럽 가입하기를 눌러 새로 신청해 주세요.';
       return;
     }
     pane.hidden=true;actions.hidden=true;status.textContent=e.message;
   }
 }
 async function loadMessages(){
   if(busy||membership!=='approved'||pane.hidden)return;
   busy=true;
   try{
     const result=await request('messages');
     const atBottom=feed.scrollHeight-feed.clientHeight-feed.scrollTop<80;
     feed.replaceChildren();
     const items=Array.isArray(result.messages)?result.messages:[];
     if(!items.length){
       const empty=document.createElement('p');
       empty.textContent='첫 인사를 남겨보세요.';
       feed.appendChild(empty);
     }
     for(const row of items){
       const article=document.createElement('article');
       article.className='club-post';
       const name=document.createElement('strong');
       name.textContent=row.nickname||'회원';
       const time=document.createElement('time');
       const date=new Date(row.created_at);
       time.textContent=Number.isNaN(date.getTime())?'':date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
       const body=document.createElement('p');
       body.textContent=row.body||'';
       article.append(name,time,body);
       feed.appendChild(article);
     }
     if(atBottom)feed.scrollTop=feed.scrollHeight;
   }catch(e){
     status.textContent=e.message;
     if(e.message.includes('승인')){pane.hidden=true;actions.hidden=true;}
   }finally{busy=false;}
 }
 function openSignupForm(){
   applyForm.reset();
   formNickname.value=sharedProfile?.nickname||'';
   formNickname.readOnly=Boolean(sharedProfile);
   document.getElementById('clubNicknameHint').textContent=sharedProfile
     ?'기존 채팅 프로필 닉네임이에요. 변경하려면 내 정보에서 수정해 주세요.'
     :'처음 신청한다면 이 닉네임으로 공통 채팅 프로필을 함께 만들어요.';
   formFeedback.textContent='';
   applyForm.hidden=false;
   actions.hidden=true;
   formNickname.focus();
 }
 function closeSignupForm(){
   applyForm.reset();
   formNickname.value='';
   formFeedback.textContent='';
   applyForm.hidden=true;
   actions.hidden=membership==='pending'||membership==='approved'||membership==='suspended';
 }
 clubTab.addEventListener('click',refresh);
 applyBtn.addEventListener('click',()=>{
   if(membership==='none'||membership==='rejected')openSignupForm();
 });
 formCancel.addEventListener('click',()=>{
   closeSignupForm();
   status.textContent='가입 작성이 취소되고 입력 내용이 초기화됐어요.';
 });
 applyForm.addEventListener('submit',async event=>{
   event.preventDefault();
   if(!applyForm.reportValidity())return;
   if(membership!=='none'&&membership!=='rejected')return;
   const nickname=formNickname.value.trim();
   if(nickname.length<2||nickname.length>20||nickname==='관리자'){
     formFeedback.textContent='닉네임을 2~20자로 입력해 주세요.';
     return;
   }
   if(!formConsent.checked){
     formFeedback.textContent='가입 안내에 동의해 주세요.';
     return;
   }
   formSubmit.disabled=true;
   formCancel.disabled=true;
   formFeedback.textContent='가입 신청을 접수하고 있어요…';
   try{
     if(!sharedProfile)await ensureSharedProfile(nickname);
     const data=await request('apply',{introduction:formIntroduction.value.trim()});
     closeSignupForm();
     renderMembership(data.status);
   }catch(error){
     formFeedback.textContent=error.message||'가입 신청에 실패했어요. 다시 시도해 주세요.';
   }finally{
     formSubmit.disabled=false;
     formCancel.disabled=false;
   }
 });
 resetBtn.addEventListener('click',async()=>{
   if(!['pending','rejected'].includes(membership))return;
   if(!window.confirm('현재 복작소 클럽 가입 신청을 취소하고 처음부터 다시 할까요?\n기존 일반 채팅방과 대화는 그대로 남아요.'))return;
   resetBtn.disabled=true;
   status.textContent='클럽 가입 신청을 초기화하고 있어요…';
   try{
     const data=await request('withdraw');
     renderMembership(data.status||'none');
     if(data.status==='none'){
       openSignupForm();
       status.textContent='클럽 신청을 초기화했어. 새 신청서를 작성해 줘.';
     }
   }catch(error){
     status.textContent=error.message||'가입 신청 취소에 실패했어요.';
     await refresh();
   }finally{resetBtn.disabled=false;}
 });
 document.getElementById('clubCompose').addEventListener('submit',async e=>{
   e.preventDefault();
   const message=input.value.trim();
   if(!message||membership!=='approved')return;
   sendBtn.disabled=true;
   try{await request('send',{message});input.value='';await loadMessages();}
   catch(err){status.textContent=err.message;}
   finally{sendBtn.disabled=false;}
 });
 setInterval(()=>{
   if(document.hidden||document.body.classList.contains('chat-active')||clubTab.getAttribute('aria-selected')!=='true')return;
   if(membership==='pending')refresh();else loadMessages();
 },4500);
})();
