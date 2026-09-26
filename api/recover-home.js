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
    const settings = await db('site_settings?select=key,value&key=in.(hero,about)');
    const map = Object.fromEntries((settings||[]).map(row => [row.key, row.value && typeof row.value === 'object' ? row.value : {}]));

    if (String(req.query?.restore || '') === '1') {
      const hero = {
        ...(map.hero || {}),
        eyebrow: '木香/玄香/明香',
        title: '흙에 새긴 금빛 마음',
        lead: '천 년의 침묵을 깨고 일어선 흙이여, 그대의 거친 살결 속에 금강(金剛)의 지혜를 새기노니, 천년의 흙이 금강경의 구절을 품었을 때, 비로소 마음은 깨지지 않는 그릇이 된다. 이 토혼(土魂, 옹기)을 보고 느끼는 것만으로 당신의 삶은 영겁의 자유와 복을 얻을 것이다.',
        image: 'https://ik.imagekit.io/wonjuart/mon.png?updatedAt=1777978787964'
      };

      const about = {
        ...(map.about || {}),
        paragraph1: '작가는 전통 동양 예술의 근간이 되는 수묵(水墨)의 담백한 기운, 서예(書藝)의 묵직한 필획, 그리고 전각(篆刻)의 집요하고 정교한 미학을 자유자재로 넘나들며 자신만의 독창적인 예술 언어를 구축해 온 예술가이다.',
        paragraph2: '이원주는 수묵, 서예, 전각이라는 동양 예술의 정수를 현대적 미감으로 승화시켰다는 평을 받는 작가이다. 그의 예술 세계는 지필묵(紙筆墨)이라는 평면적 매체를 넘어 옹기와 같은 입체적 ‘토혼’으로 확장되는 것이 특징이다.'
      };

      const restored = await db('site_settings?on_conflict=key', {
        method:'POST',
        headers:{Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify([
          {key:'hero', value:hero},
          {key:'about', value:about}
        ])
      });

      res.status(200).json({ok:true, restored});
      return;
    }

    res.status(200).json({ok:true, settings});
  }catch(error){
    res.status(500).json({ok:false, message:error.message || 'recovery failed'});
  }
};