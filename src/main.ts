import './style.css';
import {
  type Move, type Position, createPosition, legalMoves, makeMove, moveName, parseSquare,
  squareName, status,
} from './engine/board';
import { bestDefence, defenderIsLost, pathMoves } from './engine/solver';
import { LEVELS, type Level } from './levels';

// Same glyph for both colours (styled via CSS); ︎ stops iOS drawing emoji.
const GLYPHS: Record<string, string> = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const STORAGE_KEY = 'minimate.solved';

const app = document.querySelector<HTMLElement>('#app')!;

interface Game {
  level: Level;
  pos: Position;
  pathSquare: number; // path levels: where the moving piece is now
  movesUsed: number;
  selected: number | null;
  lastMove: Move | null;
  message: string;
  tone: '' | 'good' | 'bad';
  over: boolean;
  busy: boolean;
}

let game: Game | null = null;

function loadSolved(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

function markSolved(id: string) {
  const solved = loadSolved();
  solved.add(id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...solved]));
  } catch {
    // Private mode: progress just isn't saved.
  }
}

function startLevel(level: Level) {
  const pos = createPosition(level.width, level.height, level.pieces);
  const pathSquare = level.goal.kind === 'path' ? parseSquare(pos, level.goal.from) : -1;
  game = {
    level,
    pos,
    pathSquare,
    movesUsed: 0,
    selected: level.goal.kind === 'path' ? pathSquare : null, // only one piece can move
    lastMove: null,
    message: level.goal.kind === 'mate' ? 'White to move.' : `${level.goal.moves} moves left.`,
    tone: '',
    over: false,
    busy: false,
  };
  render();
}

/** Moves the player may make with the selected piece. */
function options(g: Game): Move[] {
  if (g.selected === null) return [];
  if (g.level.goal.kind === 'path') return pathMoves(g.pos, g.selected);
  return legalMoves(g.pos).filter((m) => m.from === g.selected && (!m.promotion || m.promotion === 'Q'));
}

function finish(g: Game, won: boolean, message: string) {
  g.over = true;
  g.tone = won ? 'good' : 'bad';
  g.message = message;
  if (won) markSolved(g.level.id);
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

function playMate(g: Game, move: Move) {
  const goal = g.level.goal;
  if (goal.kind !== 'mate') return;
  const remaining = goal.moves - g.movesUsed;
  const name = moveName(g.pos, move);
  const next = makeMove(g.pos, move);
  g.pos = next;
  g.lastMove = move;
  g.movesUsed++;

  const result = status(next);
  if (result === 'checkmate') return finish(g, true, `${name} – checkmate!`);
  if (result === 'stalemate') return finish(g, false, `${name} is stalemate. Careful with the last free squares!`);
  if (!defenderIsLost(next, remaining)) {
    return finish(g, false, `${name} lets black escape. Try again.`);
  }

  // Black defends perfectly: it picks the reply that delays mate the longest.
  g.busy = true;
  g.message = `${name} – black is thinking…`;
  setTimeout(() => {
    const reply = bestDefence(next, remaining - 1)!;
    const replyName = moveName(next, reply);
    g.pos = makeMove(next, reply);
    g.lastMove = reply;
    g.busy = false;
    g.message = `Black played ${replyName}. Mate in ${goal.moves - g.movesUsed}.`;
    render();
  }, 450);
}

function onSquare(square: number) {
  const g = game;
  if (!g || g.over || g.busy) return;
  const move = options(g).find((m) => m.to === square);
  if (move) {
    g.selected = null;
    if (g.level.goal.kind === 'path') playPath(g, move);
    else playMate(g, move);
  } else if (g.pos.squares[square]?.color === 'w' && (g.level.goal.kind === 'mate' || square === g.pathSquare)) {
    g.selected = square === g.selected ? null : square;
  } else if (g.level.goal.kind === 'path' && g.selected !== null) {
    g.tone = 'bad';
    g.message = 'Not there – the knight can’t reach that square, or the bishop guards it.';
  } else {
    g.selected = null;
  }
  render();
}

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
      if (square === g.selected) cell.classList.add('selected');
      if (g.lastMove && (square === g.lastMove.from || square === g.lastMove.to)) cell.classList.add('last');
      if (targets.has(square)) cell.classList.add('option');
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
      cell.addEventListener('click', () => onSquare(square));
      board.append(cell);
    }
  }
  return board;
}

function renderLevel(g: Game) {
  const index = LEVELS.indexOf(g.level);
  const next = LEVELS[index + 1];
  app.innerHTML = `
    <div class="top-bar">
      <button class="text-btn" id="back">‹ Levels</button>
      <span class="world">${index + 1} / ${LEVELS.length}</span>
    </div>
    <p class="world">${g.level.world}</p>
    <h1>${g.level.title}</h1>
    <p class="hint">${g.level.hint}</p>
    <div id="board"></div>
    <p class="status ${g.tone}">${g.message}</p>
    <div class="actions">
      <button class="secondary" id="retry">Retry</button>
      ${g.over && g.tone === 'good' && next ? '<button class="primary" id="next">Next level</button>' : ''}
    </div>`;
  app.querySelector('#board')!.replaceWith(renderBoard(g));
  app.querySelector('#back')!.addEventListener('click', () => { game = null; render(); });
  app.querySelector('#retry')!.addEventListener('click', () => startLevel(g.level));
  app.querySelector('#next')?.addEventListener('click', () => startLevel(next));
}

function renderHome() {
  const solved = loadSolved();
  const worlds = [...new Set(LEVELS.map((l) => l.world))];
  app.innerHTML = `
    <h1>Minimate</h1>
    <p class="tagline">Small boards. Real chess skills.</p>
    ${worlds.map((world) => `
      <h2>${world}</h2>
      ${LEVELS.filter((l) => l.world === world).map((l) => `
        <button class="level-card" data-id="${l.id}">
          <span>${l.title}</span>
          <span class="done">${solved.has(l.id) ? '✓' : ''}</span>
        </button>`).join('')}`).join('')}`;
  app.querySelectorAll<HTMLButtonElement>('.level-card').forEach((btn) => {
    btn.addEventListener('click', () => startLevel(LEVELS.find((l) => l.id === btn.dataset.id)!));
  });
}

function render() {
  if (game) renderLevel(game);
  else renderHome();
}

render();
