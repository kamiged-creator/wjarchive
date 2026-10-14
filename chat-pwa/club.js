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
 const clubPanel=document.getElementById('clubPanel');
 const landing=document.getElementById('clubLanding');
 const intro=document.getElementById('clubIntro');
 const approvedEntry=document.getElementById('clubApprovedEntry');
 const enterBtn=document.getElementById('clubEnterBtn');
 const leaveBtn=document.getElementById('clubLeaveBtn');
 const chatFeedback=document.getElementById('clubChatFeedback');
 const actions=document.getElementById('clubActions');
 const feed=document.getElementById('clubMessages');
 const input=document.getElementById('clubMessageInput');
 const sendBtn=document.getElementById('clubSendBtn');
 const adminLink=document.getElementById('clubAdminLink');
 const clubTab=document.getElementById('homeTabClub');
 const returnToClubBtn=document.getElementById('returnClubChatBtn');
 let membership='none',busy=false;
 function updateClubReturnButton(){
   // Preserve the existing private chat while changing bottom tabs.
   // The button is not an alternative to server-side membership authorization.
   returnToClubBtn.hidden=pane.hidden||membership!=='approved';
 }


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
 function leaveClubRoom(restoreFocus=false){
   const wasOpen=!pane.hidden;
   pane.hidden=true;
   landing.hidden=false;
   clubPanel.classList.remove('club-room-open');
   document.body.classList.remove('club-chat-open');
   chatFeedback.textContent='';
   updateClubReturnButton();
   if(restoreFocus&&wasOpen)enterBtn.focus();
 }
 function renderMembership(next){
   membership=next;
   const labels={
     none:'아직 클럽 회원이 아니에요. 아래에서 가입 신청을 해 주세요.',
     pending:'⏳ 가입 신청 완료! 최고관리자의 승인을 기다리고 있어요.',
     approved:'✅ 정회원 가입이 승인되었어요.',
     rejected:'가입이 승인되지 않았어요. 다시 신청할 수 있어요.',
     suspended:'클럽 이용이 제한되었어요. 관리자에게 문의해 주세요.'
   };
   status.textContent=labels[next]||'회원 상태를 확인할 수 없어요.';
   intro.hidden=next==='approved';
   approvedEntry.hidden=next!=='approved';
   if(next!=='approved')leaveClubRoom();
   updateClubReturnButton();
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
     leaveClubRoom();actions.hidden=true;status.textContent=e.message;
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
       if(row.isMine===true)article.classList.add('mine');
       const meta=document.createElement('div');
       meta.className='club-post-meta';
       const name=document.createElement('strong');
       name.textContent=row.isMine===true?'나':(row.nickname||'회원');
       const time=document.createElement('time');
       const date=new Date(row.created_at);
       time.textContent=Number.isNaN(date.getTime())?'':date.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
       const body=document.createElement('p');
       body.textContent=row.body||'';
       meta.append(name,time);
       article.append(meta,body);
       feed.appendChild(article);
     }
     if(atBottom)feed.scrollTop=feed.scrollHeight;
   }catch(e){
     if(e.statusCode===401||e.statusCode===403){
       leaveClubRoom();
       await refresh();
     }else{
       chatFeedback.textContent=e.message;
     }
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
 // Entering the club room is an explicit step after a fresh server-side approval check.
 enterBtn.addEventListener('click',async()=>{
   if(membership!=='approved'||!sharedProfile||enterBtn.disabled)return;
   enterBtn.disabled=true;
   status.textContent='정회원 승인 상태를 확인하고 있어요…';
   try{
     const data=await request('status');
     renderMembership(data.status);
     if(data.status!=='approved')return;
     landing.hidden=true;
     pane.hidden=false;
     clubPanel.classList.add('club-room-open');
     document.body.classList.add('club-chat-open');
     updateClubReturnButton();
     await loadMessages();
     // Do not force-open the virtual keyboard on mobile just for entering a room.
     if(!pane.hidden&&window.matchMedia('(pointer: fine)').matches)input.focus({preventScroll:true});
   }catch(error){
     leaveClubRoom();
     status.textContent=error.message||'클럽 채팅방에 입장하지 못했어요.';
   }finally{
     enterBtn.disabled=false;
   }
 });
 leaveBtn.addEventListener('click',()=>leaveClubRoom(true));
 // Switching tabs is navigation, not an explicit exit from the private room.
 // Remove only the page layout class while another panel is displayed.
 for(const tab of document.querySelectorAll('[data-home-tab]')){
   if(tab!==clubTab)tab.addEventListener('click',()=>{
     document.body.classList.remove('club-chat-open');
     updateClubReturnButton();
   });
 }
 clubTab.addEventListener('click',()=>{
   if(!pane.hidden&&membership==='approved'){
     document.body.classList.add('club-chat-open');
     loadMessages(); // Each fetch still verifies the user's server-side approval.
   }
   refresh(); // Re-check membership whenever the private tab is selected.
 });
 returnToClubBtn.addEventListener('click',()=>clubTab.click());
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
   catch(err){
     if(err.statusCode===401||err.statusCode===403){
       leaveClubRoom();
       await refresh();
     }else{chatFeedback.textContent=err.message;}
   }
   finally{sendBtn.disabled=false;}
 });
 setInterval(()=>{
   if(document.hidden||document.body.classList.contains('chat-active')||clubTab.getAttribute('aria-selected')!=='true')return;
   if(membership==='pending')refresh();else if(!pane.hidden)loadMessages();
 },4500);
})();
