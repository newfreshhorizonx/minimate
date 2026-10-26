import './style.css';
import {
  type Move, type Position, createPosition, legalMoves, makeMove, moveName, parseSquare,
  squareName, status,
} from './engine/board';
import { WIN_MARGIN, bestDefence, clearCache, material, moveWins, pathMoves } from './engine/solver';
import { CHAPTERS, type Chapter, type Level, goalText } from './levels';

// Same glyph for both colours (styled via CSS); ︎ stops iOS drawing emoji.
const GLYPHS: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const PIECE_NAMES: Record<string, string> = { K: 'king', N: 'knight' };
const STORAGE_KEY = 'minimate.progress';
const DRAG_THRESHOLD = 6; // px the pointer must travel before a press becomes a drag
const UNLOCK_AHEAD = 3; // levels playable beyond the furthest solved one

const app = document.querySelector<HTMLElement>('#app')!;

interface Game {
  chapter: Chapter;
  index: number;
  level: Level;
  pos: Position;
  base: number; // material balance at the start; "win material" levels measure against it
  pathSquare: number; // path levels: where the moving piece is now
  movesUsed: number;
  selected: number | null;
  lastMove: Move | null;
  message: string;
  tone: '' | 'good' | 'bad';
  over: boolean;
  busy: boolean;
}

interface Drag {
  from: number;
  wasSelected: boolean; // a tap on an already selected piece deselects it
  startX: number;
  startY: number;
  ghost: HTMLElement | null; // the floating piece, created once the drag starts
}

let game: Game | null = null;
let openChapter: Chapter | null = null; // the level grid being shown when no game runs
let drag: Drag | null = null;

// --- Progress: solved level numbers per chapter ----------------------------

type Progress = Record<string, number[]>;

function loadProgress(): Progress {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function markSolved(chapter: Chapter, index: number) {
  const progress = loadProgress();
  const solved = new Set(progress[chapter.id] ?? []);
  solved.add(index);
  progress[chapter.id] = [...solved];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Private mode: progress just isn't saved.
  }
}

const solvedIn = (chapter: Chapter) => new Set(loadProgress()[chapter.id] ?? []);

function isUnlocked(solved: Set<number>, index: number): boolean {
  return index <= Math.max(-1, ...solved) + UNLOCK_AHEAD;
}

function startLevel(chapter: Chapter, index: number) {
  const level = chapter.levels[index];
  const pos = createPosition(level.width, level.height, level.pieces);
  const pathSquare = level.goal.kind === 'path' ? parseSquare(pos, level.goal.from) : -1;
  clearCache(); // keeps memory small; results from another level are useless here
  openChapter = chapter;
  game = {
    chapter,
    index,
    level,
    pos,
    base: material(pos),
    pathSquare,
    movesUsed: 0,
    selected: level.goal.kind === 'path' ? pathSquare : null, // only one piece can move
    lastMove: null,
    message: level.goal.kind === 'path' ? `${level.goal.moves} moves left.` : 'White to move.',
    tone: '',
    over: false,
    busy: false,
  };
  render();
}

/** Can the player pick up the piece on this square? */
function movable(g: Game, square: number): boolean {
  if (g.over || g.busy) return false;
  if (g.level.goal.kind === 'path') return square === g.pathSquare;
  return g.pos.squares[square]?.color === 'w';
}

/** Moves the player may make with the selected piece. */
function options(g: Game): Move[] {
  if (g.selected === null) return [];
  if (g.level.goal.kind === 'path') return pathMoves(g.pos, g.selected);
  return legalMoves(g.pos).filter((m) => m.from === g.selected);
}

function finish(g: Game, won: boolean, message: string) {
  g.over = true;
  g.selected = null;
  g.tone = won ? 'good' : 'bad';
  g.message = message;
  if (won) markSolved(g.chapter, g.index);
}

function playPath(g: Game, move: Move) {
  const goal = g.level.goal;
  if (goal.kind !== 'path') return;
  g.pos = makeMove(g.pos, move);
  g.pos.turn = 'w'; // black never moves in path levels
  g.pathSquare = move.to;
  g.lastMove = move;
  g.movesUsed++;
  if (move.to === parseSquare(g.pos, goal.target)) {
    finish(g, true, `Solved in ${g.movesUsed} moves!`);
  } else if (g.movesUsed >= goal.moves) {
    finish(g, false, `Out of moves – the target is ${goal.moves} moves away. Try again.`);
  } else {
    g.selected = move.to;
    g.tone = '';
    g.message = `${goal.moves - g.movesUsed} moves left.`;
  }
}

const FAIL_TEXT = {
  mate: 'lets black escape',
  promote: 'lets black stop the pawn',
  win: 'doesn’t win material – black holds',
};

