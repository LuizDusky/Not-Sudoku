import { SudokuBoard } from './sudoku/board.js';
import { generatePuzzle } from './sudoku/generator.js';
import { createGrid, updateGrid, highlightSelection } from './sudoku/ui.js';

const gridEl = document.getElementById('grid');
const difficultySelect = document.getElementById('difficultySelect');
const difficultyRadios = Array.from(document.querySelectorAll('input[name=\"difficulty\"]'));
const newGameBtn = document.getElementById('newGameBtn');
const numberButtons = Array.from(document.querySelectorAll('.num-btn'));
const notesToggle = document.getElementById('notesToggle');
const themeToggle = document.getElementById('themeToggle');
const hintBtn = document.getElementById('hintBtn');
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

const DEFAULT_PREFS = {
  theme: 'light',
  lastDifficulty: 'medium',
  stats: { solved: 0, totalTime: 0 },
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
let stats = { solved: 0, totalTime: 0 };
let dealing = false;
let loadingGame = false;
let completedDigits = new Set();
let gameStats = { errors: 0, moves: 0 };
const undoStack = [];
const redoStack = [];
let conflictCache = new Set();
let lastHint = null;

function readLocalPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PREFS, ...parsed, stats: { ...DEFAULT_PREFS.stats, ...(parsed.stats || {}) } };
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
    stats: { ...(local.stats || {}), ...(prefs.stats || {}) }
  };
  merged.gameState = prefs.gameState || local.gameState || null;
  const savedTheme = merged.theme || 'light';
  themeToggle.checked = savedTheme === 'dark';
  difficultySelect.value = prefs.lastDifficulty || 'medium';
  difficultyRadios.forEach((r) => {
    r.checked = r.value === difficultySelect.value;
  });
  stats = merged.stats || stats;
  if (solvedCountEl) {
    solvedCountEl.textContent = stats.solved;
  }
  updateTotalTimeDisplay();
  applyTheme(savedTheme);
  restored = restoreGameState(merged.gameState);
  if (!restored) {
    updateGameMeta({ difficulty: difficultySelect.value, id: null });
  }
  return restored;
}

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
  themeToggle.checked = theme === 'dark';
}

function setNotesMode(on, { save = true, announce = false } = {}) {
  const currentActive = activeNumber;
  notesMode = on;
  notesToggle.checked = on;
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
  if (!gameMetaText || !meta) return;
  const diff = meta.difficulty || difficultySelect.value || 'medium';
  const id = meta.id || '-----';
  const diffLabel = diff.charAt(0).toUpperCase() + diff.slice(1);
  gameMetaText.textContent = `${diffLabel} #${id}`;
}

window.addEventListener('beforeunload', () => {
  saveState();
});

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
  if (conflicts instanceof Set) {
    conflictCache = new Set(conflicts);
  }
  const conflictsToUse =
    conflicts instanceof Set
      ? conflictCache
      : board
      ? new Set(board.computeConflicts())
      : conflictCache;
  if (!(conflicts instanceof Set) && board) {
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
  updateGrid(cells, board, selected, conflictsToUse, hint, done, newlyCompleted, currentActive);
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
    const computedConflicts = board.computeConflicts();
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
  const minutes = String(Math.floor(secondsElapsed / 60)).padStart(2, '0');
  const seconds = String(secondsElapsed % 60).padStart(2, '0');
  timerEl.textContent = `${minutes}:${seconds}`;
}

function updateTotalTimeDisplay() {
  if (!totalTimeEl) return;
  const totalSeconds = stats.totalTime || 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  totalTimeEl.textContent = parts.join(' ');
}

function init() {
  cells = createGrid(gridEl, handleCellClick);
  attachEvents();
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
  numberButtons.forEach((btn) => btn.addEventListener('click', () => selectNumber(btn)));
  undoBtn.addEventListener('click', undoMove);
  redoBtn.addEventListener('click', redoMove);
  document.getElementById('closeCompleteBtn')?.addEventListener('click', closeCompletionModal);
  document.getElementById('newFromCompleteBtn')?.addEventListener('click', () => {
    closeCompletionModal();
    openNewGameModal();
  });
  notesToggle.addEventListener('change', () => {
    setNotesMode(notesToggle.checked, { announce: true });
  });
  themeToggle.addEventListener('change', () => {
    applyTheme(themeToggle.checked ? 'dark' : 'light');
    persistPreferences();
  });
  difficultySelect.addEventListener('change', persistPreferences);
  hintBtn.addEventListener('click', showHint);
}

