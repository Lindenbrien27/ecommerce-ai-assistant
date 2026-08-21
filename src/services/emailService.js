const { Resend } = require('resend');
const { logError } = require('../utils/logger');

function isConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

let client = null;
function getClient() {
  if (!client) {
    client = new Resend(process.env.RESEND_API_KEY);
  }
  return client;
}

async function sendOtpEmail(email, code) {
  if (!isConfigured()) return false;

  try {
    const { error } = await getClient().emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `${code} is your verification code`,
      text: `Your verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
      html: `<p>Your verification code is <strong style="font-size:1.3em;letter-spacing:0.1em;">${code}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    });
    if (error) throw error;
    return true;
  } catch (err) {
    logError('Failed to send OTP email', err);
    return false;
  }
}

async function sendShippingUpdateEmail(email, order) {
  if (!isConfigured()) return false;

  try {
    const { error } = await getClient().emails.send({
      from: process.env.EMAIL_FROM,
      to: email,
      subject: `Your order ${order.order_number} has shipped`,
      text: `Good news! Your order ${order.order_number} (${order.product_name}) has shipped via ${order.carrier}. Tracking number: ${order.tracking_number}.`,
      html: `<p>Good news! Your order <strong>${order.order_number}</strong> (${order.product_name}) has shipped via ${order.carrier}.</p><p>Tracking number: <strong>${order.tracking_number}</strong></p>`,
    });
    if (error) throw error;
    return true;
  } catch (err) {
    logError('Failed to send shipping update email', err);
    return false;
  }
}

module.exports = { sendOtpEmail, sendShippingUpdateEmail, isConfigured };
