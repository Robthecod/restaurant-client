(function () {
  'use strict';

  // ─── State ──────────────────────────────────────────────────────────
  const state = {
    tableNumber: '01',
    waiterId: 1,
    waiterName: 'Waiter',
    currentCategory: 'starters',
    editCategory: 'starters',
    menu: null,
    basket: [],
    orders: [],
    selectedItem: null,  // item being modified
    editingOrder: null,   // order being edited
    editingItems: [],      // mutable items array during edit
    socketConnected: false,
    sending: false,          // guard against duplicate order submissions
    tablePhone: '',          // phone assigned to this table session (loyalty)
  };

  // ─── DOM References ────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // Header
    tableBadge: $('#tableBadge'),
    connDot: $('#connDot'),
    waiterNameInput: $('#waiterNameInput'),
    ordersToggle: $('#ordersToggle'),
    hamburgerBtn: $('#hamburgerBtn'),
    headerCategoryLabel: $('#headerCategoryLabel'),

    // Drawer
    drawerOverlay: $('#drawerOverlay'),
    categoryDrawer: $('#categoryDrawer'),
    drawerTabs: $('#drawerTabs'),
    drawerClose: $('#drawerClose'),

    // Menu / Basket
    menuGrid: $('#menuGrid'),
    menuLoading: $('#menuLoading'),
    basketBar: $('#basketBar'),
    basketCount: $('#basketCount'),
    basketTotal: $('#basketTotal'),
    sendBtn: $('#sendBtn'),

    // Modifier Modal
    modifierModal: $('#modifierModal'),
    modalItemName: $('#modalItemName'),
    modalItemPrice: $('#modalItemPrice'),
    modifierInput: $('#modifierInput'),
    qtyValue: $('#qtyValue'),
    qtyDec: $('#qtyDec'),
    qtyInc: $('#qtyInc'),
    modalSkip: $('#modalSkip'),
    modalAdd: $('#modalAdd'),

    // Basket Modal
    basketModal: $('#basketModal'),
    basketItems: $('#basketItems'),
    basketModalTotal: $('#basketModalTotal'),
    basketClose: $('#basketClose'),
    basketSend: $('#basketSend'),

    // Floor map picker
    tableMapBtn: $('#tableMapBtn'),
    tableMapModal: $('#tableMapModal'),
    tableMapCanvas: $('#tableMapCanvas'),
    tableMapClose: $('#tableMapClose'),
    tableMapCancel: $('#tableMapCancel'),
    tableMapHint: $('#tableMapHint'),

    // Table phone (loyalty session)
    tablePhoneChip: $('#tablePhoneChip'),
    tablePhoneText: $('#tablePhoneText'),
    waiterPhoneModal: $('#waiterPhoneModal'),
    waiterPhoneInput: $('#waiterPhoneInput'),
    waiterPhoneName: $('#waiterPhoneName'),
    waiterPhoneTableLabel: $('#waiterPhoneTableLabel'),
    waiterPhoneClose: $('#waiterPhoneClose'),
    waiterPhoneCancel: $('#waiterPhoneCancel'),
    waiterPhoneClear: $('#waiterPhoneClear'),
    waiterPhoneSave: $('#waiterPhoneSave'),
    waiterCloseTable: $('#waiterCloseTable'),

    // Orders Panel
    ordersModal: $('#ordersModal'),
    ordersList: $('#ordersList'),
    ordersTableNum: $('#ordersTableNum'),
    ordersClose: $('#ordersClose'),
    ordersNewOrder: $('#ordersNewOrder'),

    // Edit Order Modal
    editOrderModal: $('#editOrderModal'),
    editOrderId: $('#editOrderId'),
    editOrderTable: $('#editOrderTable'),
    editOrderStatus: $('#editOrderStatus'),
    editOrderItems: $('#editOrderItems'),
    editCategoryTabs: $('#editCategoryTabs'),
    editMenuGrid: $('#editMenuGrid'),
    editAddSection: $('#editAddSection'),
    editAddItemName: $('#editAddItemName'),
    editAddModifier: $('#editAddModifier'),
    editAddQtyDec: $('#editAddQtyDec'),
    editAddQtyInc: $('#editAddQtyInc'),
    editAddQtyValue: $('#editAddQtyValue'),
    editAddConfirm: $('#editAddConfirm'),
    editOrderCancel: $('#editOrderCancel'),
    editOrderSave: $('#editOrderSave'),

    // Misc
    toastContainer: $('#toastContainer'),
    // 3-dot menu
    waiterMenuBtn: $('#waiterMenuBtn'),
    waiterDropdown: $('#waiterDropdown'),
    waiterRequestIngredient: $('#waiterRequestIngredient'),
    waiterSendBackDish: $('#waiterSendBackDish'),
    waiterHelpReport: $('#waiterHelpReport'),
    waiterRefreshOrders: $('#waiterRefreshOrders'),
    // Ingredient modal
    waiterIngredientModal: $('#waiterIngredientModal'),
    waiterIngredientName: $('#waiterIngredientName'),
    waiterIngredientQty: $('#waiterIngredientQty'),
    waiterIngredientClose: $('#waiterIngredientClose'),
    waiterIngredientCancel: $('#waiterIngredientCancel'),
    waiterIngredientSubmit: $('#waiterIngredientSubmit'),
    // Send back modal
    waiterSendBackModal: $('#waiterSendBackModal'),
    waiterReturnCategory: $('#waiterReturnCategory'),
    waiterReturnDishSelect: $('#waiterReturnDishSelect'),
    waiterReturnReason: $('#waiterReturnReason'),
    waiterReturnQty: $('#waiterReturnQty'),
    waiterReturnAmount: $('#waiterReturnAmount'),
    waiterSendBackClose: $('#waiterSendBackClose'),
    waiterSendBackCancel: $('#waiterSendBackCancel'),
    waiterSendBackSubmit: $('#waiterSendBackSubmit'),
    // Help modal
    waiterHelpModal: $('#waiterHelpModal'),
    waiterHelpTitle: $('#waiterHelpTitle'),
    waiterHelpDesc: $('#waiterHelpDesc'),
    waiterHelpClose: $('#waiterHelpClose'),
    waiterHelpCancel: $('#waiterHelpCancel'),
    waiterHelpSubmit: $('#waiterHelpSubmit'),
  };

  // ─── New DOM refs for sidebar ───
  const sidebarDom = {};

  // ─── Category Labels Map ────────────────────────────────────────────
  const categoryLabels = {
    starters: 'Starters',
    mains: 'Mains',
    desserts: 'Desserts',
    drinks: 'Drinks',
  };

  // ─── Drawer Functions ────────────────────────────────────────────────
  function openDrawer() {
    dom.categoryDrawer.classList.add('open');
    dom.drawerOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    dom.categoryDrawer.classList.remove('open');
    dom.drawerOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function selectDrawerTab(category) {
    state.currentCategory = category;
    dom.headerCategoryLabel.textContent = categoryLabels[category] || category;
    renderMenu(category);
    closeDrawer();
  }

  // ─── Init ────────────────────────────────────────────────────────────
  function init() {
    // Detect table and waiter from URL
    const params = new URLSearchParams(window.location.search);
    state.tableNumber = (params.get('table') || '01').padStart(2, '0');
    state.waiterName =
      params.get('waiter') || localStorage.getItem('chauka_waiter_name') || 'Waiter';
    if (dom.waiterNameInput) dom.waiterNameInput.value = state.waiterName === 'Waiter' ? '' : state.waiterName;
    dom.tableBadge.textContent = `Table ${state.tableNumber}`;
    dom.ordersTableNum.textContent = state.tableNumber;
    dom.headerCategoryLabel.textContent = categoryLabels[state.currentCategory];
    document.title = `Waiter Pad — Table ${state.tableNumber}`;

    // Cache sidebar DOM refs
    sidebarDom.container = $('#waiterSidebar');
    sidebarDom.items = $('#sidebarItems');
    sidebarDom.toggle = $('#sidebarToggle');

    // Load this table's loyalty session (phone entered once per table)
    fetchTableSession();

    // Setup Socket.io
    setupSocket();

    // Fetch menu
    fetchMenu();

    // Fetch orders for this table
    fetchOrders();

    // Event listeners
    setupEventListeners();
    setupSidebarListeners();
  }

  // ─── Socket ──────────────────────────────────────────────────────────
  function setupSocket() {
    const client = RestaurantSocket.getInstance();
    client.connect();

    client.on('_connected', () => {
      state.socketConnected = true;
      dom.connDot.className = 'connection-dot connected';
      // Refresh orders on reconnect to avoid stale data
      refreshOrders();
    });

    client.on('_disconnected', () => {
      state.socketConnected = false;
      dom.connDot.className = 'connection-dot disconnected';
    });

    // Listen for menu updates from manager
    client.on('menu_updated', (menu) => {
      state.menu = menu;
      renderMenu(state.currentCategory);
      // Also refresh the edit menu if the edit modal is open
      if (dom.editOrderModal.classList.contains('active')) {
        renderEditMenu(state.editCategory);
      }
    });

    // Listen for ready orders
    client.on('waiter_order_ready', (order) => {
      if (order.tableNumber === state.tableNumber) {
        showReadyBanner(order);
        refreshOrders();
      }
    });

    // Order updated (items changed via edit or item status change)
    client.on('order_updated', (order) => {
      if (order.tableNumber === state.tableNumber) {
        updateOrderInList(order);
      }
    });

    // Individual item status updated (kitchen started cooking an item)
    client.on('item_status_updated', (data) => {
      if (data.tableNumber === state.tableNumber) {
        const order = state.orders.find((o) => o.id === data.orderId);
        if (order) {
          const item = order.items[data.itemIndex];
          if (item) {
            item.status = data.item.status;
          }
        }
        renderSidebar();
        if (dom.ordersModal.classList.contains('active')) {
          renderOrdersList();
        }
      }
    });

    // Order deleted
    client.on('order_deleted', (deletedOrder) => {
      if (deletedOrder.tableNumber === state.tableNumber) {
        state.orders = state.orders.filter((o) => o.id !== deletedOrder.id);
        if (dom.ordersModal.classList.contains('active')) {
          renderOrdersList();
        }
        renderSidebar();
      }
    });

    // Table session updated (another device assigned a phone to this table)
    client.on('table_session_updated', (session) => {
      if (session.tableNumber === state.tableNumber) {
        state.tablePhone = session.phone || '';
        updatePhoneChip();
      }
    });

    // Table closed (bill paid) — clear this table's phone
    client.on('table_closed', (data) => {
      if (data.tableNumber === state.tableNumber) {
        state.tablePhone = '';
        updatePhoneChip();
      }
    });
  }

  // ─── Table Phone (loyalty session) ───────────────────────────────────
  async function fetchTableSession() {
    try {
      const res = await fetch(`/api/tables/${state.tableNumber}`);
      const data = await res.json();
      state.tablePhone = data.session ? data.session.phone : '';
      updatePhoneChip();
    } catch (err) {
      /* offline — chip stays hidden */
    }
  }

  // ─── Table Map Picker ────────────────────────────────────────────────
  async function openTableMap() {
    dom.tableMapModal.classList.add('active');
    dom.tableMapCanvas.innerHTML = '<div class="table-map-empty">Loading floor map…</div>';
    dom.tableMapHint.style.display = 'none';
    try {
      const [mapRes, tablesRes, ordersRes] = await Promise.all([
        fetch('/api/map'),
        fetch('/api/tables'),
        fetch('/api/orders'),
      ]);
      const map = (await mapRes.json()).map;
      const orders = await ordersRes.json();
      // Compute per-table status: pending (red) = has open orders,
      // delivered (green) = all items delivered, default (yellow) = no orders.
      const pendingSet = new Set();
      const readySet = new Set();
      const deliveredSet = new Set();
      for (const o of orders) {
        if (o.status === 'delivered') deliveredSet.add(o.tableNumber);
        else if (o.status === 'ready') readySet.add(o.tableNumber);
        else pendingSet.add(o.tableNumber);
      }
      if (!map || !map.tables || map.tables.length === 0) {
        dom.tableMapCanvas.innerHTML = '';
        dom.tableMapHint.style.display = 'block';
        return;
      }
      TableMap.render(dom.tableMapCanvas, map, {
        openOrders: Array.from(pendingSet),
        readyTables: Array.from(readySet),
        deliveredTables: Array.from(deliveredSet),
        forceSquare: true,
        onClick: (t) => pickTableFromMap(t),
      });
    } catch (err) {
      dom.tableMapCanvas.innerHTML = '<div class="table-map-empty">Could not load the floor map.</div>';
    }
  }

  function pickTableFromMap(t) {
    // Pad like the ?table= URL flow does, so socket events (sessions keyed
    // '05') and API lookups match the label the manager typed ('5').
    state.tableNumber = String(t.label).padStart(2, '0');
    dom.tableBadge.textContent = `Table ${state.tableNumber}`;
    dom.ordersTableNum.textContent = state.tableNumber;
    document.title = `Waiter Pad — Table ${state.tableNumber}`;
    dom.tableMapModal.classList.remove('active');
    refreshOrders();
    fetchTableSession();
    showToast(`Switched to Table ${state.tableNumber}`, 'success');
  }

  function closeTableMap() {
    dom.tableMapModal.classList.remove('active');
  }

  function updatePhoneChip() {
    if (!dom.tablePhoneChip) return;
    if (state.tablePhone) {
      dom.tablePhoneText.textContent = state.tablePhone;
      dom.tablePhoneChip.style.display = 'inline-flex';
    } else {
      dom.tablePhoneChip.style.display = 'none';
    }
  }

  function openPhoneModal() {
    dom.waiterPhoneTableLabel.textContent = state.tableNumber;
    dom.waiterPhoneInput.value = state.tablePhone;
    dom.waiterPhoneName.value = '';
    dom.waiterPhoneClear.style.display = state.tablePhone ? '' : 'none';
    dom.waiterPhoneModal.classList.add('active');
    setTimeout(() => dom.waiterPhoneInput.focus(), 100);
  }

  function closePhoneModal() {
    dom.waiterPhoneModal.classList.remove('active');
  }

  async function savePhoneAssignment() {
    const phone = dom.waiterPhoneInput.value.trim();
    if (!phone) {
      showToast('Enter a phone number', 'error');
      return;
    }
    try {
      const res = await fetch(`/api/tables/${state.tableNumber}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name: dom.waiterPhoneName.value.trim() }),
      });
      if (!res.ok) throw new Error('Failed to assign');
      state.tablePhone = phone;
      updatePhoneChip();
      closePhoneModal();
      showToast(`📱 ${phone} assigned to Table ${state.tableNumber}`, 'success');
    } catch (err) {
      showToast('Could not assign phone', 'error');
    }
  }

  async function clearPhoneAssignment() {
    // Remove the phone from this table (e.g. wrong number entered). Uses the
    // dedicated /clear endpoint — /close would count a visit for this phone.
    try {
      const res = await fetch(`/api/tables/${state.tableNumber}/clear`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      state.tablePhone = '';
      updatePhoneChip();
      closePhoneModal();
      showToast('Table phone cleared', 'info');
    } catch (err) {
      showToast('Could not clear phone', 'error');
    }
  }

  async function closeTable() {
    const msg = state.tablePhone
      ? `Close Table ${state.tableNumber} for ${state.tablePhone}?\nBill paid — this counts as one visit.`
      : `Close Table ${state.tableNumber}?`;
    if (!confirm(msg)) return;
    try {
      const res = await fetch(`/api/tables/${state.tableNumber}/close`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      state.tablePhone = '';
      updatePhoneChip();
      showToast(
        data.closed ? `🧾 Table ${state.tableNumber} closed` : 'No open table session',
        data.closed ? 'success' : 'info'
      );
      refreshOrders();
    } catch (err) {
      showToast('Could not close table', 'error');
    }
  }

  // ─── Fetch Menu ──────────────────────────────────────────────────────
  async function fetchMenu() {
    try {
      const res = await fetch('/api/menu');
      state.menu = await res.json();
      dom.menuLoading.style.display = 'none';
      renderMenu(state.currentCategory);
    } catch (err) {
      console.error('Failed to fetch menu:', err);
      dom.menuLoading.textContent = '⚠️ Failed to load menu. Retrying...';
      setTimeout(fetchMenu, 3000);
    }
  }

  // ─── Fetch Orders ────────────────────────────────────────────────────
  async function fetchOrders() {
    try {
      const res = await fetch(`/api/orders?table=${state.tableNumber}`);
      state.orders = await res.json();
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    }
  }

  function refreshOrders() {
    fetchOrders().then(() => {
      if (dom.ordersModal.classList.contains('active')) {
        renderOrdersList();
      }
      renderSidebar();
    }).catch((err) => {
      console.error('Failed to refresh orders:', err);
    });
  }

  function updateOrderInList(updatedOrder) {
    const idx = state.orders.findIndex((o) => o.id === updatedOrder.id);
    if (idx !== -1) {
      state.orders[idx] = updatedOrder;
    } else {
      state.orders.unshift(updatedOrder);
    }
    if (dom.ordersModal.classList.contains('active')) {
      renderOrdersList();
    }
    renderSidebar();
  }

  // ─── Render Menu ─────────────────────────────────────────────────────
  function renderMenu(category) {
    state.currentCategory = category;
    dom.headerCategoryLabel.textContent = categoryLabels[category] || category;
    if (!state.menu || !state.menu.categories[category]) return;

    const items = state.menu.categories[category];
    dom.menuGrid.innerHTML = items
      .map(
        (item, idx) => `
        <div class="menu-item ${item.available ? '' : 'unavailable'}" data-id="${item.id}" data-category="${category}" style="animation-delay: ${idx * 30}ms">
          <span class="item-available"></span>

          <span class="item-name">${escapeHtml(item.name)}</span>
          <span class="item-price">₹${item.price.toFixed(2)}</span>
          <span class="item-tap-hint">Tap to customize</span>
        </div>
      `
      )
      .join('');

    // Update drawer tab active states
    dom.drawerTabs.querySelectorAll('.drawer-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.category === category);
    });
  }

  // ─── Basket Operations ───────────────────────────────────────────────
  function addToBasket(item, quantity, modifiers) {
    const existing = state.basket.find(
      (b) => b.id === item.id && b.modifiers === modifiers
    );
    if (existing) {
      existing.quantity += quantity;
    } else {
      state.basket.push({
        id: item.id,
        name: item.name,
        price: item.price,
        quantity,
        modifiers: modifiers || '',
        category: state.currentCategory,
      });
    }
    updateBasketUI();
  }

  function removeFromBasket(index) {
    state.basket.splice(index, 1);
    updateBasketUI();
  }

  function updateBasketUI() {
    const count = state.basket.reduce((sum, b) => sum + b.quantity, 0);
    const total = state.basket.reduce((sum, b) => sum + b.price * b.quantity, 0);

    dom.basketCount.textContent = `${count} item${count !== 1 ? 's' : ''}`;
    dom.basketTotal.textContent = `₹${total.toFixed(2)}`;
    dom.sendBtn.disabled = count === 0;

    // Bounce animation on count change
    dom.basketCount.classList.remove('basket-bounce');
    void dom.basketCount.offsetWidth;
    dom.basketCount.classList.add('basket-bounce');
  }

  // ─── Send Order ──────────────────────────────────────────────────────
  async function sendOrder() {
    if (state.basket.length === 0 || state.sending) return;
    state.sending = true;

    const items = state.basket.map((b) => ({
      name: b.name,
      quantity: b.quantity,
      modifiers: b.modifiers,
    }));

    dom.basketSend.disabled = true;
    dom.basketSend.textContent = '⏳ Sending...';

    try {
      const body = {
        tableNumber: state.tableNumber,
        waiterId: state.waiterId,
        waiterName: state.waiterName,
        items,
      };
      // No customerPhone here — the server pulls it from the table session,
      // so the phone is entered once per table, not once per order.

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Failed to send order');

      const order = await res.json();
      showToast(`Order #${order.id} sent to kitchen!`, 'success');
      state.basket = [];
      updateBasketUI();
      dom.basketModal.classList.remove('active');
      // Refresh orders to include the new one
      refreshOrders();
    } catch (err) {
      console.error('Send order error:', err);
      showToast('Failed to send order. Try again.', 'error');
    } finally {
      dom.basketSend.disabled = false;
      dom.basketSend.textContent = 'Send to Kitchen →';
      state.sending = false;
    }
  }

  // ─── Orders Panel ────────────────────────────────────────────────────
  function openOrdersPanel() {
    dom.ordersTableNum.textContent = state.tableNumber;
    renderOrdersList();
    dom.ordersModal.classList.add('active');
  }

  function closeOrdersPanel() {
    dom.ordersModal.classList.remove('active');
  }

  function renderOrdersList() {
    if (state.orders.length === 0) {
      dom.ordersList.innerHTML = `
        <div class="orders-empty">
          <div class="empty-title">No orders yet</div>
          <div class="empty-desc">Orders sent to the kitchen will appear here</div>
        </div>
      `;
      return;
    }

    dom.ordersList.innerHTML = state.orders
      .map((order) => renderOrderCard(order))
      .join('');

    // Attach actions
    state.orders.forEach((order) => {
      const card = dom.ordersList.querySelector(`.order-card[data-id="${order.id}"]`);
      if (!card) return;

      const editBtn = card.querySelector('.order-edit-btn');
      if (editBtn) editBtn.addEventListener('click', () => openEditOrder(order));

      const cancelBtn = card.querySelector('.order-cancel-btn');
      if (cancelBtn) cancelBtn.addEventListener('click', () => cancelOrder(order.id));

      const deliveredBtn = card.querySelector('.order-delivered-btn');
      if (deliveredBtn) deliveredBtn.addEventListener('click', () => markDelivered(order.id));
    });
  }

  function renderOrderCard(order) {
    const timeAgo = getTimeAgo(order.createdAt);
    const statusClass = `status-${order.status}`;
    const statusLabel = order.status.charAt(0).toUpperCase() + order.status.slice(1);

    const itemsHtml = order.items
      .map(
        (item) => `
        <div class="order-item-line">
          <span class="order-item-qty">${item.quantity}×</span>
          <span class="order-item-name">${escapeHtml(item.name)}</span>
          ${item.modifiers ? `          <span class="order-item-mod">${escapeHtml(item.modifiers)}</span>` : ''}            <span class="order-item-ind-status badge-status status-${item.status || 'pending'}">
            ${getStatusLabel(item.status || 'pending').replace(/[^\x00-\x7F]/g, '').trim()}
          </span>
        </div>
      `
      )
      .join('');

    const hasPendingItems = order.items.some((i) => i.status === 'pending');

    let actionsHtml = '';
    if (hasPendingItems) {
      actionsHtml = `
        <button class="btn btn-sm btn-secondary order-edit-btn">✏️ Edit</button>
        <button class="btn btn-sm btn-danger order-cancel-btn">✕ Cancel Order</button>
      `;
    } else if (order.status === 'cooking') {
      actionsHtml = `
        <span class="order-status-text">👨‍🍳 All Cooking...</span>
      `;
    } else if (order.status === 'ready') {
      actionsHtml = `
        <button class="btn btn-sm btn-primary order-delivered-btn">✅ Serve & Mark Delivered</button>
      `;
    } else if (order.status === 'delivered') {
      actionsHtml = `
        <span class="order-status-text" style="color:var(--text-muted);">✅ Delivered</span>
      `;
    }

    return `
      <div class="order-card ${statusClass}" data-id="${order.id}">
        <div class="order-card-header">
          <div class="order-card-title">
            <span class="order-badge">#${order.id}</span>
            <span class="badge-status ${statusClass}">${statusLabel}</span>
          </div>
          <span class="order-time">${timeAgo}</span>
        </div>
        <div class="order-card-body">
          ${itemsHtml}
        </div>
        <div class="order-card-actions">
          ${actionsHtml}
        </div>
      </div>
    `;
  }

  // ─── Cancel Single Item ────────────────────────────────────────────────
  async function cancelItem(orderId, itemIndex, itemName) {
    if (!confirm(`Cancel "${itemName}" from order #${orderId}?`)) return;

    try {
      const res = await fetch(`/api/orders/${orderId}/items/${itemIndex}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to cancel item');
      }
      const data = await res.json();
      if (data.deleted) {
        showToast(`Order #${orderId} deleted (last item removed)`, 'info');
      } else {
        showToast(`Removed "${itemName}" from order`, 'info');
      }
      refreshOrders();
    } catch (err) {
      console.error('Cancel item error:', err);
      showToast(`${err.message}`, 'error');
    }
  }

  // ─── Cancel Entire Order ────────────────────────────────────────────────
  async function cancelOrder(orderId) {
    if (!confirm(`Cancel order #${orderId}? This cannot be undone.`)) return;

    try {
      const res = await fetch(`/api/orders/${orderId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to cancel order');
      showToast(`Order #${orderId} cancelled`, 'info');
      refreshOrders();
    } catch (err) {
      console.error('Cancel order error:', err);
      showToast('Failed to cancel order', 'error');
    }
  }

  // ─── Mark Delivered ──────────────────────────────────────────────────
  async function markDelivered(orderId) {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'delivered' }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      showToast(`<span class="toast-icon">✅</span> <span>Order #${orderId} marked as delivered</span>`, 'success');
      refreshOrders();
    } catch (err) {
      console.error('Mark delivered error:', err);
      showToast('Failed to update order', 'error');
    }
  }

  // ─── Edit Order ──────────────────────────────────────────────────────
  function openEditOrder(order) {
    state.editingOrder = order;
    // Deep copy items for editing
    state.editingItems = order.items.map((item) => ({ ...item }));

    dom.editOrderId.textContent = order.id;
    dom.editOrderTable.textContent = order.tableNumber;
    dom.editOrderStatus.textContent = order.status.charAt(0).toUpperCase() + order.status.slice(1);
    dom.editOrderStatus.className = `badge-status status-${order.status}`;

    renderEditOrderItems();
    renderEditMenu(state.editCategory);
    dom.editAddSection.style.display = 'none';

    dom.editOrderModal.classList.add('active');
  }

  function closeEditOrder() {
    dom.editOrderModal.classList.remove('active');
    state.editingOrder = null;
    state.editingItems = [];
  }

  function renderEditOrderItems() {
    if (state.editingItems.length === 0) {
      dom.editOrderItems.innerHTML = `
        <div class="edit-empty-items">
          <span>No items in this order yet — add some from the menu below.</span>
        </div>
      `;
      return;
    }

    dom.editOrderItems.innerHTML = state.editingItems
      .map(
        (item, idx) => {
          const itemStatus = item.status || 'pending';
          const isLocked = itemStatus !== 'pending';
          return `
            <div class="edit-item-row ${isLocked ? 'edit-item-locked' : ''}" data-index="${idx}">
              <div class="edit-item-info">
                <span class="edit-item-name">${escapeHtml(item.name)}</span>
                <span class="edit-item-qty">×${item.quantity}</span>
                ${item.modifiers ? `<span class="edit-item-mod">${escapeHtml(item.modifiers)}</span>` : ''}
                ${isLocked ? `<span class="edit-item-badge badge-status status-${itemStatus}">${itemStatus}</span>` : ''}
              </div>
              ${isLocked
                ? `<span class="edit-item-locked-icon" title="Already ${itemStatus} — cannot remove">🔒</span>`
                : `<button class="edit-item-remove" data-index="${idx}" title="Remove item">✕</button>`
              }
            </div>
          `;
        }
      )
      .join('');

    // Remove buttons (only for pending items)
    dom.editOrderItems.querySelectorAll('.edit-item-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.index);
        state.editingItems.splice(idx, 1);
        renderEditOrderItems();
      });
    });
  }

  function renderEditMenu(category) {
    state.editCategory = category;
    if (!state.menu || !state.menu.categories[category]) return;

    const items = state.menu.categories[category];
    dom.editMenuGrid.innerHTML = items
      .map(
        (item) => `
        <div class="edit-menu-item ${item.available ? '' : 'unavailable'}" data-id="${item.id}" data-category="${category}">
          <span class="edit-menu-item-name">${escapeHtml(item.name)}</span>
          <span class="edit-menu-item-price">₹${item.price.toFixed(2)}</span>
        </div>
      `
      )
      .join('');

    // Update category tabs
    dom.editCategoryTabs.querySelectorAll('.edit-cat-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.category === category);
    });
  }

  function showEditAddSection(item) {
    dom.editAddItemName.textContent = item.name;
    dom.editAddModifier.value = '';
    dom.editAddQtyValue.textContent = '1';
    // Store selected item for adding
    dom.editAddConfirm.dataset.itemId = item.id;
    dom.editAddConfirm.dataset.category = item.category || state.editCategory;
    dom.editAddSection.style.display = 'block';
    dom.editAddSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function confirmEditAddItem() {
    const itemId = parseInt(dom.editAddConfirm.dataset.itemId);
    const category = dom.editAddConfirm.dataset.category;
    const item = state.menu.categories[category]?.find((i) => i.id === itemId);
    if (!item) return;

    const quantity = parseInt(dom.editAddQtyValue.textContent);
    const modifiers = dom.editAddModifier.value.trim();

    // Check if same item with same modifiers exists
    const existing = state.editingItems.findIndex(
      (i) => i.name === item.name && i.modifiers === modifiers
    );
    if (existing !== -1) {
      state.editingItems[existing].quantity += quantity;
    } else {
      state.editingItems.push({
        name: item.name,
        quantity,
        modifiers: modifiers || '',
      });
    }

    renderEditOrderItems();
    dom.editAddSection.style.display = 'none';      showToast(`Added ${quantity}x ${item.name}`, 'success');
  }

  async function saveEditOrder() {
    if (!state.editingOrder) return;

    dom.editOrderSave.disabled = true;
    dom.editOrderSave.textContent = '⏳ Saving...';

    try {
      const res = await fetch(`/api/orders/${state.editingOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: state.editingItems }),
      });

      if (!res.ok) throw new Error('Failed to update order');

      showToast(`Order #${state.editingOrder.id} updated`, 'success');
      closeEditOrder();
      refreshOrders();
    } catch (err) {
      console.error('Edit order error:', err);
      showToast('Failed to save changes', 'error');
    } finally {
      dom.editOrderSave.disabled = false;
      dom.editOrderSave.textContent = '💾 Save Changes';
    }
  }

  // ─── Sidebar: Live Item Tracker ─────────────────────────────────────
  function renderSidebar() {
    // Collect all non-delivered orders for this table
    const activeOrders = state.orders.filter((o) => o.status !== 'delivered');

    if (activeOrders.length === 0) {
      sidebarDom.items.innerHTML = `
        <div class="sidebar-empty">
          <span>No active items — place an order to see tracking here</span>
        </div>
      `;
      return;
    }

    sidebarDom.items.innerHTML = activeOrders
      .map((order) => {
        const hasActiveItems = order.items.some((i) => (i.status || 'pending') !== 'ready');
        if (!hasActiveItems) return '';

        const itemsHtml = order.items
          .map((item, idx) => {
            const itemStatus = item.status || 'pending';
            const isLocked = itemStatus !== 'pending';
            return `
              <div class="sidebar-item item-status-${itemStatus}">
                <div class="sidebar-item-left">
                  <div class="sidebar-item-top">
                    <span class="sidebar-item-name">${item.quantity}× ${escapeHtml(item.name)}</span>
                    <span class="sidebar-item-status status-${itemStatus}">
                      ${getStatusLabel(itemStatus)}
                    </span>
                  </div>
                  ${item.modifiers ? `          <span class="sidebar-item-mod">${escapeHtml(item.modifiers)}</span>` : ''}
                </div>
                <div class="sidebar-item-right">
                  ${!isLocked
                    ? `<button class="sidebar-cancel-btn" data-order-id="${order.id}" data-item-index="${idx}" data-item-name="${escapeHtml(item.name)}" title="Cancel item">✕</button>`
                    : `<span class="sidebar-locked" title="Cooking started — cannot cancel">🔒</span>`
                  }
                </div>
              </div>
            `;
          })
          .join('');

        if (!itemsHtml) return '';

        return `
          <div class="sidebar-order-group">
            <div class="sidebar-order-header">
              <span class="sidebar-order-label">Order #${order.id}</span>
              <span class="sidebar-order-status badge-status status-${order.status}">
                ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
            </div>
            ${itemsHtml}
          </div>
        `;
      })
      .filter(Boolean)
      .join('');

    // Attach cancel item listeners
    sidebarDom.items.querySelectorAll('.sidebar-cancel-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const orderId = parseInt(btn.dataset.orderId);
        const itemIndex = parseInt(btn.dataset.itemIndex);
        const itemName = btn.dataset.itemName;
        cancelItem(orderId, itemIndex, itemName);
      });
    });
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'pending': return 'Pending';
      case 'cooking': return 'Cooking';
      case 'ready': return 'Ready';
      case 'delivered': return 'Delivered';
      default: return status;
    }
  }

  // ─── Sidebar Toggle ───────────────────────────────────────────────────
  function setupSidebarListeners() {
    sidebarDom.toggle.addEventListener('click', () => {
      const sidebar = sidebarDom.container;
      sidebar.classList.toggle('collapsed');
      sidebarDom.toggle.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
    });
  }

  // ─── Ready Banner ────────────────────────────────────────────────────
  function showReadyBanner(order) {
    // Remove existing banners
    document.querySelectorAll('.ready-banner').forEach((el) => el.remove());

    const banner = document.createElement('div');
    banner.className = 'ready-banner';
    banner.innerHTML = `
      <div class="ready-title">✅ Order #${order.id} is Ready!</div>
      <div class="ready-desc">Table ${order.tableNumber} — ${order.items
      .map((i) => `${i.quantity}x ${i.name}`)
      .join(', ')}</div>
      <button class="dismiss-btn">Got it!</button>
    `;
    banner.querySelector('.dismiss-btn').addEventListener('click', () => {
      banner.style.animation = 'slideUp 0.3s ease reverse';
      setTimeout(() => banner.remove(), 300);
    });
    document.body.prepend(banner);

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      if (banner.parentNode) {
        banner.style.animation = 'slideUp 0.3s ease reverse';
        setTimeout(() => banner.remove(), 300);
      }
    }, 10000);
  }

  // ─── Emoji Map ───────────────────────────────────────────────────────
  function getItemEmoji(name) {
    return '';
  }

  // ─── Toast Notifications ─────────────────────────────────────────────
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = message;
    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  // ─── Modifier Modal Logic ────────────────────────────────────────────
  function openModifierModal(item, category) {
    state.selectedItem = { ...item, category };
    dom.modalItemName.textContent = item.name;
    dom.modalItemPrice.textContent = `₹${item.price.toFixed(2)}`;
    dom.modifierInput.value = '';
    dom.qtyValue.textContent = '1';
    $$('.quick-mod').forEach((btn) => btn.classList.remove('active'));
    dom.modifierModal.classList.add('active');
    dom.modifierInput.focus();
  }

  function closeModifierModal() {
    dom.modifierModal.classList.remove('active');
    state.selectedItem = null;
  }

  // ─── Editable Table Badge ────────────────────────────────────────────
  function setupEditableTable() {
    dom.tableBadge.addEventListener('click', () => {
      // Don't open edit if already editing
      if (dom.tableBadge.querySelector('input')) return;

      const currentTable = state.tableNumber;
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'table-badge-input';
      input.value = parseInt(currentTable);
      input.min = 1;
      input.max = 99;
      input.autofocus = true;

      // Replace content with input
      dom.tableBadge.classList.add('editing');
      dom.tableBadge.textContent = '';
      dom.tableBadge.appendChild(input);
      input.focus();
      input.select();

      function commitChange() {
        const val = input.value.trim();
        const num = parseInt(val);
        if (!isNaN(num) && num >= 1 && num <= 99) {
          const newTable = String(num).padStart(2, '0');
          if (newTable !== state.tableNumber) {
            state.tableNumber = newTable;
            dom.tableBadge.textContent = `Table ${newTable}`;
            dom.ordersTableNum.textContent = newTable;
            document.title = `Waiter Pad — Table ${newTable}`;
            // Re-fetch orders for the new table
            refreshOrders();
            showToast(`Switched to Table ${newTable}`, 'info');
          } else {
            dom.tableBadge.textContent = `Table ${currentTable}`;
          }
        } else {
          dom.tableBadge.textContent = `Table ${currentTable}`;
        }
        dom.tableBadge.classList.remove('editing');
      }

      function cancelEdit() {
        dom.tableBadge.textContent = `Table ${state.tableNumber}`;
        dom.tableBadge.classList.remove('editing');
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          input.blur();
        } else if (e.key === 'Escape') {
          cancelEdit();
        }
      });

      input.addEventListener('blur', commitChange);
    });
  }

  // ─── Event Listeners ─────────────────────────────────────────────────
  function setupEventListeners() {
    // Editable table badge
    setupEditableTable();

    // Hamburger: Open drawer
    dom.hamburgerBtn.addEventListener('click', openDrawer);

    // Drawer overlay: Close
    dom.drawerOverlay.addEventListener('click', closeDrawer);

    // Drawer close button
    dom.drawerClose.addEventListener('click', closeDrawer);

    // Drawer tab selection
    dom.drawerTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.drawer-tab');
      if (tab) {
        selectDrawerTab(tab.dataset.category);
      }
    });

    // Close drawer with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && dom.categoryDrawer.classList.contains('open')) {
        closeDrawer();
      }
    });

    // Menu grid item clicks
    dom.menuGrid.addEventListener('click', (e) => {
      const itemEl = e.target.closest('.menu-item');
      if (!itemEl || itemEl.classList.contains('unavailable')) return;

      const id = parseInt(itemEl.dataset.id);
      const category = itemEl.dataset.category;
      const item = state.menu.categories[category].find((i) => i.id === id);
      if (item) {
        openModifierModal(item, category);
      }
    });

    // Quick modifier buttons (main modal)
    dom.modifierModal.addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-mod');
      if (btn) {
        btn.classList.toggle('active');
        const mods = Array.from(
          dom.modifierModal.querySelectorAll('.quick-mod.active')
        )
          .map((b) => b.dataset.mod)
          .join(', ');
        dom.modifierInput.value = mods;
      }
    });

    // Quantity controls (main modal)
    dom.qtyDec.addEventListener('click', () => {
      let val = parseInt(dom.qtyValue.textContent);
      if (val > 1) dom.qtyValue.textContent = val - 1;
    });
    dom.qtyInc.addEventListener('click', () => {
      let val = parseInt(dom.qtyValue.textContent);
      if (val < 20) dom.qtyValue.textContent = val + 1;
    });

    // Modal Add button
    dom.modalAdd.addEventListener('click', () => {
      if (!state.selectedItem) return;
      const quantity = parseInt(dom.qtyValue.textContent);
      const modifiers = dom.modifierInput.value.trim();
      addToBasket(state.selectedItem, quantity, modifiers);
      closeModifierModal();
      showToast(`Added ${quantity}x ${state.selectedItem.name}`, 'success');
    });

    // Modal Skip button
    dom.modalSkip.addEventListener('click', () => {
      if (!state.selectedItem) return;
      const quantity = parseInt(dom.qtyValue.textContent);
      addToBasket(state.selectedItem, quantity, '');
      closeModifierModal();
      showToast(`<span class="toast-icon">✅</span> <span>Added ${quantity}x ${state.selectedItem.name}</span>`, 'success');
    });

    // Close modal on overlay click
    dom.modifierModal.addEventListener('click', (e) => {
      if (e.target === dom.modifierModal) closeModifierModal();
    });

    // Send button (basket bar)
    dom.sendBtn.addEventListener('click', openBasketModal);

    // Basket modal
    dom.basketClose.addEventListener('click', () => {
      dom.basketModal.classList.remove('active');
    });
    dom.basketSend.addEventListener('click', sendOrder);

    dom.basketModal.addEventListener('click', (e) => {
      if (e.target === dom.basketModal) dom.basketModal.classList.remove('active');
    });

    // ─── Table Map Picker ───
    dom.tableMapBtn.addEventListener('click', openTableMap);
    dom.tableMapClose.addEventListener('click', closeTableMap);
    dom.tableMapCancel.addEventListener('click', closeTableMap);
    dom.tableMapModal.addEventListener('click', (e) => {
      if (e.target === dom.tableMapModal) closeTableMap();
    });

    // ─── Table Phone (loyalty session) ───
    dom.tablePhoneChip.addEventListener('click', openPhoneModal);
    dom.waiterPhoneSave.addEventListener('click', savePhoneAssignment);
    dom.waiterPhoneClose.addEventListener('click', closePhoneModal);
    dom.waiterPhoneCancel.addEventListener('click', closePhoneModal);
    dom.waiterPhoneClear.addEventListener('click', clearPhoneAssignment);
    dom.waiterPhoneInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') savePhoneAssignment();
    });
    dom.waiterPhoneModal.addEventListener('click', (e) => {
      if (e.target === dom.waiterPhoneModal) closePhoneModal();
    });
    dom.waiterCloseTable.addEventListener('click', () => {
      dom.waiterDropdown.style.display = 'none';
      closeTable();
    });

    // ─── Orders Panel Events ───
    dom.ordersToggle.addEventListener('click', openOrdersPanel);

    dom.ordersClose.addEventListener('click', closeOrdersPanel);
    dom.ordersNewOrder.addEventListener('click', closeOrdersPanel);
    dom.ordersModal.addEventListener('click', (e) => {
      if (e.target === dom.ordersModal) closeOrdersPanel();
    });

    // ─── Edit Order Events ───
    // Edit category tabs
    dom.editCategoryTabs.addEventListener('click', (e) => {
      const tab = e.target.closest('.edit-cat-tab');
      if (tab) {
        renderEditMenu(tab.dataset.category);
      }
    });

    // Edit menu grid item clicks
    dom.editMenuGrid.addEventListener('click', (e) => {
      const itemEl = e.target.closest('.edit-menu-item');
      if (!itemEl || itemEl.classList.contains('unavailable')) return;

      const id = parseInt(itemEl.dataset.id);
      const category = itemEl.dataset.category || state.editCategory;
      const item = state.menu.categories[category].find((i) => i.id === id);
      if (item) {
        showEditAddSection({ ...item, category });
      }
    });

    // Quick modifier buttons (edit modal)
    dom.editOrderModal.addEventListener('click', (e) => {
      const btn = e.target.closest('.quick-mod');
      if (btn && dom.editAddSection.style.display !== 'none') {
        btn.classList.toggle('active');
        const mods = Array.from(
          dom.editOrderModal.querySelectorAll('.quick-mod.active')
        )
          .map((b) => b.dataset.mod)
          .join(', ');
        dom.editAddModifier.value = mods;
      }
    });

    // Quantity controls (edit modal)
    dom.editAddQtyDec.addEventListener('click', () => {
      let val = parseInt(dom.editAddQtyValue.textContent);
      if (val > 1) dom.editAddQtyValue.textContent = val - 1;
    });
    dom.editAddQtyInc.addEventListener('click', () => {
      let val = parseInt(dom.editAddQtyValue.textContent);
      if (val < 20) dom.editAddQtyValue.textContent = val + 1;
    });

    // Add to order confirm
    dom.editAddConfirm.addEventListener('click', confirmEditAddItem);

    // Save / Cancel edit
    dom.editOrderCancel.addEventListener('click', closeEditOrder);
    dom.editOrderSave.addEventListener('click', saveEditOrder);

    // Close edit modal on overlay click
    dom.editOrderModal.addEventListener('click', (e) => {
      if (e.target === dom.editOrderModal) closeEditOrder();
    });

    // ─── 3-Dot Menu ───
    dom.waiterMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dom.waiterDropdown.style.display === 'block';
      dom.waiterDropdown.style.display = isOpen ? 'none' : 'block';
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.waiter-actions-menu')) {
        dom.waiterDropdown.style.display = 'none';
      }
    });

    // Report Missing Ingredient
    dom.waiterRequestIngredient.addEventListener('click', () => {
      dom.waiterDropdown.style.display = 'none';
      dom.waiterIngredientName.value = '';
      dom.waiterIngredientQty.value = '';
      dom.waiterIngredientModal.classList.add('active');
      setTimeout(() => dom.waiterIngredientName.focus(), 100);
    });

    function closeIngredientModal() {
      dom.waiterIngredientModal.classList.remove('active');
    }
    dom.waiterIngredientClose.addEventListener('click', closeIngredientModal);
    dom.waiterIngredientCancel.addEventListener('click', closeIngredientModal);
    dom.waiterIngredientModal.addEventListener('click', (e) => {
      if (e.target === dom.waiterIngredientModal) closeIngredientModal();
    });

    dom.waiterIngredientSubmit.addEventListener('click', submitIngredientRequest);
    dom.waiterIngredientQty.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitIngredientRequest();
    });

    // Refresh Orders
    dom.waiterRefreshOrders.addEventListener('click', () => {
      dom.waiterDropdown.style.display = 'none';
      refreshOrders();
      showToast('🔄 Orders refreshed', 'success');
    });

    // Waiter name (persisted per device)
    dom.waiterNameInput.addEventListener('change', () => {
      const name = dom.waiterNameInput.value.trim();
      state.waiterName = name || 'Waiter';
      localStorage.setItem('chauka_waiter_name', state.waiterName);
      showToast(`Orders will show as "${state.waiterName}"`, 'info');
    });

    // Send Back Dish
    dom.waiterSendBackDish.addEventListener('click', () => {
      dom.waiterDropdown.style.display = 'none';
      populateSendBackCategories();
      dom.waiterReturnCategory.value = '';
      dom.waiterReturnDishSelect.innerHTML = '<option value="">Select dish…</option>';
      dom.waiterReturnReason.value = '';
      dom.waiterReturnQty.value = '1';
      dom.waiterReturnAmount.value = '';
      dom.waiterSendBackModal.classList.add('active');
      setTimeout(() => dom.waiterReturnCategory.focus(), 100);
    });
    dom.waiterReturnCategory.addEventListener('change', populateSendBackDishes);
    dom.waiterReturnDishSelect.addEventListener('change', onSendBackDishChange);

    function closeSendBackModal() {
      dom.waiterSendBackModal.classList.remove('active');
    }
    dom.waiterSendBackClose.addEventListener('click', closeSendBackModal);
    dom.waiterSendBackCancel.addEventListener('click', closeSendBackModal);
    dom.waiterSendBackModal.addEventListener('click', (e) => {
      if (e.target === dom.waiterSendBackModal) closeSendBackModal();
    });

    dom.waiterSendBackSubmit.addEventListener('click', submitReturnedDish);
    dom.waiterReturnAmount.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitReturnedDish();
    });

    // Help / Report an Issue
    dom.waiterHelpReport.addEventListener('click', () => {
      dom.waiterDropdown.style.display = 'none';
      dom.waiterHelpTitle.value = '';
      dom.waiterHelpDesc.value = '';
      dom.waiterHelpModal.classList.add('active');
      setTimeout(() => dom.waiterHelpTitle.focus(), 100);
    });

    function closeHelpModal() {
      dom.waiterHelpModal.classList.remove('active');
    }
    dom.waiterHelpClose.addEventListener('click', closeHelpModal);
    dom.waiterHelpCancel.addEventListener('click', closeHelpModal);
    dom.waiterHelpModal.addEventListener('click', (e) => {
      if (e.target === dom.waiterHelpModal) closeHelpModal();
    });

    dom.waiterHelpSubmit.addEventListener('click', submitHelpReport);
    dom.waiterHelpDesc.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) submitHelpReport();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (dom.tableMapModal.classList.contains('active')) {
          closeTableMap();
        } else if (dom.waiterHelpModal.classList.contains('active')) {
          closeHelpModal();
        } else if (dom.waiterSendBackModal.classList.contains('active')) {
          closeSendBackModal();
        } else if (dom.waiterIngredientModal.classList.contains('active')) {
          closeIngredientModal();
        } else if (dom.editOrderModal.classList.contains('active')) {
          closeEditOrder();
        } else if (dom.ordersModal.classList.contains('active')) {
          closeOrdersPanel();
        } else {
          closeModifierModal();
          dom.basketModal.classList.remove('active');
        }
      }
    });
  }

  // ─── Ingredient Request ──────────────────────────────────────────────
  async function submitIngredientRequest() {
    const ingredient = dom.waiterIngredientName.value.trim();
    const quantity = dom.waiterIngredientQty.value.trim();

    if (!ingredient || !quantity) {
      showToast('Please fill in both fields', 'error');
      return;
    }

    dom.waiterIngredientSubmit.disabled = true;
    dom.waiterIngredientSubmit.textContent = '⏳ Sending...';

    try {
      const res = await fetch('/api/ingredient-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient,
          quantity,
          requestedBy: `Waiter (Table ${state.tableNumber})`,
          tableNumber: state.tableNumber,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit request');

      showToast(`✅ Requested ${ingredient} — ${quantity}`, 'success');
      dom.waiterIngredientModal.classList.remove('active');
    } catch (err) {
      console.error('Ingredient request error:', err);
      showToast('Failed to submit request', 'error');
    } finally {
      dom.waiterIngredientSubmit.disabled = false;
      dom.waiterIngredientSubmit.textContent = 'Submit Request';
    }
  }

  // ─── Help / Complaint Report ─────────────────────────────────────────
  async function submitHelpReport() {
    const title = dom.waiterHelpTitle.value.trim();
    const description = dom.waiterHelpDesc.value.trim();

    if (!title || !description) {
      showToast('Please fill in both title and description', 'error');
      return;
    }

    dom.waiterHelpSubmit.disabled = true;
    dom.waiterHelpSubmit.textContent = '⏳ Sending...';

    try {
      const res = await fetch('/api/help-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          requestedBy: `Waiter (Table ${state.tableNumber})`,
          tableNumber: state.tableNumber,
        }),
      });

      if (!res.ok) throw new Error('Failed to submit report');

      showToast(`🆘 Report sent: ${title}`, 'success');
      dom.waiterHelpModal.classList.remove('active');
    } catch (err) {
      console.error('Help report error:', err);
      showToast('Failed to submit report', 'error');
    } finally {
      dom.waiterHelpSubmit.disabled = false;
      dom.waiterHelpSubmit.textContent = 'Submit Report';
    }
  }

  // ─── Returned Dish ───────────────────────────────────────────────────
  function populateSendBackCategories() {
    const catSel = dom.waiterReturnCategory;
    if (!state.menu || !catSel) return;
    const cats = Object.keys(state.menu.categories);
    catSel.innerHTML =
      '<option value="">Select category…</option>' +
      cats
        .map(
          (c) =>
            `<option value="${c}">${categoryLabels[c] || c.charAt(0).toUpperCase() + c.slice(1)}</option>`
        )
        .join('');
  }

  function populateSendBackDishes() {
    const cat = dom.waiterReturnCategory.value;
    const dishSel = dom.waiterReturnDishSelect;
    dom.waiterReturnAmount.value = '';
    if (!cat || !state.menu || !state.menu.categories[cat]) {
      dishSel.innerHTML = '<option value="">Select dish…</option>';
      return;
    }
    const items = state.menu.categories[cat].filter((i) => i.available !== false);
    dishSel.innerHTML =
      '<option value="">Select dish…</option>' +
      items
        .map((i) => `<option value="${i.name}" data-price="${i.price}">${i.name} — ₹${i.price}</option>`)
        .join('');
  }

  function onSendBackDishChange() {
    const opt = dom.waiterReturnDishSelect.selectedOptions[0];
    dom.waiterReturnAmount.value = opt && opt.dataset.price ? opt.dataset.price : '';
  }

  async function submitReturnedDish() {
    const dishName = dom.waiterReturnDishSelect.value.trim();
    const reason = dom.waiterReturnReason.value.trim() || 'Incorrectly prepared';
    const quantity = parseInt(dom.waiterReturnQty.value) || 1;
    const amount = parseFloat(dom.waiterReturnAmount.value);

    if (!dishName || isNaN(amount) || amount <= 0) {
      showToast('Select a dish from the menu first', 'error');
      return;
    }

    dom.waiterSendBackSubmit.disabled = true;
    dom.waiterSendBackSubmit.textContent = '⏳ Reporting...';

    try {
      const res = await fetch('/api/returned-dish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishName,
          quantity,
          reason,
          amount,
          tableNumber: state.tableNumber,
        }),
      });

      if (!res.ok) throw new Error('Failed to report');

      showToast(`↩️ Reported ${quantity}x ${dishName} as returned (₹${(amount * quantity).toFixed(2)})`, 'success');
      dom.waiterSendBackModal.classList.remove('active');
    } catch (err) {
      console.error('Returned dish error:', err);
      showToast('Failed to report returned dish', 'error');
    } finally {
      dom.waiterSendBackSubmit.disabled = false;
      dom.waiterSendBackSubmit.textContent = '📋 Report Return';
    }
  }

  // ─── Basket Modal ────────────────────────────────────────────────────
  function openBasketModal() {
    if (state.basket.length === 0) return;

    const total = state.basket.reduce((sum, b) => sum + b.price * b.quantity, 0);
    dom.basketModalTotal.textContent = `₹${total.toFixed(2)}`;

    dom.basketItems.innerHTML = state.basket
      .map(
        (b, i) => `
        <div class="basket-item" data-index="${i}">
          <div class="basket-item-info">
            <div class="basket-item-name">${escapeHtml(b.name)}</div>
            ${b.modifiers ? `<div class="basket-item-mod">📝 ${escapeHtml(b.modifiers)}</div>` : ''}
            <div class="basket-item-qty">Qty: ${b.quantity}</div>
          </div>
          <div class="basket-item-price">₹${(b.price * b.quantity).toFixed(2)}</div>
          <button class="basket-item-remove" data-index="${i}">✕</button>
        </div>
      `
      )
      .join('');

    // Remove buttons
    dom.basketItems.querySelectorAll('.basket-item-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeFromBasket(parseInt(btn.dataset.index));
        if (state.basket.length === 0) {
          dom.basketModal.classList.remove('active');
        } else {
          openBasketModal(); // Refresh
        }
      });
    });

    dom.basketModal.classList.add('active');
  }

  // ─── HTML Escape (prevents XSS from menu item names/modifiers) ────
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
    );
  }

  // ─── Time Ago Helper ─────────────────────────────────────────────────
  function getTimeAgo(dateStr) {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now - then;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    const remMins = diffMins % 60;
    return `${diffHrs}h ${remMins}m ago`;
  }

  // ─── Start ───────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
