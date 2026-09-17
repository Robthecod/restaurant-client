// ─── Load .env (git-ignored local overrides, zero dependencies) ──────────
(function loadEnv() {
  const fs = require('fs'), path = require('path');
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
})();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const MENU_FILE = path.join(DATA_DIR, 'menu.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const KITCHEN_FILE = path.join(DATA_DIR, 'kitchen.json');
const LICENSE_FILE = path.join(DATA_DIR, 'license.json');
const LOYALTY_FILE = path.join(DATA_DIR, 'customers.json');
const TABLES_FILE = path.join(DATA_DIR, 'tables.json');

// Shared static assets for the app screens (style.css, motion.js, manifest,
// sw.js, icons) — served at root. The restaurant screens live in /app/.
const PUBLIC_DIR = path.join(__dirname, 'public');
const APP_DIR = path.join(__dirname, 'app');

// ─── File System Helpers ────────────────────────────────────────────────

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function initDataFile(filePath, defaultData) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    console.log(`  Created ${path.basename(filePath)}`);
  }
}

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ─── Per-Item Status Helpers ────────────────────────────────────────────

function deriveOrderStatus(items) {
  const statuses = items.map((i) => i.status || 'pending');
  const hasPending = statuses.some((s) => s === 'pending');
  const hasCooking = statuses.some((s) => s === 'cooking');
  const hasReady = statuses.some((s) => s === 'ready');

  if (statuses.every((s) => s === 'delivered')) return 'delivered';
  if (statuses.every((s) => s === 'ready' || s === 'delivered')) return 'ready';
  if (hasCooking) return 'cooking';
  if (hasPending) return 'pending';
  return 'pending';
}

function addPendingStatusToItems(items) {
  return items.map((item) => ({
    ...item,
    status: item.status || 'pending',
  }));
}

// ─── Initialize Data Store ──────────────────────────────────────────────

ensureDataDir();

initDataFile(MENU_FILE, {
  categories: {
    starters: [
      { id: 1, name: 'Crispy Corn', price: 89, available: true },
      { id: 2, name: 'Paneer Tikka', price: 299, available: true },
      { id: 3, name: 'Garlic Bread with Cheese', price: 239, available: true },
      { id: 4, name: 'Hara Bhara Kabab', price: 239, available: true },
      { id: 5, name: 'Masala Spring Rolls', price: 239, available: true },
      { id: 6, name: 'Mushroom Kurkure', price: 255, available: true },
      { id: 7, name: 'Nachos Supreme', price: 299, available: true },
      { id: 8, name: 'Sweet Potato Fries', price: 225, available: true },
      { id: 9, name: 'Chilli Paneer', price: 299, available: true },
      { id: 10, name: 'Veg Seekh Kabab', price: 255, available: true },
      { id: 11, name: 'Dahi Ke Kabab', price: 299, available: true },
      { id: 12, name: 'Spinach & Corn Soup', price: 195, available: true },
      { id: 13, name: 'Tomato Basil Soup', price: 179, available: true },
      { id: 14, name: 'Cheese Chilli Toast', price: 225, available: true },
    ],
    mains: [
      { id: 15, name: 'Veg Biryani', price: 359, available: true },
      { id: 16, name: 'Paneer Butter Masala', price: 359, available: true },
      { id: 17, name: 'Dal Makhani', price: 315, available: true },
      { id: 18, name: 'Shahi Paneer', price: 375, available: true },
      { id: 19, name: 'Kadai Vegetable', price: 329, available: true },
      { id: 20, name: 'Malai Kofta', price: 359, available: true },
      { id: 21, name: 'Dal Tadka', price: 285, available: true },
      { id: 22, name: 'Palak Paneer', price: 329, available: true },
      { id: 23, name: 'Paneer Tikka Masala', price: 375, available: true },
      { id: 24, name: 'Mix Veg Curry', price: 299, available: true },
      { id: 25, name: 'Aloo Gobi', price: 269, available: true },
      { id: 26, name: 'Bhindi Masala', price: 269, available: true },
      { id: 27, name: 'Jeera Rice', price: 179, available: true },
      { id: 28, name: 'Lemon Rice', price: 209, available: true },
      { id: 29, name: 'Veg Pulao', price: 299, available: true },
      { id: 30, name: 'Veg Pasta in White Sauce', price: 359, available: true },
      { id: 31, name: 'Veg Pasta in Red Sauce', price: 329, available: true },
      { id: 32, name: 'Veg Fried Rice', price: 299, available: true },
      { id: 33, name: 'Hakka Noodles', price: 299, available: true },
      { id: 34, name: 'Veg Manchurian Gravy', price: 299, available: true },
      { id: 35, name: 'Stuffed Paratha', price: 179, available: true },
      { id: 36, name: 'Butter Naan', price: 119, available: true },
      { id: 37, name: 'Special Veg Thali', price: 479, available: true },
      { id: 38, name: 'Veg Sizzler', price: 435, available: true },
    ],
    desserts: [
      { id: 39, name: 'Gulab Jamun (2 pcs)', price: 179, available: true },
      { id: 40, name: 'Gajar Ka Halwa', price: 195, available: true },
      { id: 41, name: 'Brownie with Ice Cream', price: 239, available: true },
      { id: 42, name: 'Mango Mousse', price: 225, available: true },
      { id: 43, name: 'Tiramisu', price: 255, available: true },
      { id: 44, name: 'Rasmalai', price: 209, available: true },
      { id: 45, name: 'Ice Cream (2 scoops)', price: 149, available: true },
      { id: 46, name: 'Sizzling Brownie', price: 269, available: true },
      { id: 47, name: 'Phirni', price: 179, available: true },
      { id: 48, name: 'Fresh Fruit Bowl', price: 209, available: true },
      { id: 49, name: 'Kulfi', price: 195, available: true },
      { id: 50, name: 'Cheesecake', price: 239, available: true },
    ],
    drinks: [
      { id: 51, name: 'Masala Chai', price: 119, available: true },
      { id: 52, name: 'Cold Coffee', price: 179, available: true },
      { id: 53, name: 'Mango Lassi', price: 209, available: true },
      { id: 54, name: 'Fresh Lime Soda', price: 119, available: true },
      { id: 55, name: 'Buttermilk (Chaas)', price: 105, available: true },
      { id: 56, name: 'Fruit Smoothie', price: 225, available: true },
      { id: 57, name: 'Coconut Water', price: 135, available: true },
      { id: 58, name: 'Soft Drinks', price: 59, available: true },
      { id: 59, name: 'Mint Lemonade', price: 135, available: true },
      { id: 60, name: 'Iced Tea', price: 149, available: true },
      { id: 61, name: 'Hot Chocolate', price: 195, available: true },
      { id: 62, name: 'Fresh Juice (Seasonal)', price: 179, available: true },
    ],
  },
});

initDataFile(ORDERS_FILE, { nextId: 1, orders: [] });
initDataFile(KITCHEN_FILE, { nextIngredientId: 1, nextReturnId: 1, nextHelpId: 1, ingredientRequests: [], returnedDishes: [], helpReports: [] });
initDataFile(LICENSE_FILE, { installId: null, lastVerifiedAt: null, lastCheckedAt: null, locked: false });
initDataFile(TABLES_FILE, {
  map: { width: 800, height: 500, image: null, tables: [] },
  sessions: {},
});

// ─── LOYALTY / CUSTOMER REWARDS ─────────────────────────────────────────
// Phone-based loyalty: guests earn points on delivered orders, can redeem
// for free items (face value in points) or a deliberately weaker bill
// discount (spend 10% of the bill in points for 5% off) so item
// redemptions are the attractive path.

const LOYALTY_DEFAULTS = {
  pointsPerHundred: 100, // 100 points per ₹100 spent (before tier multiplier)
  discountSpendPct: 0.1, // points required for a discount = 10% of the bill
  discountValuePct: 0.5, // each point spent = ₹0.50 off (10% of bill → 5% off)
  birthdayBonus: 200,
  streakEvery: 5,        // bonus every Nth completed visit
  streakBonus: 50,
  tiers: [
    { key: 'silver', name: 'Silver', minSpent: 0, multiplier: 1 },
    { key: 'gold', name: 'Gold', minSpent: 5000, multiplier: 1.5 },
    { key: 'platinum', name: 'Platinum', minSpent: 15000, multiplier: 2 },
  ],
};

initDataFile(LOYALTY_FILE, {
  nextCustomerId: 1,
  nextLedgerId: 1,
  settings: JSON.parse(JSON.stringify(LOYALTY_DEFAULTS)),
  customers: [],
  ledger: [],
});

function readLoyalty() {
  const data = readJSON(LOYALTY_FILE);
  // Migrate legacy "points per ₹1" → "points per ₹100" (1 pt/₹1 = 100 pts/₹100)
  if (data.settings && data.settings.pointsPerRupee != null && data.settings.pointsPerHundred == null) {
    data.settings.pointsPerHundred = Math.round(data.settings.pointsPerRupee * 100);
    delete data.settings.pointsPerRupee;
    writeLoyalty(data);
  }
  return data;
}

function writeLoyalty(data) {
  writeJSON(LOYALTY_FILE, data);
}

