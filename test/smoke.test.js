// Smoke test for the restaurant-local system.
// Boots the real server on a random port (licensing force-disabled so the
// test never depends on a licensing server) and verifies every app screen,
// shared assets, key APIs, legacy redirects, and 404 handling.
// Uses only Node built-ins (node:test) — no extra dependencies.
'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const PORT = 3300 + Math.floor(Math.random() * 800);
const BASE = `http://localhost:${PORT}`;
const SERVER = path.join(__dirname, '..', 'server.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILES = ['orders.json', 'kitchen.json', 'tables.json', 'customers.json', 'menu.json', 'settings.json'];

let child;
let dataBackup = {};

function waitForServer() {
  const deadline = Date.now() + 15000;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (Date.now() > deadline) return reject(new Error('server did not start in time'));
      try {
        const res = await fetch(`${BASE}/health`);
        if (res.ok) return resolve();
      } catch {
        /* not up yet */
      }
      setTimeout(poll, 250);
    };
    poll();
  });
}

before(async () => {
  // The suite places real orders, so snapshot the data files and restore them
  // afterwards — repeated runs then start from exactly the same state.
  for (const file of DATA_FILES) {
    const target = path.join(DATA_DIR, file);
    if (fs.existsSync(target)) dataBackup[file] = fs.readFileSync(target);
  }

  child = spawn(process.execPath, [SERVER], {
    // Clear license vars so the test is deterministic (no phone-home needed)
    env: { ...process.env, PORT: String(PORT), LICENSE_KEY: '', LICENSE_SERVER_URL: '' },
    stdio: 'ignore',
  });
  await waitForServer();
});

after(async () => {
  if (child) child.kill();
  await new Promise((resolve) => setTimeout(resolve, 200));
  for (const [file, contents] of Object.entries(dataBackup)) {
    fs.writeFileSync(path.join(DATA_DIR, file), contents);
  }
});

test('health endpoint responds', async () => {
  const res = await fetch(`${BASE}/health`);
  assert.strictEqual(res.status, 200);
});

test('serves every app screen', async () => {
  const screens = [
    '/app/hub/',
    '/app/waiter/?table=01',
    '/app/kitchen/',
    '/app/manager/',
    '/app/customer/?table=01',
  ];
  for (const screen of screens) {
    const res = await fetch(`${BASE}${screen}`);
    assert.strictEqual(res.status, 200, `${screen} should be served`);
  }
});

test('serves shared assets', async () => {
  for (const asset of ['/css/style.css', '/js/motion.js', '/manifest.json', '/sw.js']) {
    const res = await fetch(`${BASE}${asset}`);
    assert.strictEqual(res.status, 200, `${asset} should be served`);
  }
});

test('legacy /app/*.html URLs redirect to the new folders', async () => {
  const res = await fetch(`${BASE}/app/waiter.html?table=01`, { redirect: 'manual' });
  assert.strictEqual(res.status, 301);
  assert.strictEqual(res.headers.get('location'), '/app/waiter/?table=01');
});

test('licensing is disabled when no key is configured', async () => {
  const res = await fetch(`${BASE}/api/license/status`);
  assert.strictEqual(res.status, 200);
  const body = await res.json();
  assert.strictEqual(body.licensingEnabled, false);
  assert.strictEqual(body.locked, false);
});

test('menu and analytics APIs respond', async () => {
  for (const api of ['/api/menu', '/api/analytics', '/api/orders']) {
    const res = await fetch(`${BASE}${api}`);
    assert.strictEqual(res.status, 200, `${api} should respond`);
  }
});

test('ingredient request endpoint validates input', async () => {
  const res = await fetch(`${BASE}/api/ingredient-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ingredient: 'Onion' }),
  });
  assert.strictEqual(res.status, 400);
});

test('help report endpoint validates input', async () => {
  const res = await fetch(`${BASE}/api/help-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Broken printer' }),
  });
  assert.strictEqual(res.status, 400);
});

