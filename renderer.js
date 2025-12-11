import { SudokuBoard } from './sudoku/board.js';
import { generatePuzzle } from './sudoku/generator.js';
import { createGrid, updateGrid, highlightSelection } from './sudoku/ui.js';

function createDefaultStats() {
  const base = { played: 0, wins: 0, totalTime: 0, bestTime: null, errors: 0 };
  return {
    solved: 0,
    totalTime: 0,
    overall: { ...base },
    difficulties: {
      easy: { ...base },
      medium: { ...base },
      hard: { ...base },
      expert: { ...base }
    }
  };
}

function mergeStats(base, incoming) {
  const merged = createDefaultStats();
  const source = incoming || {};
  merged.solved = source.solved ?? base.solved ?? 0;
  merged.totalTime = source.totalTime ?? base.totalTime ?? 0;
  Object.keys(merged.difficulties).forEach((diff) => {
    merged.difficulties[diff] = {
      ...merged.difficulties[diff],
      ...(source.difficulties?.[diff] || {})
    };
  });
  merged.overall = { ...merged.overall, ...(source.overall || {}) };
  return merged;
}

const gridEl = document.getElementById('grid');
const difficultySelect = document.getElementById('difficultySelect');
const difficultyRadios = Array.from(document.querySelectorAll('input[name=\"difficulty\"]'));
const newGameBtn = document.getElementById('newGameBtn');
const settingsBtn = document.getElementById('settingsBtn');
const numberButtons = Array.from(document.querySelectorAll('.num-btn'));
const notesToggle = document.getElementById('notesToggle');
const themeToggle = document.getElementById('themeToggle');
const timerEl = document.getElementById('timer');
const solvedCountEl = document.getElementById('solvedCount');
const totalTimeEl = document.getElementById('totalTime');
const loadingIndicator = document.getElementById('loadingIndicator');
const modal = document.getElementById('newGameModal');
const startNewBtn = document.getElementById('startNewBtn');
const restartBtn = document.getElementById('restartBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const gameMetaText = document.getElementById('gameMetaText');
const gameDifficultyEl = document.getElementById('gameDifficulty');
const notesToggleLabel = document.querySelector('label[for="notesToggle"]');
const themeToggleLabel = document.querySelector('label[for="themeToggle"]');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const highlightsSetting = document.getElementById('highlightsSetting');
const autoNotesSetting = document.getElementById('autoNotesSetting');
const conflictSetting = document.getElementById('conflictSetting');
const statsContainer = document.getElementById('statsContainer');

const DEFAULT_PREFS = {
  theme: 'light',
  lastDifficulty: 'medium',
  stats: createDefaultStats(),
  settings: {
    highlights: true,
    autoNotes: true,
    conflictHighlight: true
  },
  gameState: null
};
const STORAGE_KEY = 'sudoku_prefs';

let cells = [];
let board = null;
let selected = null;
let notesMode = false;
let activeNumber = null;
let timerInterval = null;
let secondsElapsed = 0;
let stats = createDefaultStats();
let userSettings = { ...DEFAULT_PREFS.settings };
let dealing = false;
let loadingGame = false;
let completedDigits = new Set();
let gameStats = { errors: 0, moves: 0 };
const undoStack = [];
const redoStack = [];
let conflictCache = new Set();
let lastHint = null;
let wakeLock = null;
let wakeLockRequested = false;
let pendingNumberClear = false;

function readLocalPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_PREFS,
      ...parsed,
      stats: mergeStats(DEFAULT_PREFS.stats, parsed.stats || createDefaultStats()),
      settings: { ...DEFAULT_PREFS.settings, ...(parsed.settings || {}) }
    };
  } catch (e) {
    console.error('Failed to read local prefs', e);
    return { ...DEFAULT_PREFS };
  }
}

function writeLocalPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to write local prefs', e);
  }
}

async function getPreferences() {
  if (window.api?.getPreferences) {
    try {
      const prefs = await window.api.getPreferences();
      writeLocalPrefs(prefs);
      return prefs;
    } catch (e) {
      console.error('Failed to load prefs from API, falling back to local', e);
      return readLocalPrefs();
    }
  }
  return readLocalPrefs();
}

async function setPreferences(update) {
  if (window.api?.setPreferences) {
    const merged = await window.api.setPreferences(update);
    writeLocalPrefs(merged);
    return merged;
  }
  const merged = { ...readLocalPrefs(), ...update };
  writeLocalPrefs(merged);
  return merged;
}

async function updateStatsPrefs(statsUpdate) {
  if (window.api?.updateStats) {
    const stats = await window.api.updateStats(statsUpdate);
    const current = readLocalPrefs();
    writeLocalPrefs({ ...current, stats });
    return stats;
  }
  const current = readLocalPrefs();
  const stats = { ...current.stats, ...statsUpdate };
  writeLocalPrefs({ ...current, stats });
  return stats;
}

