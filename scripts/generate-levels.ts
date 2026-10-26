// Generates src/levels.json.
//
// For every chapter: place pieces at random (following the chapter's theme),
// let the solver keep only positions with exactly one winning first move and
// no faster win, rate how hard each one is, then pick levels spread evenly
// from easy to hard. A fixed seed makes the output reproducible.
//
// Run: npm run generate

import { readFileSync, writeFileSync } from 'node:fs';
import {
  type Move, type Position, attackedFrom, createPosition, isAttacked, isInCheck, legalMoves,
  makeMove, squareName, status,
} from '../src/engine/board';
import {
  type Target, WIN_MARGIN, bestDefence, clearCache, distance, forces, material, pathMoves, solutions,
} from '../src/engine/solver';
import type { Level } from '../src/levels';

// --- Random helpers -------------------------------------------------------

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let random = mulberry32(1);
const rand = (n: number) => Math.floor(random() * n);
const pick = <T>(list: T[]): T => list[rand(list.length)];
const chance = (p: number) => random() < p;

type Zone = (x: number, y: number) => boolean;
interface Spec { letter: string; zone?: Zone }

const name = (x: number, y: number) => String.fromCharCode(97 + x) + (y + 1);

/** Puts each piece on a random free square inside its zone. */
function place(width: number, height: number, specs: Spec[]): Record<string, string> | null {
  const pieces: Record<string, string> = {};
  for (const spec of specs) {
    let placed = false;
    for (let tries = 0; tries < 60 && !placed; tries++) {
      const x = rand(width);
      const y = rand(height);
      if (pieces[name(x, y)]) continue;
      if (spec.letter.toUpperCase() === 'P' && (y === 0 || y === height - 1)) continue;
      if (spec.zone && !spec.zone(x, y)) continue;
      pieces[name(x, y)] = spec.letter;
      placed = true;
    }
    if (!placed) return null;
  }
  return pieces;
}

const near = (cx: number, cy: number, r: number): Zone => (x, y) =>
  Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= r;
const far = (cx: number, cy: number, r: number): Zone => (x, y) =>
  Math.max(Math.abs(x - cx), Math.abs(y - cy)) > r;

function find(pos: Position, letter: string): number {
  const color = letter === letter.toUpperCase() ? 'w' : 'b';
  return pos.squares.findIndex((p) => p?.color === color && p.type === letter.toUpperCase());
}
const xy = (pos: Position, square: number) => [square % pos.width, Math.floor(square / pos.width)];

// --- Candidates -----------------------------------------------------------

interface Candidate {
  level: Level;
  bucket: number; // levels are picked per bucket (moves needed)
  score: number; // higher = harder
}

/** Same position mirrored left-right counts as a duplicate. */
function canonical(level: Level): string {
  const entries = (mirror: boolean) => Object.entries(level.pieces)
    .map(([sq, p]) => {
      const x = sq.charCodeAt(0) - 97;
      return `${mirror ? level.width - 1 - x : x},${sq.slice(1)}${p}`;
    })
    .sort()
    .join(' ');
  const a = entries(false);
  const b = entries(true);
  return `${level.width}x${level.height} ${a < b ? a : b}`;
}

const MAX_SOLVE_MS = 350; // a level whose solution line is slower than this feels laggy on a phone

/** Plays the solution with best defence, like the app does. */
function mainLine(pos: Position, n: number, target: Target): Position[] {
  const base = material(pos);
  const line = [pos];
  let p = pos;
  for (let k = n; k >= 1; k--) {
    const move = solutions(p, k, target, base)[0];
    if (!move) break;
    p = makeMove(p, move);
    line.push(p);
    if (status(p) !== 'ongoing') break;
    p = makeMove(p, bestDefence(p, k - 1, target, base)!);
    line.push(p);
    if (target === 'win' && material(p) - base >= WIN_MARGIN) break;
  }
  return line;
}

