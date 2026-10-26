// Exact solvers. Small boards are small enough to search completely, so the
// game can prove that a level has exactly one solution and can defend perfectly.

import {
  type Move, type Position, isAttacked, isInCheck, legalMoves, makeMove, opponent,
} from './board';

/** What the attacker (the side to move) is trying to force. */
export type Target = 'mate' | 'promote';

// Results per (position, moves left, target). Positions repeat a lot in
// the search tree, so this makes deeper levels fast enough for a phone.
const cache = new Map<string, boolean>();
export const clearCache = () => cache.clear();
const key = (pos: Position, n: number, target: Target) =>
  `${target}${n}${pos.turn}` + pos.squares.map((p) => (p ? p.color + p.type : '.')).join('');

/** Can the side to move force `target` within `n` of its own moves? */
export function forces(pos: Position, n: number, target: Target): boolean {
  if (n <= 0) return false;
  const k = key(pos, n, target);
  let result = cache.get(k);
  if (result === undefined) {
    result = legalMoves(pos).some((m) => moveWins(pos, m, n, target));
    cache.set(k, result);
  }
  return result;
}

/**
 * Does `move` force `target` within `n` moves (counting `move` itself),
 * whatever the defender does? Stalemate always counts as an escape.
 * A promotion counts once the new queen cannot be captured straight away.
 */
export function moveWins(pos: Position, move: Move, n: number, target: Target): boolean {
  const after = makeMove(pos, move);
  const defences = legalMoves(after);
  if (defences.length === 0) return isInCheck(after, after.turn);
  if (target === 'promote' && move.promotion && !defences.some((d) => d.to === move.to)) return true;
  if (n <= 1) return false;
  return defences.every((d) => forces(makeMove(after, d), n - 1, target));
}

export const forcesMate = (pos: Position, n: number) => forces(pos, n, 'mate');

/** All first moves that force `target` within `n` moves. A good level has exactly one. */
export function solutions(pos: Position, n: number, target: Target = 'mate'): Move[] {
  return legalMoves(pos).filter((m) => moveWins(pos, m, n, target));
}

/** Smallest k <= max that forces `target`, or null. */
export function distance(pos: Position, max: number, target: Target = 'mate'): number | null {
  for (let k = 1; k <= max; k++) if (forces(pos, k, target)) return k;
  return null;
}

/** The defence that delays `target` the longest (or escapes it, if possible). */
export function bestDefence(pos: Position, max: number, target: Target = 'mate'): Move | null {
  let best: Move | null = null;
  let bestScore = -1;
  for (const d of legalMoves(pos)) {
    const k = distance(makeMove(pos, d), max, target);
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
