module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const token = String(req.query?.token || '');
  if (token !== 'recover-260926-bokjakso') {
    res.status(403).json({ ok:false, message:'Forbidden' });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://vefeplfczeztbplowjmj.supabase.co';
  const publicKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_mYAEJ3rvEscEgM3esQi_7Q_1Nv_fRLC';

  const headers = {
    apikey: publicKey,
    Authorization: `Bearer ${publicKey}`,
    'Content-Type':'application/json'
  };

  async function db(path, options={}){
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers:{...headers,...(options.headers||{})}
    });
    const text = await response.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; }catch(e){}
    if(!response.ok) throw new Error(data?.message || text || 'Supabase request failed');
    return data;
  }

  try{
    const [settings, works] = await Promise.all([
      db('site_settings?select=key,value&key=in.(hero,about)'),
      db('works?select=id,title,description,image_url,large_image_url,thumb_url,thumb,large_url,large,is_visible&order=created_at.desc')
    ]);
    res.status(200).json({ok:true, settings, works});
  }catch(error){
    res.status(500).json({ok:false, message:error.message || 'inspect failed'});
  }
};