async function newGame() {
  if (dealing || loadingGame) return;
  setLoadingGame(true);
  await wait(30);
  const difficulty = difficultySelect.value;
  try {
    const { puzzle, solution } = generatePuzzle(difficulty);
    board = new SudokuBoard(puzzle, solution);
    board.id = Math.floor(10000 + Math.random() * 90000);
    selected = null;
    setNotesMode(false, { save: false });
    setActiveNumber(null, true);
    clearReveals();
    gridEl.classList.add('dealing');
    document.body.classList.add('dealing-active', 'in-game');
    document.body.classList.remove('timer-ready');
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
    closeNewGameModal();
    runDealAnimation(puzzle, () => {
      document.body.classList.remove('dealing-active');
      document.body.classList.add('timer-ready');
      startTimer();
    });
  } catch (e) {
    console.error('Failed to start new game', e);
  } finally {
    setLoadingGame(false);
  }
}

function handleCellClick(row, col) {
  if (dealing) return;
  selected = { row, col };
  highlightSelection(cells, selected, board, activeNumber);
  lastHint = null;
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
      board.clearNotesInPeers(row, col, activeNumber);
    }
    pushUndo(prev);
  }
  const conflicts = board.computeConflicts();
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
  selected = null;
  setActiveNumber(null, true, true);
  highlightSelection(cells, selected, board, activeNumber);
}

function selectNumber(button) {
  if (dealing) return;
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
  const conflicts = board.computeConflicts();
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
  const conflicts = board.computeConflicts();
  refreshGrid(conflicts);
  saveState();
  showStatus('Redo');
}

function handleKeyDown(e) {
  if (dealing) return;
  if (!board) return;
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
  highlightSelection(cells, selected, board, activeNumber);
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
      board.clearNotesInPeers(selected.row, selected.col, val);
      if (val !== board.solution[selected.row][selected.col]) {
        gameStats.errors += 1;
      }
    }
    gameStats.moves += 1;
    pushUndo(prev);
  }
  const conflicts = board.computeConflicts();
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
  const conflicts = board.computeConflicts();
  refreshGrid(conflicts);
  saveState();
}

function clearReveals() {
  cells.flat().forEach((cell) => cell.classList.remove('revealed'));
  gridEl.classList.remove('dealing');
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
  gridEl.classList.add('dealing');
  clearReveals();
  runDealAnimation(board.puzzle, () => {
    document.body.classList.remove('dealing-active');
    document.body.classList.add('timer-ready');
    startTimer();
  });
  showStatus('Puzzle restarted');
}

function showHint() {
  if (!board) return;
  if (lastHint) {
    lastHint = null;
    refreshGrid();
    showStatus('Hint cleared');
    return;
  }
  const conflicts = board.computeConflicts();
  const hint = board.findHint();
  if (hint) {
    lastHint = hint;
    refreshGrid(conflicts, hint);
    selected = { row: hint.row, col: hint.col };
    highlightSelection(cells, selected, board, activeNumber);
    showStatus(`Try ${hint.value} at row ${hint.row + 1}, col ${hint.col + 1}`);
    saveState();
  } else {
    lastHint = null;
    refreshGrid(conflicts, null);
    showStatus('No hints available');
  }
}

function checkComplete() {
  if (board.isSolved()) {
    stopTimer();
    stats.solved += 1;
    stats.totalTime += secondsElapsed;
    if (solvedCountEl) {
      solvedCountEl.textContent = stats.solved;
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
  dealing = true;
  const numbersByVal = Object.fromEntries(numberButtons.map((btn) => [parseInt(btn.dataset.val, 10), btn]));
  const duration = 280;

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
      chip.style.transition = `left 0.28s ease, top 0.28s ease, opacity 0.28s ease`;
      document.body.appendChild(chip);
      refreshGrid();
      requestAnimationFrame(() => {
        chip.style.opacity = '1';
        chip.style.left = `${tRect.left + tRect.width / 2 - 18}px`;
        chip.style.top = `${tRect.top + tRect.height / 2 - 18}px`;
      });
      setTimeout(() => {
        chip.remove();
        targetCell.classList.add('revealed');
        refreshGrid();
        if (idx === givens.length - 1) {
          dealing = false;
          gridEl.classList.remove('dealing');
          cells.flat().forEach((cell) => cell.classList.add('revealed'));
          saveState();
          if (onComplete) onComplete();
        }
      }, duration);
    }, idx * 70);
  });
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
