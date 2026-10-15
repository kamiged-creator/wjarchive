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
 const clubThemeToggle=document.getElementById('clubThemeToggle');
 const pageThemeToggle=document.getElementById('themeToggle');
 const chatFeedback=document.getElementById('clubChatFeedback');
 const actions=document.getElementById('clubActions');
 const feed=document.getElementById('clubMessages');
 const input=document.getElementById('clubMessageInput');
 const sendBtn=document.getElementById('clubSendBtn');
 const attachBtn=document.getElementById('clubAttachBtn'),attachMenu=document.getElementById('clubAttachmentMenu');
 const galleryInput=document.getElementById('clubGalleryInput'),cameraInput=document.getElementById('clubCameraInput');
 const preview=document.getElementById('clubAttachmentPreview'),previewImage=document.getElementById('clubPreviewImage');
 const previewName=document.getElementById('clubPreviewName'),removePhotoBtn=document.getElementById('clubRemoveAttachment');
 const imageModal=document.getElementById('clubImageModal'),largeImage=document.getElementById('clubImageLarge');
 const imageCloseBtn=document.getElementById('clubImageClose');
 const photoActions=document.getElementById('clubPhotoActions');
 const photoActionsCard=document.getElementById('clubPhotoActionsCard');
 const copyPhotoBtn=document.getElementById('clubCopyPhoto');
 const deletePhotoBtn=document.getElementById('clubDeletePhoto');
 const adminLink=document.getElementById('clubAdminLink');
 const clubTab=document.getElementById('homeTabClub');
 const returnToClubBtn=document.getElementById('returnClubChatBtn');
 let membership='none',busy=false;
 let sending=false,roomGeneration=0,confirmedRows=[],optimisticMessage=null,lastRenderKey='';
 let selectedPhoto=null,photoPreviewUrl=null;
 let entryFollowCleanup=null;
 let menuPhoto=null,largePhoto=null,photoMenuBusy=false;
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
 function syncClubThemeIcon(){
   const dark=document.body.classList.contains('dark');
   clubThemeToggle.textContent=dark?'☀':'☾';
   const label=dark?'라이트모드로 전환':'다크모드로 전환';
   clubThemeToggle.setAttribute('aria-label',label);
   clubThemeToggle.setAttribute('title',label);
 }
 // The existing page toggle owns the saved preference and applies the theme.
 clubThemeToggle.addEventListener('click',()=>{
   pageThemeToggle.click();
   syncClubThemeIcon();
 });
 // Also stay in sync when the main chat header changes the theme.
 new MutationObserver(syncClubThemeIcon).observe(document.body,{attributes:true,attributeFilter:['class']});
 syncClubThemeIcon();
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
 function clearPhotoSelection(){
   if(photoPreviewUrl)URL.revokeObjectURL(photoPreviewUrl);
   selectedPhoto=null;photoPreviewUrl=null;preview.hidden=true;
   previewImage.removeAttribute('src');previewName.textContent='사진 1장';
   galleryInput.value='';cameraInput.value='';
 }
 function hideAttachMenu(){attachMenu.hidden=true;attachBtn.setAttribute('aria-expanded','false')}
 function showClubImage(url,row=null){
   if(typeof url!=='string'||!/^https:\/\//i.test(url))return;
   largePhoto=row;largeImage.src=url;imageModal.hidden=false;imageCloseBtn.focus();
 }
 function closeClubImage(){imageModal.hidden=true;largePhoto=null;largeImage.removeAttribute('src')}
 function showPhotoActions(row,source){
   if(!row||row.pending===true||!/^https:\/\//i.test(String(row.imageUrl||'')))return;
   menuPhoto=row;
   deletePhotoBtn.hidden=!(row.isMine===true&&Number.isSafeInteger(Number(row.id))&&Number(row.id)>0);
   photoActions.hidden=false;
   // Center over the actual visible photo, not the page or finger position.
   const actualPhoto=source?.querySelector?.('.club-post-image')||source;
   const rect=actualPhoto?.getBoundingClientRect();
   const viewportW=document.documentElement.clientWidth||window.innerWidth;
   const viewportH=window.innerHeight;
   const area=!imageModal.hidden?null:feed.getBoundingClientRect();
   const width=photoActionsCard.offsetWidth||140;
   const height=photoActionsCard.offsetHeight||54;
   let centerX=viewportW/2,centerY=viewportH/2;
   if(rect&&rect.width>0&&rect.height>0){
     const x1=Math.max(0,rect.left,area?.left??0);
     const x2=Math.min(viewportW,rect.right,area?.right??viewportW);
     const y1=Math.max(0,rect.top,area?.top??0);
     const y2=Math.min(viewportH,rect.bottom,area?.bottom??viewportH);
     centerX=x2>x1?(x1+x2)/2:(rect.left+rect.right)/2;
     centerY=y2>y1?(y1+y2)/2:(rect.top+rect.bottom)/2;
   }
   photoActionsCard.style.transform='none';
   photoActionsCard.style.left=Math.round(Math.max(10,Math.min(centerX-width/2,viewportW-width-10)))+'px';
   photoActionsCard.style.top=Math.round(Math.max(10,Math.min(centerY-height/2,viewportH-height-10)))+'px';
   copyPhotoBtn.focus({preventScroll:true});
 }
 function closePhotoActions(){if(photoMenuBusy)return;photoActions.hidden=true;menuPhoto=null}
 // Ordinary tap expands the image. Holding ~0.5 sec opens the photo menu.
 function bindPhotoPress(element,readRow,onTap){
   let pressTimer=null,originX=0,originY=0,held=false;
   const cancel=()=>{if(pressTimer!==null){clearTimeout(pressTimer);pressTimer=null}};
   element.addEventListener('pointerdown',event=>{
     if(event.pointerType==='mouse'&&event.button!==0)return;
     cancel();held=false;originX=event.clientX;originY=event.clientY;
     const row=readRow();
     if(!row||row.pending||!/^https:\/\//i.test(String(row.imageUrl||'')))return;
     pressTimer=setTimeout(()=>{pressTimer=null;held=true;showPhotoActions(readRow(),element,{x:originX,y:originY})},550);
   });
   element.addEventListener('pointermove',event=>{
     if(Math.abs(event.clientX-originX)>11||Math.abs(event.clientY-originY)>11)cancel();
   });
   element.addEventListener('pointerup',cancel);
   element.addEventListener('pointercancel',cancel);
   element.addEventListener('pointerleave',event=>{if(event.pointerType==='mouse')cancel()});
   element.addEventListener('contextmenu',event=>{
     const row=readRow();if(!row||row.pending||!/^https:\/\//i.test(String(row.imageUrl||'')))return;
     event.preventDefault();cancel();held=true;showPhotoActions(row,element,{x:event.clientX,y:event.clientY});
   });
   element.addEventListener('click',event=>{
     if(held){event.preventDefault();event.stopPropagation();held=false;return}
     if(onTap)onTap();
   });
 }
 async function copyPhotoToClipboard(row){
   const url=String(row?.imageUrl||'');
   if(!/^https:\/\//i.test(url))throw new Error('복사할 사진을 찾지 못했어.');
   if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
     try{
       // Chrome can keep a transient user gesture while the PNG promise resolves.
       const pngBlob=(async()=>{
         const response=await fetch(url,{mode:'cors'});
         if(!response.ok)throw new Error('사진 읽기 실패');
         const bitmap=await createImageBitmap(await response.blob());
         try{
           const canvas=document.createElement('canvas');
           canvas.width=bitmap.width;canvas.height=bitmap.height;
           canvas.getContext('2d').drawImage(bitmap,0,0);
           const png=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
           if(!png)throw new Error('사진 변환 실패');
           return png;
         }finally{bitmap.close?.()}
       })();
       await navigator.clipboard.write([new ClipboardItem({'image/png':pngBlob})]);
       return '사진을 복사했어.';
     }catch(_){/* Some Android browsers block cross-origin image clipboard writes. */}
   }
   if(navigator.clipboard?.writeText){
     try{await navigator.clipboard.writeText(url);return '사진 자체 대신 사진 링크를 복사했어.'}catch(_){}
   }
   window.prompt('사진 링크를 길게 눌러 복사해 줘.',url);
   return '';
 }

 async function compressClubPhoto(file){
   if(!file||!/^image\//.test(file.type))throw new Error('사진 파일만 선택할 수 있어요.');
   if(file.size>12*1024*1024)throw new Error('12MB 이하 사진만 선택할 수 있어요.');
   let bitmap;try{bitmap=await createImageBitmap(file)}catch(_){throw new Error('읽을 수 없는 사진이에요. JPG나 PNG를 선택해 주세요.')}
   const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   const ctx=canvas.getContext('2d');
   if(!ctx){bitmap.close?.();throw new Error('사진 변환에 실패했어요.')}
   ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.80));
   if(!blob||blob.type!=='image/webp'||blob.size>6*1024*1024)throw new Error('사진 압축에 실패했어요.');
   return new File([blob],'club-'+Date.now()+'.webp',{type:'image/webp'});
 }
 async function uploadClubPhoto(file){
   const prepared=await compressClubPhoto(file);
   const auth=await request('image-auth');
   const form=new FormData();
   for(const [key,value]of Object.entries({fileName:prepared.name,publicKey:auth.publicKey,signature:auth.signature,expire:String(auth.expire),token:auth.token,folder:auth.folder,useUniqueFileName:'true'}))form.append(key,value);
   form.append('file',prepared);
   const response=await fetch(auth.uploadEndpoint,{method:'POST',body:form});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.url||!result.fileId)throw new Error(result.message||'사진 업로드에 실패했어요.');
   return result;
 }
 function leaveClubRoom(restoreFocus=false){
   const wasOpen=!pane.hidden;
   if(wasOpen)leavePresence();
   roomGeneration++;
   confirmedRows=[];
   optimisticMessage=null;
   lastRenderKey='';
   stopEntryFollow();
   clearPhotoSelection();hideAttachMenu();photoMenuBusy=false;photoActions.hidden=true;menuPhoto=null;closeClubImage();
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
     row.created_at||'',row.avatarUrl||'',row.imageUrl||'',row.isMine===true,row.pending===true]));
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
   let previousDay='';
   // All visitors see club dates in Korean Standard Time.
   const roomDay=new Intl.DateTimeFormat('sv-SE',{
     timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
   });
   const roomDayLabel=new Intl.DateTimeFormat('ko-KR',{
     timeZone:'Asia/Seoul',year:'numeric',month:'long',day:'numeric',weekday:'long'
   });
   for(const row of items){
     const date=new Date(row.created_at);
     if(Number.isFinite(date.getTime())){
       const day=roomDay.format(date);
       if(day!==previousDay){
         const divider=document.createElement('div');
         divider.className='club-date-divider';
         divider.setAttribute('role','separator');
         const label=roomDayLabel.format(date);
         divider.setAttribute('aria-label',label);
         const dateText=document.createElement('time');
         dateText.dateTime=day;
         dateText.textContent=label;
         divider.append(dateText);
         feed.append(divider);
         previousDay=day;
       }
     }
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
     name.textContent=row.nickname||'회원';
     const time=document.createElement('time');
     time.textContent=row.pending===true?'보내는 중…':
       (Number.isNaN(date.getTime())?'':date.toLocaleString('ko-KR',{
         month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'
       }));
     const body=document.createElement('p');
     body.textContent=row.body||'';
     if(row.isMine!==true)meta.append(name);
     meta.append(time);
     article.append(meta);
     if(row.imageUrl&&(/^https:\/\//i.test(row.imageUrl)||(row.pending===true&&row.imageUrl.startsWith('blob:')))){
       const button=document.createElement('button');button.type='button';
       button.className='club-photo-open';button.setAttribute('aria-label','사진 크게 보기');
       const photo=document.createElement('img');
       photo.className='club-post-image';photo.src=row.imageUrl;photo.alt='클럽 회원이 보낸 사진';
       photo.loading='lazy';photo.decoding='async';
       button.append(photo);
       bindPhotoPress(button,()=>row,()=>showClubImage(row.imageUrl,row));
       article.append(button);
     }
     if(row.body&&(!row.imageUrl||row.body!=='사진'))article.append(body);
     messageRow.append(avatar,article);
     feed.appendChild(messageRow);
   }
   if(atBottom||forceBottom)feed.scrollTop=feed.scrollHeight;
 }
 // On entry, photos expand asynchronously and may otherwise push recent
 // messages out of view. Follow content-height changes until images settle,
 // but immediately stop following when the visitor interacts with the history.
 function stopEntryFollow(){
   if(!entryFollowCleanup)return;
   const cleanup=entryFollowCleanup;
   entryFollowCleanup=null;
   cleanup();
 }
 function scrollLatestOnEntry(){
   stopEntryFollow();
   const generation=roomGeneration;
   let active=true,frame=0;
   const snap=()=>{
     frame=0;
     if(!active||generation!==roomGeneration||pane.hidden||
        clubTab.getAttribute('aria-selected')!=='true')return;
     feed.scrollTop=feed.scrollHeight;
   };
   const queueSnap=()=>{
     if(!active||frame)return;
     frame=requestAnimationFrame(snap);
   };
   const sizes=typeof ResizeObserver==='function'?new ResizeObserver(queueSnap):null;
   const observeChildren=()=>{
     if(!sizes)return;
     for(const child of feed.children)sizes.observe(child);
   };
   const mutations=typeof MutationObserver==='function'?new MutationObserver(()=>{
     observeChildren();
     queueSnap();
   }):null;
   observeChildren();
   mutations?.observe(feed,{childList:true});
   const timers=[80,200,500,1000,2000,4000,7000].map(delay=>setTimeout(queueSnap,delay));
   const stopTimer=setTimeout(stopEntryFollow,10000);
   entryFollowCleanup=()=>{
     active=false;
     sizes?.disconnect();mutations?.disconnect();
     timers.forEach(clearTimeout);clearTimeout(stopTimer);
     if(frame)cancelAnimationFrame(frame);
   };
   snap();
   requestAnimationFrame(()=>{snap();requestAnimationFrame(snap)});
 }
 // Manual scrolling always wins over automatic entry positioning.
 feed.addEventListener('pointerdown',stopEntryFollow,{passive:true});
 feed.addEventListener('touchstart',stopEntryFollow,{passive:true});
 feed.addEventListener('wheel',stopEntryFollow,{passive:true});
 feed.addEventListener('keydown',stopEntryFollow);
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
     stopEntryFollow();
     document.body.classList.remove('club-chat-open','club-input-focused');
     updateClubReturnButton();
   });
 }
 clubTab.addEventListener('click',()=>{
   if(!pane.hidden&&membership==='approved'){
     document.body.classList.add('club-chat-open');
     scrollLatestOnEntry();
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
 // Android/Samsung IME: tapping Send used to blur the input first. That
 // shrinks/reflows the keyboard layout and moves the button before the click,
 // so the first tap only dismisses the keyboard. Keep focus through the tap,
 // and submit explicitly on touch/pen release; the submit guard below prevents
 // a later native click from sending the same message twice.
 const composeForm=document.getElementById('clubCompose');
 sendBtn.addEventListener('pointerdown',event=>{
   if(event.pointerType!=='mouse'&&event.isPrimary&&document.activeElement===input){
     event.preventDefault();
   }
 });
 sendBtn.addEventListener('pointerup',event=>{
   if(event.pointerType==='mouse'||!event.isPrimary||sendBtn.disabled)return;
   const bounds=sendBtn.getBoundingClientRect();
   if(event.clientX<bounds.left||event.clientX>bounds.right||
      event.clientY<bounds.top||event.clientY>bounds.bottom)return;
   composeForm.requestSubmit(sendBtn);
 });
 // Grow the unified composer from one to three lines without shrinking the chat feed.
 function resizeClubComposer(){
   input.style.height='auto';
   const contentHeight=input.scrollHeight;
   const nextHeight=Math.min(88,Math.max(40,contentHeight));
   input.style.height=nextHeight+'px';
   input.style.overflowY=contentHeight>88?'auto':'hidden';
   if(document.activeElement===input)keepLatestVisibleWhileTyping();
 }
 input.addEventListener('input',resizeClubComposer);
 // Samsung's Korean IME uses Enter to confirm characters. On touch screens,
 // Enter adds a new line; the separate Send button submits the message.
 input.addEventListener('keydown',event=>{
   if(event.key!=='Enter')return;
   if(event.isComposing||event.keyCode===229)return;
   if(!clubMobilePointer.matches&&!event.shiftKey){
     event.preventDefault();
     if(!sendBtn.disabled)document.getElementById('clubCompose').requestSubmit(sendBtn);
   }
 });
 resizeClubComposer();

 function selectClubPhoto(file){
   if(!file||sending)return;
   try{
     if(!/^image\//.test(file.type)||file.size>12*1024*1024)
       throw new Error('12MB 이하의 사진만 선택할 수 있어요.');
     clearPhotoSelection();
     selectedPhoto=file;photoPreviewUrl=URL.createObjectURL(file);
     previewImage.src=photoPreviewUrl;previewName.textContent=file.name||'사진 1장';
     preview.hidden=false;chatFeedback.textContent='';
   }catch(error){chatFeedback.textContent=error.message||'사진을 선택하지 못했어요.'}
 }
 // The mobile keyboard's Paste action exposes actual image blobs through
 // clipboardData. Reuse the existing photo preview and authenticated uploader.
 // Ordinary text paste remains untouched.
 function handlePastedClubPhoto(event){
   if(membership!=='approved'||pane.hidden||sending||event.defaultPrevented)return;
   const data=event.clipboardData;
   if(!data)return;
   const items=Array.from(data.items||[]);
   let photo=null;
   for(const item of items){
     if(item.kind==='file'&&/^image\//i.test(item.type||'')){
       photo=item.getAsFile?.()||null;
       if(photo)break;
     }
   }
   if(!photo)photo=Array.from(data.files||[]).find(file=>/^image\//i.test(file.type||''))||null;
   if(!photo)return; // Keep text, URLs and formatting handled by the browser.
   event.preventDefault(); // Prevent pasted image HTML or a blob URL appearing as text.
   const mime=photo.type||'image/png';
   const extension=mime==='image/jpeg'?'jpg':mime==='image/webp'?'webp':mime==='image/gif'?'gif':'png';
   const file=new File([photo],'붙여넣은사진-'+Date.now()+'.'+extension,{type:mime});
   selectClubPhoto(file);
   if(selectedPhoto===file){
     chatFeedback.textContent='사진이 첨부됐어. 확인하고 전송을 눌러줘.';
   }
   resizeClubComposer();
 }
 input.addEventListener('paste',handlePastedClubPhoto);
 attachBtn.addEventListener('click',()=>{
   if(membership!=='approved'||pane.hidden||sending)return;
   const open=attachMenu.hidden;attachMenu.hidden=!open;
   attachBtn.setAttribute('aria-expanded',String(open));
   if(open)input.blur();
 });
 document.getElementById('clubChoosePhoto').addEventListener('click',()=>{hideAttachMenu();galleryInput.click()});
 document.getElementById('clubTakePhoto').addEventListener('click',()=>{hideAttachMenu();cameraInput.click()});
 document.getElementById('clubCancelAttachment').addEventListener('click',hideAttachMenu);
 for(const picker of [galleryInput,cameraInput]){
   picker.addEventListener('change',()=>{const file=picker.files?.[0];picker.value='';selectClubPhoto(file)});
 }
 removePhotoBtn.addEventListener('click',clearPhotoSelection);
 document.addEventListener('click',event=>{
   if(!attachMenu.hidden&&!event.target.closest('.club-plus-wrap'))hideAttachMenu();
 });
 // Long press also works on the enlarged image; the menu overlays either view.
 bindPhotoPress(largeImage,()=>largePhoto,null);
 copyPhotoBtn.addEventListener('click',async()=>{
   if(!menuPhoto||photoMenuBusy)return;
   const row=menuPhoto;photoMenuBusy=true;copyPhotoBtn.disabled=true;deletePhotoBtn.disabled=true;
   try{
     const notice=await copyPhotoToClipboard(row);
     photoActions.hidden=true;menuPhoto=null;
     if(notice)chatFeedback.textContent=notice;
   }catch(error){chatFeedback.textContent=error.message||'복사하지 못했어.'}
   finally{photoMenuBusy=false;copyPhotoBtn.disabled=false;deletePhotoBtn.disabled=false}
 });
 deletePhotoBtn.addEventListener('click',async()=>{
   const row=menuPhoto;
   if(!row||row.isMine!==true||!Number.isSafeInteger(Number(row.id))||photoMenuBusy)return;
   if(!window.confirm('내가 보낸 사진 메시지를 삭제할까?\n함께 쓴 글도 삭제되고 복구할 수 없어.'))return;
   photoMenuBusy=true;copyPhotoBtn.disabled=true;deletePhotoBtn.disabled=true;
   try{
     await request('delete-message',{messageId:row.id});
     confirmedRows=confirmedRows.filter(item=>String(item.id)!==String(row.id));
     if(optimisticMessage?.id&&String(optimisticMessage.id)===String(row.id))optimisticMessage=null;
     lastRenderKey='';renderMessages();
     photoActions.hidden=true;menuPhoto=null;closeClubImage();
     chatFeedback.textContent='내 사진 메시지를 삭제했어.';
     await loadMessages();
   }catch(error){
     chatFeedback.textContent=error.message||'사진을 삭제하지 못했어.';
   }finally{photoMenuBusy=false;copyPhotoBtn.disabled=false;deletePhotoBtn.disabled=false}
 });
 photoActions.addEventListener('click',event=>{if(event.target===photoActions)closePhotoActions()});
 imageCloseBtn.addEventListener('click',closeClubImage);
 imageModal.addEventListener('click',event=>{if(event.target===imageModal)closeClubImage()});
 document.addEventListener('keydown',event=>{
   if(event.key!=='Escape')return;
   if(!photoActions.hidden)closePhotoActions();
   else if(!imageModal.hidden)closeClubImage();
 });
 composeForm.addEventListener('submit',async e=>{
   e.preventDefault();
   const message=input.value.trim(),photo=selectedPhoto;
   if((!message&&!photo)||membership!=='approved'||pane.hidden||sending)return;
   const wasTyping=document.activeElement===input&&clubMobilePointer.matches;
   sending=true;sendBtn.disabled=true;attachBtn.disabled=true;removePhotoBtn.disabled=true;
   hideAttachMenu();
   const generation=roomGeneration;
   const draft={
     id:null,nickname:sharedProfile?.nickname||'나',body:message||'사진',
     imageUrl:photo?photoPreviewUrl:null,
     created_at:new Date().toISOString(),isMine:true,
     avatarUrl:sharedProfile?.avatar_url||null,pending:true
   };
   optimisticMessage=draft;chatFeedback.textContent='';input.value='';resizeClubComposer();
   renderMessages(true);
   if(wasTyping){input.focus({preventScroll:true});syncClubInputFocus();keepLatestVisibleWhileTyping()}
   try{
     const uploaded=photo?await uploadClubPhoto(photo):null;
     const response=await request('send',{message,...(uploaded?{imageFileId:uploaded.fileId}:{})});
     if(generation!==roomGeneration)return;
     draft.id=response.message?.id||null;
     draft.created_at=response.message?.created_at||draft.created_at;
     if(uploaded)draft.imageUrl=response.message?.imageUrl||uploaded.url;
     draft.pending=false;
     renderMessages(true);
     if(photo)clearPhotoSelection();
   }catch(err){
     if(generation!==roomGeneration)return;
     optimisticMessage=null;renderMessages();
     if(err.statusCode===401||err.statusCode===403){leaveClubRoom();await refresh()}
     else{
       input.value=message+(input.value?' '+input.value:'');resizeClubComposer();
       chatFeedback.textContent='전송하지 못했어요. 다시 시도해 주세요. '+(err.message||'');
     }
   }finally{
     sending=false;sendBtn.disabled=false;attachBtn.disabled=false;removePhotoBtn.disabled=false;
     if(generation===roomGeneration&&optimisticMessage&&!pane.hidden)loadMessages();
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
