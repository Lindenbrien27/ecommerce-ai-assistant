// Relies on `app.set('trust proxy', 1)` being set so Express derives
// req.secure from the X-Forwarded-Proto header set by Render's reverse
// proxy (which terminates TLS at its edge and forwards plain HTTP to us).
function enforceHttps(req, res, next) {
  if (!req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }

  res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}

module.exports = { enforceHttps };
