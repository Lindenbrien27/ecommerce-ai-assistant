import { initChatWidget } from './chatWidget.js';

// NOTE: this is a shared secret visible to anyone who views this page's
// source - it only keeps out anonymous bots hitting the API directly.
// Replace with real per-customer auth before handling real order data.
// The actual value is injected by the server at request time (see
// src/app.js) so it never lives in this tracked file.
const API_KEY = '__API_KEY__';

initChatWidget({
  apiKey: API_KEY,
  chatEl: document.getElementById('chat'),
  formEl: document.getElementById('chat-form'),
  inputEl: document.getElementById('chat-input'),
});