function difficulty(pos: Position, n: number, key: Move): number {
  const after = makeMove(pos, key);
  const moves = legalMoves(pos);
  const givesCheck = isInCheck(after, 'b');
  const quiet = !givesCheck && !pos.squares[key.to];
  const mover = pos.squares[key.from]!;
  const sacrifice = mover.type !== 'K' && isAttacked(after, key.to, 'b') && !isAttacked(after, key.to, 'w');
  const traps = moves.filter((m) => status(makeMove(pos, m)) === 'stalemate').length;
  const tempting = givesCheck ? 0 : moves.filter((m) => isInCheck(makeMove(pos, m), 'b')).length;
  const pieces = pos.squares.filter(Boolean).length;
  return 10 * n
    + (quiet ? 4 : 0)
    + (sacrifice ? 6 : 0)
    + Math.min(traps, 3) * 2
    + Math.min(tempting, 6) * 0.5
    + pieces * 0.5
    + (pos.width * pos.height - 25) * 0.15
    + moves.length * 0.1;
}

/**
 * A mate/promotion candidate: unique first move, needs exactly n moves,
 * solvable fast enough, and (optionally) its final position fits the theme.
 */
function solveCandidate(
  width: number, height: number, pieces: Record<string, string> | null,
  target: Target, maxN: number, theme?: (final: Position) => boolean,
  keyTheme?: (pos: Position, key: Move) => boolean, minN = 1,
): Candidate | null {
  if (!pieces) return null;
  const pos = createPosition(width, height, pieces);
  if (isInCheck(pos, 'b') || isInCheck(pos, 'w') || status(pos) !== 'ongoing') return null;

  clearCache();
  const start = performance.now();
  const n = distance(pos, maxN, target);
  if (n === null || n < minN) return null;
  const sols = solutions(pos, n, target);
  if (sols.length !== 1) return null;
  if (keyTheme && !keyTheme(pos, sols[0])) return null;
  // Material levels must be won by the tactic, not by mating.
  if (target === 'win' && forces(pos, n, 'mate')) return null;
  clearCache();
  const line = mainLine(pos, n, target);
  if (performance.now() - start > MAX_SOLVE_MS) return null;
  if (theme && !theme(line[line.length - 1])) return null;

  return {
    level: { width, height, pieces, goal: { kind: target, moves: n } },
    bucket: n,
    score: difficulty(pos, n, sols[0]),
  };
}

/** Shortest path length and how many different shortest paths exist. */
function pathStats(pos: Position, from: number, target: number) {
  const piece = pos.squares[from]!;
  const dist = new Map([[from, 0]]);
  const ways = new Map([[from, 1]]);
  let frontier = [from];
  while (frontier.length > 0 && !dist.has(target)) {
    const next: number[] = [];
    for (const square of frontier) {
      const squares = pos.squares.slice();
      squares[from] = null;
      squares[square] = piece;
      for (const m of pathMoves({ ...pos, squares }, square)) {
        if (!dist.has(m.to)) {
          dist.set(m.to, dist.get(square)! + 1);
          ways.set(m.to, 0);
          next.push(m.to);
        }
        if (dist.get(m.to) === dist.get(square)! + 1) ways.set(m.to, ways.get(m.to)! + ways.get(square)!);
      }
    }
    frontier = next;
  }
  return dist.has(target) ? { moves: dist.get(target)!, paths: ways.get(target)! } : null;
}

function pathCandidate(width: number, height: number, mover: 'N' | 'K', obstacles: string[], minDetour: number): Candidate | null {
  const pieces = place(width, height, [{ letter: mover }, ...obstacles.map((letter) => ({ letter }))]);
  if (!pieces) return null;
  const pos = createPosition(width, height, pieces);
  const from = find(pos, mover);
  const empty = pos.squares.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
  const target = pick(empty);
  const stats = pathStats(pos, from, target);
  if (!stats || stats.moves < 2) return null;
  const [fx, fy] = xy(pos, from);
  const [tx, ty] = xy(pos, target);
  const detour = stats.moves - Math.max(Math.abs(fx - tx), Math.abs(fy - ty));
  if (mover === 'K' && detour < minDetour) return null;
  return {
    level: { width, height, pieces, goal: { kind: 'path', from: squareName(pos, from), target: squareName(pos, target), moves: stats.moves } },
    bucket: stats.moves,
    score: stats.moves * 10 + (width * height - 16) * 0.2 + obstacles.length * 2
      + (mover === 'K' ? detour * 4 : 0) - Math.log2(stats.paths) * 3,
  };
}

