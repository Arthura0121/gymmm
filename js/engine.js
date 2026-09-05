/* ============================================================
   engine.js — the single source of truth for workout state.
   No DOM, no rendering. Both me.js and dad.js consume this.

   Model: one "rep" = one full set of pushups (e.g. 30 pushups).
   You press the button once per rep. A real rest countdown runs
   after every rep except the last, ending in an alarm.
   repsPerSet is permanently locked to 1 — "sets" and "reps" are
   the same thing here; pushupsPerRep is purely a display label.
   ============================================================ */

const DEFAULT_CONFIG = {
  totalSets: 24,        // number of reps in the workout
  repsPerSet: 1,         // locked — do not expose in the UI
  breakMs: 45 * 1000,    // rest after each rep
  pushupsPerRep: 30,     // cosmetic label only, e.g. "30 pushups"
};

const MAX_REP_SAMPLES = 40;   // rolling window for the average

function fallbackRepMs(config) {
  // A rough starting guess before we have any real samples: ~0.8s/pushup.
  const pushups = (config && config.pushupsPerRep) || DEFAULT_CONFIG.pushupsPerRep;
  return Math.max(3000, pushups * 800);
}

function freshState(config) {
  const merged = { ...DEFAULT_CONFIG, ...config, repsPerSet: 1 };
  return {
    config: merged,
    status: 'idle',        // idle | active | break | paused | complete
    completedReps: 0,
    elapsedBaseMs: 0,       // frozen accumulated elapsed time
    segmentStart: null,     // epoch ms — when the running clock segment began
    lastRepAt: null,        // epoch ms — for measuring genuine rep duration
    breakEndTime: null,     // epoch ms — real target end of the current break
    prevStatus: null,       // used to resume correctly out of 'paused'
    repSamples: [],         // rolling ms-per-rep, genuine taps only
    finishedAt: null,
    updatedAt: Date.now(),
  };
}

/** Change the workout plan (reps / pushups-per-rep / break length). Always resets. */
function configureWorkout(state, partialConfig, now = Date.now()) {
  const next = freshState({ ...state.config, ...partialConfig });
  next.updatedAt = now;
  return next;
}

function totalReps(state) {
  return state.config.totalSets * state.config.repsPerSet;
}

function averageRepMs(state) {
  if (!state.repSamples.length) return fallbackRepMs(state.config);
  const sum = state.repSamples.reduce((a, b) => a + b, 0);
  return sum / state.repSamples.length;
}

/** Live elapsed ms, given the state and the current time. */
function getElapsedMs(state, now = Date.now()) {
  let ms = state.elapsedBaseMs;
  if (state.segmentStart != null) ms += now - state.segmentStart;
  return Math.max(0, ms);
}

function getCurrentSet(state) {
  return Math.min(
    Math.floor(state.completedReps / state.config.repsPerSet),
    state.config.totalSets - 1
  );
}

function getBreakRemainingMs(state, now = Date.now()) {
  if (state.status !== 'break' || !state.breakEndTime) return 0;
  return Math.max(0, state.breakEndTime - now);
}

/* ---------------- mutations (all return a NEW state object) ---------------- */

function startWorkout(state, now = Date.now()) {
  return {
    ...freshState(state.config),
    status: 'active',
    segmentStart: now,
    lastRepAt: now,
    updatedAt: now,
  };
}

function resetWorkout(state, now = Date.now()) {
  return { ...freshState(state.config), updatedAt: now };
}

/** The athlete genuinely did one rep — tap the button. */
function logRep(state, now = Date.now()) {
  if (state.status !== 'active') return state;
  if (state.completedReps >= totalReps(state)) return state;

  const duration = state.lastRepAt ? now - state.lastRepAt : fallbackRepMs(state.config);
  const repSamples = [...state.repSamples, duration].slice(-MAX_REP_SAMPLES);
  const completedReps = state.completedReps + 1;
  const total = totalReps(state);

  let next = {
    ...state,
    completedReps,
    repSamples,
    lastRepAt: now,
    updatedAt: now,
  };

  if (completedReps >= total) {
    next = {
      ...next,
      status: 'complete',
      elapsedBaseMs: getElapsedMs(state, now),
      segmentStart: null,
      breakEndTime: null,
      finishedAt: now,
    };
  } else if (completedReps % state.config.repsPerSet === 0) {
    next = { ...next, status: 'break', breakEndTime: now + state.config.breakMs };
  }

  return next;
}

/** Called on a timer tick; flips break -> active once the countdown ends. */
function checkBreakElapsed(state, now = Date.now()) {
  if (state.status === 'break' && state.breakEndTime && now >= state.breakEndTime) {
    return { ...state, status: 'active', breakEndTime: null, lastRepAt: now, updatedAt: now };
  }
  return state;
}

function pauseWorkout(state, now = Date.now()) {
  if (state.status !== 'active' && state.status !== 'break') return state;
  return {
    ...state,
    status: 'paused',
    prevStatus: state.status,
    elapsedBaseMs: getElapsedMs(state, now),
    segmentStart: null,
    updatedAt: now,
  };
}

