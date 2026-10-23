/**
 * Shared Socket.io client for Chauka.
 * Provides a singleton socket connection and helper functions.
 */
const RestaurantSocket = (() => {
  const SERVER_URL = window.location.origin;

  // Staff token cached by auth-client.js (empty when auth is off / not unlocked).
  function authToken() {
    try {
      return (window.ChaukaAuth && window.ChaukaAuth.token) || '';
    } catch (e) {
      return '';
    }
  }

  class RestaurantSocketClient {
    constructor() {
      this.socket = null;
      this.connected = false;
      this.listeners = {};
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 10;
      this.authListenerBound = false;
    }

    connect() {
      // Prevent creating multiple socket connections
      if (this.socket) {
        if (!this.socket.connected) {
          this.socket.connect();
        }
        return;
      }

      this.socket = io(SERVER_URL, {
        transports: ['websocket', 'polling'],
        // Proven once the staff PIN is entered; the server keeps an
        // unauthenticated socket out of the staff-only event stream.
        auth: { token: authToken() },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: this.maxReconnectAttempts,
      });

      this.socket.on('connect', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log('[RestaurantSocket] Connected:', this.socket.id);
        this.authenticate();
        this._emit('_connected', { id: this.socket.id });
      });

      // auth-client fires this when the PIN modal successfully unlocks, which
      // can happen long after the socket connected (e.g. on a fresh tablet).
      if (!this.authListenerBound) {
        this.authListenerBound = true;
        window.addEventListener('chauka:staff-auth', () => this.authenticate());
      }

      this.socket.on('disconnect', (reason) => {
        this.connected = false;
        console.log('[RestaurantSocket] Disconnected:', reason);
        this._emit('_disconnected', { reason });
      });

      this.socket.on('connect_error', (err) => {
        this.reconnectAttempts++;
        console.warn('[RestaurantSocket] Connection error:', err.message);
      });
    }

    // Claim staff access on the current connection. The server ignores this
    // when order auth is off; a token is only ever issued by the PIN endpoint.
    authenticate() {
      const token = authToken();
      if (!this.socket || !this.socket.connected) return;
      this.socket.emit('authenticate', { token });
    }

    // Subscribe to an event
    on(event, callback) {
      if (!this.listeners[event]) {
        this.listeners[event] = [];
      }
      // Register socket-level listener if socket exists and this is the first listener
      if (this.listeners[event].length === 0 && this.socket) {
        this._registerSocketListener(event);
      }
      this.listeners[event].push(callback);
      return () => this.off(event, callback);
    }

    // Register the actual socket.io listener for an event
    _registerSocketListener(event) {
      if (!this.socket) return;
      // Remove any existing listener to prevent duplicates on reconnect
      this.socket.off(event);
      this.socket.on(event, (data) => {
        (this.listeners[event] || []).forEach((cb) => cb(data));
      });
    }

    // Unsubscribe
    off(event, callback) {
      if (!this.listeners[event]) return;
      this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    }

    // Emit an event to the server
    emit(event, data) {
      if (this.socket && this.socket.connected) {
        this.socket.emit(event, data);
      } else {
        console.warn('[RestaurantSocket] Cannot emit — not connected');
      }
    }

    // Internal emit to local listeners
    _emit(event, data) {
      (this.listeners[event] || []).forEach((cb) => cb(data));
    }

    // Disconnect
    disconnect() {
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
        this.connected = false;
      }
    }

    // Check connection status
    isConnected() {
      return this.connected;
    }
  }

  // Singleton
  let instance;
  return {
    getInstance() {
      if (!instance) {
        instance = new RestaurantSocketClient();
      }
      return instance;
    },
  };
})();