// --- Theme checks on the final position ------------------------------------

function checkers(pos: Position): number[] {
  const king = find(pos, 'k');
  return pos.squares.flatMap((p, sq) => (p?.color === 'w' && attackedFrom(pos, sq).includes(king) ? [sq] : []));
}

/** Mated on its last rank by a rook or queen checking along that rank. */
const backRankTheme = (pos: Position) => {
  const top = pos.height - 1;
  const king = find(pos, 'k');
  return xy(pos, king)[1] === top && checkers(pos).some((sq) => {
    const p = pos.squares[sq]!;
    return (p.type === 'R' || p.type === 'Q') && xy(pos, sq)[1] === top;
  });
};

/** The knight gives check or guards a square next to the mated king. */
const knightTheme = (pos: Position) => {
  const king = find(pos, 'k');
  const around = new Set(attackedFrom({ ...pos, squares: pos.squares.map((p, i) => (i === king ? p : null)) }, king));
  return pos.squares.some((p, sq) => p?.color === 'w' && p.type === 'N'
    && attackedFrom(pos, sq).some((t) => t === king || around.has(t)));
};

// --- Tactic checks on the first (key) move ------------------------------------

const VALUE: Record<string, number> = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 100 };
const LINES: Record<string, number[][]> = {
  R: [[1, 0], [-1, 0], [0, 1], [0, -1]],
  B: [[1, 1], [1, -1], [-1, 1], [-1, -1]],
  Q: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]],
};

/** The moved piece attacks two black pieces worth more than a pawn (or the king). */
const forkTheme = (pos: Position, key: Move) => {
  const after = makeMove(pos, key);
  const targets = attackedFrom(after, key.to).filter((sq) => {
    const p = after.squares[sq];
    return p?.color === 'b' && VALUE[p.type] >= 3;
  });
  return targets.length >= 2;
};

/** For each line of the moved slider: [first black piece hit, black piece right behind it]. */
function xRays(pos: Position, from: number): [number, number][] {
  const piece = pos.squares[from]!;
  const [fx, fy] = xy(pos, from);
  const pairs: [number, number][] = [];
  for (const [dx, dy] of LINES[piece.type] ?? []) {
    const hits: number[] = [];
    for (let x = fx + dx, y = fy + dy; x >= 0 && x < pos.width && y >= 0 && y < pos.height && hits.length < 2; x += dx, y += dy) {
      if (pos.squares[y * pos.width + x]) hits.push(y * pos.width + x);
    }
    if (hits.length === 2 && hits.every((sq) => pos.squares[sq]!.color === 'b')) pairs.push([hits[0], hits[1]]);
  }
  return pairs;
}

const value = (pos: Position, sq: number) => VALUE[pos.squares[sq]!.type];

/**
 * A black piece is pinned against something worth more (often the king) and
 * can't simply capture the pinning piece. The key move sets up the line; it
 * isn't a capture (otherwise it's usually just a trade).
 */
const pinTheme = (pos: Position, key: Move) => {
  if (pos.squares[key.to]) return false;
  const after = makeMove(pos, key);
  return xRays(after, key.to).some(([front, behind]) =>
    value(after, behind) > value(after, front) && !attackedFrom(after, front).includes(key.to));
};

/** A valuable piece is attacked and must move, exposing a piece behind it. */
const skewerTheme = (pos: Position, key: Move) => {
  if (pos.squares[key.to]) return false;
  const after = makeMove(pos, key);
  return xRays(after, key.to).some(([front, behind]) =>
    value(after, front) > value(after, behind) && value(after, behind) >= 3);
};

