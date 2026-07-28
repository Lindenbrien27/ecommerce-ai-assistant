const jwt = require('jsonwebtoken');

const TOKEN_TTL = '1h';

// Identity now comes from proving control of an inbox (email OTP - see
// otpService.js/authController.js), not from pairing an order number with
// an email. issueToken/verifyToken don't care which proof produced the
// email they're signing - kept here, order-number verification (the old
// verifyCustomer) removed.
function issueToken(email) {
  return jwt.sign({ email }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: TOKEN_TTL });
}

// Throws if the token is missing, malformed, expired, or signed with a
// different secret - callers are expected to catch this.
//
// algorithms: ['HS256'] is pinned explicitly rather than left to
// jsonwebtoken's own inference. Checked during a security review: given a
// plain string secret (not a PEM key), jsonwebtoken v9 already infers
// HMAC-only and rejects "none" before that inference even runs, so this
// isn't fixing a currently-reachable bug. It's pinning down an invariant
// this app already depends on, per the OWASP JWT cheat sheet's standing
// recommendation to never let algorithm selection be implicit - the
// specific failure mode that guards against (a verify call silently
// accepting a different algorithm than intended, the classic RS256/HS256
// "confusion" attack) requires an asymmetric key existing somewhere in the
// same code path, which doesn't exist here today, but "doesn't exist today"
// isn't a property this one line should be relied on to keep true.
function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

module.exports = { issueToken, verifyToken };
