import { describe, expect, it } from 'vitest';
import { createPosition, legalMoves, makeMove, moveName, parseSquare, status } from '../src/engine/board';
import { bestDefence, distance, forces, moveWins } from '../src/engine/solver';

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

  it('promotes pawns to a queen on the last rank of a small board', () => {
    const pos = createPosition(4, 4, { a3: 'P' });
    const next = makeMove(pos, legalMoves(pos)[0]);
    expect(next.squares[parseSquare(pos, 'a4')]).toEqual({ type: 'Q', color: 'w' });
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
    expect(distance(pos, 3)).toBe(1);
  });

  it('wins material with a knight fork, counting the recapture', () => {
    // Nc3+ forks king e4 and queen b5: the queen is lost for nothing.
    const fork = createPosition(5, 5, { a3: 'K', a2: 'N', e4: 'k', b5: 'q' });
    expect(forces(fork, 1, 'win')).toBe(false);
    expect(forces(fork, 2, 'win')).toBe(true);
    // Qxb4 grabs a pawn, but the knight takes the queen back.
    const trade = createPosition(5, 5, { a1: 'K', a3: 'Q', b4: 'p', d5: 'n', e5: 'k' });
    const grab = { from: parseSquare(trade, 'a3'), to: parseSquare(trade, 'b4') };
    expect(moveWins(trade, grab, 1, 'win')).toBe(false);
  });

  it('does not count a promotion the defender can capture', () => {
    // b4-b5=Q is taken at once by the king on a5, unless the white king guards b5.
    const loose = createPosition(5, 5, { e1: 'K', b4: 'P', a5: 'k' });
    expect(forces(loose, 1, 'promote')).toBe(false);
    const defended = createPosition(5, 5, { c4: 'K', b4: 'P', a5: 'k' });
    expect(forces(defended, 1, 'promote')).toBe(true);
  });

  it('defends by delaying mate as long as possible', () => {
    const pos = createPosition(5, 5, { a3: 'K', d3: 'R', c5: 'k' });
    const afterKb3 = makeMove(pos, { from: parseSquare(pos, 'a3'), to: parseSquare(pos, 'b3') });
    expect(bestDefence(afterKb3, 2)).not.toBeNull();
  });
});
