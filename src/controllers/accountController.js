const accountService = require('../services/accountService');
const { logError } = require('../utils/logger');
const { auditLog } = require('../config/auditLog');

const ROLE_OPTIONS = ['devops', 'customer service', 'HR', 'security', 'admin'];
const NAME_MAX = 100;
const USERNAME_MAX = 50;
const BIO_MAX = 500;
const PHOTO_URL_MAX = 2048;
const URL_RE = /^https?:\/\/\S+$/;

// Blank/missing -> null (a customer clearing a field). Present but the
// wrong shape -> undefined, which the caller below treats as invalid input
// rather than silently coercing it to something the customer didn't type.
function cleanOptionalText(value, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > maxLength) return undefined;
  return value;
}

function validateProfileInput(body) {
  const name = cleanOptionalText(body.name, NAME_MAX);
  const username = cleanOptionalText(body.username, USERNAME_MAX);
  const bio = cleanOptionalText(body.bio, BIO_MAX);
  const photo_url = cleanOptionalText(body.photo_url, PHOTO_URL_MAX);
  const role = body.role === undefined || body.role === null || body.role === '' ? null : body.role;

  if ([name, username, bio, photo_url].includes(undefined)) return null;
  if (role !== null && !ROLE_OPTIONS.includes(role)) return null;
  if (photo_url !== null && !URL_RE.test(photo_url)) return null;

  return { name, username, role, bio, photo_url };
}

async function getProfile(req, res) {
  try {
    const profile = await accountService.getProfile(req.customerEmail);
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json(profile);
  } catch (err) {
    logError('Profile lookup error', err);
    res.status(500).json({ error: 'Something went wrong loading your profile.' });
  }
}

async function updateProfile(req, res) {
  const input = validateProfileInput(req.body || {});
  if (!input) {
    return res.status(400).json({ error: 'Invalid profile data.' });
  }

  try {
    const profile = await accountService.upsertProfile(req.customerEmail, input);
    auditLog('account.profile_updated', { email: req.customerEmail });
    res.json(profile);
  } catch (err) {
    logError('Profile update error', err);
    res.status(500).json({ error: 'Something went wrong saving your profile.' });
  }
}

module.exports = {
  getProfile,
  updateProfile,
};
