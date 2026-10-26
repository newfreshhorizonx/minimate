import { describe, expect, it } from 'vitest';
import { createPosition, parseSquare, status } from '../src/engine/board';
import { forcesMate, mateSolutions, shortestPath } from '../src/engine/solver';
import { LEVELS } from '../src/levels';

describe.each(LEVELS)('level $id', (level) => {
  const pos = createPosition(level.width, level.height, level.pieces);

  it('starts in a playable position', () => {
    expect(status(pos)).toBe('ongoing');
  });

  if (level.goal.kind === 'path') {
    const goal = level.goal;
    it(`shortest path is exactly ${goal.moves} moves`, () => {
      expect(shortestPath(pos, parseSquare(pos, goal.from), parseSquare(pos, goal.target))).toBe(goal.moves);
    });
  } else {
    const goal = level.goal;
    it(`has exactly one first move that mates in ${goal.moves}`, () => {
      expect(mateSolutions(pos, goal.moves)).toHaveLength(1);
    });
    it('has no faster mate', () => {
      expect(forcesMate(pos, goal.moves - 1)).toBe(false);
    });
  }
});
