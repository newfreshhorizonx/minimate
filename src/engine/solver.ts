// Exact solvers. Small boards are small enough to search completely, so the
// game can prove that a level has exactly one solution and can defend perfectly.

import {
  type Move, type Position, isAttacked, isInCheck, legalMoves, makeMove, opponent,
} from './board';

/** Can the side to move force checkmate within `n` of its own moves? */
export function forcesMate(pos: Position, n: number): boolean {
  if (n <= 0) return false;
  return legalMoves(pos).some((m) => defenderIsLost(makeMove(pos, m), n));
}

/**
 * The attacker just moved and has `n - 1` moves left.
 * True if every defence still loses (stalemate counts as an escape).
 */
export function defenderIsLost(pos: Position, n: number): boolean {
  const defences = legalMoves(pos);
  if (defences.length === 0) return isInCheck(pos, pos.turn);
  if (n <= 1) return false;
  return defences.every((d) => forcesMate(makeMove(pos, d), n - 1));
}

/** All first moves that force mate within `n` moves. A good level has exactly one. */
export function mateSolutions(pos: Position, n: number): Move[] {
  return legalMoves(pos).filter((m) => defenderIsLost(makeMove(pos, m), n));
}

/** Smallest k <= max with a forced mate in k, or null. */
export function mateDistance(pos: Position, max: number): number | null {
  for (let k = 1; k <= max; k++) if (forcesMate(pos, k)) return k;
  return null;
}

/** The defence that delays mate the longest (or escapes it, if possible). */
export function bestDefence(pos: Position, max: number): Move | null {
  let best: Move | null = null;
  let bestScore = -1;
  for (const d of legalMoves(pos)) {
    const k = mateDistance(makeMove(pos, d), max);
    const score = k === null ? Infinity : k;
    if (score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Path puzzles: one white piece moves alone (the opponent never moves) and
 * must never stop on an occupied square or a square attacked by black.
 */
export function pathMoves(pos: Position, from: number): Move[] {
  const mover = { ...pos, turn: 'w' as const };
  return legalMoves(mover).filter((m) => {
    if (m.from !== from || pos.squares[m.to]) return false;
    return !isAttacked(makeMove(mover, m), m.to, opponent('w'));
  });
}

/** Fewest moves for the piece on `from` to reach `target`, or null if impossible. */
export function shortestPath(pos: Position, from: number, target: number): number | null {
  const piece = pos.squares[from];
  if (!piece) return null;
  const seen = new Set([from]);
  let frontier = [from];
  for (let depth = 0; frontier.length > 0; depth++) {
    if (frontier.includes(target)) return depth;
    const next: number[] = [];
    for (const square of frontier) {
      // Place the piece on `square` alone, keeping the black pieces as obstacles.
      const squares = pos.squares.slice();
      squares[from] = null;
      squares[square] = piece;
      for (const m of pathMoves({ ...pos, squares }, square)) {
        if (!seen.has(m.to)) {
          seen.add(m.to);
          next.push(m.to);
        }
      }
    }
    frontier = next;
  }
  return null;
}
