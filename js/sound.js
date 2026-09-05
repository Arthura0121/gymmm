/* ============================================================
   sound.js — loud alerts, synthesized (no audio files to host).
   Browsers block audio until a user gesture happens on the page,
   so call Sound.unlock() from a click/tap handler at least once.
   ============================================================ */

(function () {
  let ctx = null;

  function ensureCtx() {
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) {
      console.warn('GRINDSET: audio unavailable, continuing without sound.', e);
      return null;
    }
  }

  function beep(freq, startTime, duration, peak) {
    const c = ensureCtx();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.03);
  }

  /** Rest is over — loud, sharp, impossible to miss. */
  function playBreakEnd() {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime;
    beep(920, now, 0.16, 1.0);
    beep(920, now + 0.22, 0.16, 1.0);
    beep(1200, now + 0.44, 0.32, 1.0);
  }

  /** Whole workout finished — a little fanfare. */
  function playComplete() {
    const c = ensureCtx();
    if (!c) return;
    const now = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => beep(f, now + i * 0.16, 0.24, 0.9));
  }

  function unlock() { ensureCtx(); }

  window.Sound = { playBreakEnd, playComplete, unlock };
})();