test('loyalty APIs respond and validate input', async () => {
  const settings = await fetch(`${BASE}/api/loyalty/settings`);
  assert.strictEqual(settings.status, 200);
  const body = await settings.json();
  assert.ok(body.pointsPerHundred > 0, 'loyalty settings expose earning rules');
  assert.ok(Array.isArray(body.tiers) && body.tiers.length >= 2, 'settings define tiers');

  const noPhone = await fetch(`${BASE}/api/loyalty/status`);
  assert.strictEqual(noPhone.status, 400);

  const badRegister = await fetch(`${BASE}/api/loyalty/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'No Phone' }),
  });
  assert.strictEqual(badRegister.status, 400);
});

test('floor map API saves and serves a map', async () => {
  const save = await fetch(`${BASE}/api/map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      width: 800,
      height: 500,
      image: null,
      tables: [{ id: 't1', label: '12', x: 50, y: 50, w: 8, h: 8, shape: 'circle' }],
    }),
  });
  assert.strictEqual(save.status, 200);
  const saved = await save.json();
  assert.ok(saved.map.tables.length === 1, 'map should save tables');
  assert.strictEqual(saved.map.tables[0].label, '12');

  const get = await fetch(`${BASE}/api/map`);
  assert.strictEqual(get.status, 200);
  const body = await get.json();
  assert.strictEqual(body.map.tables[0].label, '12');

  // Reset the map so test runs leave the data file clean
  await fetch(`${BASE}/api/map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ width: 800, height: 500, image: null, tables: [] }),
  });
});

test('loyalty points follow the phone on the order (no table session)', async () => {
  const menu = await (await fetch(`${BASE}/api/menu`)).json();
  const item = Object.values(menu.categories)
    .flat()
    .find((i) => i.available && i.price > 0);
  assert.ok(item, 'menu should expose at least one available priced item');

  // The phone is captured once when the order is placed — there is no table
  // session to assign, close, or count a visit against.
  const phone = '9812345678';
  const place = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableNumber: '42',
      waiterId: 1,
      waiterName: 'Smoke Test',
      customerPhone: phone,
      customerName: 'Smoke Guest',
      items: [{ name: item.name, quantity: 2 }],
    }),
  });
  assert.strictEqual(place.status, 201, 'order should be accepted');
  const order = await place.json();
  assert.strictEqual(order.customerPhone, phone, 'phone is stored on the order');

  const before = await (await fetch(`${BASE}/api/loyalty/status?phone=${phone}`)).json();
  assert.strictEqual(before.exists, true, 'placing an order enrols the phone');
  assert.strictEqual(before.customer.points, 0, 'points only land on delivery');

  const deliver = await fetch(`${BASE}/api/orders/${order.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'delivered' }),
  });
  assert.strictEqual(deliver.status, 200);

  const after = await (await fetch(`${BASE}/api/loyalty/status?phone=${phone}`)).json();
  assert.ok(after.customer.points > 0, 'delivering the order awards points');
  assert.ok(after.customer.totalSpent > 0, 'order total counts toward lifetime spend');
  assert.strictEqual(after.customer.visits, undefined, 'visits are no longer tracked');

  await fetch(`${BASE}/api/orders/${order.id}`, { method: 'DELETE' });
});

