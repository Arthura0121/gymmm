/* ============================================================
   sync.js — shared state, synced between the "me" and "dad" pages.

   If js/firebase-config.js has a real Firebase config, we use the
   Realtime Database for true cross-device sync (your phone <-> his
   phone). If not, we fall back to localStorage, which only syncs
   between tabs on the SAME browser/device — fine for testing, but
   your dad needs the Firebase setup to watch from his own phone.
   See README.md.
   ============================================================ */

const STORAGE_KEY = 'workout_tracker_state_v1';

function isFirebaseConfigured() {
  return (
    window.FIREBASE_CONFIG &&
    window.FIREBASE_CONFIG.apiKey &&
    !window.FIREBASE_CONFIG.apiKey.startsWith('YOUR_')
  );
}

class Sync {
  constructor() {
    this.listeners = new Set();
    this.mode = isFirebaseConfigured() ? 'firebase' : 'local';
    this._dbRef = null;

    if (this.mode === 'firebase') {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      this._dbRef = firebase.database().ref('workout/state');
      this._dbRef.on('value', (snap) => {
        const val = snap.val();
        if (val) this.listeners.forEach((fn) => fn(val));
      });
    } else {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY && e.newValue) {
          this.listeners.forEach((fn) => fn(JSON.parse(e.newValue)));
        }
      });
      // Same-tab safety net polling — some mobile browsers are stingy
      // with the 'storage' event across tabs.
      setInterval(() => {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) this.listeners.forEach((fn) => fn(JSON.parse(raw)));
      }, 1000);
    }
  }

  onUpdate(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  push(state) {
    if (this.mode === 'firebase') {
      this._dbRef.set(state);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }

  async pull() {
    if (this.mode === 'firebase') {
      const snap = await this._dbRef.get();
      return snap.val();
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }
}

window.Sync = Sync;
