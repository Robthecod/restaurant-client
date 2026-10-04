/**
 * Chauka license lock-screen client.
 * Included on every restaurant screen (waiter / kitchen / manager / customer).
 * Polls /api/license/status and shows a full-screen lock overlay whenever the
 * system is locked (inactive / unpaid license). Also reacts to the
 * license_locked / license_unlocked socket broadcasts for instant feedback.
 *
 * The overlay appears only when the server reports licensingEnabled && locked,
 * so installs without licensing configured never see it.
 */
(function () {
  'use strict';

  var OVERLAY_ID = 'chauka-license-overlay';
  var POLL_MS = 60000;
  var overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = [
      '<style>',
      '#' + OVERLAY_ID + '{position:fixed;inset:0;z-index:2147483000;display:none;',
      '  align-items:center;justify-content:center;background:rgba(12,10,8,0.94);',
      '  backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);',
      "  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;",
      '  text-align:center;}',
      '#' + OVERLAY_ID + ' .lock-card{max-width:420px;padding:40px 32px;border-radius:20px;',
      '  background:#1c1917;border:1px solid rgba(255,255,255,0.08);box-shadow:0 30px 80px rgba(0,0,0,0.5);}',
      '#' + OVERLAY_ID + ' .lock-icon{font-size:3rem;margin-bottom:12px;animation:chaukaPulse 2s ease-in-out infinite;}',
      '@keyframes chaukaPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.12);}}',
      '#' + OVERLAY_ID + ' h1{font-size:1.35rem;font-weight:800;margin:0 0 10px;}',
      '#' + OVERLAY_ID + ' p{font-size:0.92rem;line-height:1.6;color:#d6d3d1;margin:0 0 8px;}',
      '#' + OVERLAY_ID + ' .lock-hint{font-size:0.8rem;color:#a8a29e;margin-bottom:22px;}',
      '#' + OVERLAY_ID + ' .lock-reason{font-size:0.78rem;color:#fbbf24;font-weight:600;margin:0 0 22px;}',
      '#' + OVERLAY_ID + ' .lock-btn{background:#d97706;border:none;color:#fff;font-family:inherit;',
      '  font-size:0.88rem;font-weight:700;padding:12px 26px;border-radius:10px;cursor:pointer;',
      '  transition:background 0.15s, transform 0.1s;}',
      '#' + OVERLAY_ID + ' .lock-btn:hover{background:#b45309;}',
      '#' + OVERLAY_ID + ' .lock-btn:active{transform:scale(0.97);}',
      '#' + OVERLAY_ID + ' .lock-btn:disabled{opacity:0.6;cursor:wait;}',
      '</style>',
      '<div class="lock-card">',
      '  <div class="lock-icon">🔒</div>',
      '  <h1>System Locked</h1>',
      '  <p>This system\u2019s license is inactive or unpaid.<br>New orders and changes are disabled.</p>',
      '  <p class="lock-hint">Please contact your service provider to renew.</p>',
      '  <p class="lock-reason"></p>',
      '  <button class="lock-btn" id="chauka-license-retry">Check again</button>',
      '</div>',
    ].join('');
    document.body.appendChild(overlay);
    overlay.querySelector('#chauka-license-retry').addEventListener('click', retryCheck);
    return overlay;
  }

  function showLock() {
    ensureOverlay().style.display = 'flex';
  }

  function hideLock() {
    if (overlay) overlay.style.display = 'none';
  }

  async function checkStatus() {
    try {
      const res = await fetch('/api/license/status', { cache: 'no-store' });
      if (!res.ok) return;
      const status = await res.json();
      if (status.licensingEnabled && status.locked) {
        setReason(status.lastReason);
        showLock();
      } else {
        hideLock();
      }
    } catch (err) {
      /* server unreachable — don't show the lock screen */
    }
  }

  function setReason(reason) {
    var el = ensureOverlay().querySelector('.lock-reason');
    if (el) el.textContent = reason || '';
  }

  async function retryCheck() {
    const btn = document.getElementById('chauka-license-retry');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Checking\u2026';
    }
    try {
      await fetch('/api/license/check', { method: 'POST', cache: 'no-store' });
    } catch (err) { /* ignore */ }
    await checkStatus();
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Check again';
    }
  }

  // React to socket broadcasts when the shared socket client is present
  if (typeof RestaurantSocket !== 'undefined') {
    var client = RestaurantSocket.getInstance();
    client.on('license_locked', checkStatus);
    client.on('license_unlocked', checkStatus);
  }

  checkStatus();
  setInterval(checkStatus, POLL_MS);
})();
