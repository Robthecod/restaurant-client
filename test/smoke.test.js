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
const DATA_FILES = ['orders.json', 'kitchen.json', 'tables.json', 'customers.json', 'menu.json'];

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