/**
 * Two black pieces on one line (`front`, then `behind` 1–2 squares further),
 * with room in front for a white slider to come in. Raises the hit rate for
 * pins and skewers a lot compared to fully random positions.
 */
function lineUp(w: number, h: number, front: string, behind: string): Spec[] {
  const [dx, dy] = pick(LINES.Q);
  const gap = 1 + rand(2);
  for (let tries = 0; tries < 30; tries++) {
    const fx = rand(w);
    const fy = rand(h);
    const bx = fx + dx * gap;
    const by = fy + dy * gap;
    const roomX = fx - dx;
    const roomY = fy - dy;
    const inside = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h;
    if (!inside(bx, by) || !inside(roomX, roomY)) continue;
    return [
      { letter: front, zone: (x, y) => x === fx && y === fy },
      { letter: behind, zone: (x, y) => x === bx && y === by },
    ];
  }
  return [];
}

/** White K + attackers, black K + pieces to win; the key move must show the tactic. */
function tacticCandidate(
  attackers: string[][], victims: string[], keyTheme: (pos: Position, key: Move) => boolean,
  line?: (w: number, h: number) => Spec[],
) {
  const [w, h] = size([[5, 5], [5, 5], [6, 6], [6, 6]]);
  const lined = line?.(w, h) ?? [];
  const specs: Spec[] = [...lined];
  if (!lined.some((s) => s.letter === 'k')) specs.push({ letter: 'k' });
  specs.push({ letter: 'K' });
  for (const letter of pick(attackers)) specs.push({ letter });
  const count = (lined.length > 0 ? 0 : 1) + rand(3);
  for (let i = 0; i < count; i++) specs.push({ letter: pick(victims) });
  return solveCandidate(w, h, place(w, h, specs), 'win', 3, undefined, keyTheme, 2);
}

// --- Chapters -------------------------------------------------------------

interface ChapterPlan {
  id: string;
  quotas: Record<number, number>; // bucket -> number of levels
  seconds: number; // time budget for the search
  make: () => Candidate | null;
}

const size = (options: [number, number][]) => pick(options);

