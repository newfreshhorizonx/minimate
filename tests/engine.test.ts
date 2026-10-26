import { describe, expect, it } from 'vitest';
import { createPosition, legalMoves, makeMove, moveName, parseSquare, status } from '../src/engine/board';
import { bestDefence, mateDistance } from '../src/engine/solver';

describe('board', () => {
  it('names and parses squares on small boards', () => {
    const pos = createPosition(5, 5, {});
    expect(parseSquare(pos, 'a1')).toBe(0);
    expect(parseSquare(pos, 'e5')).toBe(24);
    expect(() => parseSquare(pos, 'f1')).toThrow();
  });

  it('does not allow moving into check', () => {
    // The rook on b3 covers the b-file, so a2 is the only safe square.
    const pos = createPosition(4, 4, { a1: 'K', b3: 'r' });
    expect(legalMoves(pos).map((m) => moveName(pos, m))).toEqual(['Ka1-a2']);
  });

  it('promotes pawns on the last rank of a small board', () => {
    const pos = createPosition(4, 4, { a3: 'P' });
    const promotions = legalMoves(pos).map((m) => m.promotion);
    expect(promotions).toEqual(['Q', 'R', 'B', 'N']);
  });

  it('detects checkmate and stalemate', () => {
    const mate = createPosition(3, 3, { a1: 'k', a3: 'R', c2: 'K' }, 'b');
    expect(status(mate)).toBe('checkmate');
    const stale = createPosition(3, 3, { a1: 'k', b3: 'Q', c3: 'K' }, 'b');
    expect(status(stale)).toBe('stalemate');
  });
});

describe('solver', () => {
  it('finds the mate distance', () => {
    const pos = createPosition(5, 5, { c1: 'K', a1: 'R', e5: 'k', d4: 'p', e4: 'p' });
    expect(mateDistance(pos, 3)).toBe(1);
  });

  it('defends by delaying mate as long as possible', () => {
    const pos = createPosition(5, 5, { a3: 'K', d3: 'R', c5: 'k' });
    const afterKb3 = makeMove(pos, { from: parseSquare(pos, 'a3'), to: parseSquare(pos, 'b3') });
    expect(bestDefence(afterKb3, 2)).not.toBeNull();
  });
});
