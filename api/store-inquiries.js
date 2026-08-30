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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function supabaseRequest(path, options = {}) {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://vefeplfczeztbplowjmj.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
      Prefer: 'return=minimal',
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

function clean(value) {
  return String(value || '').trim();
}

function inquiryPayload(body) {
  return {
    name: clean(body.name),
    contact: clean(body.contact),
    product_name: clean(body.product_name),
    quantity: clean(body.quantity),
    message: clean(body.message),
    status: 'new'
  };
}

module.exports = async function handler(req, res) {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const payload = inquiryPayload(body);
    if (!payload.name || !payload.contact || !payload.message) {
      res.status(400).json({ message: '이름, 연락처, 문의 내용을 입력해 주세요.' });
      return;
    }

    await supabaseRequest('store_inquiries', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message || '문의 접수 실패' });
  }
};
