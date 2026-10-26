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

export interface PromoteGoal {
  kind: 'promote';
  moves: number; // get a queen that can't be taken, in N moves against perfect defence
}

export interface Level {
  id: string;
  world: string; // the real chess skill this level trains
  title: string;
  hint: string;
  width: number;
  height: number;
  pieces: Record<string, string>; // uppercase = white, lowercase = black
  goal: PathGoal | MateGoal | PromoteGoal;
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
    id: 'vision-2',
    world: 'Piece vision',
    title: 'Two guards',
    hint: 'A bigger board and two bishops. Reach the gold square in 6 moves.',
    width: 6,
    height: 6,
    pieces: { a1: 'N', c4: 'b', e3: 'b' },
    goal: { kind: 'path', from: 'a1', target: 'f6', moves: 6 },
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
    id: 'patterns-2',
    world: 'Mating patterns',
    title: 'Smothered mate',
    hint: 'The king is surrounded by its own pieces. Only one piece can jump in. Mate in 1.',
    width: 5,
    height: 5,
    pieces: { e1: 'K', e3: 'N', a5: 'k', b5: 'r', a4: 'p', b4: 'p' },
    goal: { kind: 'mate', moves: 1 },
  },
  {
    id: 'patterns-3',
    world: 'Mating patterns',
    title: 'Anastasia’s mate',
    hint: 'The knight already guards the escape squares. The rook finishes along the edge. Mate in 1.',
    width: 5,
    height: 5,
    pieces: { a5: 'K', a1: 'R', b4: 'N', e4: 'k', d4: 'p' },
    goal: { kind: 'mate', moves: 1 },
  },
  {
    id: 'patterns-4',
    world: 'Mating patterns',
    title: 'Arabian mate',
    hint: 'Rook and knight against a king in the corner. The knight protects the rook. Mate in 1.',
    width: 5,
    height: 5,
    pieces: { a1: 'K', a4: 'R', c3: 'N', e5: 'k' },
    goal: { kind: 'mate', moves: 1 },
  },
  {
    id: 'patterns-5',
    world: 'Mating patterns',
    title: 'The ladder',
    hint: 'Two rooks take turns: one checks, the other guards the next rank. Mate in 2.',
    width: 5,
    height: 5,
    pieces: { a1: 'K', a5: 'R', b3: 'R', e4: 'k' },
    goal: { kind: 'mate', moves: 2 },
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
  {
    id: 'endgame-2',
    world: 'Endgame technique',
    title: 'Stalemate trap',
    hint: 'The queen already boxes the king in – too well. Leave it a move, bring your king. Mate in 2.',
    width: 5,
    height: 5,
    pieces: { a2: 'K', b2: 'Q', a5: 'k' },
    goal: { kind: 'mate', moves: 2 },
  },
  {
    id: 'endgame-3',
    world: 'Endgame technique',
    title: 'Losing a tempo',
    hint: 'Sometimes the best move is a waiting move that keeps the box closed. Mate in 3.',
    width: 5,
    height: 5,
    pieces: { a2: 'K', b4: 'R', a5: 'k' },
    goal: { kind: 'mate', moves: 3 },
  },
  {
    id: 'endgame-4',
    world: 'Endgame technique',
    title: 'King in front',
    hint: 'In pawn endgames the king leads and the pawn follows. Promote to a queen that can’t be taken, in 3 moves.',
    width: 5,
    height: 5,
    pieces: { a3: 'K', c3: 'P', d5: 'k' },
    goal: { kind: 'promote', moves: 3 },
  },
];
