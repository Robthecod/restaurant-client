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

// MANAGER_PIN defaults to 0000 in server.js, so manager routes always need the
// header — including on this test server, which sets no env vars.
const MANAGER = { 'Content-Type': 'application/json', 'x-manager-pin': '0000' };

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILES = ['orders.json', 'kitchen.json', 'tables.json', 'customers.json', 'menu.json', 'settings.json', 'staffcode.json'];

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

// ─── Minimal Socket.IO client (Engine.IO v4 over Node's built-in WebSocket) ──
// Enough to assert what a browser on the restaurant LAN actually receives.
function openSocket(base, token) {
  return new Promise((resolve, reject) => {
    const url = base.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket';
    const ws = new WebSocket(url);
    const events = [];
    const timer = setTimeout(() => reject(new Error('socket did not connect')), 10000);

    const client = {
      events,
      send: (name, payload) => ws.send('42' + JSON.stringify([name, payload])),
      close: () => ws.close(),
    };

    ws.addEventListener('message', (msg) => {
      const data = String(msg.data);
      if (data.startsWith('0')) {
        // Engine.IO open → connect to the default namespace, with the staff
        // token in the handshake when we have one (same as socket-client.js).
        ws.send('40' + (token ? JSON.stringify({ token }) : ''));
        return;
      }
      if (data === '2') {
        ws.send('3'); // ping → pong
        return;
      }
      if (data.startsWith('40')) {
        clearTimeout(timer);
        resolve(client);
        return;
      }
      if (data.startsWith('42')) {
        const [name, payload] = JSON.parse(data.slice(2));
        events.push({ name, payload });
      }
    });
    ws.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('socket error'));
    });
  });
}