async function loadPreferences() {
  let restored = false;
  const prefs = await getPreferences();
  const local = readLocalPrefs();
  const merged = {
    ...local,
    ...prefs,
    stats: mergeStats(local.stats || createDefaultStats(), prefs.stats || createDefaultStats()),
    settings: { ...DEFAULT_PREFS.settings, ...(local.settings || {}), ...(prefs.settings || {}) }
  };
  merged.gameState = prefs.gameState || local.gameState || null;
  const savedTheme = merged.theme || 'light';
  themeToggle.checked = savedTheme === 'dark';
  difficultySelect.value = prefs.lastDifficulty || 'medium';
  difficultyRadios.forEach((r) => {
    r.checked = r.value === difficultySelect.value;
  });
  stats = merged.stats || stats;
  userSettings = merged.settings || { ...DEFAULT_PREFS.settings };
  if (solvedCountEl) {
    solvedCountEl.textContent = stats.solved ?? stats.overall?.wins ?? 0;
  }
  updateTotalTimeDisplay();
  applyTheme(savedTheme);
  applySettings(userSettings);
  renderSettingsUI();
  renderStats();
  restored = restoreGameState(merged.gameState);
  if (!restored) {
    updateGameMeta({ difficulty: difficultySelect.value, id: null });
  }
  return restored;
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  themeToggle.checked = theme === 'dark';
  updateThemeMeta(theme);
  syncToggleKnob(themeToggle, themeToggleLabel);
}

function setNotesMode(on, { save = true, announce = false } = {}) {
  const currentActive = activeNumber;
  notesMode = on;
  notesToggle.checked = !on;
  syncToggleKnob(notesToggle, notesToggleLabel);
  document.body.classList.toggle('notes-mode', on);
  if (announce) showStatus(on ? 'Notes mode on' : 'Notes mode off');
  if (currentActive) {
    setActiveNumber(currentActive, true);
  } else {
    refreshGrid(null, lastHint);
  }
  if (save) saveState();
}

function updateGameMeta(meta) {
  if (!meta) return;
  const diff = meta.difficulty || difficultySelect.value || 'medium';
  const id = meta.id || '-----';
  const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);
  if (gameDifficultyEl) {
    gameDifficultyEl.textContent = diffLabel;
  }
  if (gameMetaText) {
    gameMetaText.textContent = `${diffLabel} #${id}`;
  }
}

window.addEventListener('beforeunload', () => {
  saveState();
});

async function requestWakeLock() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    });
  } catch (err) {
    console.warn('Wake Lock request failed', err);
  }
}

function setupWakeLock() {
  const trigger = () => {
    if (wakeLockRequested) return;
    wakeLockRequested = true;
    requestWakeLock();
  };
  ['pointerdown', 'touchstart', 'keydown'].forEach((evt) =>
    document.addEventListener(evt, trigger, { once: true, passive: true })
  );
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !wakeLock && wakeLockRequested) {
      requestWakeLock();
    }
  });
}

function updateThemeMeta(theme) {
  const light = '#eef1f7';
  const dark = '#0a0b0c';
  const current = theme === 'dark' ? dark : light;
  const metaMain = document.getElementById('themeColor');
  const metaLight = document.getElementById('themeColorLight');
  const metaDark = document.getElementById('themeColorDark');
  if (metaMain) metaMain.setAttribute('content', current);
  if (metaLight) metaLight.setAttribute('content', light);
  if (metaDark) metaDark.setAttribute('content', dark);
}

function snapshotBoard() {
  return {
    grid: board.grid.map((row) => [...row]),
    notes: board.notes.map((row) => row.map((set) => Array.from(set))),
    selected: selected ? { ...selected } : null,
    notesMode,
    activeNumber,
    gameStats: { ...gameStats }
  };
}

function restoreBoard(snapshot) {
  if (!snapshot) return;
  board.grid = snapshot.grid.map((row) => [...row]);
  board.notes = snapshot.notes.map((row) => row.map((vals) => new Set(vals)));
  selected = snapshot.selected ? { ...snapshot.selected } : null;
  setNotesMode(snapshot.notesMode, { save: false });
  setActiveNumber(snapshot.activeNumber || null, true);
  gameStats = snapshot.gameStats ? { ...snapshot.gameStats } : { errors: 0, moves: 0 };
  updateGameMeta(snapshot.meta);
}

function pushUndo(snapshot) {
  undoStack.push(snapshot);
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
}

function computeCompletedDigits() {
  if (!board) return { completedDigits: new Set(), newlyCompleted: new Set() };
  const counts = Array(10).fill(0);
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const v = board.getValue(r, c);
      if (v && board.solution[r][c] === v) {
        counts[v] += 1;
      }
    }
  }
  const next = new Set();
  for (let v = 1; v <= 9; v++) {
    if (counts[v] === 9) next.add(v);
  }
  const newlyCompleted = new Set([...next].filter((v) => !completedDigits.has(v)));
  completedDigits = next;
  return { completedDigits, newlyCompleted };
}