function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d]/g, '').replace(/^0+/, '').slice(-10);
}

// Birthday is compared as MM-DD (e.g. '08-16'). The customer screen's date
// picker sends YYYY-MM-DD, so normalize both forms to MM-DD here.
function normalizeBirthday(b) {
  const s = String(b || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(5); // YYYY-MM-DD → MM-DD
  if (/^\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function findCustomer(data, phone) {
  return data.customers.find((c) => c.phone === normalizePhone(phone));
}

function computeTier(settings, totalSpent) {
  let tier = settings.tiers[0];
  for (const t of settings.tiers) {
    if (totalSpent >= t.minSpent) tier = t;
  }
  return tier;
}

function addLedger(data, entry) {
  entry.id = data.nextLedgerId++;
  data.ledger.push(entry);
  if (data.ledger.length > 500) data.ledger = data.ledger.slice(-500);
}

function loyaltyCustomerPublic(c) {
  return {
    id: c.id,
    phone: c.phone,
    name: c.name || '',
    tier: c.tier,
    points: c.points,
    totalSpent: c.totalSpent,
    visits: c.visits,
    birthdaySet: !!c.birthday,
    whatsappOptIn: !!c.whatsappOptIn,
  };
}

// Order total from menu prices (redeemed items are free, so they don't count)
function orderTotalFromMenu(order, menu) {
  const priceMap = {};
  for (const cat of Object.keys(menu.categories)) {
    for (const item of menu.categories[cat]) priceMap[item.name.toLowerCase()] = item.price;
  }
  let total = 0;
  for (const item of order.items || []) {
    if (item.redeemed) continue;
    total += (priceMap[item.name.toLowerCase()] || item.price || 0) * (item.quantity || 1);
  }
  return total;
}

// Award points when an order is delivered. Called from every delivery path;
// guarded by order.loyaltyAwarded so points are only ever given once.
function awardLoyaltyForOrder(order) {
  try {
    if (order.status !== 'delivered' || !order.customerPhone) return;
    if (order.loyaltyAwarded) return;

    const loyalty = readLoyalty();
    const settings = loyalty.settings;
    const phone = normalizePhone(order.customerPhone);
    if (!phone) return;

    let customer = findCustomer(loyalty, phone);
    if (!customer) {
      customer = {
        id: loyalty.nextCustomerId++,
        phone,
        name: '',
        birthday: '',
        points: 0,
        totalSpent: 0,
        visits: 0,
        tier: 'silver',
        pointsEarned: 0,
        pointsRedeemed: 0,
        createdAt: new Date().toISOString(),
        lastVisitAt: null,
      };
      loyalty.customers.push(customer);
    }

    const menu = readJSON(MENU_FILE);
    const total = orderTotalFromMenu(order, menu);

    customer.totalSpent += total;
    customer.tier = computeTier(settings, customer.totalSpent).key;

    let earned = Math.floor((total / 100) * settings.pointsPerHundred);
    const tier = settings.tiers.find((t) => t.key === customer.tier) || settings.tiers[0];
    earned = Math.floor(earned * (tier.multiplier || 1));

    let bonusEarned = 0;
    if (earned > 0) {
      customer.points += earned;
      customer.pointsEarned += earned;
      addLedger(loyalty, {
        customerId: customer.id,
        phone,
        type: 'earn',
        points: earned,
        orderId: order.id,
        description: `Earned on order #${order.id} (₹${Math.round(total)})`,
        createdAt: new Date().toISOString(),
      });
    }

    // 🎂 Birthday bonus
    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (customer.birthday && customer.birthday === mmdd && settings.birthdayBonus > 0) {
      customer.points += settings.birthdayBonus;
      customer.pointsEarned += settings.birthdayBonus;
      bonusEarned += settings.birthdayBonus;
      addLedger(loyalty, {
        customerId: customer.id,
        phone,
        type: 'birthday',
        points: settings.birthdayBonus,
        orderId: order.id,
        description: '🎂 Birthday bonus',
        createdAt: new Date().toISOString(),
      });
    }

    // Visits + streak bonus are NOT awarded per order — they're counted
    // once when the table is closed (bill paid), see finalizeTableVisit().
    // Within a 4-hour window, multiple closes count as the same visit.

    order.loyaltyAwarded = true;
    order.loyaltyEarned = earned + bonusEarned;

    writeLoyalty(loyalty);
    io.emit('loyalty_updated', loyaltyCustomerPublic(customer));
    console.log(`  Loyalty: +${order.loyaltyEarned} pts for ${phone} (order #${order.id})`);
  } catch (err) {
    console.error('Loyalty award error:', err);
  }
}

// Attach a phone number + process point redemptions at order placement.
// Returns { customer } on success, { error } on failure, or null when no phone.
function applyLoyaltyRedemption(data, order, body) {
  const phone = normalizePhone(body.customerPhone);
  if (!phone) return null;

  const loyalty = readLoyalty();
  const settings = loyalty.settings;
  let customer = findCustomer(loyalty, phone);
  if (!customer) {      customer = {
        id: loyalty.nextCustomerId++,
        phone,
        name: (body.customerName || '').trim(),
        birthday: normalizeBirthday(body.customerBirthday),
      points: 0,
      totalSpent: 0,
      visits: 0,
      tier: 'silver',
      pointsEarned: 0,
      pointsRedeemed: 0,
      createdAt: new Date().toISOString(),
      lastVisitAt: null,
    };
    loyalty.customers.push(customer);
  }

  order.customerPhone = phone;

  // 1) Free item redemptions (face value in points)
  const redeemItems = Array.isArray(body.redeemItems) ? body.redeemItems : [];
  for (const ri of redeemItems) {
    const points = parseInt(ri.points, 10) || 0;
    if (points <= 0) continue;
    if (customer.points < points) return { error: 'Not enough points for ' + ri.name };
    customer.points -= points;
    customer.pointsRedeemed += points;
    addLedger(loyalty, {
      customerId: customer.id,
      phone,
      type: 'redeem_item',
      points: -points,
      orderId: order.id,
      item: ri.name,
      description: `Redeemed ${ri.name} for ${points} pts`,
      createdAt: new Date().toISOString(),
    });
    order.items.push({
      name: ri.name,
      quantity: 1,
      modifiers: '🎁 Rewarded with points',
      status: 'pending',
      price: 0,
      redeemed: true,
      pointsCost: points,
    });
  }

  // 2) Bill discount: spend 10% of the bill in points → 5% off (by design,
  //    weaker value than free-item redemptions, so items are the draw)
  if (body.useDiscount && customer.points > 0) {
    const menu = readJSON(MENU_FILE);
    const total = orderTotalFromMenu(order, menu);
    const maxSpend = Math.floor(total * settings.discountSpendPct);
    const points = Math.min(customer.points, maxSpend);
    if (points > 0) {
      const discount = Math.floor(points * settings.discountValuePct);
      customer.points -= points;
      customer.pointsRedeemed += points;
      addLedger(loyalty, {
        customerId: customer.id,
        phone,
        type: 'redeem_discount',
        points: -points,
        orderId: order.id,
        discount,
        description: `Bill discount ₹${discount} for ${points} pts`,
        createdAt: new Date().toISOString(),
      });
      order.discount = discount;
      order.discountPoints = points;
    }
  }

  writeLoyalty(loyalty);
  io.emit('loyalty_updated', loyaltyCustomerPublic(customer));
  return { customer: loyaltyCustomerPublic(customer) };
}

// ─── LICENSE / ACTIVATION MANAGER ────────────────────────────────────────
// Self-hosted installs "phone home" to a licensing server. When the license
// is missing, expired, revoked, or unpaid, the system locks down to
// read-only: every mutating API call is rejected with HTTP 402 and screens
// show a lock screen (see /js/license-client.js).
//
// Configuration (environment variables):
//   LICENSE_KEY          The restaurant's license key. If empty, licensing
//                        is disabled entirely (developer / managed-cloud mode).
//   LICENSE_SERVER_URL   Your licensing server, e.g. https://licenses.yourdomain.com
//   LICENSE_GRACE_DAYS   Days to keep running after the last successful
//                        verification when the licensing server is offline.
//                        Default: 3.
//   LICENSE_CHECK_HOUR   Hour of day (0-23) for the once-daily morning check.
//                        Default: 6 (6 AM).
//   LICENSE_CHECK_INTERVAL_HOURS  If set (1-24+), verify every N hours instead
//                        of once daily — use for snappier lockdown enforcement
//                        (e.g. 1 = checks hourly). Default: unset (daily).

// Restaurant's WhatsApp number (with country code, digits only, e.g. '919876543210')
// Used for free wa.me deep links on the customer screen and in the manager panel.
const WHATSAPP_NUMBER = (process.env.WHATSAPP_NUMBER || '').replace(/[^\d]/g, '');

// Optional PIN protecting manager-only mutations (menu + loyalty settings).
// When set, the manager panel asks for it and sends it as an `x-manager-pin`
// header on every mutating call. Leave unset for open LAN use.
const MANAGER_PIN = process.env.MANAGER_PIN || '';

const LICENSE_KEY = process.env.LICENSE_KEY || '';
const LICENSE_SERVER_URL = (process.env.LICENSE_SERVER_URL || '').replace(/\/+$/, '');
const LICENSE_GRACE_DAYS = Math.max(0, parseInt(process.env.LICENSE_GRACE_DAYS || '3', 10) || 0);
const LICENSE_CHECK_HOUR = Math.min(23, Math.max(0, parseInt(process.env.LICENSE_CHECK_HOUR || '6', 10) || 6));
const LICENSE_CHECK_INTERVAL_HOURS = Math.max(1, parseInt(process.env.LICENSE_CHECK_INTERVAL_HOURS || '0', 10) || 0);
const GRACE_MS = LICENSE_GRACE_DAYS * 24 * 60 * 60 * 1000;

const license = {
  enabled: !!LICENSE_KEY,
  locked: false,
  installId: null,
  lastVerifiedAt: null,
  lastCheckedAt: null,
  lastReason: null,
};

function readLicenseState() {
  try {
    const data = readJSON(LICENSE_FILE);
    license.installId = data.installId || null;
    license.lastVerifiedAt = data.lastVerifiedAt || null;
    license.lastCheckedAt = data.lastCheckedAt || null;
    license.locked = !!data.locked;
  } catch (err) {
    /* keep defaults */
  }
}

function saveLicenseState() {
  try {
    writeJSON(LICENSE_FILE, {
      installId: license.installId,
      lastVerifiedAt: license.lastVerifiedAt,
      lastCheckedAt: license.lastCheckedAt,
      locked: license.locked,
    });
  } catch (err) {
    console.error('  License: failed to persist state:', err.message);
  }
}

function ensureInstallId() {
  if (license.installId) return;
  const os = require('os');
  const raw = os.hostname() + '|' + os.platform() + '|' + crypto.randomBytes(8).toString('hex');
  license.installId = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
  saveLicenseState();
}

function setLocked(locked, reason) {
  const changed = license.locked !== locked;
  license.locked = locked;
  license.lastReason = reason || null;
  saveLicenseState();
  if (changed) {
    io.emit(locked ? 'license_locked' : 'license_unlocked', {
      reason: reason || null,
      at: new Date().toISOString(),
    });
    if (locked) {
      console.log('  🔒 LICENSE LOCKED — ' + (reason || 'inactive or unpaid license'));
    } else {
      console.log('  🔓 License unlocked');
    }
  }
}

function verifyLicense() {
  return new Promise((resolve) => {
    if (!license.enabled) return resolve({ ok: true, offline: false });
    if (!LICENSE_SERVER_URL) {
      return resolve({ ok: false, offline: true, reason: 'LICENSE_SERVER_URL is not configured' });
    }
    ensureInstallId();

    let target;
    try {
      target = new URL(LICENSE_SERVER_URL + '/api/license/verify');
    } catch (err) {
      return resolve({ ok: false, offline: true, reason: 'Invalid LICENSE_SERVER_URL' });
    }
    target.searchParams.set('key', LICENSE_KEY);
    target.searchParams.set('installId', license.installId);
    target.searchParams.set('hostname', require('os').hostname());

    // Support both https (production) and http (local/LAN testing)
    const client = target.protocol === 'https:' ? https : http;
    const req = client.get(target, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let data = null;
        try { data = JSON.parse(body); } catch (err) { /* ignore */ }
        // Only an explicit denial locks the system. 5xx / other unexpected
        // responses from OUR licensing server (e.g. a 502 during a deploy)
        // are treated as offline so the grace period applies instead of
        // locking every restaurant because of a vendor-side glitch.
        if (res.statusCode === 200 && data && data.valid) {
          resolve({ ok: true, offline: false, data });
        } else if (data && data.valid === false) {
          resolve({ ok: false, offline: false, reason: data.reason || 'License rejected by server' });
        } else if (res.statusCode === 400) {
          resolve({ ok: false, offline: false, reason: 'License server rejected the request (HTTP 400)' });
        } else if (res.statusCode >= 500) {
          resolve({ ok: false, offline: true, reason: 'License server error (HTTP ' + res.statusCode + ')' });
        } else {
          resolve({ ok: false, offline: true, reason: 'Unexpected response from license server' });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, offline: true, reason: 'License server timed out' });
    });
    req.on('error', (err) => {
      resolve({ ok: false, offline: true, reason: 'Cannot reach license server: ' + err.message });
    });
  });
}

async function runLicenseCheck() {
  if (!license.enabled) return;
  ensureInstallId();
  license.lastCheckedAt = new Date().toISOString();

  const result = await verifyLicense();

  if (result.ok) {
    license.lastVerifiedAt = new Date().toISOString();
    setLocked(false, null);
    const who = result.data && result.data.restaurant ? ' for ' + result.data.restaurant : '';
    console.log('  ✅ License verified' + who);
  } else if (result.offline) {
    // Phone-home unreachable — rely on the grace period since last success.
    const sinceVerified = license.lastVerifiedAt
      ? Date.now() - new Date(license.lastVerifiedAt).getTime()
      : Infinity;
    if (sinceVerified <= GRACE_MS) {
      setLocked(false, result.reason);
      const daysLeft = Math.max(0, Math.ceil((GRACE_MS - sinceVerified) / 86400000));
      console.log(`  ⚠️  License server unreachable — offline grace: ~${daysLeft} day(s) remaining`);
    } else {
      setLocked(true, 'License server unreachable beyond the ' + LICENSE_GRACE_DAYS + '-day grace period');
    }
  } else {
    // Server responded: license is invalid, expired, or revoked.
    setLocked(true, result.reason);
  }

  saveLicenseState();
}

function scheduleNextCheck() {
  // Interval mode: verify every N hours for snappier enforcement
  if (LICENSE_CHECK_INTERVAL_HOURS > 0) {
    const delay = LICENSE_CHECK_INTERVAL_HOURS * 60 * 60 * 1000;
    setTimeout(() => {
      runLicenseCheck();
      scheduleNextCheck();
    }, delay);
    console.log('  License: next verification in ' + LICENSE_CHECK_INTERVAL_HOURS + ' hour(s)');
    return;
  }

  // Default: three times daily — 10 AM, 6 PM, 9 PM
  const CHECK_TIMES = [10, 18, 21]; // hours in 24h format
  const now = new Date();

  // Find the next check time that is still in the future today
  let next = null;
  for (const h of CHECK_TIMES) {
    const candidate = new Date(now);
    candidate.setHours(h, 0, 0, 0);
    if (candidate.getTime() > now.getTime()) {
      next = candidate;
      break;
    }
  }
  // All today's checks are past — schedule for tomorrow's first check
  if (!next) {
    next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(CHECK_TIMES[0], 0, 0, 0);
  }

  const delayMs = next.getTime() - now.getTime();
  setTimeout(() => {
    runLicenseCheck();
    scheduleNextCheck();
  }, delayMs);
  const hrsLeft = Math.round(delayMs / 3600000);
  console.log('  License: next verification ' + next.toLocaleString() + ' (~' + hrsLeft + 'h)');
}

// ─── Middleware ──────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' })); // floor-plan images arrive as data URLs
// ─── LOYALTY API ─────────────────────────────────────────────────────────

// GET /api/loyalty/settings — public earning/redemption rules
app.get('/api/loyalty/settings', (req, res) => {
  const settings = readLoyalty().settings;
  res.json({
    ...settings,
    whatsappNumber: WHATSAPP_NUMBER || null, // restaurant's WhatsApp number for wa.me links
  });
});

// POST /api/loyalty/register — create or update a customer profile
app.post('/api/loyalty/register', (req, res) => {
  try {
    const loyalty = readLoyalty();
    const phone = normalizePhone(req.body.phone);
    if (!phone) return res.status(400).json({ error: 'A valid phone number is required' });

    let customer = findCustomer(loyalty, phone);
    if (!customer) {
      customer = {
        id: loyalty.nextCustomerId++,
        phone,
        name: (req.body.name || '').trim(),
        birthday: normalizeBirthday(req.body.birthday),
        whatsappOptIn: !!req.body.whatsappOptIn,
        points: 0,
        totalSpent: 0,
        visits: 0,
        tier: 'silver',
        pointsEarned: 0,
        pointsRedeemed: 0,
        createdAt: new Date().toISOString(),
        lastVisitAt: null,
      };
      loyalty.customers.push(customer);
    } else {
      if (req.body.name) customer.name = String(req.body.name).trim();
      if (req.body.birthday) customer.birthday = normalizeBirthday(req.body.birthday);
      if (typeof req.body.whatsappOptIn === 'boolean') customer.whatsappOptIn = req.body.whatsappOptIn;
    }

    writeLoyalty(loyalty);
    res.status(201).json(loyaltyCustomerPublic(customer));
  } catch (err) {
    console.error('Loyalty register error:', err);
    res.status(500).json({ error: 'Failed to register customer' });
  }
});

// GET /api/loyalty/status?phone= — balance check for the customer screen
app.get('/api/loyalty/status', (req, res) => {
  const phone = normalizePhone(req.query.phone || '');
  if (!phone) return res.status(400).json({ error: 'phone is required' });
  const loyalty = readLoyalty();
  const customer = findCustomer(loyalty, phone);
  if (!customer) return res.json({ exists: false, phone });
  res.json({ exists: true, customer: loyaltyCustomerPublic(customer) });
});

// GET /api/loyalty/customers — manager directory
app.get('/api/loyalty/customers', (req, res) => {
  const loyalty = readLoyalty();
  res.json(loyalty.customers.map((c) => loyaltyCustomerPublic(c)));
});

// GET /api/loyalty/ledger?limit=50 — manager activity feed
app.get('/api/loyalty/ledger', (req, res) => {
  const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
  const loyalty = readLoyalty();
  res.json(loyalty.ledger.slice(-limit).reverse());
});

// POST /api/loyalty/settings — manager updates rules
app.post('/api/loyalty/settings', requireManagerAuth, (req, res) => {
  try {
    const loyalty = readLoyalty();
    const s = loyalty.settings;
    if (req.body.pointsPerHundred != null) s.pointsPerHundred = Math.max(1, parseFloat(req.body.pointsPerHundred) || 1);
    if (req.body.discountSpendPct != null) s.discountSpendPct = Math.min(1, Math.max(0, parseFloat(req.body.discountSpendPct) || 0));
    if (req.body.discountValuePct != null) s.discountValuePct = Math.min(1, Math.max(0, parseFloat(req.body.discountValuePct) || 0));
    if (req.body.birthdayBonus != null) s.birthdayBonus = Math.max(0, parseInt(req.body.birthdayBonus, 10) || 0);
    if (req.body.streakEvery != null) s.streakEvery = Math.max(0, parseInt(req.body.streakEvery, 10) || 0);
    if (req.body.streakBonus != null) s.streakBonus = Math.max(0, parseInt(req.body.streakBonus, 10) || 0);
    if (Array.isArray(req.body.tiers) && req.body.tiers.length >= 2) {
      s.tiers = req.body.tiers.map((t) => ({
        key: String(t.key || 'tier'),
        name: String(t.name || t.key || 'Tier'),
        minSpent: Math.max(0, parseFloat(t.minSpent) || 0),
        multiplier: Math.max(0.1, parseFloat(t.multiplier) || 1),
      }));
    }
    writeLoyalty(loyalty);
    io.emit('loyalty_settings_updated', s);
    res.json(s);
  } catch (err) {
    console.error('Loyalty settings error:', err);
    res.status(500).json({ error: 'Failed to update loyalty settings' });
  }
});

// ─── TABLE SESSIONS (loyalty phone assignment) ─────────────────────────
// A "table session" ties a phone number (and optional name) to a table so
// the waiter enters it ONCE and every order from that table automatically
// earns points for that customer. Closing the session (bill paid) clears
// the phone and counts exactly ONE visit — orders within a session no
// longer count as separate visits.

function readTables() {
  return readJSON(TABLES_FILE);
}

function writeTables(data) {
  writeJSON(TABLES_FILE, data);
}

function tableKey(n) {
  return String(n == null ? '' : n).padStart(2, '0');
}

function getTableSession(tableNumber) {
  const tables = readTables();
  return tables.sessions[tableKey(tableNumber)] || null;
}

function emitTableSession(tableNumber, session) {
  io.emit('table_session_updated', {
    tableNumber,
    phone: session.phone,
    name: session.name,
    ordersCount: session.ordersCount || 0,
    openedAt: session.openedAt,
    lastOrderAt: session.lastOrderAt || null,
  });
}

// Attach (or replace) a phone on a table's session
function upsertTableSession(tableNumber, { phone, name } = {}) {
  const tables = readTables();
  const key = tableKey(tableNumber);
  const existing = tables.sessions[key];
  const now = new Date().toISOString();
  const session = {
    phone: normalizePhone(phone) || (existing && existing.phone) || '',
    name: String(name != null ? name : (existing && existing.name) || '').trim(),
    ordersCount: (existing && existing.ordersCount) || 0,
    openedAt: (existing && existing.openedAt) || now,
    lastOrderAt: (existing && existing.lastOrderAt) || null,
  };
  tables.sessions[key] = session;
  writeTables(tables);
  emitTableSession(key, session);
  return session;
}

// Bump order activity on a session (called when an order is placed)
function touchTableSession(tableNumber) {
  const tables = readTables();
  const key = tableKey(tableNumber);
  const s = tables.sessions[key];
  if (!s) return null;
  s.ordersCount = (s.ordersCount || 0) + 1;
  s.lastOrderAt = new Date().toISOString();
  writeTables(tables);
  return s;
}

// One visit per closed table session: increments the customer's visit
// count and awards the visit-streak bonus on every Nth visit.
function finalizeTableVisit(phone) {
  const p = normalizePhone(phone);
  if (!p) return;
  const loyalty = readLoyalty();
  const settings = loyalty.settings;
  const customer = findCustomer(loyalty, p);
  if (!customer) return;

  // Only count as a new visit if the last visit was more than 4 hours ago.
  // Within a 4-hour window, multiple table closes count as the same visit
  // so the waiter doesn't need to re-enter the phone each time.
  const VISIT_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours
  const now = new Date();
  const lastVisit = customer.lastVisitAt ? new Date(customer.lastVisitAt) : null;
  const isNewVisit = !lastVisit || (now - lastVisit) > VISIT_WINDOW_MS;

  if (isNewVisit) customer.visits++;
  customer.lastVisitAt = now.toISOString();

  if (isNewVisit && settings.streakEvery > 0 && customer.visits % settings.streakEvery === 0 && settings.streakBonus > 0) {
    customer.points += settings.streakBonus;
    customer.pointsEarned += settings.streakBonus;
    addLedger(loyalty, {
      customerId: customer.id,
      phone: p,
      type: 'streak',
      points: settings.streakBonus,
      description: `🏅 ${customer.visits}th visit bonus`,
      createdAt: new Date().toISOString(),
    });
  }

  writeLoyalty(loyalty);
  io.emit('loyalty_updated', loyaltyCustomerPublic(customer));
  console.log(`  Loyalty: visit #${customer.visits} for ${p}`);
}

// GET /api/tables — all open table sessions (for waiters / manager)
app.get('/api/tables', (req, res) => {
  const tables = readTables();
  res.json({
    sessions: Object.entries(tables.sessions).map(([tableNumber, s]) => ({
      tableNumber,
      phone: s.phone,
      name: s.name || '',
      ordersCount: s.ordersCount || 0,
      openedAt: s.openedAt,
      lastOrderAt: s.lastOrderAt || null,
    })),
  });
});

// GET /api/tables/:table — one table's session (customer screen prefill)
app.get('/api/tables/:table', (req, res) => {
  const s = getTableSession(req.params.table);
  if (!s) return res.json({ session: null });
  res.json({
    session: {
      tableNumber: tableKey(req.params.table),
      phone: s.phone,
      name: s.name || '',
      ordersCount: s.ordersCount || 0,
      openedAt: s.openedAt,
      lastOrderAt: s.lastOrderAt || null,
    },
  });
});

// POST /api/tables/:table/assign — attach a phone (+ optional name) to a table
app.post('/api/tables/:table/assign', (req, res) => {
  const phone = normalizePhone(req.body && req.body.phone);
  if (!phone) return res.status(400).json({ error: 'A valid phone number is required' });
  const session = upsertTableSession(req.params.table, {
    phone,
    name: req.body && req.body.name,
  });
  console.log(`  Table ${tableKey(req.params.table)}: phone ${phone} assigned`);
  res.status(201).json({ session });
});

// POST /api/tables/:table/close — bill paid: clear the phone, count the visit
app.post('/api/tables/:table/close', (req, res) => {
  const tables = readTables();
  const key = tableKey(req.params.table);
  const session = tables.sessions[key];
  if (!session) return res.json({ closed: false, message: 'No open session for this table' });

  delete tables.sessions[key];
  writeTables(tables);

  if ((session.ordersCount || 0) > 0 && session.phone) {
    finalizeTableVisit(session.phone);
  }

  io.emit('table_closed', { tableNumber: key, phone: session.phone || null });
  console.log(`  Table ${key}: session closed${session.phone ? ' (visit counted for ' + session.phone + ')' : ''}`);
  res.json({ closed: true, phone: session.phone || null });
});

// POST /api/tables/:table/clear — remove a phone/session WITHOUT counting a
// visit. Used when the wrong number was entered or the party left early —
// unlike /close, this never awards visits or streak bonuses.
app.post('/api/tables/:table/clear', (req, res) => {
  const tables = readTables();
  const key = tableKey(req.params.table);
  if (!tables.sessions[key]) return res.json({ cleared: false, message: 'No open session for this table' });

  delete tables.sessions[key];
  writeTables(tables);

  io.emit('table_closed', { tableNumber: key, phone: null });
  console.log(`  Table ${key}: session cleared (no visit counted)`);
  res.json({ cleared: true });
});

// ─── FLOOR MAP (table registry + floor plan) ───────────────────────────
// The manager sketches the restaurant layout (free-form: uploaded floor
// photo or drawn background) and places tables on it, each with a
// customizable label that IS the table number used across the system.

const FLOORPLAN_DIR = path.join(__dirname, 'public', 'floorplans');

function readMap() {
  const data = readJSON(TABLES_FILE);
  return Object.assign({ width: 800, height: 500, image: null, tables: [] }, data.map || {});
}

function writeMap(map) {
  const data = readJSON(TABLES_FILE);
  data.map = map;
  writeJSON(TABLES_FILE, data);
}

function sanitizeTable(t) {
  return {
    id: String((t && t.id) || 't' + Math.random().toString(36).slice(2, 8)),
    label: String((t && t.label) || '').trim().slice(0, 12) || 'Table',
    x: Math.min(100, Math.max(0, parseFloat(t && t.x) || 50)),
    y: Math.min(100, Math.max(0, parseFloat(t && t.y) || 50)),
    w: Math.min(30, Math.max(3, parseFloat(t && t.w) || 8)),
    h: Math.min(30, Math.max(3, parseFloat(t && t.h) || 8)),
    shape: t && ['circle', 'square', 'rectangle'].includes(t.shape) ? t.shape : 'circle',
  };
}

// Persist an uploaded floor-plan image (data URL) and return its URL path.
function saveFloorplanImage(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  fs.mkdirSync(FLOORPLAN_DIR, { recursive: true });
  // Remove any previous floor plan so only one stays on disk
  for (const f of fs.readdirSync(FLOORPLAN_DIR)) {
    if (f.startsWith('map.')) fs.unlinkSync(path.join(FLOORPLAN_DIR, f));
  }
  fs.writeFileSync(path.join(FLOORPLAN_DIR, 'map.' + ext), Buffer.from(m[2], 'base64'));
  return '/floorplans/map.' + ext;
}

function removeFloorplanImage() {
  if (!fs.existsSync(FLOORPLAN_DIR)) return;
  for (const f of fs.readdirSync(FLOORPLAN_DIR)) {
    if (f.startsWith('map.')) fs.unlinkSync(path.join(FLOORPLAN_DIR, f));
  }
}

// GET /api/map — the floor map (tables + background)
app.get('/api/map', (req, res) => {
  res.json({ map: readMap() });
});

// POST /api/map — save the floor map (manager only)
app.post('/api/map', requireManagerAuth, (req, res) => {
  const body = req.body || {};
  let image = null;
  if (typeof body.image === 'string' && body.image.startsWith('/floorplans/')) {
    image = body.image; // unchanged path
  } else if (typeof body.image === 'string' && body.image.startsWith('data:image/')) {
    image = saveFloorplanImage(body.image); // newly uploaded
    if (!image) return res.status(400).json({ error: 'Unsupported image format' });
  } else {
    removeFloorplanImage(); // image removed
  }

  const map = {
    width: Math.min(4000, Math.max(200, parseInt(body.width, 10) || 800)),
    height: Math.min(3000, Math.max(150, parseInt(body.height, 10) || 500)),
    image,
    tables: Array.isArray(body.tables) ? body.tables.map(sanitizeTable) : [],
  };
  writeMap(map);
  io.emit('map_updated', map);
  res.json({ map });
});

// CORS for cross-origin requests from tablets
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve shared static assets (style.css, motion.js, manifest, sw, icons)
app.use(express.static(PUBLIC_DIR));

// Health check (Render uses this)
app.get('/health', (req, res) => res.json({ ok: true, service: 'chauka-local' }));

// ─── LICENSE API ─────────────────────────────────────────────────────────
// (Placed after lead-gen routes so demo/signup stay open, and before the
// lockdown middleware so they work even while locked.)

// GET /api/license/status — current license state (lock screens poll this)
app.get('/api/license/status', (req, res) => {
  res.json({
    licensingEnabled: license.enabled,
    locked: license.locked,
    installId: license.installId,
    lastVerifiedAt: license.lastVerifiedAt,
    lastCheckedAt: license.lastCheckedAt,
    lastReason: license.lastReason,
    graceDays: LICENSE_GRACE_DAYS,
    checkTimes: [10, 18, 21],
  });
});

// POST /api/license/check — force an immediate re-verification
app.post('/api/license/check', (req, res) => {
  if (!license.enabled) {
    return res.json({ licensingEnabled: false, locked: false });
  }
  runLicenseCheck().then(() => {
    res.json({
      licensingEnabled: true,
      locked: license.locked,
      lastVerifiedAt: license.lastVerifiedAt,
      lastCheckedAt: license.lastCheckedAt,
      lastReason: license.lastReason,
    });
  });
});

// ─── MANAGER ACCESS (PIN) ──────────────────────────────────────────────
// Optional: protects manager-only mutations (menu CRUD + loyalty settings)
// with a PIN. Set MANAGER_PIN on the server; when set, the manager panel
// asks for the PIN and sends it as an `x-manager-pin` header on every
// mutating call. Placed before the license lockdown middleware so login
// still works while locked (the license overlay handles that state).

// GET /api/manager/config — tells the manager screen whether a PIN is required
app.get('/api/manager/config', (req, res) => {
  res.json({ pinRequired: !!MANAGER_PIN });
});

// POST /api/manager/login — verify the PIN (client keeps it for the session)
app.post('/api/manager/login', (req, res) => {
  if (!MANAGER_PIN) return res.json({ ok: true, pinRequired: false });
  const pin = String(req.body && req.body.pin != null ? req.body.pin : '');
  if (pin === MANAGER_PIN) return res.json({ ok: true, pinRequired: true });
  return res.status(401).json({ error: 'Invalid PIN' });
});

function requireManagerAuth(req, res, next) {
  if (!MANAGER_PIN) return next();
  const pin = String(req.headers['x-manager-pin'] || '');
  if (pin === MANAGER_PIN) return next();
  return res.status(401).json({
    error: 'MANAGER_PIN_REQUIRED',
    message: 'Manager PIN required to make changes.',
  });
}

// ─── LICENSE LOCKDOWN MIDDLEWARE ─────────────────────────────────────────
// When locked, reject all mutating /api requests (HTTP 402). Read-only GET
// requests stay available so staff can still view data.
app.use('/api', (req, res, next) => {
  if (!license.enabled || !license.locked) return next();
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'OPTIONS' || method === 'HEAD') return next();
  return res.status(402).json({
    error: 'LICENSE_LOCKED',
    message: 'This system is locked because the license is inactive or unpaid. Please contact your service provider to renew.',
    locked: true,
  });
});

