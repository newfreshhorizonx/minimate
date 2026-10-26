# Minimate

Small-board chess levels that train **real** chess skills.

Each level uses a small board (3x3 to 8x8) with only the pieces that matter.
Unlike puzzle apps that only ask "find the mate", levels are grouped into
worlds that each train one skill you use in real games.

## Worlds (planned)

| World | Trains | Example |
|---|---|---|
| Piece vision | seeing where pieces can go | knight paths around guarded squares |
| Mating patterns | recognising mates by name | back rank, smothered, Anastasia, Arabian |
| Tactics | one motif per world | forks, pins, skewers, discovered attacks |
| Defence | finding the only move | avoid mate, hold the draw |
| Endgame technique | playing it out against perfect defence | K+R vs K, opposition, square of the pawn |
| Transfer | the same idea on a full 8x8 board | patterns hidden in real-looking positions |

360 levels in 8 chapters so far, each going from easy to hard:

| World | Chapter | Levels |
|---|---|---|
| Piece vision | Knight paths | 50 |
| Piece vision | King walks | 30 |
| Mating patterns | Back rank | 40 |
| Mating patterns | Knight mates (smothered, Anastasia, Arabian) | 50 |
| Mating patterns | Rooks & queens (ladder, box) | 40 |
| Endgame technique | Queen mates (incl. stalemate traps) | 50 |
| Endgame technique | Rook mates (quiet king moves, waiting moves) | 50 |
| Endgame technique | Pawn endgames (king in front, opposition) | 50 |

Move pieces by tapping (piece, then square) or by dragging them.
Levels unlock as you go, up to three ahead of your furthest solved one.

## How it works

- `src/engine/board.ts` – chess rules for any board size (no castling / en passant, pawns promote to a queen).
- `src/engine/solver.ts` – exact solvers. Small boards can be searched completely, so:
  - the opponent always plays the **best defence** (delays mate or promotion the longest),
  - every level is **proven** to have exactly one solution (`tests/levels.test.ts`).
- `scripts/generate-levels.ts` – the level generator. For each chapter it places
  pieces at random (following the chapter's theme), keeps positions the solver
  proves have exactly one winning first move, rates their difficulty (moves
  needed, quiet or sacrificing key move, stalemate traps, tempting checks,
  board size) and picks levels spread from easy to hard. Output: `src/levels.json`.
- `src/levels.ts` – chapter titles and intros.
- `src/main.ts` – the UI (plain TypeScript, no framework).

It is a PWA: on an iPhone open the site in Safari → Share → *Add to Home Screen*.

## Development

Requires [Node.js](https://nodejs.org/) 20+.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # engine + level checks
npm run build   # production build in dist/
npm run generate                 # regenerate all levels (~12 min)
npm run generate -- rook-mates   # regenerate one chapter only
```

## Roadmap

- [x] Mini-board engine, solver, 3 example levels
- [x] Chapters with 30–50 generated levels each, level select with progress
- [ ] More chapters: tactics (forks, pins, skewers), defence, opposition duels
- [ ] Spaced repetition: failed motifs come back later
- [x] Deploy to GitHub Pages – play at https://newfreshhorizonx.github.io/minimate/
- [ ] App Store build via Capacitor
