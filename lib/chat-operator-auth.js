const crypto = require('crypto');
const { supabaseAdminRequest: db } = require('./supabase-admin');
const operatorTable = 'bokjakso_chat_operator_accounts';
const clean = value => String(value || '').normalize('NFC').trim();

function verifyOwner(req) {
  const secret = clean(process.env.CROP_ACCESS_PASSWORD);
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  const [expiry,nonce,signature] = token.split(':');
  if (!secret || !/^\d{10,12}$/.test(expiry || '') || !/^[0-9a-f]{16,128}$/i.test(nonce || '') ||
    !/^[0-9a-f]{64}$/i.test(signature || '') || Number(expiry) <= Date.now()/1000) return false;
  const expected = crypto.createHmac('sha256',secret).update(expiry+':'+nonce).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex'));
}
async function account() {
  const rows = await db(operatorTable+'?id=eq.primary&select=id,password_salt,password_hash,is_active,failed_attempts,locked_until&limit=1');
  return Array.isArray(rows) ? rows[0] || null : null;
}
function hashPassword(password,salt) {
  return crypto.scryptSync(String(password || ''),salt,64).toString('hex');
}
function safeEquals(a,b) {
  if (!/^[0-9a-f]{128}$/i.test(String(a || '')) || !/^[0-9a-f]{128}$/i.test(String(b || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
}
function signingKey() {
  return clean(process.env.CROP_ACCESS_PASSWORD);
}
function signature(expiry,nonce,record) {
  return crypto.createHmac('sha256',signingKey()).update('operator:'+expiry+':'+nonce+':'+record.password_hash).digest('hex');
}
function issueOperatorToken(record) {
  const expiry=Math.floor(Date.now()/1000)+12*60*60;
  const nonce=crypto.randomBytes(16).toString('hex');
  return 'op.'+expiry+'.'+nonce+'.'+signature(expiry,nonce,record);
}
async function verifyOperatorToken(req) {
  const secret=signingKey();
  const token=String(req.headers.authorization || '').replace(/^Bearer\s+/i,'');
  const match=/^op\.(\d{10,12})\.([0-9a-f]{32})\.([0-9a-f]{64})$/i.exec(token);
  if (!secret || !match || Number(match[1])<=Date.now()/1000) return false;
  const record=await account();
  if (!record?.is_active) return false;
  const expected=signature(match[1],match[2],record);
  return crypto.timingSafeEqual(Buffer.from(match[3],'hex'),Buffer.from(expected,'hex'));
}
module.exports={db,operatorTable,verifyOwner,account,hashPassword,safeEquals,issueOperatorToken,verifyOperatorToken};