test('table session endpoints are gone', async () => {
  const list = await fetch(`${BASE}/api/tables`);
  assert.strictEqual(list.status, 404, '/api/tables should no longer exist');

  const assign = await fetch(`${BASE}/api/tables/42/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '9999900000' }),
  });
  assert.strictEqual(assign.status, 404, 'assigning a phone to a table is gone');
});
test('order items are priced and statused by the server, not the client', async () => {
  const menu = await (await fetch(`${BASE}/api/menu`)).json();
  const item = Object.values(menu.categories).flat().find((i) => i.available && i.price > 0);
  const phone = '9811112222';

  // Unknown items are rejected outright (they used to carry a client price)
  const bogus = await fetch(`${BASE}/api/orders/customer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableNumber: '43', items: [{ name: 'Free Money', quantity: 1, price: 500000 }] }),
  });
  assert.strictEqual(bogus.status, 400, 'unknown menu items are rejected');

  // Client price + status are ignored on create
  const res = await fetch(`${BASE}/api/orders/customer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tableNumber: '43',
      customerPhone: phone,
      items: [{ name: item.name, quantity: 1, price: 500000, status: 'delivered' }],
    }),
  });
  assert.strictEqual(res.status, 201, 'a valid item is still accepted');
  const order = await res.json();
  assert.strictEqual(order.items[0].price, item.price, 'price comes from the menu');
  assert.strictEqual(order.items[0].status, 'pending', 'client item status is ignored');
  assert.strictEqual(order.grossTotal, item.price, 'total is the real menu price');
  assert.strictEqual(order.status, 'pending', 'order starts pending');

  // ...and the edit route cannot be used to deliver it either
  const edit = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ name: item.name, quantity: 1, status: 'delivered' }] }),
  });
  assert.strictEqual(edit.status, 200);
  const edited = await edit.json();
  assert.strictEqual(edited.status, 'pending', 'editing items cannot deliver the order');
  assert.ok(!edited.loyaltyAwarded, 'no points awarded by the edit');

  const earned = await (await fetch(`${BASE}/api/loyalty/status?phone=${phone}`)).json();
  assert.ok(!earned.exists || earned.customer.points === 0, 'no points were minted');

  // free-form status strings are rejected (they used to be stored verbatim)
  const badStatus = await fetch(`${BASE}/api/orders/${order.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'totally-fake-status' }),
  });
  assert.strictEqual(badStatus.status, 400, 'invalid order status rejected');

  // negative quantities are rejected
  const negative = await fetch(`${BASE}/api/orders/customer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tableNumber: '43', items: [{ name: item.name, quantity: -50 }] }),
  });
  assert.strictEqual(negative.status, 400, 'negative quantity rejected');

  await fetch(`${BASE}/api/orders/${order.id}`, { method: 'DELETE' });
});

test('redemption cost comes from the menu, not the request', async () => {
  const menu = await (await fetch(`${BASE}/api/menu`)).json();
  const flat = Object.values(menu.categories).flat().filter((i) => i.available && i.price > 0);
  const cheap = flat.reduce((a, i) => (i.price < a.price ? i : a), flat[0]);
  const pricey = flat.reduce((a, i) => (i.price > a.price ? i : a), flat[0]);
  const phone = '9822223333';
  const original = await (await fetch(`${BASE}/api/loyalty/settings`)).json();
  const setRate = (pointsPerHundred) =>
    fetch(`${BASE}/api/loyalty/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...original, pointsPerHundred }),
    });
  const placeOrder = async (body) => {
    const res = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: '44', waiterId: 1, waiterName: 'Smoke', customerPhone: phone, ...body }),
    });
    return { status: res.status, body: await res.json() };
  };

  // Phase 1 — a small but non-zero balance: claiming the cheapest dish for
  // "1 point" must fail, because the trade is the menu price, not 1. (Before
  // the fix the client's own `points` value was deducted and this succeeded.)
  await setRate(10);
  const seed = await placeOrder({ items: [{ name: cheap.name, quantity: 2 }] });
  assert.strictEqual(seed.status, 201);
  await fetch(`${BASE}/api/orders/${seed.body.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'delivered' }),
  });
  const small = (await (await fetch(`${BASE}/api/loyalty/status?phone=${phone}`)).json()).customer.points;
  assert.ok(small > 0, 'the seed order earned points');
  assert.ok(small < Math.round(cheap.price), `balance (${small}) is below the cheapest dish (${cheap.price}) so the check is meaningful`);

  const forged = await placeOrder({ redeemItems: [{ name: cheap.name, points: 1 }], items: [{ name: cheap.name, quantity: 1 }] });
  assert.strictEqual(forged.status, 400, 'a 1-point claim on a dish worth more was rejected');
  assert.match(forged.body.error, /Not enough points/, 'rejection quotes the real menu price');

  // Phase 2 — fund the account properly, then confirm a forged low `points`
  // value is ignored and the menu price is what actually gets charged.
  await setRate(1000);
  const topUp = await placeOrder({ items: [{ name: cheap.name, quantity: 2 }] });
  await fetch(`${BASE}/api/orders/${topUp.body.id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'delivered' }),
  });
  const funded = (await (await fetch(`${BASE}/api/loyalty/status?phone=${phone}`)).json()).customer.points;
  assert.ok(funded >= Math.round(pricey.price), 'account can now afford the priciest dish');

  const forgedCheap = await placeOrder({ redeemItems: [{ name: pricey.name, points: 1 }], items: [{ name: cheap.name, quantity: 1 }] });
  assert.strictEqual(forgedCheap.status, 201, 'affordable redemption still works');
  const free = forgedCheap.body.items.find((i) => i.redeemed);
  assert.ok(free, 'the free item is on the order');
  assert.strictEqual(free.name, pricey.name);
  assert.strictEqual(free.pointsCost, Math.round(pricey.price), 'charged the menu price, not the 1 the client sent');

  await setRate(original.pointsPerHundred);
  for (const id of [seed.body.id, topUp.body.id, forgedCheap.body.id]) {
    await fetch(`${BASE}/api/orders/${id}`, { method: 'DELETE' });
  }
});