function refreshGrid(conflicts = null, hint = null) {
  if (!board) return;
  const allowConflicts = userSettings.conflictHighlight !== false;
  if (!allowConflicts) {
    conflictCache = new Set();
  }
  if (conflicts instanceof Set) {
    conflictCache = new Set(conflicts);
  }
  const conflictsToUse =
    allowConflicts && conflicts instanceof Set
      ? conflictCache
      : allowConflicts && board
      ? new Set(board.computeConflicts())
      : new Set();
  if (!(conflicts instanceof Set) && board && allowConflicts) {
    conflictCache = new Set(conflictsToUse);
  }
  lastHint = hint;
  const { completedDigits: done, newlyCompleted } = computeCompletedDigits();
  completedDigits = done;
  const cleared = updateNumberPad(done);
  if (cleared) {
    selected = null;
  }
  const currentActive = cleared ? null : activeNumber;
  updateGrid(
    cells,
    board,
    selected,
    conflictsToUse,
    hint,
    done,
    newlyCompleted,
    currentActive,
    userSettings.highlights !== false
  );
}

function updateNumberPad(doneSet) {
  let activeCleared = false;
  numberButtons.forEach((btn) => {
    const val = parseInt(btn.dataset.val, 10);
    const isDone = doneSet.has(val);
    btn.classList.toggle('disabled', isDone);
    if (isDone && activeNumber === val) {
      activeCleared = true;
    }
  });
  if (doneSet.size === 9 && activeNumber !== null) {
    activeCleared = true;
  }
  if (activeCleared) {
    activeNumber = null;
    numberButtons.forEach((btn) => btn.classList.remove('active'));
  }
  return activeCleared;
}

function persistPreferences() {
  saveState();
}

function persistStats() {
  updateStatsPrefs(stats);
}

function recordGameStart(difficulty) {
  const diffStats = stats.difficulties?.[difficulty] || stats.difficulties.medium;
  diffStats.played += 1;
  stats.overall.played += 1;
}

function recordGameEnd(difficulty, elapsedSeconds, errorsCount) {
  const diffStats = stats.difficulties?.[difficulty] || stats.difficulties.medium;
  diffStats.wins += 1;
  diffStats.totalTime += elapsedSeconds;
  diffStats.bestTime =
    diffStats.bestTime === null ? elapsedSeconds : Math.min(diffStats.bestTime, elapsedSeconds);
  diffStats.errors += errorsCount;

  stats.overall.wins += 1;
  stats.overall.totalTime += elapsedSeconds;
  stats.overall.bestTime =
    stats.overall.bestTime === null ? elapsedSeconds : Math.min(stats.overall.bestTime, elapsedSeconds);
  stats.overall.errors += errorsCount;
  stats.solved = stats.overall.wins;
  stats.totalTime = stats.overall.totalTime;
}

function setLoadingGame(on) {
  loadingGame = on;
  document.body.classList.toggle('loading-game', on);
  if (loadingIndicator) {
    loadingIndicator.setAttribute('aria-hidden', on ? 'false' : 'true');
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function saveState() {
  const payload = {
    theme: themeToggle.checked ? 'dark' : 'light',
    lastDifficulty: difficultySelect.value,
    stats,
    settings: userSettings,
    gameState: buildGameState()
  };
  writeLocalPrefs(payload);
  setPreferences(payload);
}

function buildGameState() {
  if (!board) return null;
  const notes = board.notes.map((row) => row.map((set) => Array.from(set)));
  const puzzle = board.puzzle
    ? board.puzzle.map((row) => [...row])
    : board.givens.map((row, rIdx) =>
        row.map((isGiven, cIdx) => (isGiven ? board.getValue(rIdx, cIdx) : 0))
      );
  return {
    puzzle,
    solution: board.solution.map((row) => [...row]),
    grid: board.grid.map((row) => [...row]),
    notes,
    difficulty: difficultySelect.value,
    elapsed: secondsElapsed,
    notesMode,
    activeNumber,
    gameStats,
    completedDigits: Array.from(completedDigits),
    conflicts: Array.from(conflictCache),
    meta: {
      difficulty: difficultySelect.value,
      id: board?.id || null
    }
  };
}

function restoreGameState(state) {
  if (!state || !state.puzzle || !state.solution) return false;
  try {
    board = new SudokuBoard(state.puzzle, state.solution);
    board.id = state.meta?.id || board.id || Math.floor(10000 + Math.random() * 90000);
    const grid = state.grid || state.puzzle;
    board.grid = grid.map((row) => [...row]);
    board.notes = (state.notes || Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => []))).map(
      (row) => row.map((vals) => new Set(vals))
    );
    completedDigits = new Set(state.completedDigits || []);
    const computedConflicts = userSettings.conflictHighlight === false ? [] : board.computeConflicts();
    conflictCache = new Set(computedConflicts);
    selected = null;
    difficultySelect.value = state.difficulty || difficultySelect.value;
    refreshGrid(conflictCache, null);
    gridEl.classList.remove('dealing');
    cells.flat().forEach((cell) => cell.classList.add('revealed'));
    stopTimer();
    secondsElapsed = state.elapsed || 0;
    updateTimer();
    document.body.classList.add('timer-ready', 'in-game');
    startTimer(secondsElapsed);
    setNotesMode(!!state.notesMode, { save: false });
    setActiveNumber(null, true, true);
    undoStack.length = 0;
    redoStack.length = 0;
    gameStats = state.gameStats ? { ...state.gameStats } : { errors: 0, moves: 0 };
    updateNumberPad(completedDigits);
    updateGameMeta({ difficulty: difficultySelect.value, id: board.id });
    return true;
  } catch (e) {
    console.error('Failed to restore game state', e);
    return false;
  }
}