/** Mate, promotion and material levels: black answers every move with its best defence. */
function playAgainstDefence(g: Game, move: Move) {
  const goal = g.level.goal;
  if (goal.kind === 'path') return;
  const remaining = goal.moves - g.movesUsed;
  const name = moveName(g.pos, move);
  const wins = moveWins(g.pos, move, remaining, goal.kind, g.base);
  const next = makeMove(g.pos, move);
  g.pos = next;
  g.lastMove = move;
  g.movesUsed++;

  const result = status(next);
  if (result === 'checkmate') return finish(g, true, `${name} – checkmate!`);
  if (result === 'stalemate') return finish(g, false, `${name} is stalemate – a draw. Leave the king a square!`);
  if (goal.kind === 'promote' && move.promotion && wins) return finish(g, true, `${name} – a new queen, and it’s safe!`);
  if (!wins) return finish(g, false, `${name} ${FAIL_TEXT[goal.kind]}. Try again.`);

  g.busy = true;
  g.message = `${name} – black is thinking…`;
  setTimeout(() => {
    const reply = bestDefence(next, remaining - 1, goal.kind, g.base)!;
    const replyName = moveName(next, reply);
    g.pos = makeMove(next, reply);
    g.lastMove = reply;
    g.busy = false;
    const gained = material(g.pos) - g.base;
    const left = goal.moves - g.movesUsed;
    if (goal.kind === 'win' && gained >= WIN_MARGIN) {
      finish(g, true, `Black played ${replyName}. You won material: +${gained}!`);
    } else {
      g.message = `Black played ${replyName}. ${left} move${left === 1 ? '' : 's'} left.`;
    }
    if (game === g) render();
  }, 450);
}

/** Tries to move the selected piece to `square`. Returns false if that isn't legal. */
function tryMove(g: Game, square: number): boolean {
  const move = options(g).find((m) => m.to === square);
  if (!move) return false;
  g.selected = null;
  g.tone = '';
  if (g.level.goal.kind === 'path') playPath(g, move);
  else playAgainstDefence(g, move);
  return true;
}

/** A tap on a square that isn't a piece the player can pick up. */
function tapSquare(g: Game, square: number) {
  if (g.over || g.busy) return;
  if (tryMove(g, square)) return render();
  if (g.level.goal.kind === 'path' && g.selected !== null) {
    const piece = PIECE_NAMES[g.pos.squares[g.selected]!.type] ?? 'piece';
    g.tone = 'bad';
    g.message = `Not there – the ${piece} can’t reach that square, or a black piece guards it.`;
  } else {
    g.selected = null;
  }
  render();
}

// --- Dragging -------------------------------------------------------------
// Press a piece and either release it (tap: select it, then tap a target)
// or drag it straight onto the target square.

function squareAt(x: number, y: number): number | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-square]');
  return el ? Number(el.dataset.square) : null;
}

function onPointerDown(event: PointerEvent, square: number) {
  const g = game;
  if (!g || event.button !== 0) return;
  if (!movable(g, square)) return tapSquare(g, square);

  // Own pieces can never be capture targets, so pressing one always selects it.
  drag = { from: square, wasSelected: g.selected === square, startX: event.clientX, startY: event.clientY, ghost: null };
  g.selected = square;
  render();
  event.preventDefault();
}

function onPointerMove(event: PointerEvent) {
  if (!drag || !game) return;
  if (!drag.ghost) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < DRAG_THRESHOLD) return;
    const cell = app.querySelector<HTMLElement>(`[data-square="${drag.from}"]`);
    const piece = game.pos.squares[drag.from];
    if (!cell || !piece) return;
    const size = cell.getBoundingClientRect().height;
    drag.ghost = document.createElement('div');
    drag.ghost.className = `piece ${piece.color} ghost`;
    drag.ghost.textContent = GLYPHS[piece.type] + '︎';
    drag.ghost.style.fontSize = `${size * 0.86}px`;
    document.body.append(drag.ghost);
    cell.classList.add('lifted');
  }
  drag.ghost.style.transform = `translate(${event.clientX}px, ${event.clientY}px) translate(-50%, -55%)`;
}

function onPointerUp(event: PointerEvent) {
  const d = drag;
  const g = game;
  drag = null;
  if (!d || !g) return;
  if (d.ghost) {
    d.ghost.remove();
    // Dropped somewhere illegal: tryMove does nothing, the piece snaps back and stays selected.
    const to = squareAt(event.clientX, event.clientY);
    if (to !== null && to !== d.from) tryMove(g, to);
    render();
  } else if (d.wasSelected && g.level.goal.kind !== 'path') {
    g.selected = null;
    render();
  }
}

window.addEventListener('pointermove', onPointerMove);
window.addEventListener('pointerup', onPointerUp);
window.addEventListener('pointercancel', () => {
  drag?.ghost?.remove();
  drag = null;
  render();
});

// --- Rendering ------------------------------------------------------------

