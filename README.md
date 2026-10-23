# 🏠 Chauka Restaurant System

Real-time restaurant engine — Waiter Pad, Kitchen Display, Manager Panel & Customer QR ordering.

---

## Quick Start

### 1. Configure

Edit the `.env` file with your license key and server URL:

```
LICENSE_KEY=CHK-XXXX-XXXX-XXXX-XXXX
LICENSE_SERVER_URL=https://licenses.yourdomain.com
```

### 2. Install

```bash
npm install
```

### 3. Start

```bash
npm start
```

The server runs on port 3000.

### 4. Connect Screens

Open the **Hub** on the server machine:

```
http://localhost:3000/app/hub/
```

| Screen | URL |
|--------|-----|
| 🏠 Hub | `http://<server-ip>:3000/app/hub/` |
| 📋 Waiter Pad | `http://<server-ip>:3000/app/waiter/?table=01` |
| 🍳 Kitchen Display | `http://<server-ip>:3000/app/kitchen/` |
| 📊 Manager Panel | `http://<server-ip>:3000/app/manager/` |
| 📱 Customer Menu | `http://<server-ip>:3000/app/customer/?table=01` |

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `LICENSE_KEY` | ✅ | Your restaurant's license key |
| `LICENSE_SERVER_URL` | ✅ | License server URL |
| `LICENSE_GRACE_DAYS` | ❌ | Offline grace period (default: `3`) |
| `LICENSE_CHECK_INTERVAL_HOURS` | ❌ | Check every N hours (default: once daily) |
| `PORT` | ❌ | Server port (default: `3000`) |
| `WHATSAPP_NUMBER` | ❌ | WhatsApp number for customer links |
| `MANAGER_PIN` | ❌ | The manager's own PIN (default `0000`) — protects menu/loyalty edits, the order-auth switch and the staff code |
| `STAFF_TOKEN_TTL_MINUTES` | ❌ | How long a staff device stays signed in (default: `480` = 8 h) |

Staff do **not** use `MANAGER_PIN`. They use **today's staff code**, shown on the manager panel's **Security** tab: 6 characters (e.g. `A3F9C2`), shared with the team each day, entered once per device. It rotates by itself at midnight.

> The staff code is only as private as `MANAGER_PIN`: with the default `0000`, anyone who guesses it can open the manager panel and read today's code. Set a real PIN on networks you don't control.

---

## License

The system checks your license at startup and 3× daily. If the license expires or is unpaid, the system locks to read-only mode. See the setup guide for details.