function startTimer(initialSeconds = 0) {
  secondsElapsed = initialSeconds;
  updateTimer();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    secondsElapsed += 1;
    updateTimer();
    if (secondsElapsed % 15 === 0) saveState();
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimer() {
  const hours = Math.floor(secondsElapsed / 3600);
  const minutes = Math.floor((secondsElapsed % 3600) / 60);
  const seconds = secondsElapsed % 60;
  if (hours > 0) {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    timerEl.textContent = `${hours}:${mm}:${ss}`;
  } else {
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
  }
}

function updateTotalTimeDisplay() {
  if (!totalTimeEl) return;
  const totalSeconds = stats.totalTime ?? stats.overall?.totalTime ?? 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  totalTimeEl.textContent = parts.join(' ');
}

function formatTime(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function applySettings(next = userSettings) {
  userSettings = { ...DEFAULT_PREFS.settings, ...(next || {}) };
  document.body.classList.toggle('no-highlights', !userSettings.highlights);
  if (highlightsSetting) highlightsSetting.checked = !!userSettings.highlights;
  if (autoNotesSetting) autoNotesSetting.checked = !!userSettings.autoNotes;
  if (conflictSetting) conflictSetting.checked = !!userSettings.conflictHighlight;
  refreshGrid();
}

function renderSettingsUI() {
  applySettings(userSettings);
}

function renderStats() {
  if (!statsContainer) return;
  const diffs = ['easy', 'medium', 'hard', 'expert'];
  const makeRow = (label, data) => {
    const winRate = data.played ? Math.round((data.wins / data.played) * 100) : 0;
    const avgTime = data.wins ? data.totalTime / data.wins : null;
    return `
      <div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-line"><span>Jogos</span><strong>${data.played}</strong></div>
        <div class="stat-line"><span>Vitórias</span><strong>${data.wins} (${winRate || 0}%)</strong></div>
        <div class="stat-line"><span>Tempo médio</span><strong>${formatTime(avgTime)}</strong></div>
        <div class="stat-line"><span>Melhor tempo</span><strong>${formatTime(data.bestTime)}</strong></div>
        <div class="stat-line"><span>Erros</span><strong>${data.errors}</strong></div>
      </div>
    `;
  };
  const overall = stats.overall || createDefaultStats().overall;
  const cards = [
    makeRow('Geral', overall),
    ...diffs.map((d) => makeRow(d.charAt(0).toUpperCase() + d.slice(1), stats.difficulties?.[d] || createDefaultStats().difficulties[d]))
  ];
  statsContainer.innerHTML = cards.join('');
}

function init() {
  cells = createGrid(gridEl, handleCellClick);
  attachEvents();
  setupWakeLock();
  loadPreferences().then((restored) => {
    if (!restored) {
      openNewGameModal();
    } else {
      document.body.classList.add('timer-ready', 'in-game');
    }
  });
}

function attachEvents() {
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('click', handleClickAway);
  newGameBtn.addEventListener('click', openNewGameModal);
  startNewBtn.addEventListener('click', startNewFromModal);
  restartBtn.addEventListener('click', restartPuzzle);
  cancelModalBtn.addEventListener('click', closeNewGameModal);
  settingsBtn.addEventListener('click', openSettingsModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeNewGameModal();
    }
  });
  numberButtons.forEach((btn) => btn.addEventListener('click', () => selectNumber(btn)));
  undoBtn.addEventListener('click', undoMove);
  redoBtn.addEventListener('click', redoMove);
  document.getElementById('closeCompleteBtn')?.addEventListener('click', closeCompletionModal);
  document.getElementById('newFromCompleteBtn')?.addEventListener('click', () => {
    closeCompletionModal();
    openNewGameModal();
  });
  const completeModal = document.getElementById('completeModal');
  completeModal?.addEventListener('click', (e) => {
    if (e.target === completeModal) {
      closeCompletionModal();
    }
  });
  notesToggle.addEventListener('change', () => {
    setNotesMode(!notesToggle.checked, { announce: true });
  });
  themeToggle.addEventListener('change', () => {
    applyTheme(themeToggle.checked ? 'dark' : 'light');
    persistPreferences();
  });
  closeSettingsBtn?.addEventListener('click', closeSettingsModal);
  settingsModal?.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      closeSettingsModal();
    }
  });
  [highlightsSetting, autoNotesSetting, conflictSetting].forEach((input) => {
    input?.addEventListener('change', () => {
      userSettings = {
        ...userSettings,
        highlights: highlightsSetting?.checked ?? userSettings.highlights,
        autoNotes: autoNotesSetting?.checked ?? userSettings.autoNotes,
        conflictHighlight: conflictSetting?.checked ?? userSettings.conflictHighlight
      };
      applySettings(userSettings);
      saveState();
    });
  });
  if (notesToggle && notesToggleLabel) {
    setupDraggableToggle(notesToggle, notesToggleLabel, (checked) =>
      setNotesMode(!checked, { announce: true })
    );
  }
  if (themeToggle && themeToggleLabel) {
    setupDraggableToggle(themeToggle, themeToggleLabel, (checked) => {
      applyTheme(checked ? 'dark' : 'light');
      persistPreferences();
    });
  }
  let resizeRaf = null;
  window.addEventListener('resize', () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      syncToggleKnob(notesToggle, notesToggleLabel);
      syncToggleKnob(themeToggle, themeToggleLabel);
    });
  });
  difficultySelect.addEventListener('change', persistPreferences);
}

