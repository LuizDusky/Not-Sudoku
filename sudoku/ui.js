/**
 * UI helpers to build and update the grid.
 */
export function createGrid(container, onCellClick) {
  container.innerHTML = '';
  const cells = [];
  const fragment = document.createDocumentFragment();

  container.onpointerdown = (e) => {
    const cell = e.target.closest('.cell');
    if (!cell || !container.contains(cell)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
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

export function highlightSelection(cells, selected, board, activeNumber = null, highlightsEnabled = true) {
  const selectedValue = selected && board ? board.getValue(selected.row, selected.col) : 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = cells[r][c];
      const isSelected = selected && r === selected.row && c === selected.col;
      const sameRow = selected && r === selected.row;
      const sameCol = selected && c === selected.col;
      const sameBox =
        selected &&
        Math.floor(r / 3) === Math.floor(selected.row / 3) &&
        Math.floor(c / 3) === Math.floor(selected.col / 3);
      cell.classList.toggle('selected', isSelected);

      const val = board ? board.getValue(r, c) : 0;
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
  }
}

export function showStatus(message) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
}
