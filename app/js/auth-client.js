// ─── Chauka Order Auth Client ──────────────────────────────────────────────
// Loaded FIRST on every screen. When the manager has enabled order auth:
//   • Any API call that returns 401 STAFF_AUTH_REQUIRED opens a small PIN
//     modal; on success the staff token is cached in localStorage and the
//     original request is retried once automatically.
//   • Every fetch gets an `x-auth-token` header when a token is cached.
// The token is per-device and expires (server TTL) — a 401 simply re-asks.
(function () {
  'use strict';

  var TOKEN_KEY = 'chaukaStaffToken';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* private mode etc. */ }
  }

  // ── Modal machinery (no inline handlers — CSP-friendly) ────────────────
  var modalEl = null;

  function closeModal() {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
  }

  // options: { title, message, inputPlaceholder, inputType, confirmLabel, showCode, codeValue }
  // Resolves with the entered string (or the code when showCode), or null on cancel.
  function showModal(options) {
    return new Promise(function (resolve) {
      closeModal();

      var backdrop = document.createElement('div');
      backdrop.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99999;' +
        'display:flex;align-items:center;justify-content:center;';

      var box = document.createElement('div');
      box.style.cssText =
        'background:#fff;color:#111;border-radius:12px;padding:22px 24px;' +
        'width:min(90vw,340px);box-shadow:0 12px 40px rgba(0,0,0,.3);' +
        'font-family:system-ui,sans-serif;text-align:center;';

      var title = document.createElement('div');
      title.textContent = options.title || 'Chauka';
      title.style.cssText = 'font-weight:700;font-size:16px;margin-bottom:6px;';
      box.appendChild(title);

      if (options.message) {
        var msg = document.createElement('div');
        msg.textContent = options.message;
        msg.style.cssText = 'font-size:13px;opacity:.75;margin-bottom:14px;';
        box.appendChild(msg);
      }

      var input = null;
      if (!options.showCode) {
        input = document.createElement('input');
        input.type = options.inputType || 'password';
        input.placeholder = options.inputPlaceholder || '';
        input.style.cssText =
          'width:100%;box-sizing:border-box;text-align:center;font-size:18px;' +
          'letter-spacing:2px;padding:10px;border:1px solid #ccc;border-radius:8px;margin-bottom:12px;';
        box.appendChild(input);
      } else {
        var code = document.createElement('div');
        code.textContent = options.codeValue || '';
        code.style.cssText =
          'font-family:ui-monospace,monospace;font-size:22px;font-weight:700;' +
          'letter-spacing:3px;background:#f2f2f2;border-radius:8px;padding:12px;' +
          'margin-bottom:12px;word-break:break-all;';
        box.appendChild(code);
      }

      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;justify-content:center;';

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText =
        'flex:1;padding:9px;border:1px solid #ccc;border-radius:8px;background:#fff;' +
        'cursor:pointer;font-size:14px;';
      cancelBtn.addEventListener('click', function () {
        closeModal();
        resolve(null);
      });

      var okBtn = document.createElement('button');
      okBtn.textContent = options.confirmLabel || 'OK';
      okBtn.style.cssText =
        'flex:1;padding:9px;border:0;border-radius:8px;background:#111;color:#fff;' +
        'cursor:pointer;font-size:14px;font-weight:600;';
      okBtn.addEventListener('click', function () {
        var value = input ? input.value : (options.codeValue || '');
        closeModal();
        resolve(value || null);
      });

      row.appendChild(cancelBtn);
      row.appendChild(okBtn);
      box.appendChild(row);
      backdrop.appendChild(box);

      backdrop.addEventListener('click', function (event) {
        if (event.target === backdrop) {
          closeModal();
          resolve(null);
        }
      });

      document.addEventListener('keydown', function onKey(event) {
        if (event.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          closeModal();
          resolve(null);
        }
        if (event.key === 'Enter' && input && document.activeElement === input) {
          document.removeEventListener('keydown', onKey);
          var value = input.value;
          closeModal();
          resolve(value || null);
        }
      });

      modalEl = backdrop; // so closeModal() can actually remove it
      document.body.appendChild(backdrop);
      if (input) input.focus();
    });
  }

  // Verify a PIN with the server; caches the staff token on success.
  function login(pin) {
    return fetch('/api/auth/staff-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: pin }),
    }).then(function (res) {
      if (!res.ok) throw new Error('Invalid PIN');
      return res.json();
    }).then(function (data) {
      if (data.token) setToken(data.token);
      return data;
    });
  }

  // Ask for the PIN (retrying on failure) until valid or cancelled.
  function promptForPin(attemptMessage) {
    return showModal({
      title: 'Staff access',
      message: attemptMessage || 'Enter the staff PIN to continue.',
      inputPlaceholder: 'PIN',
      confirmLabel: 'Unlock',
    }).then(function (pin) {
      if (pin == null) return null;
      return login(pin).catch(function () {
        return promptForPin('Wrong PIN. Try again.');
      });
    });
  }

  // Screens fire several gated fetches at load; they must share ONE prompt
  // instead of racing modals that cancel each other.
  var pinPromptInFlight = null;
  function sharedPinPrompt() {
    if (!pinPromptInFlight) {
      pinPromptInFlight = promptForPin().then(
        function (r) { pinPromptInFlight = null; return r; },
        function (e) { pinPromptInFlight = null; throw e; }
      );
    }
    return pinPromptInFlight;
  }

  var RETRIED = '__chaukaAuthRetried';

  // Patch fetch: attach the token, auto-unlock once on STAFF_AUTH_REQUIRED.
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    init = init || {};
    var headers = new Headers(init.headers || {});
    var token = getToken();
    if (token && !headers.has('x-auth-token')) headers.set('x-auth-token', token);
    var patched = {};
    for (var key in init) patched[key] = init[key];
    patched.headers = headers;

    return nativeFetch(input, patched).then(function (res) {
      if (res.status !== 401 || init[RETRIED]) return res;
      return res.clone().json().catch(function () { return {}; }).then(function (body) {
        if (body && body.error === 'STAFF_AUTH_REQUIRED') {
          return sharedPinPrompt().then(function (result) {
            if (!result || !result.token) return res; // cancelled — surface the 401
            var retry = {};
            for (var key in init) retry[key] = init[key];
            retry[RETRIED] = true;
            retry.headers = new Headers(init.headers || {});
            retry.headers.set('x-auth-token', result.token);
            return nativeFetch(input, retry);
          });
        }
        return res;
      });
    });
  };

  window.ChaukaAuth = {
    get token() { return getToken(); },
    login: login,
    promptForPin: promptForPin,
    promptText: function (message, placeholder) {
      return showModal({
        title: 'Table code',
        message: message,
        inputPlaceholder: placeholder || '',
        inputType: 'text',
        confirmLabel: 'Continue',
      });
    },
    showCode: function (message, codeValue) {
      return showModal({
        title: 'Table code',
        message: message,
        showCode: true,
        codeValue: codeValue,
        confirmLabel: 'Done',
      });
    },
  };
})();
