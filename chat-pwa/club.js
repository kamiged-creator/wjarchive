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
 const onlineCount=document.getElementById('clubOnlineCount');
 const inviteBtn=document.getElementById('clubInviteBtn');
 const moreBtn=document.getElementById('clubMoreBtn');
 const roomMenu=document.getElementById('clubRoomMenu');
 const roomMenuLeaveBtn=document.getElementById('clubMenuLeaveBtn');
 const chatFeedback=document.getElementById('clubChatFeedback');
 const actions=document.getElementById('clubActions');
 const feed=document.getElementById('clubMessages');
 const input=document.getElementById('clubMessageInput');
 const sendBtn=document.getElementById('clubSendBtn');
 const adminLink=document.getElementById('clubAdminLink');
 const clubTab=document.getElementById('homeTabClub');
 const returnToClubBtn=document.getElementById('returnClubChatBtn');
 let membership='none',busy=false;
 let sending=false,roomGeneration=0,confirmedRows=[],optimisticMessage=null,lastRenderKey='';
 let presenceBusy=false;
 const clubIsVisible=()=>!pane.hidden&&membership==='approved'&&!document.hidden&&
   !document.body.classList.contains('chat-active')&&
   clubTab.getAttribute('aria-selected')==='true';
 function leavePresence(){
   if(!sharedProfile)return;
   // Same profile-token verification as every other club action.
   fetch('/api/store-inquiries',{
     method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({action:'club-leave',...sharedCredentials()}),
     keepalive:true
   }).catch(()=>{});
 }
 async function updatePresence(){
   if(!clubIsVisible()||presenceBusy)return;
   presenceBusy=true;
   const generation=roomGeneration;
   try{
     const data=await request('presence');
     if(generation===roomGeneration&&clubIsVisible()){
       const total=Math.max(0,Number(data.onlineCount)||0);
       onlineCount.textContent='🟢 접속 '+total+'명';
     }
   }catch(err){
     if(generation===roomGeneration&&clubIsVisible()){
       onlineCount.textContent='접속 확인 중';
       if(err.statusCode===401||err.statusCode===403)refresh();
     }
   }finally{presenceBusy=false;}
 }
 function setRoomMenu(open){
   roomMenu.hidden=!open;
   moreBtn.setAttribute('aria-expanded',String(open));
 }
 moreBtn.addEventListener('click',()=>setRoomMenu(roomMenu.hidden));
 roomMenuLeaveBtn.addEventListener('click',()=>{
   setRoomMenu(false);
   leaveClubRoom(true);
 });
 document.addEventListener('click',event=>{
   if(!roomMenu.hidden&&!event.target.closest('.club-room-menu-wrap'))setRoomMenu(false);
 });
 document.addEventListener('keydown',event=>{
   if(event.key==='Escape'&&!roomMenu.hidden){
     setRoomMenu(false);moreBtn.focus();
   }
 });
 inviteBtn.addEventListener('click',async()=>{
   const link=new URL('/chat.html?tab=club',location.origin).href;
   const description='복작소 클럽에 초대합니다. 가입 신청 후 최고관리자의 승인을 받으면 채팅할 수 있어요.';
   try{
     if(navigator.share){
       await navigator.share({title:'복작소 클럽 초대',text:description,url:link});
     }else if(navigator.clipboard?.writeText){
       await navigator.clipboard.writeText(link);
       chatFeedback.textContent='초대 링크를 복사했어. 정회원 승인 후 채팅할 수 있어.';
     }else{
       window.prompt('클럽 초대 링크를 복사해 주세요.',link);
     }
   }catch(error){
     if(error.name==='AbortError')return;
     if(navigator.clipboard?.writeText){
       try{
         await navigator.clipboard.writeText(link);
         chatFeedback.textContent='초대 링크를 복사했어. 정회원 승인 후 채팅할 수 있어.';
         return;
       }catch(_){}
     }
     window.prompt('클럽 초대 링크를 복사해 주세요.',link);
   }
 });
 const clubMobilePointer=window.matchMedia('(max-width: 560px) and (pointer: coarse)');
 let keyboardScrollScheduled=false;
 const visibleViewportHeight=()=>window.visualViewport?.height||window.innerHeight;
 // A focused input is NOT enough to prove that Samsung's keyboard is open:
 // the Back key can dismiss the IME without blurring the input.
 let fullClubViewportHeight=visibleViewportHeight();
 let clubViewportWidth=window.innerWidth;
 function keepLatestVisibleWhileTyping(){
   if(keyboardScrollScheduled||!document.body.classList.contains('club-input-focused'))return;
   keyboardScrollScheduled=true;
   requestAnimationFrame(()=>{
     keyboardScrollScheduled=false;
     if(document.body.classList.contains('club-input-focused')&&!pane.hidden){
       feed.scrollTop=feed.scrollHeight;
     }
   });
 }
 function syncClubInputFocus(){
   const visibleHeight=visibleViewportHeight();
   if(window.innerWidth!==clubViewportWidth){
     clubViewportWidth=window.innerWidth;
     // Rotation or split-screen resizing establishes a new baseline.
     fullClubViewportHeight=visibleHeight;
   }
   const focused=document.activeElement===input;
   // When the input isn't focused, any viewport size is a legitimate baseline.
   // While it is focused, only grow the baseline as the keyboard retracts.
   if(!focused)fullClubViewportHeight=visibleHeight;
   else fullClubViewportHeight=Math.max(fullClubViewportHeight,visibleHeight);
   const keyboardOpen=fullClubViewportHeight-visibleHeight>130;
   const typing=clubMobilePointer.matches&&!document.hidden&&!pane.hidden&&
     membership==='approved'&&clubTab.getAttribute('aria-selected')==='true'&&
     focused&&keyboardOpen;
   document.body.classList.toggle('club-input-focused',typing);
   if(typing)keepLatestVisibleWhileTyping();
 }
 input.addEventListener('focus',syncClubInputFocus);
 input.addEventListener('blur',syncClubInputFocus);
 window.addEventListener('resize',syncClubInputFocus,{passive:true});
 window.visualViewport?.addEventListener('resize',syncClubInputFocus,{passive:true});
 window.visualViewport?.addEventListener('scroll',syncClubInputFocus,{passive:true});
 document.addEventListener('visibilitychange',syncClubInputFocus);
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
   if(wasOpen)leavePresence();
   setRoomMenu(false);
   roomGeneration++;
   confirmedRows=[];
   optimisticMessage=null;
   lastRenderKey='';
   feed.replaceChildren();
   pane.hidden=true;
   landing.hidden=false;
   clubPanel.classList.remove('club-room-open');
   document.body.classList.remove('club-chat-open');
   document.body.classList.remove('club-input-focused');
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
 function renderMessages(forceBottom=false){
   if(pane.hidden)return;
   const items=confirmedRows.slice();
   if(optimisticMessage&&!items.some(row=>optimisticMessage.id&&String(row.id)===String(optimisticMessage.id))){
     items.push(optimisticMessage);
   }
   // Polling unchanged messages must not rebuild portraits or flicker the
   // conversation. Only redraw when a row actually changed.
   const key=JSON.stringify(items.map(row=>[row.id||'',row.nickname||'',row.body||'',
     row.created_at||'',row.avatarUrl||'',row.isMine===true,row.pending===true]));
   if(key===lastRenderKey){
     if(forceBottom)feed.scrollTop=feed.scrollHeight;
     return;
   }
   const atBottom=feed.scrollHeight-feed.clientHeight-feed.scrollTop<100;
   lastRenderKey=key;
   feed.replaceChildren();
   if(!items.length){
     const empty=document.createElement('p');
     empty.textContent='첫 인사를 남겨보세요.';
     feed.appendChild(empty);
   }
   for(const row of items){
     const messageRow=document.createElement('div');
     messageRow.className='club-message-row';
     if(row.isMine===true)messageRow.classList.add('mine');
     const avatar=document.createElement('span');
     avatar.className='club-post-avatar';
     avatar.setAttribute('aria-label',(row.isMine===true?'내':(row.nickname||'회원'))+' 프로필 사진');
     // The photo endpoint may temporarily run an older build. Never turn
     // the current member's already-saved portrait into a silhouette when a
     // confirmed message lacks avatarUrl.
     const ownPhoto=row.isMine===true?sharedProfile?.avatar_url:null;
     const candidate=typeof row.avatarUrl==='string'&&row.avatarUrl?row.avatarUrl:ownPhoto;
     const avatarUrl=typeof candidate==='string'&&/^https:\/\//i.test(candidate)?candidate:'';
     if(avatarUrl){
       const portrait=document.createElement('img');
       portrait.src=avatarUrl;
       portrait.alt='';
       portrait.loading='lazy';
       portrait.decoding='async';
       portrait.addEventListener('error',()=>{
         avatar.replaceChildren();
         avatar.textContent='👤';
       },{once:true});
       avatar.appendChild(portrait);
     }else{
       avatar.textContent='👤';
     }
     const article=document.createElement('article');
     article.className='club-post';
     if(row.isMine===true)article.classList.add('mine');
     if(row.pending===true)article.classList.add('pending');
     const meta=document.createElement('div');
     meta.className='club-post-meta';
     const name=document.createElement('strong');
     name.textContent=row.isMine===true?'나':(row.nickname||'회원');
     const time=document.createElement('time');
     const date=new Date(row.created_at);
     time.textContent=row.pending===true?'보내는 중…':
       (Number.isNaN(date.getTime())?'':date.toLocaleString('ko-KR',{
         month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'
       }));
     const body=document.createElement('p');
     body.textContent=row.body||'';
     meta.append(name,time);
     article.append(meta,body);
     messageRow.append(avatar,article);
     feed.appendChild(messageRow);
   }
   if(atBottom||forceBottom)feed.scrollTop=feed.scrollHeight;
 }
 // Initial entry needs an extra layout pass: mobile panels resize after
 // the message nodes are painted, so a synchronous scrollTop can stop early.
 // Only run on first entry, never on periodic refresh or manual history scroll.
 function scrollLatestOnEntry(){
   const generation=roomGeneration;
   const move=()=>{
     if(generation!==roomGeneration||pane.hidden||
        clubTab.getAttribute('aria-selected')!=='true')return;
     feed.scrollTop=feed.scrollHeight;
   };
   move();
   requestAnimationFrame(()=>{
     move();
     requestAnimationFrame(move);
   });
 }
 async function loadMessages(){
   if(busy||membership!=='approved'||pane.hidden||sending)return;
   busy=true;
   const generation=roomGeneration;
   try{
     const result=await request('messages');
     if(generation!==roomGeneration||pane.hidden)return;
     confirmedRows=Array.isArray(result.messages)?result.messages:[];
     if(optimisticMessage?.id&&confirmedRows.some(row=>String(row.id)===String(optimisticMessage.id))){
       optimisticMessage=null;
     }
     renderMessages();
   }catch(e){
     if(generation!==roomGeneration)return;
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
     // On a new backend this combines the approval check and message list.
     // Older backends safely fall back to the original two-request sequence.
     let data;
     try{
       data=await request('enter');
     }catch(error){
       if(error.statusCode!==400)throw error;
       const statusResult=await request('status');
       if(statusResult.status==='approved'){
         const messageResult=await request('messages');
         data={...statusResult,messages:messageResult.messages};
       }else{
         data={...statusResult,messages:[]};
       }
     }
     renderMembership(data.status);
     if(data.status!=='approved')return;
     landing.hidden=true;
     pane.hidden=false;
     clubPanel.classList.add('club-room-open');
     document.body.classList.add('club-chat-open');
     updateClubReturnButton();
     onlineCount.textContent='접속 확인 중';
     confirmedRows=Array.isArray(data.messages)?data.messages:[];
     optimisticMessage=null;
     lastRenderKey='';
     renderMessages(true);
     scrollLatestOnEntry();
     updatePresence();
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
     if(!pane.hidden)leavePresence();
     document.body.classList.remove('club-chat-open','club-input-focused');
     setRoomMenu(false);
     updateClubReturnButton();
   });
 }
 clubTab.addEventListener('click',()=>{
   if(!pane.hidden&&membership==='approved'){
     document.body.classList.add('club-chat-open');
     syncClubInputFocus();
     updatePresence();
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
   if(!message||membership!=='approved'||pane.hidden||sending)return;
   sending=true;
   sendBtn.disabled=true;
   const generation=roomGeneration;
   const draft={
     id:null,nickname:sharedProfile?.nickname||'나',body:message,
     created_at:new Date().toISOString(),isMine:true,
     avatarUrl:sharedProfile?.avatar_url||null,pending:true
   };
   optimisticMessage=draft;
   chatFeedback.textContent='';
   input.value='';
   renderMessages(true); // Appear immediately without waiting for the network.
   try{
     const response=await request('send',{message});
     if(generation!==roomGeneration)return;
     if(response.message?.id){
       draft.id=response.message.id;
       draft.created_at=response.message.created_at||draft.created_at;
     }
     draft.pending=false;
     renderMessages(true);
   }catch(err){
     if(generation!==roomGeneration)return;
     optimisticMessage=null;
     renderMessages();
     if(err.statusCode===401||err.statusCode===403){
       leaveClubRoom();
       await refresh();
     }else{
       // Put the unsent text back, including anything typed during upload.
       input.value=message+(input.value?' '+input.value:'');
       chatFeedback.textContent='전송하지 못했어요. 다시 전송해 주세요. '+(err.message||'');
     }
   }finally{
     sending=false;
     sendBtn.disabled=false;
     if(generation===roomGeneration&&optimisticMessage&&!pane.hidden){
       // Reconcile with the authoritative, approved-members-only server.
       loadMessages();
     }
   }
 });
 setInterval(()=>{
   if(document.hidden||document.body.classList.contains('chat-active')||clubTab.getAttribute('aria-selected')!=='true')return;
   if(membership==='pending')refresh();else if(!pane.hidden)loadMessages();
 },2000);
 // Count members in this private room, not all approved club members.
 setInterval(updatePresence,20000);
 document.addEventListener('visibilitychange',()=>{
   if(document.hidden){
     if(!pane.hidden)leavePresence();
   }else if(clubIsVisible()){
     updatePresence();
   }
 });
 window.addEventListener('pagehide',()=>{
   if(!pane.hidden)leavePresence();
 });
})();
