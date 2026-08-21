const jwt = require('jsonwebtoken');

const TOKEN_TTL = '1h';

function issueToken(email) {
  return jwt.sign({ email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

  if (payload.role) {
    throw new Error('Not a customer token');
  }
  return payload;
}

module.exports = { issueToken, verifyToken };
