// Level definitions. Every level is checked by tests/levels.test.ts with the
// solver, so a broken or ambiguous level fails the test suite.

export interface PathGoal {
  kind: 'path';
  from: string; // the piece that moves
  target: string;
  moves: number; // must equal the shortest path
}

export interface MateGoal {
  kind: 'mate';
  moves: number; // mate in N against perfect defence
}

export interface Level {
  id: string;
  world: string; // the real chess skill this level trains
  title: string;
  hint: string;
  width: number;
  height: number;
  pieces: Record<string, string>; // uppercase = white, lowercase = black
  goal: PathGoal | MateGoal;
}

export const LEVELS: Level[] = [
  {
    id: 'vision-1',
    world: 'Piece vision',
    title: 'Knight’s path',
    hint: 'Reach the gold square in 4 moves. Never stop on a square the bishop attacks.',
    width: 5,
    height: 5,
    pieces: { a1: 'N', d2: 'b' },
    goal: { kind: 'path', from: 'a1', target: 'e5', moves: 4 },
  },
  {
    id: 'patterns-1',
    world: 'Mating patterns',
    title: 'Back rank',
    hint: 'The king is trapped behind its own pawns. Mate in 1.',
    width: 5,
    height: 5,
    pieces: { c1: 'K', a1: 'R', e5: 'k', d4: 'p', e4: 'p' },
    goal: { kind: 'mate', moves: 1 },
  },
  {
    id: 'endgame-1',
    world: 'Endgame technique',
    title: 'The quiet king',
    hint: 'Rook mates need the king’s help. Mate in 2 – the first move gives no check.',
    width: 5,
    height: 5,
    pieces: { a3: 'K', d3: 'R', c5: 'k' },
    goal: { kind: 'mate', moves: 2 },
  },
];
