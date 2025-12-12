import { solveBoard } from './solver.js';

const MAX_GENERATION_ATTEMPTS = 8;

/**
 * Generates a puzzle by creating a solved grid, then removing cells
 * according to the difficulty level while keeping a unique solution.
 * We also re-validate the final puzzle to guarantee it remains solvable.
 */
export function generatePuzzle(difficulty = 'medium') {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const solved = generateSolvedBoard();
    if (!solved) continue;
    const puzzle = carvePuzzle(solved, difficulty);
    const validation = validatePuzzle(puzzle, solved);
    if (validation.valid) {
      return { puzzle, solution: validation.solution };
    }
  }
  throw new Error('Failed to generate a valid Sudoku puzzle after multiple attempts');
}

function generateSolvedBoard() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  const solved = solveBoard(board, true);
  if (!solved) return null;
  return cloneBoard(board);
}

function carvePuzzle(solved, difficulty) {
  const removalMap = {
    easy: 45,
    medium: 55,
    hard: 62,
    expert: 70
  };
  const toRemove = removalMap[difficulty] ?? removalMap.medium;
  const puzzle = cloneBoard(solved);
  let removed = 0;
  const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));
  for (const pos of positions) {
    if (removed >= toRemove) break;
    const r = Math.floor(pos / 9);
    const c = pos % 9;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;
    const solutions = countSolutions(cloneBoard(puzzle));
    if (solutions !== 1) {
      puzzle[r][c] = backup; // keep unique solution
    } else {
      removed += 1;
    }
  }
  return puzzle;
}

function validatePuzzle(puzzle, expectedSolution) {
  const solvedBoard = cloneBoard(puzzle);
  const solvable = solveBoard(solvedBoard);
  if (!solvable) return { valid: false, reason: 'no-solution' };
  if (!isCompleteAndValid(solvedBoard)) return { valid: false, reason: 'invalid-solution' };

  const solutionCount = countSolutions(cloneBoard(puzzle));
  if (solutionCount !== 1) return { valid: false, reason: 'non-unique' };

  const matchesExpected = expectedSolution && boardsEqual(solvedBoard, expectedSolution);
  return {
    valid: true,
    solution: matchesExpected ? expectedSolution : solvedBoard
  };
}

function countSolutions(board) {
  let count = 0;
  solveBoard(board, false, () => {
    count += 1;
    return count >= 2; // stop once we know there's more than one solution
  });
  return count;
}

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function boardsEqual(a, b) {
  if (!a || !b) return false;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

function isCompleteAndValid(board) {
  const hasAllDigits = (values) => {
    if (values.length !== 9) return false;
    const seen = new Set(values);
    if (seen.size !== 9) return false;
    for (let n = 1; n <= 9; n++) {
      if (!seen.has(n)) return false;
    }
    return true;
  };

  for (let r = 0; r < 9; r++) {
    if (!hasAllDigits(board[r])) return false;
  }
  for (let c = 0; c < 9; c++) {
    const col = [];
    for (let r = 0; r < 9; r++) {
      col.push(board[r][c]);
    }
    if (!hasAllDigits(col)) return false;
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const box = [];
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) {
          box.push(board[r][c]);
        }
      }
      if (!hasAllDigits(box)) return false;
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