async function newGame() {
  if (dealing || loadingGame) return;
  const loadStart = performance.now();
  setLoadingGame(true);
  closeNewGameModal();
  await wait(30);
  const difficulty = difficultySelect.value;
  let nextPuzzle = null;
  try {
    const { puzzle, solution } = generatePuzzle(difficulty);
    nextPuzzle = puzzle;
    board = new SudokuBoard(puzzle, solution);
    board.id = Math.floor(10000 + Math.random() * 90000);
    recordGameStart(difficulty);
    selected = null;
    setNotesMode(false, { save: false });
    setActiveNumber(null, true);
    clearReveals();
    gridEl.classList.add('dealing');
    stopTimer();
    secondsElapsed = 0;
    updateTimer();
    completedDigits = new Set();
    gameStats = { errors: 0, moves: 0 };
    conflictCache = new Set();
    lastHint = null;
    undoStack.length = 0;
    redoStack.length = 0;
    refreshGrid();
    updateGameMeta({ difficulty, id: board.id });
    saveState();
    renderStats();
  } catch (e) {
    console.error('Failed to start new game', e);
  } finally {
    const elapsed = performance.now() - loadStart;
    const minimum = 2000;
    if (elapsed < minimum) {
      await wait(minimum - elapsed);
    }
    setLoadingGame(false);
    // Give the overlay time to fade out before dealing.
    await wait(350);
    if (nextPuzzle) {
      gridEl.classList.add('dealing');
      document.body.classList.add('dealing-active', 'in-game');
      document.body.classList.remove('timer-ready');
      runDealAnimation(nextPuzzle, () => {
        document.body.classList.remove('dealing-active');
        document.body.classList.add('timer-ready');
        startTimer();
      });
    } else {
      gridEl.classList.remove('dealing');
    }
  }
}

function handleCellClick(row, col) {
  if (dealing) return;
  pendingNumberClear = false;
  selected = { row, col };
  highlightSelection(cells, selected, board, activeNumber, userSettings.highlights !== false);
  lastHint = null;
  const val = board?.getValue(row, col) || 0;
  if (!board || board.isGiven(row, col)) return;
  if (notesMode) {
    if (!activeNumber) return;
    const prev = snapshotBoard();
    board.toggleNote(row, col, activeNumber);
    pushUndo(prev);
  } else if (activeNumber) {
    const prev = snapshotBoard();
    const current = board.getValue(row, col);
    if (current === activeNumber) {
      board.clearValue(row, col);
      board.clearNotes(row, col);
    } else {
      board.setValue(row, col, activeNumber);
      if (userSettings.autoNotes !== false) {
        board.clearNotesInPeers(row, col, activeNumber);
      }
    }
    pushUndo(prev);
  }
  const conflicts = userSettings.conflictHighlight === false ? new Set() : board.computeConflicts();
  refreshGrid(conflicts);
  saveState();
  checkComplete();
}

function handleClickAway(e) {
  if (
    e.target.closest('.cell') ||
    e.target.closest('.actions') ||
    e.target.closest('.panel') ||
    e.target.closest('.toggle') ||
    e.target.closest('.toggle-row') ||
    e.target.closest('.theme-switch') ||
    e.target.closest('.number-pad') ||
    e.target.closest('.num-btn')
  ) {
    return;
  }
  if (selected) {
    selected = null;
    pendingNumberClear = activeNumber !== null;
    highlightSelection(cells, selected, board, activeNumber, userSettings.highlights !== false);
    return;
  }
  if (activeNumber !== null) {
    setActiveNumber(null, true, true);
    pendingNumberClear = false;
    highlightSelection(cells, selected, board, activeNumber, userSettings.highlights !== false);
    return;
  }
  pendingNumberClear = false;
}

function selectNumber(button) {
  if (dealing) return;
  pendingNumberClear = false;
  const val = parseInt(button.dataset.val, 10);
  if (completedDigits.has(val)) {
    setActiveNumber(null, false, true);
    return;
  }
  if (activeNumber === val) {
    setActiveNumber(null, false, true);
  } else {
    setActiveNumber(val, false, true);
  }
}

