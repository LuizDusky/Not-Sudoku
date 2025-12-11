/**
 * UI helpers to build and update the grid.
 */
export function createGrid(container, onCellClick) {
  container.innerHTML = '';
  const cells = [];
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
      for (let i = 1; i <= 9; i++) {
        const note = document.createElement('div');
        note.className = 'note';
        note.textContent = '';
        notes.appendChild(note);
      }
      cell.appendChild(notes);

      // Use pointerdown to avoid the slight click delay on touch devices.
      cell.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        onCellClick(r, c);
      });
      container.appendChild(cell);
      rowCells.push(cell);
    }
    cells.push(rowCells);
  }
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
  activeNumber = null
) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = cells[r][c];
      const val = board.getValue(r, c);
      const valueSpan = cell.querySelector('.value');
      valueSpan.textContent = val === 0 ? '' : val;
      valueSpan.classList.toggle('empty', val === 0);
      cell.classList.toggle('empty-cell', val === 0);
      cell.classList.toggle('filled-cell', val !== 0);
      cell.classList.toggle('given', board.isGiven(r, c));
      cell.classList.toggle('conflict', conflicts.has(`${r},${c}`));

      const noteEls = cell.querySelectorAll('.note');
      noteEls.forEach((n) => {
        n.textContent = '';
        n.classList.remove('active-note');
      });
      const noteSet = board.notes[r][c];
      if (val === 0 && noteSet.size) {
        noteSet.forEach((n) => {
          const noteEl = noteEls[n - 1];
          noteEl.textContent = n;
          if (activeNumber && n === activeNumber) {
            noteEl.classList.add('active-note');
          }
        });
      }

      let hintEl = cell.querySelector('.hint');
      if (hint && hint.row === r && hint.col === c) {
        if (!hintEl) {
          hintEl = document.createElement('div');
          hintEl.className = 'hint';
          hintEl.textContent = '!';
          cell.appendChild(hintEl);
        }
      } else if (hintEl) {
        hintEl.remove();
      }

      const isCompleted = completedDigits.has(val);
      cell.classList.toggle('completed-digit', isCompleted);
      if (isCompleted && newlyCompleted.has(val)) {
        cell.classList.add('completed-anim');
      } else {
        cell.classList.remove('completed-anim');
      }

      cell.classList.toggle('number-match', !!activeNumber && val === activeNumber);
    }
  }
  highlightSelection(cells, selected, board, activeNumber);
}

export function highlightSelection(cells, selected, board, activeNumber = null) {
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
      const sameNumber = board && selected && val !== 0 && val === board.getValue(selected.row, selected.col);
      const related =
        !isSelected &&
        (sameRow || sameCol || sameBox || sameNumber);
      cell.classList.toggle('related', related);
      cell.classList.toggle('row-related', !isSelected && sameRow);
      cell.classList.toggle('col-related', !isSelected && sameCol);
      cell.classList.toggle('box-related', !isSelected && sameBox);
    }
  }
}

export function showStatus(message) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
}
