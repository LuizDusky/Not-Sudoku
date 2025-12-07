import { solveBoard } from './solver.js';

/**
 * Generates a puzzle by creating a solved grid, then removing cells
 * according to the difficulty level while keeping a unique solution.
 */
export function generatePuzzle(difficulty = 'medium') {
  const solved = generateSolvedBoard();
  const puzzle = carvePuzzle(solved, difficulty);
  return { puzzle, solution: solved };
}

function generateSolvedBoard() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  solveBoard(board, true);
  return board.map((row) => [...row]);
}

function carvePuzzle(solved, difficulty) {
  const removalMap = {
    easy: 35,
    medium: 45,
    hard: 54,
    expert: 60
  };
  const toRemove = removalMap[difficulty] ?? removalMap.medium;
  const puzzle = solved.map((row) => [...row]);
  let removed = 0;
  const positions = shuffle(Array.from({ length: 81 }, (_, i) => i));
  for (const pos of positions) {
    if (removed >= toRemove) break;
    const r = Math.floor(pos / 9);
    const c = pos % 9;
    const backup = puzzle[r][c];
    puzzle[r][c] = 0;
    const copy = puzzle.map((row) => [...row]);
    const solutions = countSolutions(copy);
    if (solutions !== 1) {
      puzzle[r][c] = backup; // keep unique solution
    } else {
      removed += 1;
    }
  }
  return puzzle;
}

function countSolutions(board) {
  let count = 0;
  solveBoard(board, false, () => {
    count += 1;
    return count >= 2; // stop once we know there's more than one solution
  });
  return count;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
