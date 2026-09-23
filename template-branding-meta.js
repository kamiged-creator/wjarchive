(function(){
  const config=window.ARTIST_TEMPLATE_CONFIG||{};
  let saved={};
  try{saved=JSON.parse(localStorage.getItem('artistTemplateBranding')||'{}')||{}}catch(e){}
  const siteName=String(saved.siteName||config.siteName||'Artist Portfolio').trim();
  const artistName=String(saved.artistName||config.artistName||'Sample Artist').trim();
  const isGuide=location.pathname.endsWith('/guide.html');
  document.title=isGuide?`${siteName} 사용법`:`이미지 크롭 편집 | ${artistName}`;
  for(const selector of ['meta[name="application-name"]','meta[name="apple-mobile-web-app-title"]']){
    const meta=document.querySelector(selector);
    if(meta) meta.content=siteName;
  }
  document.querySelectorAll('.guide-site-name').forEach(node=>{node.textContent=siteName});
})();
