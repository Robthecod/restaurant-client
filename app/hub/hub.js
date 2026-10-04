let serverUrl = '';

    // ─── Detect LAN IP ───
    async function detectLAN() {
      try {
        const res = await fetch('/api/network');
        const data = await res.json();
        serverUrl = data.url;
        document.getElementById('lanIpDisplay').innerHTML = `
          <div class="lan-ip-value" onclick="copyIP()" title="Click to copy">${data.url.replace('http://','')}</div>
        `;
        document.getElementById('serverUrlDisplay').textContent = serverUrl;
        // Generate QR codes with the LAN URL
        generateQRs(data.url);
      } catch (err) {
        document.getElementById('lanIpDisplay').innerHTML = `
          <div class="lan-ip-value" style="font-size:1.2rem;user-select:all;">localhost:3000</div>
        `;
        generateQRs(window.location.origin);
      }
    }

    // ─── Copy IP ───
    function copyIP() {
      const ip = document.querySelector('.lan-ip-value');
      if (ip) {
        navigator.clipboard.writeText(ip.textContent.trim());
        const orig = ip.textContent;
        ip.textContent = '✅ Copied!';
        setTimeout(() => ip.textContent = orig, 1500);
      }
    }

    // ─── Generate QR Codes ───
    function generateQRs(baseUrl) {
      const qrAPI = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=';

      const waiterUrl = encodeURIComponent(baseUrl + '/app/waiter/?table=01');
      const kitchenUrl = encodeURIComponent(baseUrl + '/app/kitchen/');
      const managerUrl = encodeURIComponent(baseUrl + '/app/manager/');

      document.getElementById('qrWaiter').innerHTML =
        `<img src="${qrAPI}${waiterUrl}" alt="QR for Waiter Pad" loading="lazy" onerror="this.parentElement.innerHTML='QR'">`;
      document.getElementById('qrKitchen').innerHTML =
        `<img src="${qrAPI}${kitchenUrl}" alt="QR for Kitchen Display" loading="lazy" onerror="this.parentElement.innerHTML='QR'">`;
      document.getElementById('qrManager').innerHTML =
        `<img src="${qrAPI}${managerUrl}" alt="QR for Manager Panel" loading="lazy" onerror="this.parentElement.innerHTML='QR'">`;

      // Customer QR (default table 1)
      refreshCustomerQR(baseUrl);
    }

    // ─── Customer QR per table ───
    function refreshCustomerQR(baseUrl) {
      const tableNum = document.getElementById('customerTableNum').value || '1';
      const tableStr = String(tableNum).padStart(2, '0');
      const url = (baseUrl || serverUrl || window.location.origin) + '/app/customer/?table=' + tableStr;
      const qrAPI = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=';
      document.getElementById('qrCustomer').innerHTML =
        `<img src="${qrAPI}${encodeURIComponent(url)}" alt="QR for Customer Ordering Table ${tableStr}" loading="lazy" onerror="this.parentElement.innerHTML='QR'">`;
      document.getElementById('customerQRLabel').textContent = `Table ${tableStr} · Scan to order`;
    }

    // ─── Open Waiter ───
    function openWaiter() {
      window.open('/app/waiter/?table=01', '_blank');
    }

    // ─── Init ───
    document.addEventListener('DOMContentLoaded', () => {
      detectLAN();

    });
