"use strict";

exports.WhatsWebURL = "https://shopee.co.id/buyer/login/qr";

exports.DefaultOptions = {
  puppeteer: {
    headless: true,
    defaultViewport: { width: 1920, height: 1080 },
  },
  authTimeoutMs: 0,
  qrMaxRetries: 0,
  takeoverOnConflict: false,
  takeoverTimeoutMs: 0,
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.67 Safari/537.36",
  ffmpegPath: "ffmpeg",
  bypassCSP: false,
};

exports.Events = {
  AUTHENTICATED: "authenticated",
  AUTHENTICATION_FAILURE: "auth_failure",
  READY: "ready",
  QR_RECEIVED: "qr",
  LOADING_SCREEN: "loading_screen",
  DISCONNECTED: "disconnected",
  STATE_CHANGED: "change_state",
  REMOTE_SESSION_SAVED: "remote_session_saved",
};