test('security headers are set and CORS is same-origin only', async () => {
  const res = await fetch(`${BASE}/api/menu`);
  assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(res.headers.get('content-security-policy'), 'CSP is set');
  assert.strictEqual(res.headers.get('access-control-allow-origin'), null, 'no wildcard CORS without an Origin');

  const cross = await fetch(`${BASE}/api/menu`, { headers: { Origin: 'https://evil.example' } });
  assert.strictEqual(cross.headers.get('access-control-allow-origin'), null, 'cross-origin requests are not allowed');

  const same = await fetch(`${BASE}/api/menu`, { headers: { Origin: BASE } });
  assert.strictEqual(same.headers.get('access-control-allow-origin'), BASE, 'same-origin is reflected');
});

test('menu prices must be real numbers', async () => {
  const bad = await fetch(`${BASE}/api/menu`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ category: 'starters', name: 'NaN dish', price: 'not-a-number' }),
  });
  assert.strictEqual(bad.status, 400, 'non-numeric price rejected');
});

test('returns 404 for unknown API routes', async () => {
  const res = await fetch(`${BASE}/api/nope`);
  assert.strictEqual(res.status, 404);
});

// ─── Manual loyalty earn (waiter enters bill + phone, guest consents) ────

test('manual points: bill + phone earn at the configured rate, consent required', async () => {
  const settings = await (await fetch(`${BASE}/api/loyalty/settings`)).json();
  const phone = '9988776655'; // synthetic — the suite restores customers.json

  const noConsent = await fetch(`${BASE}/api/loyalty/manual-earn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, billAmount: 500 }),
  });
  assert.strictEqual(noConsent.status, 400, 'consent is mandatory');
  assert.match((await noConsent.json()).error, /consent/i);

  const badPhone = await fetch(`${BASE}/api/loyalty/manual-earn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '12345', billAmount: 500, consent: true }),
  });
  assert.strictEqual(badPhone.status, 400, 'a real phone number is required');

  const badBill = await fetch(`${BASE}/api/loyalty/manual-earn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, billAmount: -5, consent: true }),
  });
  assert.strictEqual(badBill.status, 400, 'negative bills are rejected');

  const earn = await fetch(`${BASE}/api/loyalty/manual-earn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, billAmount: 500, consent: true }),
  });
  assert.strictEqual(earn.status, 201);
  const body = await earn.json();

  // Exact server maths for a fresh customer: floor(bill/100 × rate) × tier
  let tier = settings.tiers[0];
  for (const t of settings.tiers) if (500 >= t.minSpent) tier = t;
  const expected = Math.floor(Math.floor((500 / 100) * settings.pointsPerHundred) * (tier.multiplier || 1));
  assert.strictEqual(body.earned, expected, 'points follow the configured rate × tier');
  assert.strictEqual(body.points, expected, 'a new customer\'s balance equals what was earned');
  assert.strictEqual(body.customer.phone, phone);

  const ledger = await (await fetch(`${BASE}/api/loyalty/ledger`)).json();
  const entry = ledger.find((l) => l.phone === phone && l.source === 'manual');
  assert.ok(entry, 'the ledger records the manual earn');
  assert.strictEqual(entry.points, expected);
  assert.ok(entry.consentAt, 'the consent timestamp is recorded');

  // Second earn stacks on the first
  const again = await fetch(`${BASE}/api/loyalty/manual-earn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, billAmount: 100, consent: true }),
  });
  assert.strictEqual(again.status, 201);

  const status = await (await fetch(`${BASE}/api/loyalty/status?phone=${phone}`)).json();
  assert.ok(status.customer.points > body.points, 'the balance accumulated');
  const ledgerNow = await (await fetch(`${BASE}/api/loyalty/ledger`)).json();
  const secondEntry = ledgerNow.find((l) => l.phone === phone && l.source === 'manual' && l.id !== entry.id);
  assert.ok(secondEntry, 'the second earn is in the ledger too');
  assert.strictEqual(status.customer.points, body.points + secondEntry.points, 'balance = first earn + second earn');
});

// ─── Order auth (hybrid staff tokens + one-time table tokens) ────────────
// Runs against a SECOND server instance with MANAGER_PIN set: enabling order
// auth is refused without a PIN (by design — the staff PIN protects it), and
// the main test server deliberately runs PIN-less to keep the other tests
// open-access. Data files are restored by the suite's after-hook.

test('order auth: manager toggle, staff tokens, single-use table tokens', async () => {
  const PORT2 = 4100 + Math.floor(Math.random() * 800);
  const B2 = `http://localhost:${PORT2}`;
  const PIN = '4680';
  const child2 = spawn(process.execPath, [SERVER], {
    env: { ...process.env, PORT: String(PORT2), LICENSE_KEY: '', LICENSE_SERVER_URL: '', MANAGER_PIN: PIN },
    stdio: 'ignore',
  });

  const waitFor = async () => {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${B2}/health`);
        if (res.ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('second server did not start');
  };

  try {
    await waitFor();

    // Starts OFF — disabled is the default everywhere
    const initial = await (await fetch(`${B2}/api/settings`)).json();
    assert.strictEqual(initial.orderAuth, false, 'order auth is off by default');

    // Toggling requires the manager PIN
    const noPin = await fetch(`${B2}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderAuth: true }),
    });
    assert.strictEqual(noPin.status, 401, 'toggling needs the manager PIN');

    const badPin = await fetch(`${B2}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-manager-pin': '0000' },
      body: JSON.stringify({ orderAuth: true }),
    });
    assert.strictEqual(badPin.status, 401, 'wrong PIN refused');

    const menu = await (await fetch(`${B2}/api/menu`)).json();
    const item = Object.values(menu.categories).flat().find((i) => i.available && i.price > 0);
    assert.ok(item, 'menu has an available item');

    const enabled = await fetch(`${B2}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-manager-pin': PIN },
      body: JSON.stringify({ orderAuth: true }),
    });
    assert.strictEqual(enabled.status, 200, 'manager can enable order auth');
    assert.strictEqual((await enabled.json()).orderAuth, true);

    // With auth ON, staff mutations are refused without a token...
    const openOrder = await fetch(`${B2}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: '51', items: [{ name: item.name, quantity: 1 }] }),
    });
    assert.strictEqual(openOrder.status, 401, 'order creation now needs staff auth');
    assert.strictEqual((await openOrder.json()).error, 'STAFF_AUTH_REQUIRED');

    const openStatus = await fetch(`${B2}/api/orders/1/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'delivered' }),
    });
    assert.strictEqual(openStatus.status, 401, 'status changes now need staff auth');

    // Login: wrong PIN refused, right PIN issues a token
    const badLogin = await fetch(`${B2}/api/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: '9999' }),
    });
    assert.strictEqual(badLogin.status, 401, 'wrong staff PIN refused');

    const goodLogin = await fetch(`${B2}/api/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: PIN }),
    });
    assert.strictEqual(goodLogin.status, 200);
    const { token } = await goodLogin.json();
    assert.ok(token && token.length >= 32, 'a staff token was issued');

    // The token unlocks staff mutations
    const staffHeaders = { 'Content-Type': 'application/json', 'x-auth-token': token };
    const authedOrder = await fetch(`${B2}/api/orders`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ tableNumber: '51', waiterName: 'Test', items: [{ name: item.name, quantity: 1 }] }),
    });
    assert.strictEqual(authedOrder.status, 201, 'staff token can place an order');
    const order = await authedOrder.json();

    const authedStatus = await fetch(`${B2}/api/orders/${order.id}/status`, {
      method: 'PUT',
      headers: staffHeaders,
      body: JSON.stringify({ status: 'delivered' }),
    });
    assert.strictEqual(authedStatus.status, 200, 'staff token can change status');

    // Table tokens: minted by staff, required by customers, single-use
    const mint = await fetch(`${B2}/api/orders/table-token`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ tableNumber: '52' }),
    });
    assert.strictEqual(mint.status, 201);
    const tt = await mint.json();
    assert.match(tt.token, /^TT-[0-9A-F]{8}$/, 'token format is TT-XXXXXXXX');

    const mintNoAuth = await fetch(`${B2}/api/orders/table-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: '52' }),
    });
    assert.strictEqual(mintNoAuth.status, 401, 'cannot mint tokens without a staff token');

    const noToken = await fetch(`${B2}/api/orders/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: '52', items: [{ name: item.name, quantity: 1 }] }),
    });
    assert.strictEqual(noToken.status, 401, 'customer orders need a table token');
    assert.strictEqual((await noToken.json()).error, 'TABLE_TOKEN_REQUIRED');

    const wrongTable = await fetch(`${B2}/api/orders/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: '53', tableToken: tt.token, items: [{ name: item.name, quantity: 1 }] }),
    });
    assert.strictEqual(wrongTable.status, 403, 'a table-52 token cannot order at table 53');

    const withToken = await fetch(`${B2}/api/orders/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: '52', tableToken: tt.token, items: [{ name: item.name, quantity: 1 }] }),
    });
    assert.strictEqual(withToken.status, 201, 'a valid table token places the order');

    const reuse = await fetch(`${B2}/api/orders/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: '52', tableToken: tt.token, items: [{ name: item.name, quantity: 1 }] }),
    });
    assert.strictEqual(reuse.status, 401, 'the token was consumed by the first use');

    // Read endpoints no longer leak PII without a staff token
    const listNoAuth = await fetch(`${B2}/api/orders`);
    assert.strictEqual(listNoAuth.status, 401, 'orders list needs staff auth');

    const listAuthed = await fetch(`${B2}/api/orders`, { headers: { 'x-auth-token': token } });
    assert.strictEqual(listAuthed.status, 200, 'staff token can read the orders list');

    // Guests polling their own order still get it — minus the loyalty identity
    const seed2 = await fetch(`${B2}/api/orders`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({
        tableNumber: '55',
        waiterName: 'Test',
        customerPhone: '9876543210',
        items: [{ name: item.name, quantity: 1 }],
      }),
    });
    assert.strictEqual(seed2.status, 201);
    const seedOrder = await seed2.json();

    const guestView = await (await fetch(`${B2}/api/orders/${seedOrder.id}`)).json();
    assert.strictEqual(guestView.id, seedOrder.id, 'guest can still poll their order');
    assert.ok(!('customerPhone' in guestView), 'phone is stripped for guests');
    assert.ok(!('customerName' in guestView), 'name is stripped for guests');

    const staffView = await (
      await fetch(`${B2}/api/orders/${seedOrder.id}`, { headers: { 'x-auth-token': token } })
    ).json();
    assert.strictEqual(staffView.customerPhone, '9876543210', 'staff still see the full order');

    const dirNoAuth = await fetch(`${B2}/api/loyalty/customers`);
    assert.strictEqual(dirNoAuth.status, 401, 'customer directory needs staff auth');

    const dirAuthed = await fetch(`${B2}/api/loyalty/customers`, { headers: { 'x-auth-token': token } });
    assert.strictEqual(dirAuthed.status, 200, 'staff token can read the directory');

    const ledgerNoAuth = await fetch(`${B2}/api/loyalty/ledger`);
    assert.strictEqual(ledgerNoAuth.status, 401, 'points ledger needs staff auth');

    const ledgerAuthed = await fetch(`${B2}/api/loyalty/ledger`, { headers: { 'x-auth-token': token } });
    assert.strictEqual(ledgerAuthed.status, 200, 'staff token can read the ledger');

    await fetch(`${B2}/api/orders/${seedOrder.id}`, { method: 'DELETE', headers: { 'x-auth-token': token } });

    // Manager turns it back off — orders work openly again
    const disabled = await fetch(`${B2}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-manager-pin': PIN },
      body: JSON.stringify({ orderAuth: false }),
    });
    assert.strictEqual(disabled.status, 200);

    const reopened = await fetch(`${B2}/api/orders/customer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tableNumber: '54', items: [{ name: item.name, quantity: 1 }] }),
    });
    assert.strictEqual(reopened.status, 201, 'with auth off anyone can order again');
  } finally {
    child2.kill();
    await new Promise((r) => setTimeout(r, 200));
  }
});