function setActiveNumber(val, skipSave = false, clearSelection = false) {
  pendingNumberClear = false;
  if (val && completedDigits.has(val)) {
    val = null;
  }
  if (clearSelection) {
    selected = null;
  }
  activeNumber = val;
  numberButtons.forEach((btn) => {
    btn.classList.toggle('active', parseInt(btn.dataset.val, 10) === val);
  });
  document.body.classList.toggle('has-active-number', !!val);
  if (val) showStatus(`Number ${val} selected`);
  if (!skipSave) saveState();
  refreshGrid();
}

function undoMove() {
  if (!board || undoStack.length === 0) {
    showStatus('Nothing to undo');
    return;
  }
  lastHint = null;
  const prev = undoStack.pop();
  redoStack.push(snapshotBoard());
  restoreBoard(prev);
  const conflicts = userSettings.conflictHighlight === false ? new Set() : board.computeConflicts();
  refreshGrid(conflicts);
  saveState();
  showStatus('Undo');
}

function redoMove() {
  if (!board || redoStack.length === 0) {
    showStatus('Nothing to redo');
    return;
  }
  lastHint = null;
  const next = redoStack.pop();
  undoStack.push(snapshotBoard());
  restoreBoard(next);
  const conflicts = userSettings.conflictHighlight === false ? new Set() : board.computeConflicts();
  refreshGrid(conflicts);
  saveState();
  showStatus('Redo');
}

function handleKeyDown(e) {
  if (dealing) return;
  if (!board) return;
  pendingNumberClear = false;
  if (!selected) selected = { row: 0, col: 0 };
  const key = e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
    e.preventDefault();
    moveSelection(key);
    return;
  }
  if (key >= '1' && key <= '9') {
    setValue(parseInt(key, 10));
    return;
  }
  if (key === 'Backspace' || key === 'Delete' || key === '0') {
    clearSelectedCell();
  }
  if (key.toLowerCase() === 'n') {
    setNotesMode(!notesMode, { announce: true });
  }
}

function moveSelection(key) {
  const delta = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1]
  }[key];
  selected = {
    row: Math.min(8, Math.max(0, selected.row + delta[0])),
    col: Math.min(8, Math.max(0, selected.col + delta[1]))
  };
  highlightSelection(cells, selected, board, activeNumber, userSettings.highlights !== false);
}

function setValue(val) {
  if (completedDigits.has(val)) {
    setActiveNumber(null, true);
    return;
  }
  if (!board || !selected || board.isGiven(selected.row, selected.col)) return;
  lastHint = null;
  if (notesMode) {
    const prev = snapshotBoard();
    board.toggleNote(selected.row, selected.col, val);
    pushUndo(prev);
  } else {
    const prev = snapshotBoard();
    const current = board.getValue(selected.row, selected.col);
    if (current === val) {
      board.clearValue(selected.row, selected.col);
      board.clearNotes(selected.row, selected.col);
    } else {
      board.setValue(selected.row, selected.col, val);
      if (userSettings.autoNotes !== false) {
        board.clearNotesInPeers(selected.row, selected.col, val);
      }
      if (val !== board.solution[selected.row][selected.col]) {
        gameStats.errors += 1;
      }
    }
    gameStats.moves += 1;
    pushUndo(prev);
  }
  const conflicts = userSettings.conflictHighlight === false ? new Set() : board.computeConflicts();
  refreshGrid(conflicts);
  saveState();
  checkComplete();
}

function clearSelectedCell() {
  if (!board || !selected || board.isGiven(selected.row, selected.col)) return;
  lastHint = null;
  const prev = snapshotBoard();
  board.clearValue(selected.row, selected.col);
  board.clearNotes(selected.row, selected.col);
  gameStats.moves += 1;
  pushUndo(prev);
  const conflicts = userSettings.conflictHighlight === false ? new Set() : board.computeConflicts();
  refreshGrid(conflicts);
  saveState();
}

function clearReveals() {
  cells.flat().forEach((cell) => cell.classList.remove('revealed'));
  conflictCache = new Set();
}

function openNewGameModal() {
  modal.classList.add('show');
  const current = difficultySelect.value || 'medium';
  difficultyRadios.forEach((r) => {
    r.checked = r.value === current;
  });
}

function closeNewGameModal() {
  modal.classList.remove('show');
}

function openSettingsModal() {
  if (!settingsModal) return;
  renderSettingsUI();
  renderStats();
  settingsModal.classList.add('show');
}

function closeSettingsModal() {
  settingsModal?.classList.remove('show');
}

function startNewFromModal() {
  const chosen = difficultyRadios.find((r) => r.checked)?.value || 'medium';
  difficultySelect.value = chosen;
  newGame();
}

function restartPuzzle() {
  if (!board) {
    closeNewGameModal();
    return;
  }
  stopTimer();
  secondsElapsed = 0;
  updateTimer();
  board.resetToPuzzle();
  selected = null;
  completedDigits = new Set();
  gameStats = { errors: 0, moves: 0 };
  undoStack.length = 0;
  redoStack.length = 0;
  lastHint = null;
  refreshGrid();
  document.body.classList.add('dealing-active', 'in-game');
  document.body.classList.remove('timer-ready');
  setNotesMode(false, { save: false });
  setActiveNumber(null, true);
  closeNewGameModal();
  clearReveals();
  gridEl.classList.add('dealing');
  runDealAnimation(board.puzzle, () => {
    document.body.classList.remove('dealing-active');
    document.body.classList.add('timer-ready');
    startTimer();
  });
  showStatus('Puzzle restarted');
}