function resumeWorkout(state, now = Date.now()) {
  if (state.status !== 'paused') return state;
  const resumedStatus = state.prevStatus || 'active';
  let breakEndTime = state.breakEndTime;
  if (resumedStatus === 'break') {
    // extend the break by whatever time was spent paused
    breakEndTime = now + Math.max(0, (state.breakEndTime || now) - state.updatedAt);
  }
  return {
    ...state,
    status: resumedStatus,
    prevStatus: null,
    segmentStart: now,
    breakEndTime,
    lastRepAt: resumedStatus === 'active' ? now : state.lastRepAt,
    updatedAt: now,
  };
}

/**
 * Manually add N reps without actually doing them ("adjust").
 * Fast-forwards elapsed time using the athlete's own average rep pace,
 * plus a full break for every set boundary skipped over — including the
 * one you're currently resting in, if you cheat again mid-break.
 */
function adjustAdd(state, n, now = Date.now()) {
  if (n <= 0) return state;
  const total = totalReps(state);
  if (state.completedReps >= total) return state; // already complete — nothing to add

  const avg = averageRepMs(state);
  const perSet = state.config.repsPerSet;

  let completedReps = state.completedReps;
  let elapsedBaseMs = getElapsedMs(state, now);

  // If we're currently resting, cheating means skipping the REST of the
  // rest — pay for whatever time hasn't actually ticked yet, so this
  // pending break is never left uncredited (and never double-counted).
  if (state.status === 'break') {
    elapsedBaseMs += getBreakRemainingMs(state, now);
  }

  let landedOnBoundary = false;
  let didComplete = false;

  for (let i = 1; i <= n; i++) {
    if (completedReps >= total) break;
    completedReps += 1;
    elapsedBaseMs += avg;

    if (completedReps >= total) { didComplete = true; break; }

    if (completedReps % perSet === 0) {
      if (i < n) {
        elapsedBaseMs += state.config.breakMs; // skipped straight through this break
      } else {
        landedOnBoundary = true; // last rep of this batch — take a real break now
      }
    }
  }

  if (didComplete) {
    return {
      ...state,
      completedReps,
      elapsedBaseMs,
      segmentStart: null,
      status: 'complete',
      breakEndTime: null,
      finishedAt: now,
      updatedAt: now,
    };
  }

  if (landedOnBoundary) {
    return {
      ...state,
      completedReps,
      elapsedBaseMs,
      segmentStart: now, // clock keeps ticking naturally if you don't cheat further
      status: 'break',
      breakEndTime: now + state.config.breakMs,
      updatedAt: now,
    };
  }

  // Not landed on a boundary, not complete: we're now genuinely mid-set,
  // so status must resolve to 'active' (or stay 'paused') — never left
  // hanging as a stale 'break'/'complete' from before this call.
  return {
    ...state,
    completedReps,
    elapsedBaseMs,
    segmentStart: state.status === 'paused' ? null : now,
    status: state.status === 'paused' ? 'paused' : 'active',
    breakEndTime: null,
    lastRepAt: now,
    updatedAt: now,
  };
}

/** Manually remove N reps, unwinding elapsed time (and skipped breaks) to match. */
function adjustRemove(state, n, now = Date.now()) {
  if (n <= 0) return state;
  const avg = averageRepMs(state);
  const perSet = state.config.repsPerSet;

  let completedReps = state.completedReps;
  let elapsedBaseMs = getElapsedMs(state, now);

  // If we're currently resting, only the time actually spent so far in
  // THIS break has been credited — refund exactly that, not a full break,
  // or we'd wipe out time from reps that came before it too.
  if (state.status === 'break') {
    elapsedBaseMs -= (state.config.breakMs - getBreakRemainingMs(state, now));
  }

  for (let i = 0; i < n; i++) {
    if (completedReps <= 0) break;
    const isPendingBreakBoundary = i === 0 && state.status === 'break' && completedReps % perSet === 0;
    if (completedReps % perSet === 0 && !isPendingBreakBoundary) {
      elapsedBaseMs -= state.config.breakMs; // uncross an already-paid break boundary
    }
    completedReps -= 1;
    elapsedBaseMs -= avg;
  }

  elapsedBaseMs = Math.max(0, elapsedBaseMs);
  const wasRunnable = state.status !== 'idle';

  return {
    ...state,
    completedReps,
    elapsedBaseMs,
    segmentStart: wasRunnable && state.status !== 'paused' ? now : null,
    status: wasRunnable ? (state.status === 'paused' ? 'paused' : 'active') : 'idle',
    breakEndTime: null,
    finishedAt: null,
    updatedAt: now,
  };
}

function fmtClock(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (x) => String(x).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

window.Engine = {
  DEFAULT_CONFIG,
  freshState,
  configureWorkout,
  totalReps,
  averageRepMs,
  getElapsedMs,
  getCurrentSet,
  getBreakRemainingMs,
  startWorkout,
  resetWorkout,
  logRep,
  checkBreakElapsed,
  pauseWorkout,
  resumeWorkout,
  adjustAdd,
  adjustRemove,
  fmtClock,
};
