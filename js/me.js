(function () {
  const E = window.Engine;
  const DEFAULT_PIN = localStorage.getItem('grindset_pin') || '7734';

  /* ---------------- lock screen ---------------- */

  const lockEl = document.getElementById('lock');
  const appEl = document.getElementById('app');
  const lockDots = document.getElementById('lockDots');
  const lockPad = document.getElementById('lockPad');
  const lockError = document.getElementById('lockError');
  let entered = '';

  function renderDots() {
    lockDots.innerHTML = '';
    for (let i = 0; i < DEFAULT_PIN.length; i++) {
      const d = document.createElement('div');
      d.className = 'lock-dot' + (i < entered.length ? ' filled' : '');
      lockDots.appendChild(d);
    }
  }

  function buildPad() {
    lockPad.innerHTML = '';
    const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];
    keys.forEach((k) => {
      const b = document.createElement('button');
      b.className = 'lock-key';
      b.textContent = k;
      b.style.visibility = k === '' ? 'hidden' : 'visible';
      b.addEventListener('click', () => onKey(k));
      lockPad.appendChild(b);
    });
  }

  function onKey(k) {
    try { if (window.Sound) Sound.unlock(); } catch (e) { /* never let audio break the keypad */ }
    if (k === '⌫') { entered = entered.slice(0, -1); }
    else if (entered.length < DEFAULT_PIN.length) { entered += k; }
    renderDots();
    lockError.textContent = '';
    if (entered.length === DEFAULT_PIN.length) {
      if (entered === DEFAULT_PIN) {
        sessionStorage.setItem('grindset_unlocked', '1');
        unlock();
      } else {
        lockError.textContent = 'wrong pin';
        setTimeout(() => { entered = ''; renderDots(); }, 350);
      }
    }
  }

  function unlock() {
    lockEl.style.display = 'none';
    appEl.style.display = 'flex';
    boot();
  }

  buildPad();
  renderDots();
  if (sessionStorage.getItem('grindset_unlocked') === '1') {
    unlock();
  }

  /* ---------------- app ---------------- */

  function boot() {
    const sync = new Sync();
    document.getElementById('syncMode').textContent = sync.mode === 'firebase' ? 'live · firebase' : 'local only';

    let state = E.freshState({});
    let prevStatus = state.status;

    sync.pull().then((remote) => {
      if (remote) state = remote;
      render();
    });

    sync.onUpdate((remote) => { state = remote; render(); });

    function commit(next) {
      state = next;
      sync.push(state);
      render();
    }

    // --- element refs ---
    const repBtn = document.getElementById('repBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resetBtn = document.getElementById('resetBtn');
    const skipBreakBtn = document.getElementById('skipBreakBtn');
    const startHint = document.getElementById('startHint');
    const statusBadge = document.getElementById('statusBadge');
    const statusVal = document.getElementById('statusVal');
    const dialCard = document.getElementById('dialCard');
    const breakCard = document.getElementById('breakCard');
    const dialFill = document.getElementById('dialFill');
    const repsDone = document.getElementById('repsDone');
    const repsTotal = document.getElementById('repsTotal');
    const repsSub = document.getElementById('repsSub');
    const planLine = document.getElementById('planLine');
    const pipsEl = document.getElementById('pips');
    const breakCountdown = document.getElementById('breakCountdown');
    const breakProgress = document.getElementById('breakProgress');
    const nextRepNum = document.getElementById('nextRepNum');
    const breakRepsTotal = document.getElementById('breakRepsTotal');
    const completeBanner = document.getElementById('completeBanner');
    const completeSub = document.getElementById('completeSub');
    const elapsedVal = document.getElementById('elapsedVal');
    const repsLeftVal = document.getElementById('repsLeftVal');
    const paceVal = document.getElementById('paceVal');
    const avgTag = document.getElementById('avgTag');

    const CIRC = 2 * Math.PI * 100;
    dialFill.setAttribute('stroke-dasharray', CIRC.toFixed(1));

    let pipsBuilt = 0;

    repBtn.addEventListener('click', () => {
      if (state.status === 'idle') { commit(E.startWorkout(state)); return; }
      if (state.status !== 'active') return;
      repBtn.classList.remove('pulse'); void repBtn.offsetWidth; repBtn.classList.add('pulse');
      commit(E.logRep(state));
    });

    pauseBtn.addEventListener('click', () => {
      if (state.status === 'paused') commit(E.resumeWorkout(state));
      else commit(E.pauseWorkout(state));
    });

    resetBtn.addEventListener('click', () => {
      if (confirm('Reset the whole workout? This clears progress for both panels.')) {
        commit(E.resetWorkout(state));
      }
    });

    skipBreakBtn.addEventListener('click', () => {
      if (state.status === 'break') {
        commit({ ...state, status: 'active', breakEndTime: null, lastRepAt: Date.now(), updatedAt: Date.now() });
      }
    });

    document.querySelectorAll('[data-add]').forEach((el) => {
      el.addEventListener('click', () => commit(E.adjustAdd(state, parseInt(el.dataset.add, 10))));
    });
    document.querySelectorAll('[data-remove]').forEach((el) => {
      el.addEventListener('click', () => commit(E.adjustRemove(state, parseInt(el.dataset.remove, 10))));
    });
    document.getElementById('addCustom').addEventListener('click', () => {
      const n = parseInt(prompt('Add how many reps?', '1') || '0', 10);
      if (n > 0) commit(E.adjustAdd(state, n));
    });
    document.getElementById('removeCustom').addEventListener('click', () => {
      const n = parseInt(prompt('Remove how many reps?', '1') || '0', 10);
      if (n > 0) commit(E.adjustRemove(state, n));
    });

    /* ---------------- settings modal ---------------- */

    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsCancel = document.getElementById('settingsCancel');
    const settingsSave = document.getElementById('settingsSave');
    const modalNote = document.getElementById('modalNote');
    const cfgReps = document.getElementById('cfgReps');
    const cfgPushups = document.getElementById('cfgPushups');
    const cfgBreak = document.getElementById('cfgBreak');

    settingsBtn.addEventListener('click', () => {
      cfgReps.value = state.config.totalSets;
      cfgPushups.value = state.config.pushupsPerRep;
      cfgBreak.value = Math.round(state.config.breakMs / 1000);
      modalNote.textContent = state.status !== 'idle'
        ? 'Saving will reset your current progress on both panels.'
        : '';
      settingsModal.style.display = 'flex';
    });
    settingsCancel.addEventListener('click', () => { settingsModal.style.display = 'none'; });
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) settingsModal.style.display = 'none'; });

    settingsSave.addEventListener('click', () => {
      const reps = parseInt(cfgReps.value, 10);
      const pushups = parseInt(cfgPushups.value, 10);
      const breakSec = parseInt(cfgBreak.value, 10);
      if (!(reps > 0) || !(pushups > 0) || !(breakSec >= 0)) {
        modalNote.textContent = 'Please enter valid positive numbers.';
        return;
      }
      const proceed = state.status === 'idle'
        || confirm('Changing settings resets your current workout for both panels. Continue?');
      if (!proceed) return;

      commit(E.configureWorkout(state, {
        totalSets: reps,
        pushupsPerRep: pushups,
        breakMs: breakSec * 1000,
      }));
      settingsModal.style.display = 'none';
    });

    function buildPips() {
      pipsEl.innerHTML = '';
      for (let i = 0; i < state.config.totalSets; i++) {
        const p = document.createElement('div');
        p.className = 'pip';
        pipsEl.appendChild(p);
      }
      pipsBuilt = state.config.totalSets;
    }

    function render(now = Date.now()) {
      state = E.checkBreakElapsed(state, now);
      if (pipsBuilt !== state.config.totalSets) buildPips();

      const total = E.totalReps(state);
      const elapsed = E.getElapsedMs(state, now);
      const frac = state.completedReps / total;

      repsDone.textContent = state.completedReps;
      repsTotal.textContent = total;
      repsSub.textContent = state.completedReps === 1 ? 'rep' : 'reps';
      planLine.textContent = `${total} reps · ${state.config.pushupsPerRep} pushups each · ${Math.round(state.config.breakMs / 1000)}s rest`;
      repsLeftVal.textContent = Math.max(0, total - state.completedReps);
      elapsedVal.textContent = E.fmtClock(elapsed);

      const avg = E.averageRepMs(state);
      paceVal.textContent = state.repSamples.length ? E.fmtClock(avg) : '—';
      avgTag.textContent = state.repSamples.length ? `avg ${E.fmtClock(avg)}/rep` : 'avg —';

      dialFill.setAttribute('stroke-dashoffset', (CIRC * (1 - frac)).toFixed(1));

      [...pipsEl.children].forEach((p, i) => {
        p.classList.toggle('done', i < state.completedReps);
        p.classList.toggle('current', i === state.completedReps && state.status !== 'complete');
      });

      const isBreak = state.status === 'break';
      dialCard.style.display = isBreak ? 'none' : 'flex';
      breakCard.style.display = isBreak ? 'flex' : 'none';
      if (isBreak) {
        const remaining = E.getBreakRemainingMs(state, now);
        breakCountdown.textContent = E.fmtClock(remaining);
        const pct = Math.max(0, Math.min(100, (remaining / state.config.breakMs) * 100));
        breakProgress.style.width = pct + '%';
        nextRepNum.textContent = state.completedReps + 1;
        breakRepsTotal.textContent = total;
      }

      const statusLabel = { idle: 'Idle', active: 'Working', break: 'Resting', paused: 'Paused', complete: 'Complete' }[state.status] || state.status;
      statusBadge.textContent = statusLabel.toUpperCase();
      statusVal.textContent = statusLabel;

      completeBanner.classList.toggle('show', state.status === 'complete');
      if (state.status === 'complete') {
        completeSub.textContent = `${total} reps in ${E.fmtClock(elapsed)}`;
      }

      startHint.style.display = state.status === 'idle' ? 'block' : 'none';

      if (state.status === 'idle') { repBtn.textContent = 'START'; repBtn.disabled = false; }
      else if (state.status === 'active') { repBtn.textContent = `LOG REP ${state.completedReps + 1} / ${total}`; repBtn.disabled = false; }
      else if (state.status === 'break') { repBtn.textContent = 'RESTING…'; repBtn.disabled = true; }
      else if (state.status === 'paused') { repBtn.textContent = 'PAUSED'; repBtn.disabled = true; }
      else if (state.status === 'complete') { repBtn.textContent = 'DONE 🔥'; repBtn.disabled = true; }

      pauseBtn.textContent = state.status === 'paused' ? 'Resume' : 'Pause';
      pauseBtn.disabled = state.status === 'idle' || state.status === 'complete';

      if (prevStatus === 'break' && state.status === 'active' && window.Sound) Sound.playBreakEnd();
      if (prevStatus !== 'complete' && state.status === 'complete' && window.Sound) Sound.playComplete();
      prevStatus = state.status;
    }

    setInterval(() => render(), 200);
  }
})();
