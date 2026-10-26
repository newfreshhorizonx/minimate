import { describe, expect, it } from 'vitest';
import { createPosition, parseSquare, status } from '../src/engine/board';
import { clearCache, forces, shortestPath, solutions } from '../src/engine/solver';
import { CHAPTERS } from '../src/levels';

describe.each(CHAPTERS)('chapter $id', (chapter) => {
  it('has levels', () => {
    expect(chapter.levels.length).toBeGreaterThan(0);
  });

  it.each(chapter.levels.map((level, i) => ({ level, n: i + 1 })))('level $n is valid', ({ level }) => {
    clearCache();
    const pos = createPosition(level.width, level.height, level.pieces);
    expect(status(pos)).toBe('ongoing');

    const goal = level.goal;
    if (goal.kind === 'path') {
      expect(shortestPath(pos, parseSquare(pos, goal.from), parseSquare(pos, goal.target))).toBe(goal.moves);
    } else {
      expect(solutions(pos, goal.moves, goal.kind)).toHaveLength(1); // exactly one winning first move
      expect(forces(pos, goal.moves - 1, goal.kind)).toBe(false); // and no faster win
    }
  });
});
