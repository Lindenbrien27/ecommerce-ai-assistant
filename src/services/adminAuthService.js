const jwt = require('jsonwebtoken');

// Half the customer token's 1h TTL (authService.js) - an admin session is a
// higher-value target (can edit the catalog), so it stays valid for a
// shorter window even though nothing here can revoke it early once issued.
const ADMIN_TOKEN_TTL = '30m';

function issueAdminToken(admin) {
  return jwt.sign({ adminId: admin.id, email: admin.email, role: 'admin' }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: ADMIN_TOKEN_TTL,
  });
}

// Throws on anything wrong with the token, same "throws, caller catches"
// contract authService.js's verifyToken already uses. The role check is
// what keeps a customer token (a structurally valid JWT signed with the
// same JWT_SECRET) from ever satisfying requireAdminAuth.
function verifyAdminToken(token) {
  const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  if (payload.role !== 'admin') {
    throw new Error('Not an admin token');
  }
  return payload;
}

module.exports = { issueAdminToken, verifyAdminToken, ADMIN_TOKEN_TTL };
