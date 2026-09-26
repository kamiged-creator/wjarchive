module.exports = async function handler(req, res){
  res.setHeader('Cache-Control','no-store');
  const supabaseUrl='https://vefeplfczeztbplowjmj.supabase.co';
  const key='sb_publishable_mYAEJ3rvEscEgM3esQi_7Q_1Nv_fRLC';
  try{
    const r=await fetch(supabaseUrl+'/rest/v1/works?select=id,title,image_url,large_image_url,is_visible,created_at&order=created_at.asc',{
      headers:{apikey:key,Authorization:'Bearer '+key}
    });
    const text=await r.text();
    if(!r.ok) return res.status(r.status).send(text);
    const rows=JSON.parse(text||'[]');
    const norm=(v)=>{
      const s=String(v||'').trim();
      if(!s) return '';
      try{const u=new URL(s);u.hash='';u.search='';return u.toString().replace(/\/+$/,'').toLowerCase();}
      catch(e){return s.replace(/[?#].*$/,'').replace(/\/+$/,'').toLowerCase();}
    };
    const seen=new Map();
    const duplicates=[];
    for(const row of rows){
      const keys=[norm(row.image_url),norm(row.large_image_url)].filter(Boolean);
      let matched=null;
      for(const k of keys){ if(seen.has(k)){matched=seen.get(k);break;} }
      if(matched){
        duplicates.push({original:matched,duplicate:row});
      }else{
        for(const k of keys) seen.set(k,row);
      }
    }
    res.status(200).json({count:rows.length,duplicates});
  }catch(e){
    res.status(500).json({error:e.message});
  }
};