const PLANS: ChapterPlan[] = [
  {
    id: 'knight-paths',
    quotas: { 2: 5, 3: 9, 4: 10, 5: 10, 6: 9, 7: 7 },
    seconds: 20,
    make: () => {
      const [w, h] = size([[4, 4], [5, 5], [5, 5], [6, 6], [6, 6], [7, 7]]);
      const count = 1 + rand(w >= 6 ? 4 : 2);
      return pathCandidate(w, h, 'N', Array.from({ length: count }, () => pick(['b', 'b', 'r', 'n', 'p', 'p'])), 0);
    },
  },
  {
    id: 'king-walks',
    quotas: { 3: 6, 4: 8, 5: 8, 6: 8 },
    seconds: 20,
    make: () => {
      const [w, h] = size([[5, 5], [5, 5], [6, 6], [6, 6], [7, 7]]);
      const count = 2 + rand(3);
      return pathCandidate(w, h, 'K', Array.from({ length: count }, () => pick(['b', 'r', 'n', 'n', 'p', 'q'])), 1);
    },
  },
  {
    id: 'forks',
    quotas: { 2: 34, 3: 16 },
    seconds: 150,
    make: () => tacticCandidate([['N'], ['N'], ['Q'], ['P', 'N'], ['B'], ['R'], ['N', 'P']], ['r', 'r', 'q', 'b', 'n', 'p'], forkTheme),
  },
  {
    id: 'pins',
    quotas: { 2: 28, 3: 12 },
    seconds: 360,
    make: () => tacticCandidate([['B'], ['R'], ['Q'], ['B', 'P'], ['R', 'N']], ['r', 'q', 'n', 'b', 'n', 'p'], pinTheme,
      (w, h) => (chance(0.5) ? [] : lineUp(w, h, pick(['n', 'b', 'r', 'n']), pick(['k', 'k', 'q'])))),
  },
  {
    id: 'skewers',
    quotas: { 2: 28, 3: 12 },
    seconds: 150,
    make: () => tacticCandidate([['B'], ['R'], ['Q'], ['R', 'P'], ['B', 'N']], ['r', 'r', 'q', 'b', 'n'], skewerTheme,
      (w, h) => (chance(0.5) ? [] : lineUp(w, h, pick(['k', 'k', 'q']), pick(['r', 'r', 'b', 'n'])))),
  },
  {
    id: 'back-rank',
    quotas: { 1: 14, 2: 18, 3: 8 },
    seconds: 60,
    make: () => {
      const [w, h] = size([[5, 5], [5, 6], [6, 6]]);
      const kx = rand(w);
      const specs: Spec[] = [{ letter: 'k', zone: (x, y) => x === kx && y === h - 1 }];
      for (const dx of [-1, 0, 1]) {
        if (kx + dx >= 0 && kx + dx < w && chance(0.8)) {
          specs.push({ letter: 'p', zone: (x, y) => x === kx + dx && y === h - 2 });
        }
      }
      if (chance(0.6)) specs.push({ letter: pick(['r', 'r', 'q', 'b', 'n']) });
      specs.push({ letter: 'K', zone: (_x, y) => y <= 1 });
      for (const letter of pick([['R'], ['R'], ['Q'], ['R', 'R'], ['Q', 'R'], ['R', 'B'], ['R', 'N']])) specs.push({ letter, zone: (_x, y) => y < h - 1 });
      return solveCandidate(w, h, place(w, h, specs), 'mate', 3, backRankTheme);
    },
  },
  {
    id: 'knight-mates',
    quotas: { 1: 16, 2: 22, 3: 12 },
    seconds: 90,
    make: () => {
      const [w, h] = size([[5, 5], [5, 5], [6, 6]]);
      const edge: Zone = (x, y) => x === 0 || x === w - 1 || y === h - 1;
      const kingSpec = { letter: 'k', zone: edge };
      const kingOnly = place(w, h, [kingSpec]);
      if (!kingOnly) return null;
      const [[sq]] = Object.entries(kingOnly);
      const kx = sq.charCodeAt(0) - 97;
      const ky = Number(sq.slice(1)) - 1;
      const specs: Spec[] = [{ letter: 'k', zone: (x, y) => x === kx && y === ky }];
      const blockers = 1 + rand(3);
      for (let i = 0; i < blockers; i++) specs.push({ letter: pick(['p', 'p', 'r', 'b', 'n', 'q']), zone: near(kx, ky, 1) });
      specs.push({ letter: 'K', zone: far(kx, ky, 2) });
      specs.push({ letter: 'N', zone: near(kx, ky, 3) });
      for (const letter of pick([[], ['R'], ['R'], ['Q'], ['N']])) specs.push({ letter });
      return solveCandidate(w, h, place(w, h, specs), 'mate', 3, knightTheme);
    },
  },
  {
    id: 'heavy-mates',
    quotas: { 1: 10, 2: 18, 3: 12 },
    seconds: 90,
    make: () => {
      const [w, h] = size([[5, 5], [5, 5], [6, 6]]);
      const specs: Spec[] = [{ letter: 'k' }, { letter: 'K' }];
      for (const letter of pick([['R', 'R'], ['R', 'R'], ['Q', 'R'], ['Q'], ['R', 'B']])) specs.push({ letter });
      const extras = rand(3);
      for (let i = 0; i < extras; i++) specs.push({ letter: pick(['p', 'p', 'b', 'n', 'r']) });
      return solveCandidate(w, h, place(w, h, specs), 'mate', 3);
    },
  },
  {
    id: 'queen-mates',
    quotas: { 1: 8, 2: 16, 3: 16, 4: 10 },
    seconds: 150,
    make: () => {
      const [w, h] = size([[4, 4], [5, 5], [5, 5], [6, 6]]);
      return solveCandidate(w, h, place(w, h, [{ letter: 'k' }, { letter: 'K' }, { letter: 'Q' }]), 'mate', 4);
    },
  },
  {
    id: 'rook-mates',
    quotas: { 1: 6, 2: 12, 3: 14, 4: 12, 5: 6 },
    seconds: 180,
    make: () => {
      const [w, h] = size([[4, 4], [5, 5], [5, 5], [6, 6]]);
      return solveCandidate(w, h, place(w, h, [{ letter: 'k' }, { letter: 'K' }, { letter: 'R' }]), 'mate', 5);
    },
  },
  {
    id: 'pawn-endgames',
    quotas: { 2: 8, 3: 12, 4: 12, 5: 10, 6: 8 },
    seconds: 180,
    make: () => {
      const [w, h] = size([[5, 5], [5, 6], [6, 6]]);
      const specs: Spec[] = [{ letter: 'k' }, { letter: 'K' }, { letter: 'P', zone: (_x, y) => y <= h - 3 }];
      if (chance(0.25)) specs.push({ letter: 'p', zone: (_x, y) => y >= 2 });
      return solveCandidate(w, h, place(w, h, specs), 'promote', 6);
    },
  },
];