async function waitForEvent(socket, name, ms = 3000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const hit = socket.events.find((e) => e.name === name);
    if (hit) return hit.payload;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
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
  // Restore every data file to its pre-test bytes — and delete the ones the
  // suite itself created (settings.json from the auth toggle, staffcode.json
  // from the staff-code endpoint), so later runs start clean.
  for (const file of DATA_FILES) {
    const target = path.join(DATA_DIR, file);
    if (dataBackup[file]) fs.writeFileSync(target, dataBackup[file]);
    else fs.rmSync(target, { force: true });
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
    headers: MANAGER,
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
    headers: MANAGER,
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
      headers: MANAGER,
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
    headers: MANAGER,
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

    // A phone already watching while auth is OFF (the normal default)
    const preexisting = await openSocket(B2);

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

    // Staff sign in with TODAY'S CODE, not the manager PIN
    const codeNoPin = await fetch(`${B2}/api/staff-code`);
    assert.strictEqual(codeNoPin.status, 401, 'the staff code is manager-only to read');

    const codeRes = await fetch(`${B2}/api/staff-code`, { headers: { 'x-manager-pin': PIN } });
    assert.strictEqual(codeRes.status, 200, 'the manager can read the staff code');
    const { code, day, rotatesAt } = await codeRes.json();
    assert.match(code, /^[0-9A-F]{6}$/, 'the code is 6 characters');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(day), 'the code is tied to a calendar day');
    assert.ok(new Date(rotatesAt) > new Date(), 'it rotates in the future');

    const codeAgain = await (await fetch(`${B2}/api/staff-code`, { headers: { 'x-manager-pin': PIN } })).json();
    assert.strictEqual(codeAgain.code, code, 'the code is stable within the day');

    const badLogin = await fetch(`${B2}/api/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'ZZZZZZ' }),
    });
    assert.strictEqual(badLogin.status, 401, 'a wrong staff code is refused');

    const managerPinLogin = await fetch(`${B2}/api/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: PIN }),
    });
    assert.strictEqual(managerPinLogin.status, 401, 'the manager PIN is not a staff code');

    const goodLogin = await fetch(`${B2}/api/auth/staff-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    assert.strictEqual(goodLogin.status, 200);
    const { token } = await goodLogin.json();
    assert.ok(token && token.length >= 32, 'a staff token was issued for the daily code');

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

    // A stale screen tapping an item must not drag a delivered order backwards
    const regress = await fetch(`${B2}/api/orders/${order.id}/items/0/status`, {
      method: 'PUT',
      headers: staffHeaders,
      body: JSON.stringify({ status: 'cooking' }),
    });
    assert.strictEqual(regress.status, 409, 'item status cannot change on a delivered order');
    const stillDelivered = await (
      await fetch(`${B2}/api/orders/${order.id}`, { headers: { 'x-auth-token': token } })
    ).json();
    assert.strictEqual(stillDelivered.status, 'delivered', 'the order stays delivered');

    // Staff records are no longer writable or readable by a guest on the LAN
    const anonIngredient = await fetch(`${B2}/api/ingredient-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredient: 'Saffron', quantity: '1kg' }),
    });
    assert.strictEqual(anonIngredient.status, 401, 'ingredient requests need staff auth');

    const anonHelp = await fetch(`${B2}/api/help-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Spam', description: 'from a guest phone' }),
    });
    assert.strictEqual(anonHelp.status, 401, 'help reports need staff auth');

    const anonReturned = await fetch(`${B2}/api/returned-dish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dishName: item.name, quantity: 1, amount: 100 }),
    });
    assert.strictEqual(anonReturned.status, 401, 'returned dishes need staff auth');

    for (const url of ['/api/ingredient-requests', '/api/help-reports']) {
      assert.strictEqual((await fetch(`${B2}${url}`)).status, 401, `${url} needs staff auth`);
      assert.strictEqual((await fetch(`${B2}${url}`, { headers: { 'x-auth-token': token } })).status, 200, `${url} opens with a token`);
    }

    const staffIngredient = await fetch(`${B2}/api/ingredient-request`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({ ingredient: 'Saffron', quantity: '1kg' }),
    });
    assert.strictEqual(staffIngredient.status, 201, 'staff can still file requests');

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

    // ── Live socket stream is staff-only while auth is ON ──
    const guestSocket = await openSocket(B2);
    const lateSocket = await openSocket(B2); // PIN entered after connecting
    const staffSocket = await openSocket(B2, token);

    const toCooking = await fetch(`${B2}/api/orders/${seedOrder.id}/status`, {
      method: 'PUT',
      headers: staffHeaders,
      body: JSON.stringify({ status: 'cooking' }),
    });
    assert.strictEqual(toCooking.status, 200);

    const staffEvent = await waitForEvent(staffSocket, 'order_status_updated');
    assert.ok(staffEvent, 'a socket holding the staff token receives live order updates');
    assert.strictEqual(staffEvent.customerPhone, '9876543210', 'staff see the full order over the socket');

    // A brand-new order (the loudest payload — it carries the phone) is staff-only
    const fresh = await fetch(`${B2}/api/orders`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({
        tableNumber: '56',
        waiterName: 'Test',
        customerPhone: '9876543211',
        items: [{ name: item.name, quantity: 1 }],
      }),
    });
    assert.strictEqual(fresh.status, 201);
    const freshOrder = await fresh.json();

    const kitchenHit = await waitForEvent(staffSocket, 'kitchen_new_order');
    assert.ok(kitchenHit, 'staff sockets receive new orders');
    assert.strictEqual(kitchenHit.customerPhone, '9876543211', 'staff get the phone with the order');

    await fetch(`${B2}/api/orders/${freshOrder.id}`, { method: 'DELETE', headers: { 'x-auth-token': token } });
    assert.ok(await waitForEvent(staffSocket, 'order_deleted'), 'staff sockets receive deletions');

    const guestStatus = await waitForEvent(guestSocket, 'order_status_updated');
    assert.ok(guestStatus, 'an unauthenticated socket still gets order status');
    assert.ok(!('customerPhone' in guestStatus), 'guest socket payload carries no phone');
    assert.ok(!('customerName' in guestStatus), 'guest socket payload carries no name');

    const staffOnly = ['order_updated', 'kitchen_new_order', 'waiter_order_ready', 'order_deleted'];
    assert.deepStrictEqual(
      guestSocket.events.filter((e) => staffOnly.includes(e.name)).map((e) => e.name),
      [],
      'no staff-only order payload reaches an unauthenticated socket'
    );
    assert.deepStrictEqual(
      preexisting.events.filter((e) => staffOnly.includes(e.name)).map((e) => e.name),
      [],
      'a socket connected before auth was enabled is downgraded when it flips on'
    );

    // A screen that unlocks the PIN after connecting claims access live.
    // Drop the redacted guest events it already collected first.
    lateSocket.events.length = 0;
    lateSocket.send('authenticate', { token });
    const toReady = await fetch(`${B2}/api/orders/${seedOrder.id}/status`, {
      method: 'PUT',
      headers: staffHeaders,
      body: JSON.stringify({ status: 'ready' }),
    });
    assert.strictEqual(toReady.status, 200);

    const lateStatus = await waitForEvent(lateSocket, 'order_status_updated');
    assert.ok(lateStatus, 'authenticating upgrades a live socket');
    assert.strictEqual(lateStatus.customerPhone, '9876543210', 'the upgraded socket now sees the full order');
    assert.ok(await waitForEvent(lateSocket, 'waiter_order_ready'), 'upgraded socket gets waiter alerts');

    // Points pushes follow the number a guest asked to watch, not the LAN
    const otherGuest = await openSocket(B2);
    guestSocket.send('watch_loyalty', '9876543210');
    await new Promise((r) => setTimeout(r, 300));

    // Placing an order with a phone re-publishes that customer's record
    const ordered = await fetch(`${B2}/api/orders`, {
      method: 'POST',
      headers: staffHeaders,
      body: JSON.stringify({
        tableNumber: '57',
        waiterName: 'Test',
        customerPhone: '9876543210',
        items: [{ name: item.name, quantity: 1 }],
      }),
    });
    assert.strictEqual(ordered.status, 201);
    const loyaltyOrder = await ordered.json();

    assert.ok(await waitForEvent(guestSocket, 'loyalty_updated'), 'the watching guest gets its points update');
    assert.ok(await waitForEvent(staffSocket, 'loyalty_updated'), 'staff see loyalty changes');
    await new Promise((r) => setTimeout(r, 300));
    assert.deepStrictEqual(
      otherGuest.events.filter((e) => e.name === 'loyalty_updated'),
      [],
      'a guest watching no number receives no customer identity'
    );

    await fetch(`${B2}/api/orders/${loyaltyOrder.id}`, { method: 'DELETE', headers: { 'x-auth-token': token } });

    guestSocket.close();
    lateSocket.close();
    staffSocket.close();
    otherGuest.close();
    preexisting.close();

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

    const anonAgain = await fetch(`${B2}/api/ingredient-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredient: 'Salt', quantity: '2kg' }),
    });
    assert.strictEqual(anonAgain.status, 201, 'with auth off staff endpoints behave as before');

    // Auth off restores the old behaviour: every socket behaves as staff
    const reopenedOrder = await reopened.json();
    const plainSocket = await openSocket(B2);
    await fetch(`${B2}/api/orders/${reopenedOrder.id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cooking' }),
    });
    assert.ok(
      await waitForEvent(plainSocket, 'order_status_updated'),
      'with auth off an ordinary socket receives order updates again'
    );
    plainSocket.close();
  } finally {
    child2.kill();
    await new Promise((r) => setTimeout(r, 200));
  }
});

