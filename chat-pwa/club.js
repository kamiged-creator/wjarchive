/* 복작소 클럽: UI only, authorization is always verified by the server. */
(()=>{
 'use strict';
 const status=document.getElementById('clubStatus');
 const applyBtn=document.getElementById('clubApplyBtn');
 const pane=document.getElementById('clubChat');
 const actions=document.getElementById('clubActions');
 const feed=document.getElementById('clubMessages');
 const input=document.getElementById('clubMessageInput');
 const sendBtn=document.getElementById('clubSendBtn');
 const adminLink=document.getElementById('clubAdminLink');
 const clubTab=document.getElementById('homeTabClub');
 let membership='none',busy=false;

 async function request(action,extra={}){
   const response=await fetch('/api/club',{
     method:'POST',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({action,...sharedCredentials(),...extra})
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.message||'클럽 요청을 완료하지 못했습니다.');
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
   actions.hidden=next==='approved'||next==='pending'||next==='suspended';
   applyBtn.textContent=next==='rejected'?'가입 다시 신청':'클럽 가입 신청';
 }
 async function refresh(){
   adminLink.hidden=!sessionStorage.getItem(ADMIN_KEY);
   if(!sharedProfile){
     renderMembership('none');
     status.textContent='내 정보에서 프로필을 먼저 만든 다음 클럽 가입을 신청해 주세요.';
     applyBtn.textContent='내 프로필 만들기';
     return;
   }
   try{
     const data=await request('status');
     renderMembership(data.status);
     if(data.status==='approved')await loadMessages();
   }catch(e){
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
 clubTab.addEventListener('click',refresh);
 applyBtn.addEventListener('click',async()=>{
   if(!sharedProfile){
     document.getElementById('homeTabMe').click();
     document.getElementById('homeProfileEditBtn').click();
     return;
   }
   applyBtn.disabled=true;status.textContent='신청을 접수하고 있어요…';
   try{
     const data=await request('apply');
     renderMembership(data.status);
   }catch(e){status.textContent=e.message;}
   finally{applyBtn.disabled=false;}
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
   loadMessages();
 },4500);
})();
