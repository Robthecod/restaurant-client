(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────
  const state = {
    tableNumber: '01',
    menu: null,
    cart: [],
    currentCategory: null,
    selectedItem: null,
    currentOrder: null, // the last placed order, for tracking
    socketConnected: false,
    // Loyalty
    loyalty: null,         // public customer object, or null while not linked
    loyaltyPhone: '',      // normalized phone of the active guest
    loyaltySettings: null, // earning/redemption rules from the server
    redeemCart: [],        // [{ name, points }] free items being redeemed
    useDiscount: false,    // bill-discount toggle
  };

  // ─── DOM References ────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Header
    tableBadge: $('#custTableBadge'),
    connDot: $('#custConnDot'),

    // Overview
    overview: $('#custOverview'),

    // Categories
    categories: $('#custCategories'),

    // Menu
    menuGrid: $('#custMenuGrid'),
    menuLoading: $('#custMenuLoading'),

    // Cart bar
    cartBar: $('#custCartBar'),
    cartCount: $('#custCartCount'),
    cartTotal: $('#custCartTotal'),
    placeOrder: $('#custPlaceOrder'),

    // Modal
    modalOverlay: $('#custModalOverlay'),
    modalIcon: $('#custModalIcon'),
    modalItemName: $('#custModalItemName'),
    modalItemPrice: $('#custModalItemPrice'),
    modalModifier: $('#custModalModifier'),
    modalQtyValue: $('#custModalQtyValue'),
    modalQtyDec: $('#custModalQtyDec'),
    modalQtyInc: $('#custModalQtyInc'),
    modalSkip: $('#custModalSkip'),
    modalAdd: $('#custModalAdd'),

    // Confirmation
    confirmation: $('#custConfirmation'),
    confirmOrderNum: $('#custConfirmOrderNum'),

    // Order status overlay
    orderStatus: $('#custOrderStatus'),
    statusIcon: $('#custStatusIcon'),
    statusTitle: $('#custStatusTitle'),
    statusRef: $('#custStatusRef'),
    statusTimeline: $('#custStatusTimeline'),
    statusNewOrder: $('#custStatusNewOrder'),

    // Toast
    toastContainer: $('#custToastContainer'),

    // Loyalty
    loyaltyPhone: $('#loyaltyPhone'),
    loyaltyWhatsapp: $('#loyaltyWhatsapp'),
    loyaltyCheck: $('#loyaltyCheck'),
    loyaltyRegister: $('#loyaltyRegister'),
    loyaltyName: $('#loyaltyName'),
    loyaltyBirthday: $('#loyaltyBirthday'),
    loyaltyRegisterBtn: $('#loyaltyRegisterBtn'),
    loyaltyStatus: $('#loyaltyStatus'),
    redeemBtn: $('#custRedeemBtn'),
    redeemModal: $('#custRedeemModal'),
    redeemBalance: $('#redeemBalance'),
    redeemItems: $('#redeemItems'),
    redeemDiscountRow: $('#redeemDiscountRow'),
    redeemUseDiscount: $('#redeemUseDiscount'),
    redeemDiscountSpend: $('#redeemDiscountSpend'),
    redeemDiscountAmount: $('#redeemDiscountAmount'),
    redeemClose: $('#redeemClose'),
    cartDiscount: $('#custCartDiscount'),
    loyaltyEarned: $('#custLoyaltyEarned'),
  };

  // ─── Init ────────────────────────────────────────────────────────────
  function init() {
    // Detect table from URL
    const params = new URLSearchParams(window.location.search);
    state.tableNumber = (params.get('table') || '01').padStart(2, '0');
    dom.tableBadge.textContent = `Table ${state.tableNumber}`;
    document.title = `Menu — Table ${state.tableNumber}`;

    // Setup Socket.io
    setupSocket();

    // Fetch menu
    fetchMenu();

    // Setup event listeners
    setupEventListeners();

    // Loyalty: load rules + restore the guest's account
    initLoyalty();

    // If this table already has a phone assigned (waiter entered it, or a
    // previous order by the same party), prefill it so they don't re-enter.
    fetchTableSession();
  }

  // ─── Table Session (loyalty phone, entered once per table) ───────────
  async function fetchTableSession() {
    try {
      const res = await fetch(`/api/tables/${state.tableNumber}`);
      const data = await res.json();
      if (data.session && data.session.phone) {
        dom.loyaltyPhone.value = data.session.phone;
        checkLoyalty(data.session.phone);
      }
    } catch (err) {
      /* offline — leave empty */
    }
  }

  // ─── Socket ──────────────────────────────────────────────────────────
  function setupSocket() {
    const client = RestaurantSocket.getInstance();
    client.connect();

    client.on('_connected', () => {
      state.socketConnected = true;
      dom.connDot.className = 'conn-indicator connected';
    });

    client.on('_disconnected', () => {
      state.socketConnected = false;
      dom.connDot.className = 'conn-indicator disconnected';
    });

    // Menu updates from manager
    client.on('menu_updated', (menu) => {
      state.menu = menu;
      if (state.currentCategory && !menu.categories[state.currentCategory]) {
        const cats = Object.keys(menu.categories);
        state.currentCategory = cats.length > 0 ? cats[0] : null;
      }
      renderMenu();
    });

    // Item status updates — refresh order status if tracking
    client.on('item_status_updated', (data) => {
      if (state.currentOrder && data.tableNumber === state.tableNumber) {
        refreshCurrentOrder();
      }
    });

    // Order status updated
    client.on('order_status_updated', (data) => {
      if (state.currentOrder && data.id === state.currentOrder.id) {
        state.currentOrder = data;
        updateStatusTimeline(data);
      }
    });

    // Loyalty balance changed (e.g. points awarded on delivery)
    client.on('loyalty_updated', (customer) => {
      if (customer && customer.phone === state.loyaltyPhone) {
        const prev = state.loyalty ? state.loyalty.points : 0;
        state.loyalty = customer;
        renderLoyaltyBanner();
        if (prev > 0 && customer.points > prev) {
          showToast(`🎉 +${customer.points - prev} pts earned! New balance: ${customer.points}`, 'success');
        }
      }
    });
  }

  // ─── Fetch Menu ──────────────────────────────────────────────────────
  async function fetchMenu() {
    try {
      const res = await fetch('/api/menu');
      state.menu = await res.json();
      const cats = Object.keys(state.menu.categories);
      state.currentCategory = cats.length > 0 ? cats[0] : null;
      dom.menuLoading.style.display = 'none';
      renderCategories();
      renderMenu();
    } catch (err) {
      console.error('Failed to fetch menu:', err);
      dom.menuLoading.innerHTML = `
        <div class="customer-error-state">
          <div class="error-text">Couldn't load the menu.</div>
          <div class="error-sub">Make sure you're connected to the restaurant's network.</div>
          <button class="error-retry" onclick="window.location.reload()">Try Again</button>
        </div>
      `;
      setTimeout(fetchMenu, 3000);
    }
  }

  function renderCategories() {
    if (!state.menu) return;
    const cats = Object.keys(state.menu.categories);

    dom.categories.innerHTML = cats
      .map(
        (cat) => `
        <button class="customer-cat-tab ${cat === state.currentCategory ? 'active' : ''}"
                data-category="${cat}">
          <span class="cat-label">${capitalize(cat)}</span>
        </button>
      `
      )
      .join('');
  }

  // ─── Render Menu ─────────────────────────────────────────────────────
  function renderMenu() {
    if (!state.menu || !state.currentCategory) return;

    const items = state.menu.categories[state.currentCategory];
    if (!items) return;

    dom.menuGrid.innerHTML = items
      .map(
        (item, idx) => `
        <div class="customer-menu-item ${item.available ? '' : 'unavailable'}"
             data-id="${item.id}"
             data-category="${state.currentCategory}"
             style="animation-delay: ${idx * 35}ms">
          <span class="item-available"></span>

          <span class="item-name">${item.name}</span>
          <span class="item-price">₹${item.price.toFixed(2)}</span>
          <span class="item-tap-hint">Tap to customize</span>
        </div>
      `
      )
      .join('');

    // Update category tabs
    $$('.customer-cat-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.category === state.currentCategory);
    });
  }

  // ─── Cart Operations ─────────────────────────────────────────────────
  function addToCart(item, quantity, modifiers) {
    const existing = state.cart.find(
      (c) => c.id === item.id && c.modifiers === modifiers
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      state.cart.push({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity,
        modifiers: modifiers || '',
      });
    }
    updateCartUI();
  }

  function removeFromCart(index) {
    state.cart.splice(index, 1);
    updateCartUI();
  }

  function cartTotal() {
    return state.cart.reduce((sum, c) => sum + c.price * c.quantity, 0);
  }

  function updateCartUI() {
    const count = state.cart.reduce((sum, c) => sum + c.quantity, 0);
    const total = cartTotal();

    dom.cartCount.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    dom.cartTotal.textContent = `₹${total.toFixed(2)}`;
    dom.placeOrder.disabled = count === 0;

    // Loyalty: show redeemed items + discount on the cart bar
    const lines = [];
    if (state.redeemCart.length) {
      lines.push(`🎁 ${state.redeemCart.map((r) => r.name).join(', ')}`);
    }
    if (state.useDiscount) {
      const spend = discountSpendFor(total);
      const amount = Math.floor(spend * (state.loyaltySettings?.discountValuePct || 0.5));
      if (spend > 0) lines.push(`−₹${amount} off (${spend} pts)`);
    }
    if (lines.length) {
      dom.cartDiscount.textContent = lines.join(' · ');
      dom.cartDiscount.style.display = 'block';
    } else {
      dom.cartDiscount.style.display = 'none';
    }

    // Bounce animation on count change
    dom.cartCount.classList.remove('cart-bounce');
    void dom.cartCount.offsetWidth; // force reflow
    dom.cartCount.classList.add('cart-bounce');
  }

  // ─── Loyalty ────────────────────────────────────────────────────────
  async function initLoyalty() {
    try {
      const res = await fetch('/api/loyalty/settings');
      state.loyaltySettings = await res.json();
    } catch (_) {
      state.loyaltySettings = null;
    }

    const saved = localStorage.getItem('chauka_loyalty_phone');
    if (saved) {
      dom.loyaltyPhone.value = saved;
      await checkLoyalty(saved);
    }
  }

  async function checkLoyalty(phone) {
    try {
      const res = await fetch(`/api/loyalty/status?phone=${encodeURIComponent(phone)}`);
      const data = await res.json();
      if (data.exists) {
        state.loyalty = data.customer;
        state.loyaltyPhone = data.customer.phone;
        localStorage.setItem('chauka_loyalty_phone', data.customer.phone);
        dom.loyaltyInputRow.style.display = 'none';
        dom.loyaltyRegister.style.display = 'none';
        renderLoyaltyBanner();
        showToast('Welcome back — points loaded! 🎉', 'success');
      } else {
        state.loyaltyPhone = phone;
        dom.loyaltyInputRow.style.display = 'none';
        dom.loyaltyRegister.style.display = 'block';
        dom.loyaltyStatus.style.display = 'none';
        dom.redeemBtn.style.display = 'none';
      }
    } catch (_) {
      showToast('Could not check loyalty. Try again!', 'error');
    }
  }

  async function registerLoyalty() {
    const name = dom.loyaltyName.value.trim();
    const birthday = dom.loyaltyBirthday.value;
    try {
      const res = await fetch('/api/loyalty/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: state.loyaltyPhone,
          name,
          birthday,
          whatsappOptIn: dom.loyaltyWhatsapp.checked,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not register');
      state.loyalty = data;
      localStorage.setItem('chauka_loyalty_phone', data.phone);
      dom.loyaltyRegister.style.display = 'none';
      renderLoyaltyBanner();
      showToast('You\'re all set — start earning points! ✨', 'success');
    } catch (err) {
      showToast(err.message || 'Could not register', 'error');
    }
  }

  function renderLoyaltyBanner() {
    if (!state.loyalty) return;
    const c = state.loyalty;
    const value = Math.floor(c.points * (state.loyaltySettings?.discountValuePct || 0.5));
    const medal = c.tier === 'gold' ? '🥇' : c.tier === 'platinum' ? '💎' : '🥈';
    const wa = state.loyaltySettings?.whatsappNumber;
    const waBtn = wa
      ? `<a class="loyalty-wa-link" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${encodeURIComponent(
          `Hi! I have ${c.points} pts at Chauka — please keep me updated on WhatsApp 🎉`
        )}">📲 Get my points on WhatsApp</a>`
      : '';
    dom.loyaltyStatus.innerHTML = `
      <div class="loyalty-banner ${c.tier}">
        <div class="loyalty-banner-top">
          <span class="loyalty-greeting">Hi ${escapeHtml(c.name || 'guest')} 👋</span>
          <span class="loyalty-tier">${medal} ${escapeHtml(c.tier)}</span>
        </div>
        <div class="loyalty-points"><b>${c.points}</b> pts <span class="loyalty-value">≈ ₹${value} off</span></div>
        ${waBtn}
      </div>`;
    dom.loyaltyStatus.style.display = 'block';
    dom.redeemBtn.style.display = 'inline-flex';
    dom.redeemBalance.textContent = `${c.points} pts`;
  }

  // Points needed for the bill discount at the current cart total
  function discountSpendFor(total) {
    const s = state.loyaltySettings;
    const balance = state.loyalty ? state.loyalty.points : 0;
    if (!s || balance <= 0 || total <= 0) return 0;
    return Math.min(balance, Math.floor(total * s.discountSpendPct));
  }

  // Rough estimate of what this order will earn (tier multiplier applied)
  function estimateEarn(total) {
    const s = state.loyaltySettings;
    if (!s || !total) return 0;
    let pts = Math.floor((total / 100) * (s.pointsPerHundred || 100));
    const tier =
      (s.tiers || []).find((t) => t.key === (state.loyalty && state.loyalty.tier)) || (s.tiers || [])[0];
    return Math.floor(pts * (tier ? tier.multiplier : 1));
  }

  function openRedeemModal() {
    if (!state.loyalty) return;
    const balance = state.loyalty.points;
    dom.redeemBalance.textContent = `${balance} pts`;

    // Free items: anything whose face price fits the balance
    const items = [];
    if (state.menu) {
      for (const cat of Object.keys(state.menu.categories)) {
        for (const item of state.menu.categories[cat]) {
          if (item.available !== false && Math.ceil(item.price) <= balance) {
            items.push({ name: item.name, price: item.price });
          }
        }
      }
    }
    dom.redeemItems.innerHTML = items.length
      ? items
          .map((it) => {
            const added = state.redeemCart.some((r) => r.name === it.name);
            return `
            <div class="redeem-item ${added ? 'added' : ''}" data-name="${escapeHtml(it.name)}" data-points="${Math.ceil(it.price)}">
              <div class="redeem-item-info">
                <span class="redeem-item-name">${escapeHtml(it.name)}</span>
                <span class="redeem-item-cost">${Math.ceil(it.price)} pts</span>
              </div>
              <span class="redeem-item-action">${added ? '✓ Added' : 'Redeem'}</span>
            </div>`;
          })
          .join('')
      : '<div class="redeem-empty">Not enough points for a free item yet — keep ordering! 💪</div>';

    // Bill discount row
    const spend = discountSpendFor(cartTotal());
    const amount = Math.floor(spend * (state.loyaltySettings?.discountValuePct || 0.5));
    if (spend > 0) {
      dom.redeemDiscountSpend.textContent = spend;
      dom.redeemDiscountAmount.textContent = amount;
      dom.redeemDiscountRow.style.display = 'block';
    } else {
      dom.redeemDiscountRow.style.display = 'none';
      dom.redeemUseDiscount.checked = false;
      state.useDiscount = false;
    }

    dom.redeemModal.classList.add('active');
  }

  function closeRedeemModal() {
    dom.redeemModal.classList.remove('active');
  }

  function toggleRedeemItem(name, points) {
    const idx = state.redeemCart.findIndex((r) => r.name === name);
    if (idx >= 0) state.redeemCart.splice(idx, 1);
    else state.redeemCart.push({ name, points });
    updateCartUI();
    openRedeemModal(); // re-render the list with the new state
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
    );
  }

  // ─── Place Order ────────────────────────────────────────────────────
  async function placeOrder() {
    if (state.cart.length === 0) return;

    const items = state.cart.map((c) => ({
      name: c.name,
      quantity: c.quantity,
      modifiers: c.modifiers,
    }));

    dom.placeOrder.disabled = true;
    dom.placeOrder.textContent = 'Sending...';

    try {
      const body = {
        tableNumber: state.tableNumber,
        items,
      };
      if (state.loyaltyPhone) body.customerPhone = state.loyaltyPhone;
      if (state.redeemCart.length) body.redeemItems = state.redeemCart;
      if (state.useDiscount) body.useDiscount = true;

      const res = await fetch('/api/orders/customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        let msg = 'Failed to place order';
        try {
          const e = await res.json();
          if (e.error) msg = e.error;
        } catch (_) {}
        throw new Error(msg);
      }

      const order = await res.json();
      state.currentOrder = order;

      // Show confirmation
      dom.confirmOrderNum.textContent = `#${order.id}`;
      dom.cartBar.style.display = 'none';
      dom.customerHeader.style.display = 'none';
      dom.confirmation.style.display = 'block';

      // Clear cart + this order's redemptions (the account stays linked)
      state.cart = [];
      state.redeemCart = [];
      state.useDiscount = false;
      dom.cartDiscount.style.display = 'none';
      updateCartUI();

      if (order.loyaltyCustomer) {
        state.loyalty = order.loyaltyCustomer;
        renderLoyaltyBanner();
      }
      if (state.loyaltyPhone) {
        const est = estimateEarn(order.grossTotal || 0);
        if (est > 0) {
          dom.loyaltyEarned.textContent = `✨ You'll earn ~${est} pts when your order is delivered`;
          dom.loyaltyEarned.style.display = 'block';
        }
      }

      showToast(`Order #${order.id} placed! The kitchen has it.`, 'success');

      // After 3 seconds, offer to track the order
      setTimeout(() => {
        dom.confirmation.querySelector('.track-btn').style.display = 'inline-block';
      }, 3000);
    } catch (err) {
      console.error('Place order error:', err);
      showToast(err.message || 'Could not place order. Try again!', 'error');
    } finally {
      dom.placeOrder.disabled = false;
      dom.placeOrder.textContent = 'Place Order';
    }
  }

  // ─── Order Status Tracking ───────────────────────────────────────────
  function showOrderStatus(order) {
    state.currentOrder = order;
    dom.confirmation.style.display = 'none';
    dom.overview.style.display = 'none';
    dom.categories.style.display = 'none';
    dom.menuGrid.parentElement.style.display = 'none';
    dom.cartBar.style.display = 'none';
    dom.customerHeader.style.display = 'flex';

    dom.statusRef.textContent = `Table ${order.tableNumber} · Order #${order.id}`;
    updateStatusTimeline(order);
    dom.orderStatus.classList.add('active');
  }

  function updateStatusTimeline(order) {
    const allStatuses = [
      { key: 'pending', icon: '', label: 'Order Received', sub: 'Kitchen is looking at it' },
      { key: 'cooking', icon: '', label: 'Being Prepared', sub: 'Your food is being cooked' },
      { key: 'ready', icon: '', label: 'Ready to Serve', sub: 'Coming your way shortly!' },
    ];

    const currentIdx = allStatuses.findIndex((s) => s.key === order.status) + 1;
    // Also check per-item status for more granular tracking
    const hasCookingItems = order.items.some((i) => i.status === 'cooking');
    const hasReadyItems = order.items.some((i) => i.status === 'ready');

    let activeIdx = 0;
    if (order.status === 'delivered') {
      activeIdx = 3;
    } else if (hasReadyItems) {
      activeIdx = 2;
    } else if (hasCookingItems || order.status === 'cooking') {
      activeIdx = 1;
    } else if (order.status === 'ready') {
      activeIdx = 2;
    }

    // Update status icon
    if (order.status === 'delivered') {
      dom.statusTitle.textContent = 'Enjoy your meal!';
    } else if (activeIdx === 2) {
      dom.statusTitle.textContent = 'Almost there!';
    } else if (activeIdx === 1) {
      dom.statusTitle.textContent = 'Being prepared...';
    } else {
      dom.statusTitle.textContent = 'Order received!';
    }

    dom.statusTimeline.innerHTML = allStatuses
      .map((s, idx) => {
        let cls = '';
        if (idx < activeIdx) cls = 'done';
        else if (idx === activeIdx) cls = 'active';
        return `
          <div class="status-step ${cls}">
            <span class="step-icon">${idx < activeIdx ? 'Done' : s.icon}</span>
            <div>
              <span class="step-text">${s.label}</span>
              <span class="step-sub">${idx < activeIdx ? 'Completed' : s.sub}</span>
            </div>
          </div>
        `;
      })
      .join('');
  }

  async function refreshCurrentOrder() {
    if (!state.currentOrder) return;
    try {
      const res = await fetch(`/api/orders/${state.currentOrder.id}`);
      if (res.ok) {
        const order = await res.json();
        state.currentOrder = order;
        updateStatusTimeline(order);
      }
    } catch (err) {
      console.error('Failed to refresh order:', err);
    }
  }

  // ─── Modal ───────────────────────────────────────────────────────────
  function openItemModal(item, category) {
    state.selectedItem = { ...item, category };

    dom.modalItemName.textContent = item.name;
    dom.modalItemPrice.textContent = `₹${item.price.toFixed(2)}`;
    dom.modalModifier.value = '';
    dom.modalQtyValue.textContent = '1';
    $$('.customer-qmod').forEach((btn) => btn.classList.remove('active'));
    dom.modalOverlay.classList.add('active');
  }

  function closeItemModal() {
    dom.modalOverlay.classList.remove('active');
    state.selectedItem = null;
  }

  function getItemEmoji(name) {
    return '';
  }

  // ─── Toast ───────────────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `customer-toast ${type}`;
    toast.innerHTML = message;
    dom.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ─── Event Listeners ─────────────────────────────────────────────────
  function setupEventListeners() {
    // Category tabs
    dom.categories.addEventListener('click', (e) => {
      const tab = e.target.closest('.customer-cat-tab');
      if (tab) {
        state.currentCategory = tab.dataset.category;
        renderMenu();
      }
    });

    // Menu item clicks
    dom.menuGrid.addEventListener('click', (e) => {
      const itemEl = e.target.closest('.customer-menu-item');
      if (!itemEl || itemEl.classList.contains('unavailable')) return;

      const id = parseInt(itemEl.dataset.id);
      const category = itemEl.dataset.category;
      const item = state.menu.categories[category].find((i) => i.id === id);
      if (item) {
        openItemModal(item, category);
      }
    });

    // Quick modifiers
    dom.modalOverlay.addEventListener('click', (e) => {
      const btn = e.target.closest('.customer-qmod');
      if (btn) {
        btn.classList.toggle('active');
        const mods = Array.from(dom.modalOverlay.querySelectorAll('.customer-qmod.active'))
          .map((b) => b.dataset.mod)
          .join(', ');
        dom.modalModifier.value = mods;
      }
    });

    // Quantity controls
    dom.modalQtyDec.addEventListener('click', () => {
      let val = parseInt(dom.modalQtyValue.textContent);
      if (val > 1) dom.modalQtyValue.textContent = val - 1;
    });
    dom.modalQtyInc.addEventListener('click', () => {
      let val = parseInt(dom.modalQtyValue.textContent);
      if (val < 20) dom.modalQtyValue.textContent = val + 1;
    });

    // Modal Add
    dom.modalAdd.addEventListener('click', () => {
      if (!state.selectedItem) return;
      const quantity = parseInt(dom.modalQtyValue.textContent);
      const modifiers = dom.modalModifier.value.trim();
      addToCart(state.selectedItem, quantity, modifiers);
      closeItemModal();
      showToast(`Added ${quantity}x ${state.selectedItem.name}`, 'success');
    });

    // Modal Skip
    dom.modalSkip.addEventListener('click', () => {
      if (!state.selectedItem) return;
      const quantity = parseInt(dom.modalQtyValue.textContent);
      addToCart(state.selectedItem, quantity, '');
      closeItemModal();
      showToast(`<span class="toast-icon">✅</span> <span>Added ${quantity}x ${state.selectedItem.name}</span>`, 'success');
    });

    // Close modal on overlay click
    dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) closeItemModal();
    });

    // Place order
    dom.placeOrder.addEventListener('click', placeOrder);

    // Loyalty: check phone / register
    dom.loyaltyCheck.addEventListener('click', () => {
      const phone = dom.loyaltyPhone.value.trim();
      if (phone.length < 7) return showToast('Enter a valid phone number', 'error');
      checkLoyalty(phone);
    });
    dom.loyaltyPhone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') dom.loyaltyCheck.click();
    });
    dom.loyaltyRegisterBtn.addEventListener('click', registerLoyalty);

    // Loyalty: redeem modal
    dom.redeemBtn.addEventListener('click', openRedeemModal);
    dom.redeemClose.addEventListener('click', closeRedeemModal);
    dom.redeemModal.addEventListener('click', (e) => {
      if (e.target === dom.redeemModal) closeRedeemModal();
    });
    dom.redeemItems.addEventListener('click', (e) => {
      const el = e.target.closest('.redeem-item');
      if (!el) return;
      toggleRedeemItem(el.dataset.name, parseInt(el.dataset.points, 10) || 0);
    });
    dom.redeemUseDiscount.addEventListener('change', () => {
      state.useDiscount = dom.redeemUseDiscount.checked;
      updateCartUI();
    });

    // Confirmation: Track order
    dom.confirmation.addEventListener('click', (e) => {
      const trackBtn = e.target.closest('.track-btn');
      if (trackBtn && state.currentOrder) {
        showOrderStatus(state.currentOrder);
      }
      const newOrderBtn = e.target.closest('.new-order-btn');
      if (newOrderBtn) {
        resetToMenu();
      }
    });

    // Order status: New order
    dom.statusNewOrder.addEventListener('click', resetToMenu);

    // Keyboard: Escape closes modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeItemModal();
        closeRedeemModal();
      }
    });
  }

  // ─── Reset to Menu ──────────────────────────────────────────────────
  function resetToMenu() {
    state.currentOrder = null;
    dom.confirmation.style.display = 'none';
    dom.orderStatus.classList.remove('active');
    dom.overview.style.display = 'block';
    dom.categories.style.display = 'flex';
    dom.menuGrid.parentElement.style.display = 'block';
    dom.cartBar.style.display = 'flex';
    dom.customerHeader.style.display = 'flex';
    // Re-fetch menu
    fetchMenu();
  }

  // ─── Store header reference ─────────────────────────────────────────
  Object.defineProperty(dom, 'customerHeader', {
    get: () => document.querySelector('.customer-header'),
  });

  // ─── Start ───────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