test('menu updates reject junk instead of storing it', async () => {
  const menu = await (await fetch(`${BASE}/api/menu`)).json();
  const item = Object.values(menu.categories).flat()[0];
  const before = { price: item.price, available: item.available };
  const put = (body) =>
    fetch(`${BASE}/api/menu/${item.id}`, {
      method: 'PUT',
      headers: MANAGER,
      body: JSON.stringify(body),
    });

  assert.strictEqual((await put({ price: 'free' })).status, 400, 'non-numeric price refused');
  assert.strictEqual((await put({ available: 'false' })).status, 400, 'non-boolean availability refused');
  assert.strictEqual((await put({ name: '   ' })).status, 400, 'blank name refused');

  const after = await (await fetch(`${BASE}/api/menu`)).json();
  const stored = Object.values(after.categories).flat().find((i) => i.id === item.id);
  assert.deepStrictEqual(
    { price: stored.price, available: stored.available },
    before,
    'a rejected update changed nothing (price stayed a real number)'
  );
  assert.strictEqual(typeof stored.price, 'number');

  assert.strictEqual((await put({ price: before.price, available: before.available })).status, 200, 'valid updates still work');
});

test('loyalty registration and rules reject junk', async () => {
  const register = (body) =>
    fetch(`${BASE}/api/loyalty/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  assert.strictEqual((await register({ phone: '123', name: 'Junk' })).status, 400, 'short phone refused');
  const good = await register({ phone: '9876501111', name: 'Valid Guest' });
  assert.strictEqual(good.status, 201, 'a real 10-digit phone registers');
  assert.strictEqual((await good.json()).phone, '9876501111');

  const before = await (await fetch(`${BASE}/api/loyalty/settings`)).json();
  const save = (body) =>
    fetch(`${BASE}/api/loyalty/settings`, {
      method: 'POST',
      headers: MANAGER,
      body: JSON.stringify(body),
    });

  assert.strictEqual((await save({ pointsPerHundred: 'abc' })).status, 400, 'typo in the earn rate refused');
  assert.strictEqual((await save({ discountValuePct: 'half' })).status, 400, 'typo in a percentage refused');
  assert.strictEqual((await save({ tiers: [{ key: 'a', name: 'A' }] })).status, 400, 'a single tier refused');

  const after = await (await fetch(`${BASE}/api/loyalty/settings`)).json();
  assert.strictEqual(after.pointsPerHundred, before.pointsPerHundred, 'the rate was not silently rewritten');
  assert.strictEqual(after.discountValuePct, before.discountValuePct, 'the discount was not silently rewritten');

  const ok = await save({
    pointsPerHundred: before.pointsPerHundred,
    discountSpendPct: before.discountSpendPct,
    discountValuePct: before.discountValuePct,
    birthdayBonus: before.birthdayBonus,
    tiers: before.tiers,
  });
  assert.strictEqual(ok.status, 200, 'valid rules still save');
});

test('returned dishes need a real amount', async () => {
  const post = (body) =>
    fetch(`${BASE}/api/returned-dish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.strictEqual((await post({ dishName: 'Veg Biryani', quantity: 1, amount: 'abc' })).status, 400, 'junk amount refused');
  assert.strictEqual((await post({ dishName: 'Veg Biryani', quantity: 0, amount: 100 })).status, 400, 'zero quantity refused');
  assert.strictEqual((await post({ dishName: 'Veg Biryani', quantity: 1, amount: 299 })).status, 201, 'a real return still records');
});

test('the staff code rotates daily but is stable within a day', () => {
  const codes = require('../staff-code');
  const secret = 'test-secret-0123456789';
  const monday = new Date(2026, 9, 19, 0, 0, 0);
  const mondayLate = new Date(2026, 9, 19, 23, 59, 0);
  const tuesday = new Date(2026, 9, 20, 0, 1, 0);

  assert.strictEqual(codes.dayKey(monday), '2026-10-19');
  assert.strictEqual(codes.dayKey(mondayLate), '2026-10-19', 'still the same day at 23:59');
  assert.strictEqual(
    codes.derive(secret, codes.dayKey(monday)),
    codes.derive(secret, codes.dayKey(mondayLate)),
    'the code does not change during the day'
  );
  assert.notStrictEqual(
    codes.derive(secret, codes.dayKey(monday)),
    codes.derive(secret, codes.dayKey(tuesday)),
    'a new day means a new code'
  );
  assert.notStrictEqual(
    codes.derive(secret, '2026-10-19'),
    codes.derive('another-install-secret', '2026-10-19'),
    'codes are per install, not global'
  );
  assert.match(codes.derive(secret, '2026-10-19'), /^[0-9A-F]{6}$/);
  assert.strictEqual(codes.rotatesAt(mondayLate).getDate(), 20, 'rotation happens at midnight');
});

// The restaurant serves past midnight (there is a "Late Night (22-6)" bucket),
// so a 02:00 order must be today's revenue — and loyalty giveaways/discounts
// must not be counted as money taken.
test('analytics counts late-night orders today and only money actually paid', async () => {
  const ordersPath = path.join(DATA_DIR, 'orders.json');
  const original = fs.readFileSync(ordersPath);
  const now = new Date();
  const at = (h) => {
    const d = new Date(now);
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  const menu = await (await fetch(`${BASE}/api/menu`)).json();
  const item = Object.values(menu.categories).flat().find((i) => i.available && i.price > 0);
  const line = (price, extra) => ({ name: item.name, quantity: 1, price, status: 'ready', ...(extra || {}) });

  try {
    fs.writeFileSync(
      ordersPath,
      JSON.stringify(
        {
          nextId: 4,
          orders: [
            { id: 1, tableNumber: '01', waiterName: 'T', status: 'delivered', createdAt: at(2), items: [line(item.price)] },
            {
              id: 2,
              tableNumber: '02',
              waiterName: 'T',
              status: 'delivered',
              createdAt: at(10),
              items: [line(item.price), line(0, { redeemed: true, pointsCost: item.price })],
            },
            { id: 3, tableNumber: '03', waiterName: 'T', status: 'delivered', createdAt: at(12), discount: 10, items: [line(item.price)] },
          ],
        },
        null,
        2
      )
    );

    const a = await (await fetch(`${BASE}/api/analytics`)).json();
    const localDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const day = a.sales.byDay.find((d) => d.key === localDay);
    const paid = item.price * 3 - 10;

    assert.strictEqual(a.periods.today.orders, 3, 'the 02:00 order belongs to today');
    assert.strictEqual(a.periods.today.revenue, paid, 'redeemed item excluded, discount subtracted');
    assert.strictEqual(day.revenue, paid, 'the daily chart agrees with the today card');
  } finally {
    fs.writeFileSync(ordersPath, original);
  }
});
