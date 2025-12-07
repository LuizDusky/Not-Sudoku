/**
 * Backtracking Sudoku solver. Optionally randomizes candidate order.
 * The optional onSolution callback is invoked each time a complete
 * solution is found; return true from it to stop searching early.
 */
export function solveBoard(board, randomize = false, onSolution = null) {
  const empty = findEmpty(board);
  if (!empty) {
    if (onSolution) {
      const stop = onSolution(board);
      return !!stop;
    }
    return true;
  }

  const [row, col] = empty;
  const candidates = [];
  for (let i = 1; i <= 9; i++) candidates.push(i);
  if (randomize) shuffle(candidates);

  for (const num of candidates) {
    if (isSafe(board, row, col, num)) {
      board[row][col] = num;
      const done = solveBoard(board, randomize, onSolution);
      if (!onSolution && done) return true;
      if (onSolution && done) return true; // stop was requested
    }
    board[row][col] = 0;
  }

  return false;
}

function findEmpty(board) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) return [r, c];
    }
  }
  return null;
}

function isSafe(board, row, col, val) {
  for (let i = 0; i < 9; i++) {
    if (board[row][i] === val || board[i][col] === val) return false;
  }
  const startRow = Math.floor(row / 3) * 3;
  const startCol = Math.floor(col / 3) * 3;
  for (let r = startRow; r < startRow + 3; r++) {
    for (let c = startCol; c < startCol + 3; c++) {
      if (board[r][c] === val) return false;
    }
  }
  return true;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
