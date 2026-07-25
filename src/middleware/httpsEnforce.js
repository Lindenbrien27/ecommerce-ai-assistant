// Relies on `app.set('trust proxy', 1)` being set so Express derives
// req.secure from the X-Forwarded-Proto header set by Render's reverse
// proxy (which terminates TLS at its edge and forwards plain HTTP to us).
// The Strict-Transport-Security header itself is set by securityHeaders.js
// (helmet), not here - this middleware only owns the redirect.
function enforceHttps(req, res, next) {
  if (!req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }

  next();
}

module.exports = { enforceHttps };
