// Vercel serverless redirect for the Simli voice-advisor share session.
// Store the URL ONLY in the Production environment variable:
// SIMLI_HARIN_SESSION_URL. This route never places it in git or HTML.
// Note: a shared session redirect remains discoverable to people allowed to open the site.
module.exports = function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).end();
  }
  let shareUrl = null;
  try {
    const candidate = new URL(process.env.SIMLI_HARIN_SESSION_URL || "");
    const segments = candidate.pathname.split("/").filter(Boolean);
    if (candidate.protocol === "https:" && candidate.hostname === "app.simli.com" &&
        segments.length === 3 && segments[0] === "session" &&
        /^[0-9a-f-]{36}$/i.test(segments[1]) && /^[A-Za-z0-9_-]{30,}$/.test(segments[2]) &&
        !candidate.username && !candidate.password) {
      shareUrl = candidate.toString();
    }
  } catch (_) { /* not configured */ }
  if (req.query && req.query.status === "1") {
    return res.status(200).json({ ready: Boolean(shareUrl) });
  }
  if (!shareUrl) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(503).end("<!doctype html><html lang=\"ko\"><meta charset=\"utf-8\"><body>하린 음성 상담 연결을 준비 중입니다.</body></html>");
  }
  res.setHeader("Location", shareUrl);
  return res.status(307).end();
};