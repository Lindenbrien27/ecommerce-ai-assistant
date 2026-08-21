

function enforceHttps(req, res, next) {
  if (!req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  }

  next();
}

module.exports = { enforceHttps };
