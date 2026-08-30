const crypto = require('crypto');

const allowedOrigins = new Set([
  'https://wjarchive.vercel.app',
  'https://ycuve.com',
  'https://www.ycuve.com',
  'https://bokjakso.com',
  'https://www.bokjakso.com'
]);

function setCors(req, res) {
  const origin = req.headers.origin;
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function normalizePassword(value) {
  return String(value || '').normalize('NFC').trim();
}

function verifyAccessToken(token, secret) {
  const parts = String(token || '').split(':');
  if (parts.length !== 3) return false;

  const [expire, nonce, signature] = parts;
  if (Number(expire) <= Math.floor(Date.now() / 1000)) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${expire}:${nonce}`)
    .digest('hex');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function getEnv() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || 'https://vefeplfczeztbplowjmj.supabase.co',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    password: normalizePassword(process.env.CROP_ACCESS_PASSWORD)
  };
}

async function supabaseRequest(path, options = {}) {
  const { supabaseUrl, serviceKey } = getEnv();
  if (!serviceKey) {
    const error = new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.');
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || 'Supabase request failed.');
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

function requireAdmin(req) {
  const { password } = getEnv();
  if (!password) {
    const error = new Error('CROP_ACCESS_PASSWORD is not configured.');
    error.statusCode = 500;
    throw error;
  }
  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!verifyAccessToken(accessToken, password)) {
    const error = new Error('비밀번호를 먼저 입력해주세요.');
    error.statusCode = 401;
    throw error;
  }
}

function toProductPayload(body) {
  const detailImages = Array.isArray(body.detail_image_urls)
    ? body.detail_image_urls
    : [body.detail_image_url_1, body.detail_image_url_2, body.detail_image_url_3];

  return {
    title: String(body.title || '').trim() || '새 상품',
    description: String(body.description || '').trim(),
    story: String(body.story || '').trim(),
    price_text: String(body.price_text || '').trim() || '가격 준비중',
    category: String(body.category || 'keyring').trim(),
    status: String(body.status || 'preparing').trim(),
    main_image_url: String(body.main_image_url || '').trim(),
    detail_image_urls: detailImages.map(value => String(value || '').trim()).filter(Boolean),
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 10,
    is_visible: body.is_visible !== false
  };
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      const data = await supabaseRequest('store_products?select=*&is_visible=eq.true&order=sort_order.desc,created_at.desc', {
        method: 'GET'
      });
      res.status(200).json({ products: data || [] });
      return;
    }

    requireAdmin(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    if (req.method === 'POST') {
      const data = await supabaseRequest('store_products', {
        method: 'POST',
        body: JSON.stringify(toProductPayload(body))
      });
      res.status(200).json({ product: data?.[0] || null });
      return;
    }

    if (req.method === 'PUT') {
      if (!body.id) {
        res.status(400).json({ message: '상품 id가 필요합니다.' });
        return;
      }
      const data = await supabaseRequest(`store_products?id=eq.${encodeURIComponent(body.id)}`, {
        method: 'PATCH',
        body: JSON.stringify(toProductPayload(body))
      });
      res.status(200).json({ product: data?.[0] || null });
      return;
    }

    if (req.method === 'DELETE') {
      if (!body.id) {
        res.status(400).json({ message: '상품 id가 필요합니다.' });
        return;
      }
      await supabaseRequest(`store_products?id=eq.${encodeURIComponent(body.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_visible: false })
      });
      res.status(200).json({ ok: true });
      return;
    }

    res.status(405).json({ message: 'Method not allowed.' });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || '스토어 상품 처리 실패' });
  }
};
