// Exact solvers. Small boards are small enough to search completely, so the
// game can prove that a level has exactly one solution and can defend perfectly.

import {
  type Move, type PieceType, type Position, isAttacked, isInCheck, legalMoves, makeMove, opponent,
} from './board';

/**
 * What the attacker (white, the side to move) is trying to force:
 * - mate
 * - promote: a new queen that can't be captured straight away
 * - win: be at least WIN_MARGIN points of material up after black's reply
 */
export type Target = 'mate' | 'promote' | 'win';

const VALUES: Record<PieceType, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
export const WIN_MARGIN = 2; // e.g. a knight for nothing, or a rook for a knight

/** White's material minus black's. */
export function material(pos: Position): number {
  return pos.squares.reduce((sum, p) => sum + (p ? (p.color === 'w' ? 1 : -1) * VALUES[p.type] : 0), 0);
}

// Results per (position, moves left, target, starting material). Positions
// repeat a lot in the search tree, so this makes deeper levels fast enough for a phone.
const cache = new Map<string, boolean>();
export const clearCache = () => cache.clear();
const key = (pos: Position, n: number, target: Target, base: number) =>
  `${target}${n}${base}${pos.turn}` + pos.squares.map((p) => (p ? p.color + p.type : '.')).join('');

// `base` is the material balance at the start of the level: "win" means
// gaining material compared to it. Callers pass it on through the search.

/** Can the side to move force `target` within `n` of its own moves? */
export function forces(pos: Position, n: number, target: Target, base = material(pos)): boolean {
  if (n <= 0) return false;
  const k = key(pos, n, target, base);
  let result = cache.get(k);
  if (result === undefined) {
    result = legalMoves(pos).some((m) => moveWins(pos, m, n, target, base));
    cache.set(k, result);
  }
  return result;
}

/**
 * Does `move` force `target` within `n` moves (counting `move` itself),
 * whatever the defender does? Stalemate always counts as an escape.
 */
export function moveWins(pos: Position, move: Move, n: number, target: Target, base = material(pos)): boolean {
  const after = makeMove(pos, move);
  const defences = legalMoves(after);
  if (defences.length === 0) return isInCheck(after, after.turn);
  if (target === 'promote' && move.promotion && !defences.some((d) => d.to === move.to)) return true;
  return defences.every((d) => {
    const next = makeMove(after, d);
    if (target === 'win' && material(next) - base >= WIN_MARGIN) return true;
    return n > 1 && forces(next, n - 1, target, base);
  });
}

export const forcesMate = (pos: Position, n: number) => forces(pos, n, 'mate');

/** All first moves that force `target` within `n` moves. A good level has exactly one. */
export function solutions(pos: Position, n: number, target: Target = 'mate', base = material(pos)): Move[] {
  return legalMoves(pos).filter((m) => moveWins(pos, m, n, target, base));
}

/** Smallest k <= max that forces `target`, or null. */
export function distance(pos: Position, max: number, target: Target = 'mate', base = material(pos)): number | null {
  for (let k = 1; k <= max; k++) if (forces(pos, k, target, base)) return k;
  return null;
}

/**
 * The defence that delays `target` the longest (or escapes it, if possible).
 * Between equally long defences, it keeps the most material.
 */
export function bestDefence(pos: Position, max: number, target: Target = 'mate', base = material(pos)): Move | null {
  let best: Move | null = null;
  let bestScore = -Infinity;
  for (const d of legalMoves(pos)) {
    const next = makeMove(pos, d);
    const k = distance(next, max, target, base);
    const score = (k === null ? 1000 : k * 100) - material(next);
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