// ─── CATEGORY MANAGEMENT API ─────────────────────────────────────────────

// POST /api/menu/category — Add a new category
app.post('/api/menu/category', requireManagerAuth, (req, res) => {
  try {
    const menu = readJSON(MENU_FILE);
    const { key, name } = req.body;

    if (!key || !name) {
      return res.status(400).json({ error: 'key and name are required' });
    }

    if (menu.categories[key]) {
      return res.status(400).json({ error: 'Category "' + key + '" already exists' });
    }

    menu.categories[key] = [];
    writeJSON(MENU_FILE, menu);
    io.emit('menu_updated', menu);

    console.log('  Category added: ' + name + ' (' + key + ')');

    res.status(201).json({ key, name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add category' });
  }
});

// ─── INGREDIENT REQUEST API ────────────────────────────────────────────

// POST /api/ingredient-request — Report missing ingredient
app.post('/api/ingredient-request', (req, res) => {
  try {
    const data = readJSON(KITCHEN_FILE);
    const { ingredient, quantity, requestedBy, tableNumber } = req.body;

    if (!ingredient || !quantity) {
      return res.status(400).json({ error: 'ingredient and quantity are required' });
    }

    const request = {
      id: data.nextIngredientId,
      ingredient,
      quantity,
      requestedBy: requestedBy || 'Staff',
      tableNumber: tableNumber || '',
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    data.nextIngredientId++;
    data.ingredientRequests.push(request);
    writeJSON(KITCHEN_FILE, data);

    io.emit('new_ingredient_request', request);
    console.log(`  Ingredient request #${request.id}: ${ingredient} — ${quantity} (by ${request.requestedBy})`);

    res.status(201).json({ success: true, id: request.id });
  } catch (err) {
    console.error('Ingredient request error:', err);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// ─── INGREDIENT REQUESTS API (GET + PATCH) ─────────────────────────────

// GET /api/ingredient-requests — Fetch all open ingredient requests
app.get('/api/ingredient-requests', (req, res) => {
  try {
    const data = readJSON(KITCHEN_FILE);
    const openRequests = data.ingredientRequests.filter(r => r.status === 'open');
    res.json(openRequests);
  } catch (err) {
    console.error('Fetch ingredient requests error:', err);
    res.status(500).json({ error: 'Failed to fetch ingredient requests' });
  }
});

// PATCH /api/ingredient-requests/:id/resolve — Mark an ingredient request as resolved
app.patch('/api/ingredient-requests/:id/resolve', (req, res) => {
  try {
    const data = readJSON(KITCHEN_FILE);
    const requestId = parseInt(req.params.id);
    const request = data.ingredientRequests.find(r => r.id === requestId);

    if (!request) {
      return res.status(404).json({ error: 'Ingredient request not found' });
    }

    request.status = 'resolved';
    request.resolvedAt = new Date().toISOString();
    writeJSON(KITCHEN_FILE, data);

    io.emit('ingredient_request_resolved', request);
    console.log(`  Ingredient request #${requestId}: ${request.ingredient} — RESOLVED`);

    res.json({ success: true, request });
  } catch (err) {
    console.error('Resolve ingredient request error:', err);
    res.status(500).json({ error: 'Failed to resolve request' });
  }
});

// ─── RETURNED DISH API ─────────────────────────────────────────────────

// POST /api/returned-dish — Report a dish sent back (waiter only)
app.post('/api/returned-dish', (req, res) => {
  try {
    const data = readJSON(KITCHEN_FILE);
    const { dishName, quantity, reason, amount, tableNumber } = req.body;

    if (!dishName || !amount) {
      return res.status(400).json({ error: 'dishName and amount are required' });
    }

    const returned = {
      id: data.nextReturnId,
      dishName,
      quantity: quantity || 1,
      reason: reason || 'Incorrectly prepared',
      amount: parseFloat(amount),
      tableNumber: tableNumber || '',
      createdAt: new Date().toISOString(),
    };

    data.nextReturnId++;
    data.returnedDishes.push(returned);
    writeJSON(KITCHEN_FILE, data);

    io.emit('new_returned_dish', returned);
    console.log(`  Returned dish #${returned.id}: ${dishName} x${returned.quantity} — ₹${returned.amount}`);

    res.status(201).json({ success: true, id: returned.id });
  } catch (err) {
    console.error('Returned dish error:', err);
    res.status(500).json({ error: 'Failed to report returned dish' });
  }
});

// ─── HELP / COMPLAINT REPORT API ────────────────────────────────────────

// POST /api/help-report — Staff records a complaint/note (title + description)
app.post('/api/help-report', (req, res) => {
  try {
    const data = readJSON(KITCHEN_FILE);
    const { title, description, requestedBy, tableNumber } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: 'title and description are required' });
    }

    const report = {
      id: data.nextHelpId,
      title: title.trim(),
      description: description.trim(),
      requestedBy: requestedBy || 'Staff',
      tableNumber: tableNumber || '',
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };

    data.nextHelpId++;
    data.helpReports.push(report);
    writeJSON(KITCHEN_FILE, data);

    io.emit('new_help_report', report);
    console.log(`  Help report #${report.id}: ${report.title} (by ${report.requestedBy})`);

    res.status(201).json({ success: true, id: report.id });
  } catch (err) {
    console.error('Help report error:', err);
    res.status(500).json({ error: 'Failed to submit help report' });
  }
});

// GET /api/help-reports — Fetch all open help reports
app.get('/api/help-reports', (req, res) => {
  try {
    const data = readJSON(KITCHEN_FILE);
    const openReports = (data.helpReports || []).filter(r => r.status === 'open');
    res.json(openReports);
  } catch (err) {
    console.error('Fetch help reports error:', err);
    res.status(500).json({ error: 'Failed to fetch help reports' });
  }
});

// PATCH /api/help-reports/:id/resolve — Mark a help report as resolved
app.patch('/api/help-reports/:id/resolve', (req, res) => {
  try {
    const data = readJSON(KITCHEN_FILE);
    const reportId = parseInt(req.params.id, 10);
    const report = (data.helpReports || []).find(r => r.id === reportId);

    if (!report) {
      return res.status(404).json({ error: 'Help report not found' });
    }

    report.status = 'resolved';
    report.resolvedAt = new Date().toISOString();
    writeJSON(KITCHEN_FILE, data);

    io.emit('help_report_resolved', report);
    console.log(`  Help report #${reportId}: ${report.title} — RESOLVED`);

    res.json({ success: true, id: report.id });
  } catch (err) {
    console.error('Resolve help report error:', err);
    res.status(500).json({ error: 'Failed to resolve help report' });
  }
});

// ─── NETWORK INFO API ───────────────────────────────────────────────────

function getLANIP() {
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (loopback) addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// GET /api/network — Get server's LAN IP
app.get('/api/network', (req, res) => {
  res.json({
    ip: getLANIP(),
    port: PORT,
    url: `http://${getLANIP()}:${PORT}`
  });
});

// ─── MENU API ───────────────────────────────────────────────────────────

// GET /api/menu — Fetch the full menu
app.get('/api/menu', (req, res) => {
  try {
    const menu = readJSON(MENU_FILE);
    res.json(menu);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read menu' });
  }
});

// POST /api/menu — Add a new menu item
app.post('/api/menu', requireManagerAuth, (req, res) => {
  try {
    const menu = readJSON(MENU_FILE);
    const { category, name, price } = req.body;

    if (!category || !name || price === undefined) {
      return res.status(400).json({ error: 'category, name, and price are required' });
    }
    if (!menu.categories[category]) {
      return res.status(400).json({ error: `Invalid category "${category}". Valid: ${Object.keys(menu.categories).join(', ')}` });
    }

    const items = menu.categories[category];
    const newId = items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1;

    const newItem = {
      id: newId,
      name,
      price: parseFloat(price),
      available: true,
    };

    items.push(newItem);
    writeJSON(MENU_FILE, menu);

    io.emit('menu_updated', menu);
    console.log('  Menu item added: ' + name + ' (₹' + price + ') in ' + category);

    res.status(201).json(newItem);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add menu item' });
  }
});

// PUT /api/menu/:id — Update a menu item
app.put('/api/menu/:id', requireManagerAuth, (req, res) => {
  try {
    const menu = readJSON(MENU_FILE);
    const itemId = parseInt(req.params.id);
    const { name, price, available } = req.body;

    for (const cat of Object.keys(menu.categories)) {
      const item = menu.categories[cat].find((i) => i.id === itemId);
      if (item) {
        if (name !== undefined) item.name = name;
        if (price !== undefined) item.price = parseFloat(price);
        if (available !== undefined) item.available = available;

        writeJSON(MENU_FILE, menu);
        io.emit('menu_updated', menu);

        return res.json(item);
      }
    }

    res.status(404).json({ error: 'Item not found' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// DELETE /api/menu/:id — Remove a menu item
app.delete('/api/menu/:id', requireManagerAuth, (req, res) => {
  try {
    const menu = readJSON(MENU_FILE);
    const itemId = parseInt(req.params.id);

    for (const cat of Object.keys(menu.categories)) {
      const index = menu.categories[cat].findIndex((i) => i.id === itemId);
      if (index !== -1) {
        const removed = menu.categories[cat].splice(index, 1)[0];
        writeJSON(MENU_FILE, menu);
        io.emit('menu_updated', menu);

        return res.json(removed);
      }
    }

    res.status(404).json({ error: 'Item not found' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// ─── ORDERS API ─────────────────────────────────────────────────────────

// GET /api/orders — Fetch all orders (optional ?table=XX filter)
app.get('/api/orders', (req, res) => {
  try {
    const data = readJSON(ORDERS_FILE);
    let orders = data.orders;

    // Filter by table number if provided
    if (req.query.table) {
      const tableNum = String(req.query.table).padStart(2, '0');
      orders = orders.filter((o) => o.tableNumber === tableNum);
    }

    // Sort: newest first
    orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read orders' });
  }
});

// GET /api/orders/:id — Fetch a single order by ID (used by customer order tracking)
app.get('/api/orders/:id', (req, res) => {
  try {
    const data = readJSON(ORDERS_FILE);
    const orderId = parseInt(req.params.id);
    const order = data.orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read order' });
  }
});

// POST /api/orders/customer — Place a new order from customer self-ordering
app.post('/api/orders/customer', (req, res) => {
  try {
    const data = readJSON(ORDERS_FILE);
    const { tableNumber, items } = req.body;

    if (!tableNumber || !items || items.length === 0) {
      return res.status(400).json({ error: 'tableNumber and items are required' });
    }

    const orderItems = addPendingStatusToItems(items);

    const order = {
      id: data.nextId,
      tableNumber: String(tableNumber).padStart(2, '0'),
      waiterId: null,
      waiterName: 'Customer',
      source: 'customer',
      items: orderItems,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Loyalty: remember the customer's phone on the table session so they
    // enter it once — later orders from the same table reuse it.
    const tableNum = String(tableNumber).padStart(2, '0');
    if (normalizePhone(req.body.customerPhone)) {
      upsertTableSession(tableNum, {
        phone: req.body.customerPhone,
        name: req.body.customerName,
      });
    }
    touchTableSession(tableNum);

    // Loyalty: attach phone + process point redemptions (free items / discount)
    const loyaltyResult = applyLoyaltyRedemption(data, order, req.body);
    if (loyaltyResult && loyaltyResult.error) {
      return res.status(400).json({ error: loyaltyResult.error });
    }

    const menu = readJSON(MENU_FILE);
    const grossTotal = orderTotalFromMenu(order, menu);
    order.grossTotal = grossTotal;
    order.paidTotal = Math.max(0, grossTotal - (order.discount || 0));

    data.nextId++;
    data.orders.push(order);
    writeJSON(ORDERS_FILE, data);

    // Broadcast to Kitchen Display
    io.emit('kitchen_new_order', order);
    console.log('  Customer Order #' + order.id + ' placed for Table ' + order.tableNumber);

    res.status(201).json({
      ...order,
      loyaltyCustomer: loyaltyResult ? loyaltyResult.customer : null,
    });
  } catch (err) {
    console.error('Customer order error:', err);
    res.status(500).json({ error: 'Failed to place customer order' });
  }
});

// POST /api/orders — Place a new order (from Waiter Pad)
app.post('/api/orders', (req, res) => {
  try {
    const data = readJSON(ORDERS_FILE);
    const { tableNumber, waiterId, waiterName, items } = req.body;

    if (!tableNumber || !items || items.length === 0) {
      return res.status(400).json({ error: 'tableNumber and items are required' });
    }

    // Each item gets its own status
    const orderItems = addPendingStatusToItems(items);

    const order = {
      id: data.nextId,
      tableNumber: String(tableNumber).padStart(2, '0'),
      waiterId: waiterId || 1,
      waiterName: waiterName || 'Waiter',
      items: orderItems,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Loyalty: the phone lives on the TABLE session (entered once when the
    // table opens) — every order from the table picks it up automatically.
    const tableNum = String(tableNumber).padStart(2, '0');
    if (!normalizePhone(req.body.customerPhone)) {
      const session = getTableSession(tableNum);
      if (session && session.phone) req.body.customerPhone = session.phone;
    }
    touchTableSession(tableNum);

    // Loyalty: attach phone + process point redemptions (free items / discount)
    const loyaltyResult = applyLoyaltyRedemption(data, order, req.body);
    if (loyaltyResult && loyaltyResult.error) {
      return res.status(400).json({ error: loyaltyResult.error });
    }

    const menu = readJSON(MENU_FILE);
    const grossTotal = orderTotalFromMenu(order, menu);
    order.grossTotal = grossTotal;
    order.paidTotal = Math.max(0, grossTotal - (order.discount || 0));

    data.nextId++;
    data.orders.push(order);
    writeJSON(ORDERS_FILE, data);

    // Broadcast new order to Kitchen Display
    io.emit('kitchen_new_order', order);
    console.log('  Order #' + order.id + ' placed for Table ' + order.tableNumber);

    res.status(201).json({
      ...order,
      loyaltyCustomer: loyaltyResult ? loyaltyResult.customer : null,
    });
  } catch (err) {
    console.error('Place order error:', err);
    res.status(500).json({ error: 'Failed to place order' });
  }
});

// PUT /api/orders/:id — Update an order (edit items)
app.put('/api/orders/:id', (req, res) => {
  try {
    const data = readJSON(ORDERS_FILE);
    const orderId = parseInt(req.params.id);
    const { items, status } = req.body;

    const order = data.orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (items) {
      // Preserve existing item statuses by matching on name
      order.items = items.map((newItem) => {
        const existing = order.items.find(
          (i) => i.name === newItem.name && i.modifiers === (newItem.modifiers || '')
        );
        return {
          ...newItem,
          status: existing && existing.status !== 'pending' ? existing.status : (newItem.status || 'pending'),
        };
      });
    }
    if (status) order.status = status;
    order.updatedAt = new Date().toISOString();

    // Derive order status from items if items changed
    if (items) {
      order.status = deriveOrderStatus(order.items);
    }

    awardLoyaltyForOrder(order); // award points when delivered
    writeJSON(ORDERS_FILE, data);
    io.emit('order_updated', order);

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// PUT /api/orders/:id/status — Legacy: Mark entire order as delivered
app.put('/api/orders/:id/status', (req, res) => {
  try {
    const data = readJSON(ORDERS_FILE);
    const orderId = parseInt(req.params.id);
    const { status } = req.body;

    const validStatuses = ['pending', 'cooking', 'ready', 'delivered'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` });
    }

    const order = data.orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.status = status;
    order.updatedAt = new Date().toISOString();
    awardLoyaltyForOrder(order); // award points when delivered
    writeJSON(ORDERS_FILE, data);

    // Notify the specific waiter when order is ready
    if (status === 'ready') {
      io.emit('waiter_order_ready', order);
      console.log('  Order #' + orderId + ' marked READY — notified waiter');
    }

    io.emit('order_status_updated', order);

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// PUT /api/orders/:id/items/:itemIndex/status — Update individual item status
app.put('/api/orders/:id/items/:itemIndex/status', (req, res) => {
  try {
    const data = readJSON(ORDERS_FILE);
    const orderId = parseInt(req.params.id);
    const itemIndex = parseInt(req.params.itemIndex);
    const { status } = req.body;

    const validStatuses = ['pending', 'cooking', 'ready'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` });
    }

    const order = data.orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = order.items[itemIndex];
    if (!item) return res.status(404).json({ error: 'Item not found at this index' });

    item.status = status;
    order.updatedAt = new Date().toISOString();

    // Derive the overall order status from all items
    const newOrderStatus = deriveOrderStatus(order.items);
    order.status = newOrderStatus;

    awardLoyaltyForOrder(order); // award points when delivered
    writeJSON(ORDERS_FILE, data);

    // Emit events
    io.emit('item_status_updated', {
      orderId: order.id,
      tableNumber: order.tableNumber,
      itemIndex,
      item,
      orderStatus: newOrderStatus,
    });

    io.emit('order_updated', order);

    // Notify waiter if the order becomes fully ready
    if (newOrderStatus === 'ready' && status === 'ready') {
      io.emit('waiter_order_ready', order);
      console.log('  Order #' + orderId + ' all items READY — notified waiter');
    }

    res.json({ order, item, itemIndex });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update item status' });
  }
});

// DELETE /api/orders/:id/items/:itemIndex — Cancel a single item (only if pending)
app.delete('/api/orders/:id/items/:itemIndex', (req, res) => {
  try {
    const data = readJSON(ORDERS_FILE);
    const orderId = parseInt(req.params.id);
    const itemIndex = parseInt(req.params.itemIndex);

    const order = data.orders.find((o) => o.id === orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = order.items[itemIndex];
    if (!item) return res.status(404).json({ error: 'Item not found at this index' });

    // Can only cancel items that haven't started cooking
    if (item.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot cancel item that is already ${item.status}. Only pending items can be cancelled.`,
      });
    }

    const removed = order.items.splice(itemIndex, 1)[0];
    order.updatedAt = new Date().toISOString();

    // If no items left, delete the entire order
    if (order.items.length === 0) {
      const orderIndex = data.orders.findIndex((o) => o.id === orderId);
      data.orders.splice(orderIndex, 1);
      writeJSON(ORDERS_FILE, data);
      io.emit('order_deleted', order);
      return res.json({ deleted: true, item: removed, message: 'Order deleted (no items remaining)' });
    }

    // Otherwise derive new status and update
    order.status = deriveOrderStatus(order.items);
    writeJSON(ORDERS_FILE, data);
    io.emit('order_updated', order);

    res.json({ deleted: false, item: removed, order });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel item' });
  }
});

// DELETE /api/orders/:id — Cancel/delete an order
app.delete('/api/orders/:id', (req, res) => {
  try {
    const data = readJSON(ORDERS_FILE);
    const orderId = parseInt(req.params.id);

    const index = data.orders.findIndex((o) => o.id === orderId);
    if (index === -1) return res.status(404).json({ error: 'Order not found' });

    const removed = data.orders.splice(index, 1)[0];
    writeJSON(ORDERS_FILE, data);

    io.emit('order_deleted', removed);

    res.json(removed);
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// ─── ANALYTICS API ─────────────────────────────────────────────────────

// GET /api/analytics — Sales insights, top dishes, time-of-day breakdown
app.get('/api/analytics', (req, res) => {
  try {
    const data = readJSON(ORDERS_FILE);
    const menu = readJSON(MENU_FILE);
    const orders = data.orders;

    // Build price lookup from menu
    const priceMap = {};
    for (const cat of Object.keys(menu.categories)) {
      for (const item of menu.categories[cat]) {
        priceMap[item.name.toLowerCase()] = item.price;
      }
    }

    // Filter delivered/completed orders for revenue calculations
    const completedOrders = orders.filter((o) => o.status === 'delivered');

    let totalRevenue = 0;
    let totalItemsSold = 0;
    const itemSales = {};
    const itemRevenue = {};
    const timeSlots = {
      morning: { label: '🌅 Morning (6-11)', orders: 0, revenue: 0, items: 0 },
      lunch: { label: '☀️ Lunch (11-14)', orders: 0, revenue: 0, items: 0 },
      afternoon: { label: '🌤️ Afternoon (14-17)', orders: 0, revenue: 0, items: 0 },
      dinner: { label: '🌙 Dinner (17-22)', orders: 0, revenue: 0, items: 0 },
      lateNight: { label: '🌃 Late Night (22-6)', orders: 0, revenue: 0, items: 0 },
    };

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Start of this week (Sunday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of this month
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let revenueToday = 0;
    let revenueThisWeek = 0;
    let revenueThisMonth = 0;
    let ordersToday = 0;
    let ordersThisWeek = 0;
    let ordersThisMonth = 0;

    // Sales breakdown buckets (local time): year / month / week (Sunday start) / day
    const yearMap = {};  // 'YYYY' -> { revenue, orders }
    const monthMap = {}; // 'YYYY-MM' -> { revenue, orders }
    const weekMap = {};  // Sunday date 'YYYY-MM-DD' -> { revenue, orders }
    const dayMap = {};   // 'YYYY-MM-DD' -> { revenue, orders }

    const fmtLocalDate = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    for (const order of completedOrders) {
      let orderItemCount = 0;
      let orderTotal = 0;

      for (const item of order.items) {
        const qty = item.quantity || 1;
        const price = priceMap[item.name.toLowerCase()] || 0;
        const lineTotal = price * qty;

        orderItemCount += qty;
        orderTotal += lineTotal;

        // Aggregate item sales count & revenue in one pass
        itemSales[item.name] = (itemSales[item.name] || 0) + qty;
        itemRevenue[item.name] = (itemRevenue[item.name] || 0) + lineTotal;
      }

      totalRevenue += orderTotal;
      totalItemsSold += orderItemCount;

      const createdAt = new Date(order.createdAt);
      const hour = createdAt.getHours();

      // Time of day slot
      let slot;
      if (hour >= 6 && hour < 11) slot = 'morning';
      else if (hour >= 11 && hour < 14) slot = 'lunch';
      else if (hour >= 14 && hour < 17) slot = 'afternoon';
      else if (hour >= 17 && hour < 22) slot = 'dinner';
      else slot = 'lateNight';

      timeSlots[slot].orders++;
      timeSlots[slot].revenue += orderTotal;
      timeSlots[slot].items += orderItemCount;

      // Period-based revenue
      const orderDate = createdAt.toISOString().slice(0, 10);
      if (orderDate === todayStr) {
        revenueToday += orderTotal;
        ordersToday++;
      }
      if (createdAt >= startOfWeek) {
        revenueThisWeek += orderTotal;
        ordersThisWeek++;
      }
      if (createdAt >= startOfMonth) {
        revenueThisMonth += orderTotal;
        ordersThisMonth++;
      }

      // Bucket into year / month / week / day (local time)
      const y = createdAt.getFullYear();
      const monthKey = `${y}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`;
      const dayKey = fmtLocalDate(createdAt);
      const yearKey = String(y);

      const weekStart = new Date(createdAt);
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekKey = fmtLocalDate(weekStart);

      for (const map of [yearMap, monthMap, weekMap, dayMap]) {
        const key = map === yearMap ? yearKey : map === monthMap ? monthKey : map === weekMap ? weekKey : dayKey;
        if (!map[key]) map[key] = { revenue: 0, orders: 0 };
        map[key].revenue += orderTotal;
        map[key].orders++;
      }
    }

    // Top 10 dishes by quantity sold (revenue computed in same pass above)
    const topDishes = Object.entries(itemSales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count], i) => ({
        rank: i + 1,
        name,
        count,
        revenue: Math.round((itemRevenue[name] || 0) * 100) / 100,
      }));

    // ─── Yearly / monthly / weekly / daily series (oldest → newest) ───
    const monthShort = (d) => d.toLocaleString('en-US', { month: 'short' });

    const byMonth = [];
    {
      const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      for (let i = 0; i < 12; i++) {
        const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const data = monthMap[key] || { revenue: 0, orders: 0 };
        byMonth.push({
          key,
          label: monthShort(d),
          fullLabel: d.toLocaleString('en-US', { month: 'short', year: 'numeric' }),
          revenue: Math.round(data.revenue * 100) / 100,
          orders: data.orders,
        });
      }
    }

    const byWeek = [];
    {
      const thisSunday = new Date(now);
      thisSunday.setHours(0, 0, 0, 0);
      thisSunday.setDate(thisSunday.getDate() - thisSunday.getDay());
      for (let i = 11; i >= 0; i--) {
        const d = new Date(thisSunday);
        d.setDate(thisSunday.getDate() - i * 7);
        const key = fmtLocalDate(d);
        const data = weekMap[key] || { revenue: 0, orders: 0 };
        byWeek.push({
          key,
          label: `${d.getDate()} ${monthShort(d)}`,
          fullLabel: `Week of ${d.getDate()} ${monthShort(d)}`,
          revenue: Math.round(data.revenue * 100) / 100,
          orders: data.orders,
        });
      }
    }

    const byDay = [];
    {
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(now.getDate() - i);
        const key = fmtLocalDate(d);
        const data = dayMap[key] || { revenue: 0, orders: 0 };
        byDay.push({
          key,
          label: `${d.getDate()} ${monthShort(d)}`,
          fullLabel: d.toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }),
          revenue: Math.round(data.revenue * 100) / 100,
          orders: data.orders,
        });
      }
    }

    const thisYearData = yearMap[String(now.getFullYear())] || { revenue: 0, orders: 0 };
    const lastYearData = yearMap[String(now.getFullYear() - 1)] || { revenue: 0, orders: 0 };

    // ─── Wastage / Returns from sent-back dishes ───
    const kitchenData = readJSON(KITCHEN_FILE);
    const returnedDishes = kitchenData.returnedDishes || [];
    let totalWastage = 0;
    let totalReturns = 0;
    for (const rd of returnedDishes) {
      totalWastage += rd.amount * (rd.quantity || 1);
      totalReturns++;
    }

    res.json({
      summary: {
        totalOrders: completedOrders.length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalItemsSold,
        averageOrderValue:
          completedOrders.length > 0
            ? Math.round((totalRevenue / completedOrders.length) * 100) / 100
            : 0,
        allOrders: orders.length,
        totalWastage: Math.round(totalWastage * 100) / 100,
        totalReturns,
      },
      periods: {
        today: { orders: ordersToday, revenue: Math.round(revenueToday * 100) / 100 },
        thisWeek: { orders: ordersThisWeek, revenue: Math.round(revenueThisWeek * 100) / 100 },
        thisMonth: { orders: ordersThisMonth, revenue: Math.round(revenueThisMonth * 100) / 100 },
      },
      sales: {
        thisYear: { revenue: Math.round(thisYearData.revenue * 100) / 100, orders: thisYearData.orders },
        lastYear: { revenue: Math.round(lastYearData.revenue * 100) / 100, orders: lastYearData.orders },
        byMonth,
        byWeek,
        byDay,
      },
      topDishes,
      timeSlots: Object.values(timeSlots).map((s) => ({
        ...s,
        revenue: Math.round(s.revenue * 100) / 100,
      })),
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to compute analytics' });
  }
});

// ─── SOCKET.IO EVENT HANDLERS ──────────────────────────────────────────

io.on('connection', (socket) => {
  console.log(`  Client connected: ${socket.id}`);

  // Allow kitchen to update order status via WebSocket
  socket.on('update_order_status', (data) => {
    // Refuse writes while the license is locked (and flip every screen to the lock screen)
    if (license.enabled && license.locked) {
      io.emit('license_locked', { reason: license.lastReason });
      return;
    }
    const { orderId, status } = data;
    const fileData = readJSON(ORDERS_FILE);
    const order = fileData.orders.find((o) => o.id === orderId);

    if (order) {
      order.status = status;
      order.updatedAt = new Date().toISOString();
      awardLoyaltyForOrder(order); // award points when delivered
      writeJSON(ORDERS_FILE, fileData);

      if (status === 'ready') {
        io.emit('waiter_order_ready', order);
      }
      io.emit('order_status_updated', order);
    }
  });

  socket.on('disconnect', () => {
    console.log(`  Client disconnected: ${socket.id}`);
  });
});

// ─── Restaurant app pages ───────────────────────────────────────────────
// Mounted at /app/... — this is the restaurant system's own server.
app.use('/app', express.static(APP_DIR));

// Redirect legacy flat URLs (e.g. /app/waiter.html) to the new per-page
// folders (/app/waiter/) so already-printed QR codes keep working.
app.get('/app/:page.html', (req, res) => {
  const page = req.params.page;
  if (!['hub', 'waiter', 'kitchen', 'manager', 'customer'].includes(page)) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, '/app/' + page + '/' + qs);
});

// ─── 404 handler (after all API routes) ────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
    res.status(404).json({ error: 'Not found' });
  } else {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
});

// ─── START SERVER ───────────────────────────────────────────────────────

// Kick off license verification + schedule the next check
if (license.enabled) {
  readLicenseState();
  ensureInstallId();
  runLicenseCheck();
  scheduleNextCheck();
} else {
  console.log('  Licensing disabled (set LICENSE_KEY to enable).');
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIP = getLANIP();
  console.log('');
  console.log('  ================================================');
  console.log('     CHAUKA RESTAURANT ENGINE');
  console.log('     Running on http://0.0.0.0:' + PORT);
  console.log('  ================================================');
  console.log('');
  console.log('  LAN Access:     http://' + lanIP + ':' + PORT);  console.log('  Hub:            http://localhost:' + PORT + '/app/hub/');
  console.log('  Waiter Pad:     http://localhost:' + PORT + '/app/waiter/?table=01');
  console.log('  Kitchen Display: http://localhost:' + PORT + '/app/kitchen/');
  console.log('  Manager Panel:   http://localhost:' + PORT + '/app/manager/');
  console.log('  Customer Menu:   http://localhost:' + PORT + '/app/customer/?table=01');
  console.log('');
});
