/**
 * UI helpers to build and update the grid.
 */
const FULL_SELECTION_SCAN = Symbol('full-selection-scan');
export function createGrid(container, onCellClick) {
  container.innerHTML = '';
  const cells = [];
  const fragment = document.createDocumentFragment();

  container.onpointerdown = (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || !container.contains(cell)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.pointerType && e.pointerType !== 'mouse') {
      e.preventDefault();
    }
    onCellClick(Number(cell.dataset.row), Number(cell.dataset.col));
  };

  for (let r = 0; r < 9; r++) {
    const rowCells = [];
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.row = r;
      cell.dataset.col = c;

      const valueSpan = document.createElement('span');
      valueSpan.className = 'value empty';
      cell.appendChild(valueSpan);

      const notes = document.createElement('div');
      notes.className = 'notes';
      const noteEls = [];
      for (let i = 1; i <= 9; i++) {
        const note = document.createElement('div');
        note.className = 'note';
        note.textContent = '';
        notes.appendChild(note);
        noteEls.push(note);
      }
      cell.appendChild(notes);
      cell._ui = {
        hintEl: null,
        noteEls,
        valueEl: valueSpan
      };
      fragment.appendChild(cell);
      rowCells.push(cell);
    }
    cells.push(rowCells);
  }
  container.appendChild(fragment);
  return cells;
}

export function updateGrid(
  cells,
  board,
  selected,
  conflicts = new Set(),
  hint = null,
  completedDigits = new Set(),
  newlyCompleted = new Set(),
  activeNumber = null,
  highlightsEnabled = true
) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = cells[r][c];
      const ui = cell._ui;
      const val = board.getValue(r, c);
      const valueSpan = ui.valueEl;
      valueSpan.textContent = val === 0 ? '' : val;
      valueSpan.classList.toggle('empty', val === 0);
      cell.classList.toggle('empty-cell', val === 0);
      cell.classList.toggle('filled-cell', val !== 0);
      cell.classList.toggle('given', board.isGiven(r, c));
      cell.classList.toggle('conflict', conflicts.has(`${r},${c}`));

      const noteSet = board.notes[r][c];
      const noteEls = ui.noteEls;
      for (let i = 0; i < noteEls.length; i++) {
        const noteEl = noteEls[i];
        const noteValue = val === 0 && noteSet.has(i + 1) ? String(i + 1) : '';
        noteEl.textContent = noteValue;
        noteEl.classList.toggle('active-note', noteValue !== '' && activeNumber === i + 1);
      }

      let hintEl = ui.hintEl;
      if (hint && hint.row === r && hint.col === c) {
        if (!hintEl) {
          hintEl = document.createElement('div');
          hintEl.className = 'hint';
          hintEl.textContent = '!';
          cell.appendChild(hintEl);
          ui.hintEl = hintEl;
        }
        hintEl.hidden = false;
      } else if (hintEl) {
        hintEl.hidden = true;
      }

      const isCompleted = completedDigits.has(val);
      cell.classList.toggle('completed-digit', isCompleted);
      if (isCompleted && newlyCompleted.has(val)) {
        cell.classList.add('completed-anim');
      } else {
        cell.classList.remove('completed-anim');
      }

      const showMatch = highlightsEnabled && !!activeNumber && val === activeNumber;
      cell.classList.toggle('number-match', showMatch);
    }
  }
  highlightSelection(cells, selected, board, activeNumber, highlightsEnabled);
}

function applySelectionClasses(cell, row, col, selected, board, selectedValue, highlightsEnabled) {
  const isSelected = selected && row === selected.row && col === selected.col;
  const sameRow = selected && row === selected.row;
  const sameCol = selected && col === selected.col;
  const sameBox =
    selected &&
    Math.floor(row / 3) === Math.floor(selected.row / 3) &&
    Math.floor(col / 3) === Math.floor(selected.col / 3);

  cell.classList.toggle('selected', isSelected);

  const val = board ? board.getValue(row, col) : 0;
  const sameNumber = board && selected && selectedValue !== 0 && val !== 0 && val === selectedValue;
  const related =
    highlightsEnabled &&
    !isSelected &&
    (sameRow || sameCol || sameBox || sameNumber);

  cell.classList.toggle('related', related);
  cell.classList.toggle('row-related', highlightsEnabled && !isSelected && sameRow);
  cell.classList.toggle('col-related', highlightsEnabled && !isSelected && sameCol);
  cell.classList.toggle('box-related', highlightsEnabled && !isSelected && sameBox);
}

function collectAffectedCells(cells, selected, board, highlightsEnabled, affected) {
  if (!selected) return;

  affected.add(cells[selected.row][selected.col]);
  for (let i = 0; i < 9; i++) {
    affected.add(cells[selected.row][i]);
    affected.add(cells[i][selected.col]);
  }

  const startRow = Math.floor(selected.row / 3) * 3;
  const startCol = Math.floor(selected.col / 3) * 3;
  for (let r = startRow; r < startRow + 3; r++) {
    for (let c = startCol; c < startCol + 3; c++) {
      affected.add(cells[r][c]);
    }
  }

  if (!highlightsEnabled || !board) return;

  const selectedValue = board.getValue(selected.row, selected.col);
  if (!selectedValue) return;

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board.getValue(r, c) === selectedValue) {
        affected.add(cells[r][c]);
      }
    }
  }
}

export function highlightSelection(
  cells,
  selected,
  board,
  activeNumber = null,
  highlightsEnabled = true,
  previousSelected = FULL_SELECTION_SCAN
) {
  const selectedValue = selected && board ? board.getValue(selected.row, selected.col) : 0;

  if (!board || previousSelected === FULL_SELECTION_SCAN) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        applySelectionClasses(cells[r][c], r, c, selected, board, selectedValue, highlightsEnabled);
      }
    }
    return;
  }

  const affected = new Set();
  collectAffectedCells(cells, previousSelected, board, true, affected);
  collectAffectedCells(cells, selected, board, highlightsEnabled, affected);

  affected.forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    applySelectionClasses(cell, row, col, selected, board, selectedValue, highlightsEnabled);
  });
}

export function showStatus(message) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
}
