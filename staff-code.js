/**
 * Daily staff code.
 *
 * One code for the whole team, derived from a per-install secret and the local
 * calendar day — so it changes at midnight without a scheduler and survives a
 * server restart. The manager reads it off the manager panel and shares it;
 * staff type it once per device, which buys them a staff token.
 *
 * The secret is random per install and stored in data/staffcode.json, so two
 * restaurants never share a code (guessing tomorrow's from today's is not
 * possible without the secret).
 */
'use strict';

const crypto = require('crypto');

// Local calendar day, e.g. "2026-10-23". The code rotates at local midnight.
function dayKey(date) {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 6 upper-case hex characters — short enough to read out over a counter.
function derive(secret, key) {
  return crypto
    .createHmac('sha256', String(secret))
    .update('chauka-staff:' + key)
    .digest('hex')
    .slice(0, 6)
    .toUpperCase();
}

// When the current code stops working (next local midnight).
function rotatesAt(date) {
  const d = date || new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
}

module.exports = { dayKey, derive, rotatesAt };
