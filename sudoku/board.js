/**
 * SudokuBoard tracks current puzzle state, givens, notes and conflicts.
 */
export class SudokuBoard {
  constructor(puzzle, solution) {
    this.puzzle = puzzle.map((row) => [...row]);
    this.grid = puzzle.map((row) => [...row]);
    this.solution = solution.map((row) => [...row]);
    this.givens = puzzle.map((row) => row.map((v) => v !== 0));
    this.notes = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set())
    );
  }

  isGiven(row, col) {
    return this.givens[row][col];
  }

  getValue(row, col) {
    return this.grid[row][col];
  }

  setValue(row, col, value) {
    this.grid[row][col] = value;
    this.notes[row][col].clear();
  }

  clearValue(row, col) {
    this.grid[row][col] = 0;
    this.notes[row][col].clear();
  }

  toggleNote(row, col, value) {
    if (this.grid[row][col] !== 0) return;
    const noteSet = this.notes[row][col];
    if (noteSet.has(value)) {
      noteSet.delete(value);
    } else {
      noteSet.add(value);
    }
  }

  clearNotes(row, col) {
    this.notes[row][col].clear();
  }

  clearNotesInPeers(row, col, value) {
    if (!value) return;
    // Clear in the same row and column
    for (let c = 0; c < 9; c++) {
      if (c !== col && this.grid[row][c] === 0) {
        this.notes[row][c].delete(value);
      }
    }
    for (let r = 0; r < 9; r++) {
      if (r !== row && this.grid[r][col] === 0) {
        this.notes[r][col].delete(value);
      }
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = startRow; r < startRow + 3; r++) {
      for (let c = startCol; c < startCol + 3; c++) {
        if ((r !== row || c !== col) && this.grid[r][c] === 0) {
          this.notes[r][c].delete(value);
        }
      }
    }
  }

  rowValues(row) {
    return this.grid[row];
  }

  colValues(col) {
    return this.grid.map((r) => r[col]);
  }

  boxValues(row, col) {
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    const vals = [];
    for (let r = startRow; r < startRow + 3; r++) {
      for (let c = startCol; c < startCol + 3; c++) {
        vals.push(this.grid[r][c]);
      }
    }
    return vals;
  }

  isValidPlacement(row, col, value) {
    if (value === 0) return true;
    for (let c = 0; c < 9; c++) {
      if (c !== col && this.grid[row][c] === value) return false;
    }
    for (let r = 0; r < 9; r++) {
      if (r !== row && this.grid[r][col] === value) return false;
    }
    const startRow = Math.floor(row / 3) * 3;
    const startCol = Math.floor(col / 3) * 3;
    for (let r = startRow; r < startRow + 3; r++) {
      for (let c = startCol; c < startCol + 3; c++) {
        if (r === row && c === col) continue;
        if (this.grid[r][c] === value) return false;
      }
    }
    return true;
  }

  computeConflicts() {
    const conflicts = new Set();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = this.grid[r][c];
        if (val === 0) continue;
        // Only flag conflicts when Sudoku rules are broken (duplicate in row/col/box).
        if (!this.isValidPlacement(r, c, val)) {
          conflicts.add(`${r},${c}`);
        }
      }
    }
    return conflicts;
  }

  mismatchedCells() {
    const wrong = new Set();
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const val = this.grid[r][c];
        if (val !== 0 && val !== this.solution[r][c]) {
          wrong.add(`${r},${c}`);
        }
      }
    }
    return wrong;
  }

  availableCandidates(row, col) {
    if (this.grid[row][col] !== 0) return [];
    const used = new Set([
      ...this.rowValues(row),
      ...this.colValues(col),
      ...this.boxValues(row, col)
    ].filter((v) => v !== 0));
    const candidates = [];
    for (let v = 1; v <= 9; v++) {
      if (!used.has(v)) candidates.push(v);
    }
    return candidates;
  }

  findHint() {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] !== 0) continue;
        const candidates = this.availableCandidates(r, c);
        if (candidates.length === 1) {
          return { row: r, col: c, value: candidates[0] };
        }
      }
    }
    return null;
  }

  isSolved() {
    return this.grid.every((row, rIdx) =>
      row.every((val, cIdx) => val !== 0 && val === this.solution[rIdx][cIdx])
    );
  }

  resetToPuzzle() {
    this.grid = this.puzzle.map((row) => [...row]);
    this.notes = Array.from({ length: 9 }, () =>
      Array.from({ length: 9 }, () => new Set())
    );
  }
}
