// Chess rules for boards of any size from 3x3 to 8x8.
// Squares are numbered 0..width*height-1, row by row starting at a1.
// Simplifications vs. full chess: no castling, no en passant, pawns always
// promote to a queen.

export type Color = 'w' | 'b';
export type PieceType = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';

export interface Piece {
  type: PieceType;
  color: Color;
}

export interface Position {
  width: number;
  height: number;
  squares: (Piece | null)[];
  turn: Color;
}

export interface Move {
  from: number;
  to: number;
  promotion?: PieceType;
}

const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];

export const opponent = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function squareName(pos: Position, square: number): string {
  const file = square % pos.width;
  const rank = Math.floor(square / pos.width);
  return String.fromCharCode(97 + file) + (rank + 1);
}

export function parseSquare(pos: Position, name: string): number {
  const file = name.charCodeAt(0) - 97;
  const rank = Number(name.slice(1)) - 1;
  if (file < 0 || file >= pos.width || rank < 0 || rank >= pos.height || Number.isNaN(rank)) {
    throw new Error(`Square ${name} is not on a ${pos.width}x${pos.height} board`);
  }
  return rank * pos.width + file;
}

/** pieces: e.g. { a1: 'R', e5: 'k' } – uppercase = white, lowercase = black. */
export function createPosition(
  width: number,
  height: number,
  pieces: Record<string, string>,
  turn: Color = 'w',
): Position {
  const pos: Position = { width, height, squares: new Array(width * height).fill(null), turn };
  for (const [name, letter] of Object.entries(pieces)) {
    const type = letter.toUpperCase() as PieceType;
    if (!'KQRBNP'.includes(type)) throw new Error(`Unknown piece ${letter}`);
    pos.squares[parseSquare(pos, name)] = { type, color: letter === type ? 'w' : 'b' };
  }
  return pos;
}

/** Squares the piece on `from` attacks (for pawns: only the diagonals). */
export function attackedFrom(pos: Position, from: number): number[] {
  const piece = pos.squares[from];
  if (!piece) return [];
  const { width, height } = pos;
  const x = from % width;
  const y = Math.floor(from / width);
  const result: number[] = [];
  const onBoard = (fx: number, fy: number) => fx >= 0 && fx < width && fy >= 0 && fy < height;

  const steps = (list: number[][]) => {
    for (const [dx, dy] of list) {
      if (onBoard(x + dx, y + dy)) result.push((y + dy) * width + x + dx);
    }
  };
  const slides = (dirs: number[][]) => {
    for (const [dx, dy] of dirs) {
      let fx = x + dx;
      let fy = y + dy;
      while (onBoard(fx, fy)) {
        result.push(fy * width + fx);
        if (pos.squares[fy * width + fx]) break; // blocked
        fx += dx;
        fy += dy;
      }
    }
  };

  switch (piece.type) {
    case 'K': steps(ALL_DIRS); break;
    case 'N': steps(KNIGHT_STEPS); break;
    case 'R': slides(ROOK_DIRS); break;
    case 'B': slides(BISHOP_DIRS); break;
    case 'Q': slides(ALL_DIRS); break;
    case 'P': steps(piece.color === 'w' ? [[1, 1], [-1, 1]] : [[1, -1], [-1, -1]]); break;
  }
  return result;
}

export function isAttacked(pos: Position, square: number, by: Color): boolean {
  return pos.squares.some((p, from) => p?.color === by && attackedFrom(pos, from).includes(square));
}

export function isInCheck(pos: Position, color: Color): boolean {
  const king = pos.squares.findIndex((p) => p?.type === 'K' && p.color === color);
  // Training levels may have no king at all (e.g. knight paths).
  return king !== -1 && isAttacked(pos, king, opponent(color));
}

function pseudoMoves(pos: Position): Move[] {
  const moves: Move[] = [];
  const { width, height, turn } = pos;

  pos.squares.forEach((piece, from) => {
    if (!piece || piece.color !== turn) return;

    if (piece.type !== 'P') {
      for (const to of attackedFrom(pos, from)) {
        if (pos.squares[to]?.color !== turn) moves.push({ from, to });
      }
      return;
    }

    // Pawns: forward to empty squares, diagonally only to capture.
    const dir = turn === 'w' ? 1 : -1;
    const y = Math.floor(from / width);
    const lastRank = turn === 'w' ? height - 1 : 0;
    const push = (to: number) => {
      moves.push(Math.floor(to / width) === lastRank ? { from, to, promotion: 'Q' } : { from, to });
    };

    const one = from + dir * width;
    if (y + dir >= 0 && y + dir < height && !pos.squares[one]) {
      push(one);
      const startRank = turn === 'w' ? 1 : height - 2;
      const two = one + dir * width;
      if (height >= 6 && y === startRank && !pos.squares[two]) push(two);
    }
    for (const to of attackedFrom(pos, from)) {
      const target = pos.squares[to];
      if (target && target.color !== turn) push(to);
    }
  });
  return moves;
}

/** Returns a new position; the original is never changed. */
export function makeMove(pos: Position, move: Move): Position {
  const squares = pos.squares.slice();
  const piece = squares[move.from]!;
  squares[move.to] = move.promotion ? { type: move.promotion, color: piece.color } : piece;
  squares[move.from] = null;
  return { ...pos, squares, turn: opponent(pos.turn) };
}

export function legalMoves(pos: Position): Move[] {
  return pseudoMoves(pos).filter((m) => !isInCheck(makeMove(pos, m), pos.turn));
}

export type Status = 'ongoing' | 'checkmate' | 'stalemate';

export function status(pos: Position): Status {
  if (legalMoves(pos).length > 0) return 'ongoing';
  return isInCheck(pos, pos.turn) ? 'checkmate' : 'stalemate';
}

export const sameMove = (a: Move, b: Move) =>
  a.from === b.from && a.to === b.to && (a.promotion ?? null) === (b.promotion ?? null);

export function moveName(pos: Position, move: Move): string {
  const piece = pos.squares[move.from]!;
  const letter = piece.type === 'P' ? '' : piece.type;
  const capture = pos.squares[move.to] ? 'x' : '-';
  return `${letter}${squareName(pos, move.from)}${capture}${squareName(pos, move.to)}${move.promotion ?? ''}`;
}
