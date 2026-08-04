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

function cleanRequiredText(value, maxLength) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) return undefined;
  return value.trim();
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

function validateAddressInput(body) {
  const line1 = cleanRequiredText(body.line1, 200);
  const line2 = cleanOptionalText(body.line2, 200);
  const city = cleanRequiredText(body.city, 200);
  const state = cleanOptionalText(body.state, 200);
  const postal_code = cleanRequiredText(body.postal_code, 20);
  const country = cleanRequiredText(body.country, 200);
  const phone = cleanOptionalText(body.phone, 30);

  if ([line1, line2, city, state, postal_code, country, phone].includes(undefined)) return null;

  return { line1, line2, city, state, postal_code, country, phone };
}

const BRAND_OPTIONS = ['Visa', 'Mastercard', 'Amex', 'Discover'];
const LAST4_RE = /^\d{4}$/;

function validatePaymentInput(body) {
  const brand = body.brand;
  const last4 = body.last4;
  const expiry_month = Number(body.expiry_month);
  const expiry_year = Number(body.expiry_year);
  const billing_name = cleanRequiredText(body.billing_name, 100);
  const currentYear = new Date().getFullYear();

  if (!BRAND_OPTIONS.includes(brand)) return null;
  if (typeof last4 !== 'string' || !LAST4_RE.test(last4)) return null;
  if (!Number.isInteger(expiry_month) || expiry_month < 1 || expiry_month > 12) return null;
  if (!Number.isInteger(expiry_year) || expiry_year < currentYear || expiry_year > currentYear + 20) return null;
  if (billing_name === undefined) return null;

  return { brand, last4, expiry_month, expiry_year, billing_name };
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

async function getAddress(req, res) {
  try {
    const address = await accountService.getAddress(req.customerEmail);
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json(address);
  } catch (err) {
    logError('Address lookup error', err);
    res.status(500).json({ error: 'Something went wrong loading your address.' });
  }
}

async function updateAddress(req, res) {
  const input = validateAddressInput(req.body || {});
  if (!input) {
    return res.status(400).json({ error: 'Invalid address data.' });
  }

  try {
    const address = await accountService.upsertAddress(req.customerEmail, input);
    auditLog('account.address_updated', { email: req.customerEmail });
    res.json(address);
  } catch (err) {
    logError('Address update error', err);
    res.status(500).json({ error: 'Something went wrong saving your address.' });
  }
}

async function deleteAddress(req, res) {
  try {
    await accountService.deleteAddress(req.customerEmail);
    auditLog('account.address_removed', { email: req.customerEmail });
    res.status(204).end();
  } catch (err) {
    logError('Address removal error', err);
    res.status(500).json({ error: 'Something went wrong removing your address.' });
  }
}

async function getPaymentMethod(req, res) {
  try {
    const method = await accountService.getPaymentMethod(req.customerEmail);
    res.setHeader('Cache-Control', 'private, max-age=30');
    res.json(method);
  } catch (err) {
    logError('Payment method lookup error', err);
    res.status(500).json({ error: 'Something went wrong loading your payment method.' });
  }
}

async function updatePaymentMethod(req, res) {
  const input = validatePaymentInput(req.body || {});
  if (!input) {
    return res.status(400).json({ error: 'Invalid payment method data.' });
  }

  try {
    const method = await accountService.upsertPaymentMethod(req.customerEmail, input);
    auditLog('account.payment_method_updated', { email: req.customerEmail });
    res.json(method);
  } catch (err) {
    logError('Payment method update error', err);
    res.status(500).json({ error: 'Something went wrong saving your payment method.' });
  }
}

async function deletePaymentMethod(req, res) {
  try {
    await accountService.deletePaymentMethod(req.customerEmail);
    auditLog('account.payment_method_removed', { email: req.customerEmail });
    res.status(204).end();
  } catch (err) {
    logError('Payment method removal error', err);
    res.status(500).json({ error: 'Something went wrong removing your payment method.' });
  }
}

module.exports = {
  getProfile,
  updateProfile,
  getAddress,
  updateAddress,
  deleteAddress,
  getPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
};
