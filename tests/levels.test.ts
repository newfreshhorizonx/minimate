import { describe, expect, it } from 'vitest';
import { createPosition, parseSquare, status } from '../src/engine/board';
import { forces, shortestPath, solutions } from '../src/engine/solver';
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
    const { kind, moves } = level.goal;
    it(`has exactly one first move that wins (${kind}) in ${moves}`, () => {
      expect(solutions(pos, moves, kind)).toHaveLength(1);
    });
    it('has no faster win', () => {
      expect(forces(pos, moves - 1, kind)).toBe(false);
    });
  }
});

it('level ids are unique', () => {
  expect(new Set(LEVELS.map((l) => l.id)).size).toBe(LEVELS.length);
});
