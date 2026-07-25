function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  const provided = req.get('X-API-Key');

  if (!expected || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
}

module.exports = { requireApiKey };