// --- Selection ------------------------------------------------------------

/** Picks `count` items spread evenly over a list sorted easy -> hard. */
function spread<T>(sorted: T[], count: number): T[] {
  if (sorted.length <= count) return sorted;
  return Array.from({ length: count }, (_, i) => sorted[Math.round((i * (sorted.length - 1)) / (count - 1 || 1))]);
}

const POOL_FACTOR = 3; // collect 3x more candidates than needed, then spread

function generate(plan: ChapterPlan): Level[] {
  const buckets = new Map<number, Candidate[]>();
  const seen = new Set<string>();
  const wanted = (b: number) => (plan.quotas[b] ?? 0) * POOL_FACTOR;
  const full = () => Object.keys(plan.quotas).every((b) => (buckets.get(Number(b))?.length ?? 0) >= wanted(Number(b)));
  const deadline = Date.now() + plan.seconds * 1000;
  let tried = 0;

  while (Date.now() < deadline && !full()) {
    tried++;
    const c = plan.make();
    if (!c || !(c.bucket in plan.quotas)) continue;
    const list = buckets.get(c.bucket) ?? [];
    if (list.length >= wanted(c.bucket)) continue;
    const key = canonical(c.level);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(c);
    buckets.set(c.bucket, list);
  }

  const chosen = Object.entries(plan.quotas).flatMap(([b, quota]) =>
    spread((buckets.get(Number(b)) ?? []).sort((x, y) => x.score - y.score), quota));
  chosen.sort((x, y) => x.score - y.score);

  const report = Object.keys(plan.quotas).map((b) => `${b}:${buckets.get(Number(b))?.length ?? 0}/${wanted(Number(b))}`).join(' ');
  console.log(`${plan.id.padEnd(14)} ${String(chosen.length).padStart(3)} levels  (tried ${tried}, pool ${report})`);
  return chosen.map((c) => c.level);
}

// Only generate the chapters named on the command line (default: all),
// keeping the others from the existing file.
const only = process.argv.slice(2);
const outFile = new URL('../src/levels.json', import.meta.url);
let existing: Record<string, Level[]> = {};
try {
  existing = JSON.parse(readFileSync(outFile, 'utf8'));
} catch {
  // first run
}

const result: Record<string, Level[]> = {};
// Per-chapter seed from the chapter id: regenerating or adding one chapter
// doesn't change the others.
const seedOf = (id: string) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

PLANS.forEach((plan) => {
  if (only.length > 0 && !only.includes(plan.id)) {
    result[plan.id] = existing[plan.id] ?? [];
    return;
  }
  random = mulberry32(seedOf(plan.id));
  result[plan.id] = generate(plan);
});

// One level per line keeps git diffs readable.
const body = Object.entries(result)
  .map(([id, levels]) => `  "${id}": [\n${levels.map((l) => `    ${JSON.stringify(l)}`).join(',\n')}\n  ]`)
  .join(',\n');
writeFileSync(outFile, `{\n${body}\n}\n`);