function renderBoard(g: Game): HTMLElement {
  const { pos } = g;
  const board = document.createElement('div');
  board.className = 'board';
  board.style.setProperty('--cols', String(pos.width));
  board.style.setProperty('--rows', String(pos.height));
  const targets = new Set(options(g).map((m) => m.to));
  const goalSquare = g.level.goal.kind === 'path' ? parseSquare(pos, g.level.goal.target) : -1;

  for (let rank = pos.height - 1; rank >= 0; rank--) {
    for (let file = 0; file < pos.width; file++) {
      const square = rank * pos.width + file;
      const cell = document.createElement('button');
      cell.className = `square ${(rank + file) % 2 === 0 ? 'dark' : 'light'}`;
      cell.dataset.square = String(square);
      if (square === g.selected) cell.classList.add('selected');
      if (g.lastMove && (square === g.lastMove.from || square === g.lastMove.to)) cell.classList.add('last');
      if (targets.has(square)) cell.classList.add(pos.squares[square] ? 'capture' : 'option');
      if (square === goalSquare) cell.classList.add('target');
      cell.setAttribute('aria-label', squareName(pos, square));

      const piece = pos.squares[square];
      if (piece) {
        const span = document.createElement('span');
        span.className = `piece ${piece.color}`;
        span.textContent = GLYPHS[piece.type] + '︎';
        cell.append(span);
      }
      if (file === 0) {
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = String(rank + 1);
        cell.append(label);
      }
      cell.addEventListener('pointerdown', (e) => onPointerDown(e, square));
      // Keyboard users: Enter/Space fire a click with detail 0 (mouse/touch clicks are handled above).
      cell.addEventListener('click', (e) => {
        if (e.detail === 0 && game) {
          if (movable(game, square) && game.selected !== square) {
            game.selected = square;
            render();
          } else {
            tapSquare(game, square);
          }
        }
      });
      board.append(cell);
    }
  }
  return board;
}

function renderLevel(g: Game) {
  const { chapter, index } = g;
  const hasNext = index + 1 < chapter.levels.length;
  const won = g.over && g.tone === 'good';
  app.innerHTML = `
    <div class="top-bar">
      <button class="text-btn" id="back">‹ ${chapter.title}</button>
      <span class="world">Level ${index + 1} / ${chapter.levels.length}</span>
    </div>
    <h1>${goalText(g.level.goal)}</h1>
    <p class="hint">${chapter.intro}</p>
    <div id="board"></div>
    <p class="status ${g.tone}">${g.message}</p>
    <div class="actions">
      <button class="secondary" id="retry">Retry</button>
      ${won ? `<button class="primary" id="next">${hasNext ? 'Next level' : 'Chapter done!'}</button>` : ''}
    </div>`;
  app.querySelector('#board')!.replaceWith(renderBoard(g));
  app.querySelector('#back')!.addEventListener('click', () => { game = null; render(); });
  app.querySelector('#retry')!.addEventListener('click', () => startLevel(chapter, index));
  app.querySelector('#next')?.addEventListener('click', () => {
    if (hasNext) return startLevel(chapter, index + 1);
    game = null;
    openChapter = null;
    render();
  });
}

function renderChapter(chapter: Chapter) {
  const solved = solvedIn(chapter);
  app.innerHTML = `
    <div class="top-bar">
      <button class="text-btn" id="back">‹ Chapters</button>
      <span class="world">${solved.size} / ${chapter.levels.length}</span>
    </div>
    <p class="world">${chapter.world}</p>
    <h1>${chapter.title}</h1>
    <p class="hint">${chapter.intro}</p>
    <div class="level-grid">
      ${chapter.levels.map((_, i) => {
        const state = solved.has(i) ? 'solved' : isUnlocked(solved, i) ? 'open' : 'locked';
        return `<button class="level-tile ${state}" data-index="${i}" ${state === 'locked' ? 'disabled' : ''}
          aria-label="Level ${i + 1}${state === 'solved' ? ', solved' : ''}">${i + 1}</button>`;
      }).join('')}
    </div>`;
  app.querySelector('#back')!.addEventListener('click', () => { openChapter = null; render(); });
  app.querySelectorAll<HTMLButtonElement>('.level-tile:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => startLevel(chapter, Number(btn.dataset.index)));
  });
}

function renderHome() {
  const worlds = [...new Set(CHAPTERS.map((c) => c.world))];
  app.innerHTML = `
    <h1>Minimate</h1>
    <p class="tagline">Small boards. Real chess skills.</p>
    ${worlds.map((world) => `
      <h2>${world}</h2>
      ${CHAPTERS.filter((c) => c.world === world).map((c) => {
        const done = solvedIn(c).size;
        const total = c.levels.length;
        return `
        <button class="level-card" data-id="${c.id}">
          <span class="card-title">${c.title}</span>
          <span class="card-count ${done === total ? 'done' : ''}">${done} / ${total}</span>
          <span class="progress"><span style="width: ${total ? (100 * done) / total : 0}%"></span></span>
        </button>`;
      }).join('')}`).join('')}`;
  app.querySelectorAll<HTMLButtonElement>('.level-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      openChapter = CHAPTERS.find((c) => c.id === btn.dataset.id)!;
      render();
    });
  });
}

function render() {
  if (game) renderLevel(game);
  else if (openChapter) renderChapter(openChapter);
  else renderHome();
}

render();