function clearBoardChanges() {
  if (!board) return;
  lastHint = null;
  board.resetToPuzzle();
  selected = null;
  completedDigits = new Set();
  gameStats = { errors: 0, moves: 0 };
  undoStack.length = 0;
  redoStack.length = 0;
  conflictCache = new Set();
  setActiveNumber(null, true, true);
  refreshGrid();
  saveState();
  showStatus('Board cleared');
}

function checkComplete() {
  if (board.isSolved()) {
    stopTimer();
    const diff = difficultySelect.value || 'medium';
    recordGameEnd(diff, secondsElapsed, gameStats.errors);
    renderStats();
    if (solvedCountEl) {
        solvedCountEl.textContent = stats.solved ?? stats.overall?.wins ?? 0;
    }
    updateTotalTimeDisplay();
    persistStats();
    saveState();
    runWinSweepAnimation(() => {
      showCompletionModal();
      showStatus('Puzzle solved! 🎉');
    });
  }
}

function showStatus(message) {
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = message;
}

function runDealAnimation(puzzle, onComplete) {
  const givens = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = puzzle[r][c];
      if (val !== 0) givens.push({ row: r, col: c, val });
    }
  }
  if (!givens.length) {
    gridEl.classList.remove('dealing');
    refreshGrid();
    saveState();
    return;
  }
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Keep deal animation everywhere unless the user explicitly prefers less motion.
  const fastDeal = prefersReducedMotion;
  dealing = true;
  const numbersByVal = Object.fromEntries(numberButtons.map((btn) => [parseInt(btn.dataset.val, 10), btn]));
  const duration = 200;

  if (fastDeal) {
    refreshGrid();
    requestAnimationFrame(() => {
      cells.flat().forEach((cell) => cell.classList.add('revealed'));
      dealing = false;
      gridEl.classList.remove('dealing');
      saveState();
      if (onComplete) onComplete();
    });
    return;
  }

  refreshGrid();

  givens.forEach((item, idx) => {
    setTimeout(() => {
      const { row, col, val } = item;
      const targetCell = cells[row][col];
      const sourceBtn = numbersByVal[val] || numberButtons[0];
      const sRect = sourceBtn.getBoundingClientRect();
      const tRect = targetCell.getBoundingClientRect();
      const chip = document.createElement('div');
      chip.className = 'deal-chip';
      chip.textContent = val;
      chip.style.left = `${sRect.left + sRect.width / 2 - 18}px`;
      chip.style.top = `${sRect.top + sRect.height / 2 - 18}px`;
      chip.style.transition = `left 0.22s ease, top 0.22s ease, opacity 0.22s ease`;
      document.body.appendChild(chip);
      requestAnimationFrame(() => {
        chip.style.opacity = '1';
        chip.style.left = `${tRect.left + tRect.width / 2 - 18}px`;
        chip.style.top = `${tRect.top + tRect.height / 2 - 18}px`;
      });
      setTimeout(() => {
        chip.remove();
        targetCell.classList.add('revealed');
        if (idx === givens.length - 1) {
          refreshGrid();
          dealing = false;
          gridEl.classList.remove('dealing');
          cells.flat().forEach((cell) => cell.classList.add('revealed'));
          saveState();
          if (onComplete) onComplete();
        }
      }, duration);
    }, idx * 55);
  });
}

function measureToggleGeometry(labelEl) {
  if (!labelEl) {
    return { pad: 0, knobW: 0, maxShift: 0, rectLeft: 0 };
  }
  const styles = getComputedStyle(labelEl);
  const pad = parseFloat(styles.getPropertyValue('--pad')) || 0;
  const fallbackW = parseFloat(styles.getPropertyValue('--toggle-w')) || 0;
  const rect = labelEl.getBoundingClientRect();
  const trackW = labelEl.clientWidth || rect.width || fallbackW || 0;
  const knobW = Math.max(trackW / 2 - pad, 0);
  const maxShift = Math.max(trackW - knobW - pad * 2, 0);
  return { pad, knobW, maxShift, rectLeft: rect.left };
}

function syncToggleKnob(inputEl, labelEl) {
  if (!inputEl || !labelEl) return;
  if (labelEl.classList.contains('dragging')) return;
  const reverse = labelEl.dataset.reverse === 'true' || labelEl.classList.contains('reverse');
  const { maxShift } = measureToggleGeometry(labelEl);
  const shift = inputEl.checked ? (reverse ? 0 : maxShift) : (reverse ? maxShift : 0);
  labelEl.style.setProperty('--knob-shift', `${shift}px`);
}

