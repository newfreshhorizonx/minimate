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

Three example levels exist so far, one each for piece vision, mating patterns and endgame technique.

## How it works

- `src/engine/board.ts` – chess rules for any board size (no castling / en passant).
- `src/engine/solver.ts` – exact solvers. Small boards can be searched completely, so:
  - the opponent always plays the **best defence** (delays mate the longest),
  - every level is **proven** to have exactly one solution (`tests/levels.test.ts`).
- `src/levels.ts` – level definitions. Adding a level = adding an object here;
  the tests fail if it is broken or has a second solution.
- `src/main.ts` – the UI (plain TypeScript, no framework).

It is a PWA: on an iPhone open the site in Safari → Share → *Add to Home Screen*.

## Development

Requires [Node.js](https://nodejs.org/) 20+.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # engine + level checks
npm run build   # production build in dist/
```

## Roadmap

- [x] Mini-board engine, solver, 3 example levels
- [ ] 10+ levels per world, level select with progress
- [ ] Spaced repetition: failed motifs come back later
- [x] Deploy to GitHub Pages – play at https://newfreshhorizonx.github.io/minimate/
- [ ] App Store build via Capacitor
