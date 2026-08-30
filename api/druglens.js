const ALLOWED_ORIGINS = new Set([
  'https://ycuve.com',
  'https://www.ycuve.com',
  'https://bokjakso.com',
  'https://www.bokjakso.com'
]);

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function normalizeKey(value) {
  const key = String(value || '').trim();
  if (!key) return '';
  try { return key.includes('%') ? decodeURIComponent(key) : key; }
  catch { return key; }
}

export default async function handler(req, res) {
  const allowed = cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!allowed) return res.status(403).json({ error: '허용되지 않은 사이트 요청입니다.' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 지원합니다.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // 공개 페이지에서 인증키를 받지 않는다. Vercel 환경변수에만 보관한다.
    const key = normalizeKey(process.env.MFDS_SERVICE_KEY || process.env.DATA_GO_KR_SERVICE_KEY || '');
    if (!key) {
      return res.status(503).json({
        error: '서버 인증키가 설정되지 않았습니다.',
        code: 'SERVICE_KEY_NOT_CONFIGURED'
      });
    }

    let url;
    if (body.type === 'drug') {
      const term = String(body.term || '').trim().slice(0, 100);
      if (!term) return res.status(400).json({ error: '약 이름을 입력해 주세요.' });
      url = new URL('https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList');
      url.searchParams.set('serviceKey', key);
      url.searchParams.set('itemName', term);
      url.searchParams.set('pageNo', '1');
      url.searchParams.set('numOfRows', '20');
      url.searchParams.set('type', 'json');
    } else if (body.type === 'pharmacy') {
      const lat = Number(body.lat), lon = Number(body.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < 33 || lat > 39 || lon < 124 || lon > 132) {
        return res.status(400).json({ error: '대한민국 내 현재 위치를 확인해 주세요.' });
      }
      url = new URL('https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList');
      url.searchParams.set('ServiceKey', key);
      url.searchParams.set('xPos', String(lon));
      url.searchParams.set('yPos', String(lat));
      url.searchParams.set('radius', '3000');
      url.searchParams.set('pageNo', '1');
      url.searchParams.set('numOfRows', '30');
    } else {
      return res.status(400).json({ error: '지원하지 않는 조회 종류입니다.' });
    }

    const upstream = await fetch(url, { headers: { Accept: 'application/json, application/xml, text/xml' } });
    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type') || (body.type === 'drug' ? 'application/json' : 'application/xml');
    res.setHeader('Content-Type', contentType);
    return res.status(upstream.status).send(text);
  } catch (error) {
    return res.status(502).json({ error: '공공데이터 서버 연결에 실패했습니다.', detail: error?.message || '' });
  }
}
