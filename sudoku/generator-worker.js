import { generatePuzzle } from './generator.js';

self.addEventListener('message', (event) => {
  const { id, difficulty } = event.data || {};
  if (id === undefined || id === null) return;
  try {
    const { puzzle, solution } = generatePuzzle(difficulty);
    self.postMessage({ id, ok: true, puzzle, solution });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Puzzle generation failed'
    });
  }
});