function setupDraggableToggle(inputEl, labelEl, onChange) {
  const DRAG_SLOP = 8;
  let pointerActive = false;
  let dragStarted = false;
  let geometry = measureToggleGeometry(labelEl);
  let latestPointerId = null;
  let lastPreview = inputEl?.checked ?? false;
  let startChecked = inputEl?.checked ?? false;
  let startX = 0;
  const reverse = labelEl.dataset.reverse === 'true' || labelEl.classList.contains('reverse');

  const computeGeometry = () => {
    geometry = measureToggleGeometry(labelEl);
  };

  const shiftForState = (checked) =>
    reverse ? (checked ? 0 : geometry.maxShift) : (checked ? geometry.maxShift : 0);

  const syncKnob = () => {
    syncToggleKnob(inputEl, labelEl);
  };

  const endDrag = (nextChecked) => {
    computeGeometry();
    pointerActive = false;
    dragStarted = false;
    if (latestPointerId !== null) {
      labelEl.releasePointerCapture?.(latestPointerId);
    }
    latestPointerId = null;
    if (nextChecked === null) {
      inputEl.checked = startChecked;
      syncKnob();
      labelEl.classList.remove('dragging', 'dragging-on', 'dragging-off');
      return;
    }
    const changed = inputEl.checked !== nextChecked;
    inputEl.checked = nextChecked;
    labelEl.style.setProperty('--knob-shift', `${shiftForState(nextChecked)}px`);
    if (changed) {
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    labelEl.classList.remove('dragging', 'dragging-on', 'dragging-off');
  };

  labelEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    computeGeometry();
    pointerActive = true;
    dragStarted = false;
    startX = e.clientX;
    lastPreview = inputEl.checked;
    startChecked = inputEl.checked;
    latestPointerId = e.pointerId;
    labelEl.setPointerCapture?.(e.pointerId);
    labelEl.classList.remove('dragging-on', 'dragging-off');
    e.preventDefault();
  });

  labelEl.addEventListener('pointermove', (e) => {
    if (!pointerActive) return;
    const delta = Math.abs(e.clientX - startX);
    if (!dragStarted && delta < DRAG_SLOP) return;
    if (!dragStarted) {
      dragStarted = true;
      labelEl.classList.add('dragging');
    }
    const shift = Math.max(
      0,
      Math.min(geometry.maxShift, e.clientX - geometry.rectLeft - geometry.pad - geometry.knobW / 2)
    );
    labelEl.style.setProperty('--knob-shift', `${shift}px`);
    const previewOn = reverse ? shift <= geometry.maxShift / 2 : shift >= geometry.maxShift / 2;
    labelEl.classList.toggle('dragging-on', previewOn);
    labelEl.classList.toggle('dragging-off', !previewOn);
    if (previewOn !== lastPreview) {
      lastPreview = previewOn;
      inputEl.checked = previewOn;
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    e.preventDefault();
  });

  labelEl.addEventListener('pointerup', (e) => {
    if (!pointerActive) return;
    computeGeometry();
    let shouldCheck;
    if (!dragStarted) {
      shouldCheck = !inputEl.checked;
    } else {
      const shift = Math.max(
        0,
        Math.min(geometry.maxShift, e.clientX - geometry.rectLeft - geometry.pad - geometry.knobW / 2)
      );
      shouldCheck = reverse ? shift <= geometry.maxShift / 2 : shift >= geometry.maxShift / 2;
      labelEl.style.setProperty('--knob-shift', `${shiftForState(shouldCheck)}px`);
    }
    endDrag(shouldCheck);
    e.preventDefault();
  });

  labelEl.addEventListener('pointercancel', () => {
    if (!pointerActive) return;
    endDrag(null);
  });

  const wrapper = labelEl.parentElement;
  if (wrapper && wrapper !== labelEl) {
    wrapper.addEventListener('click', (e) => {
      if (labelEl.contains(e.target)) return;
      e.preventDefault();
      endDrag(!inputEl.checked);
    });
  }

  const outer = labelEl.closest('.theme-switch, .toggle-row');
  if (outer && outer !== wrapper) {
    outer.addEventListener('click', (e) => {
      if (labelEl.contains(e.target)) return;
      e.preventDefault();
      endDrag(!inputEl.checked);
    });
  }

  syncKnob();
}

function runWinSweepAnimation(done) {
  const order = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      order.push(cells[r][c]);
    }
  }
  const delay = 30;
  order.forEach((cell, idx) => {
    setTimeout(() => cell.classList.add('win-highlight'), idx * delay);
  });
  setTimeout(() => {
    cells.flat().forEach((cell) => cell.classList.remove('win-highlight'));
    if (done) done();
  }, order.length * delay + 350);
}

function showCompletionModal() {
  const modal = document.getElementById('completeModal');
  const finishTimeEl = document.getElementById('finishTime');
  const finishErrorsEl = document.getElementById('finishErrors');
  const finishMovesEl = document.getElementById('finishMoves');
  finishTimeEl.textContent = timerEl.textContent;
  finishErrorsEl.textContent = gameStats.errors;
  finishMovesEl.textContent = gameStats.moves;
  modal.classList.add('show');
}

function closeCompletionModal() {
  document.getElementById('completeModal').classList.remove('show');
}

init();
