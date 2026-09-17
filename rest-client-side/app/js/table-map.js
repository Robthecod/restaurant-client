/**
 * Chauka shared floor-map renderer (vanilla JS, no dependencies).
 * Renders the free-form floor map into a container:
 *   - background = uploaded floor plan (or a neutral tint when none)
 *   - tables    = absolutely-positioned markers labeled with their table
 *                 number, colored by live status:
 *                   delivered   (green)  = all items delivered
 *                   pending     (red)    = order placed but not received yet
 *                   (default)   (yellow) = no orders / yet to order
 *
 * Used by the Manager panel (drag/resize editor + live view) and the
 * Waiter pad (tap a table to switch to it).
 */
(function () {
  'use strict';

  /**
   * render(container, map, opts)
   *   map: { width, height, image, tables: [{ id, label, x, y, w, h, shape }] }
   *   opts:
   *     draggable    - allow dragging tables + resize handles (manager editor)
   *     selectedId   - highlight this table id
 *     openOrders   - array of table numbers with pending/cooking orders → red
 *     readyTables  - array of table numbers whose order is ready to collect → red+green outline
 *     deliveredTables - array of table numbers with delivered orders → green
   *     forceSquare  - render all tables as squares regardless of shape setting
   *     onClick      - fn(table) when a marker is clicked
   *     onChange     - fn(table) after a drag/resize (table object already mutated)
   */
  function render(container, map, opts) {
    opts = opts || {};
    container.innerHTML = '';
    container.style.backgroundImage = map && map.image ? 'url("' + map.image + '")' : 'none';
    if (map && map.width && map.height) {
      container.style.aspectRatio = map.width + ' / ' + map.height;
    }
    container.classList.toggle('draggable', !!opts.draggable);

    if (!map || !map.tables || map.tables.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'table-map-empty';
      empty.textContent = opts.emptyText || 'No tables on the map yet';
      container.appendChild(empty);
      return;
    }

    // Table numbers are stored zero-padded system-wide ('05', '12'), while the
    // manager may label a map table as plain '5'. Normalize both sides so the
    // status colors match regardless of how the label was typed.
    const norm = (n) => String(n == null ? '' : n).padStart(2, '0');
    const openSet = {};
    (opts.openOrders || []).forEach((n) => {
      openSet[norm(n)] = true;
    });
    const readySet = {};
    (opts.readyTables || []).forEach((n) => {
      readySet[norm(n)] = true;
    });
    const deliveredSet = {};
    (opts.deliveredTables || []).forEach((n) => {
      deliveredSet[norm(n)] = true;
    });

    map.tables.forEach((t) => {
      const el = document.createElement('div');
      // When forceSquare is on, always use the square shape
      let shapeCls;
      if (opts.forceSquare) {
        shapeCls = ' square';
      } else if (t.shape === 'square') {
        shapeCls = ' square';
      } else if (t.shape === 'rectangle') {
        shapeCls = ' rectangle';
      } else {
        shapeCls = '';
      }
      el.className = 'tm-table' + shapeCls;
      el.style.left = t.x + '%';
      el.style.top = t.y + '%';
      el.style.width = t.w + '%';
      el.style.height = t.h + '%';
      el.dataset.tableId = t.id;

      // Status: delivered (green) > ready-to-serve (red+green) > pending (red) > default (yellow)
      const labelKey = norm(t.label);
      if (deliveredSet[labelKey]) el.classList.add('delivered');
      else if (readySet[labelKey]) el.classList.add('ready-to-serve');
      else if (openSet[labelKey]) el.classList.add('pending');
      // else: yellow (default, no orders)
      if (opts.selectedId === t.id) el.classList.add('selected');

      const label = document.createElement('div');
      label.className = 'tm-label';
      label.textContent = t.label;
      el.appendChild(label);

      if (opts.draggable) {
        // Resize handle (bottom-right)
        const handle = document.createElement('div');
        handle.className = 'tm-resize';
        handle.title = 'Drag to resize';
        el.appendChild(handle);

        // Move: drag the marker body
        el.addEventListener('pointerdown', (e) => {
          if (e.target === handle) return;
          e.preventDefault();
          const startX = e.clientX;
          const startY = e.clientY;
          const rect = container.getBoundingClientRect();
          const origX = t.x;
          const origY = t.y;
          const onMove = (ev) => {
            t.x = Math.min(100, Math.max(0, origX + ((ev.clientX - startX) / rect.width) * 100));
            t.y = Math.min(100, Math.max(0, origY + ((ev.clientY - startY) / rect.height) * 100));
            el.style.left = t.x + '%';
            el.style.top = t.y + '%';
            if (opts.onChange) opts.onChange(t);
          };
          const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
          };
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
        });

        // Resize: drag the corner handle
        handle.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          const startX = e.clientX;
          const startY = e.clientY;
          const rect = container.getBoundingClientRect();
          const origW = t.w;
          const origH = t.h;
          const onMove = (ev) => {
            t.w = Math.min(30, Math.max(3, origW + ((ev.clientX - startX) / rect.width) * 100));
            t.h = Math.min(30, Math.max(3, origH + ((ev.clientY - startY) / rect.height) * 100));
            el.style.width = t.w + '%';
            el.style.height = t.h + '%';
            if (opts.onChange) opts.onChange(t);
          };
          const onUp = () => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
          };
          document.addEventListener('pointermove', onMove);
          document.addEventListener('pointerup', onUp);
        });
      }

      if (opts.onClick) {
        el.addEventListener('click', () => opts.onClick(t));
      }

      container.appendChild(el);
    });
  }

  window.TableMap = { render };
})();
