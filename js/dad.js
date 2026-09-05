(function () {
  const E = window.Engine;
  const sync = new Sync();
  document.getElementById('syncMode').textContent = sync.mode === 'firebase' ? 'live · firebase' : 'local only';

  let state = E.freshState({});
  let pipsBuilt = 0;
  let prevStatus = state.status;

  const soundBtn = document.getElementById('soundUnlockBtn');
  soundBtn.addEventListener('click', () => {
    try { if (window.Sound) Sound.unlock(); } catch (e) { /* ignore */ }
    soundBtn.textContent = '🔊 Sound on';
    soundBtn.disabled = true;
  });

  const statusBadge = document.getElementById('statusBadge');
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
  const statusVal = document.getElementById('statusVal');
  const setsVal = document.getElementById('setsVal');
  const idleHint = document.getElementById('idleHint');

  const CIRC = 2 * Math.PI * 100;
  dialFill.setAttribute('stroke-dasharray', CIRC.toFixed(1));

  const STATUS_LABEL = {
    idle: 'Idle', active: 'Working', break: 'Resting', paused: 'Paused', complete: 'Complete',
  };

  sync.pull().then((remote) => { if (remote) state = remote; render(); });
  sync.onUpdate((remote) => { state = remote; render(); });

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
    const effective = E.checkBreakElapsed(state, now);
    if (pipsBuilt !== effective.config.totalSets) buildPips();

    const total = E.totalReps(effective);
    const elapsed = E.getElapsedMs(effective, now);
    const frac = effective.completedReps / total;

    repsDone.textContent = effective.completedReps;
    repsTotal.textContent = total;
    repsSub.textContent = effective.completedReps === 1 ? 'rep' : 'reps';
    planLine.textContent = `${total} reps · ${effective.config.pushupsPerRep} pushups each · ${Math.round(effective.config.breakMs / 1000)}s rest`;
    repsLeftVal.textContent = Math.max(0, total - effective.completedReps);
    elapsedVal.textContent = E.fmtClock(elapsed);
    setsVal.textContent = `${effective.completedReps} / ${total}`;
    statusVal.textContent = STATUS_LABEL[effective.status] || effective.status;

    dialFill.setAttribute('stroke-dashoffset', (CIRC * (1 - frac)).toFixed(1));

    [...pipsEl.children].forEach((p, i) => {
      p.classList.toggle('done', i < effective.completedReps);
      p.classList.toggle('current', i === effective.completedReps && effective.status !== 'complete');
    });

    const isBreak = effective.status === 'break';
    dialCard.style.display = isBreak ? 'none' : 'flex';
    breakCard.style.display = isBreak ? 'flex' : 'none';
    if (isBreak) {
      const remaining = E.getBreakRemainingMs(effective, now);
      breakCountdown.textContent = E.fmtClock(remaining);
      const pct = Math.max(0, Math.min(100, (remaining / effective.config.breakMs) * 100));
      breakProgress.style.width = pct + '%';
      nextRepNum.textContent = effective.completedReps + 1;
      breakRepsTotal.textContent = total;
    }

    statusBadge.textContent = effective.status === 'idle' ? 'WATCHING' : (STATUS_LABEL[effective.status] || effective.status).toUpperCase();

    completeBanner.classList.toggle('show', effective.status === 'complete');
    if (effective.status === 'complete') completeSub.textContent = `${total} reps in ${E.fmtClock(elapsed)}`;

    idleHint.style.display = effective.status === 'idle' ? 'block' : 'none';

    if (prevStatus === 'break' && effective.status === 'active' && window.Sound) Sound.playBreakEnd();
    if (prevStatus !== 'complete' && effective.status === 'complete' && window.Sound) Sound.playComplete();
    prevStatus = effective.status;
  }

  setInterval(() => render(), 200);
})();
