import { useEffect, useMemo, useRef, useState } from 'react';
import { addChildEntertainmentUsage, getChildEntertainmentSession, type EntertainmentSessionState } from '../api/student';
import { ENTERTAINMENT_GAME_KEYS, normalizeEntertainmentLimitSeconds, readTaskPlanSettings } from '../utils/taskPlan';

type GameKey = '2048' | '24' | 'sudoku' | 'gomoku' | 'memory';

const GAME_LIMIT_MS = 30 * 60 * 1000;
const SESSION_DATE_KEY = 'kidsQuiz.gameSessionDate';
const SESSION_END_KEY = 'kidsQuiz.gameSessionEndsAt';
const SESSION_LIMIT_KEY = 'kidsQuiz.gameSessionLimitMs';

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function allowedGameKeys(values: unknown): GameKey[] {
  const keys = Array.isArray(values) ? values.map(String) : [...ENTERTAINMENT_GAME_KEYS];
  const filtered = keys.filter((key): key is GameKey => (ENTERTAINMENT_GAME_KEYS as readonly string[]).includes(key));
  return filtered.length ? filtered : [...ENTERTAINMENT_GAME_KEYS] as GameKey[];
}

function localDailyLimitMs() {
  return normalizeEntertainmentLimitSeconds(readTaskPlanSettings().entertainmentDailyLimitSeconds) * 1000;
}

function createSessionEnd(limitMs = GAME_LIMIT_MS) {
  const key = todayKey();
  const storedDate = localStorage.getItem(SESSION_DATE_KEY);
  const storedEnd = Number(localStorage.getItem(SESSION_END_KEY) || 0);
  const storedLimit = Number(localStorage.getItem(SESSION_LIMIT_KEY) || 0);
  if (storedDate === key && storedEnd && storedLimit === limitMs) return storedEnd;
  const next = Date.now() + limitMs;
  localStorage.setItem(SESSION_DATE_KEY, key);
  localStorage.setItem(SESSION_END_KEY, String(next));
  localStorage.setItem(SESSION_LIMIT_KEY, String(limitMs));
  return next;
}

function localRemainingSeconds() {
  return Math.max(0, Math.ceil((createSessionEnd(localDailyLimitMs()) - Date.now()) / 1000));
}

function formatLeft(ms: number) {
  const safe = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function addTile(board: number[]) {
  const empty = board.map((value, index) => value ? -1 : index).filter((index) => index >= 0);
  if (!empty.length) return board;
  const next = [...board];
  next[empty[randomInt(0, empty.length - 1)]] = Math.random() < 0.9 ? 2 : 4;
  return next;
}

function new2048Board() {
  return addTile(addTile(Array(16).fill(0)));
}

function slideLine(line: number[]) {
  const values = line.filter(Boolean);
  const result: number[] = [];
  let gained = 0;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] === values[i + 1]) {
      result.push(values[i] * 2);
      gained += values[i] * 2;
      i += 1;
    } else {
      result.push(values[i]);
    }
  }
  while (result.length < 4) result.push(0);
  return { line: result, gained };
}

function move2048(board: number[], direction: 'up' | 'down' | 'left' | 'right') {
  const next = [...board];
  let gained = 0;
  for (let i = 0; i < 4; i += 1) {
    const indexes = direction === 'left' || direction === 'right'
      ? [0, 1, 2, 3].map((col) => i * 4 + col)
      : [0, 1, 2, 3].map((row) => row * 4 + i);
    const ordered = direction === 'right' || direction === 'down' ? [...indexes].reverse() : indexes;
    const slid = slideLine(ordered.map((index) => board[index]));
    gained += slid.gained;
    ordered.forEach((index, pos) => { next[index] = slid.line[pos]; });
  }
  const moved = next.some((value, index) => value !== board[index]);
  return { board: moved ? addTile(next) : board, gained, moved };
}

function Game2048({ locked }: { locked: boolean }) {
  const [board, setBoard] = useState(() => new2048Board());
  const [score, setScore] = useState(0);
  const [touch, setTouch] = useState<{ x: number; y: number } | null>(null);

  const move = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (locked) return;
    const result = move2048(board, direction);
    setBoard(result.board);
    if (result.moved) setScore((value) => value + result.gained);
  };

  const over = !board.includes(0) && !(['up', 'down', 'left', 'right'] as const).some((direction) => move2048(board, direction).moved);

  return <section className="gamePanel game2048">
    <div className="gameHead"><b>2048</b><span>分数 {score}</span><button onClick={() => { setBoard(new2048Board()); setScore(0); }}>重开</button></div>
    <div
      className="board2048"
      onTouchStart={(event) => setTouch({ x: event.touches[0].clientX, y: event.touches[0].clientY })}
      onTouchEnd={(event) => {
        if (!touch) return;
        const dx = event.changedTouches[0].clientX - touch.x;
        const dy = event.changedTouches[0].clientY - touch.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
        move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      }}
    >
      {board.map((value, index) => <span className={value ? `tile tile-${value}` : 'tile'} key={index}>{value || ''}</span>)}
    </div>
    <div className="gameControls">
      <button onClick={() => move('up')}>上</button>
      <button onClick={() => move('left')}>左</button>
      <button onClick={() => move('right')}>右</button>
      <button onClick={() => move('down')}>下</button>
    </div>
    {over && <p className="gameNotice">没有可移动方块了，试试重开一局。</p>}
  </section>;
}

function sortedNumbers(values: number[]) {
  return [...values].sort((a, b) => a - b).join(',');
}

type Game24Node = {
  value: number;
  expr: string;
  display: string;
};

type Game24Question = {
  numbers: number[];
  solution: Game24Node | null;
};

function solve24(nodes: Game24Node[]): Game24Node | null {
  if (nodes.length === 1) return Math.abs(nodes[0].value - 24) < 1e-8 ? nodes[0] : null;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];
      const rest = nodes.filter((_node, index) => index !== i && index !== j);
      const candidates: Game24Node[] = [
        { value: a.value + b.value, expr: `(${a.expr}+${b.expr})`, display: `(${a.display} + ${b.display})` },
        { value: a.value - b.value, expr: `(${a.expr}-${b.expr})`, display: `(${a.display} - ${b.display})` },
        { value: b.value - a.value, expr: `(${b.expr}-${a.expr})`, display: `(${b.display} - ${a.display})` },
        { value: a.value * b.value, expr: `(${a.expr}*${b.expr})`, display: `(${a.display} × ${b.display})` },
      ];
      if (Math.abs(b.value) > 1e-8) candidates.push({ value: a.value / b.value, expr: `(${a.expr}/${b.expr})`, display: `(${a.display} ÷ ${b.display})` });
      if (Math.abs(a.value) > 1e-8) candidates.push({ value: b.value / a.value, expr: `(${b.expr}/${a.expr})`, display: `(${b.display} ÷ ${a.display})` });
      for (const candidate of candidates) {
        if (!Number.isFinite(candidate.value)) continue;
        const solved = solve24([...rest, candidate]);
        if (solved) return solved;
      }
    }
  }
  return null;
}

function new24Question(): Game24Question {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const numbers = Array.from({ length: 4 }, () => randomInt(1, 10));
    const solution = solve24(numbers.map((value) => ({ value, expr: String(value), display: String(value) })));
    if (solution) return { numbers, solution };
  }
  const numbers = [4, 4, 10, 10];
  return { numbers, solution: solve24(numbers.map((value) => ({ value, expr: String(value), display: String(value) }))) };
}

function Game24({ locked }: { locked: boolean }) {
  const [question, setQuestion] = useState(() => new24Question());
  const [tokens, setTokens] = useState<Array<{ label: string; value: string; numberIndex?: number }>>([]);
  const [message, setMessage] = useState('用这四个数字各一次，算出 24。');
  const numbers = question.numbers;
  const expr = tokens.map((token) => token.value).join('');
  const displayExpr = tokens.map((token) => token.label).join(' ');
  const usedIndexes = new Set(tokens.map((token) => token.numberIndex).filter((index): index is number => index !== undefined));

  const resetQuestion = () => {
    setQuestion(new24Question());
    setTokens([]);
    setMessage('用这四个数字各一次，算出 24。');
  };

  const appendToken = (token: { label: string; value: string; numberIndex?: number }) => {
    if (locked) return;
    setTokens((current) => [...current, token]);
  };

  const check = () => {
    if (locked) return;
    if (!expr.trim()) { setMessage('先组成一个算式。'); return; }
    if (!/^[\d+\-*/().\s]+$/.test(expr)) { setMessage('只能使用数字、括号和四则运算符。'); return; }
    const used = (expr.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (sortedNumbers(used) !== sortedNumbers(numbers)) { setMessage('必须把四个数字各用一次。'); return; }
    try {
      const value = Function(`"use strict"; return (${expr})`)();
      if (!Number.isFinite(Number(value))) { setMessage('这个算式还不能得到有效结果。'); return; }
      setMessage(Math.abs(Number(value) - 24) < 1e-8 ? '答对了。' : `结果是 ${value}，还差一点。`);
    } catch {
      setMessage('表达式还不能计算。');
    }
  };

  const showHint = () => {
    if (locked) return;
    setMessage(question.solution ? `提示：${question.solution.display}` : '这题可能没有解，换一题试试。');
  };

  return <section className="gamePanel">
    <div className="gameHead"><b>24 点</b><button onClick={resetQuestion}>换题</button></div>
    <div className="numberCards game24Cards">{numbers.map((value, index) => <button
      key={`${value}-${index}`}
      disabled={locked || usedIndexes.has(index)}
      onClick={() => appendToken({ label: String(value), value: String(value), numberIndex: index })}
    >{value}</button>)}</div>
    <div className="game24Expression">{displayExpr || '24'}</div>
    <div className="game24Keypad">
      {[
        { label: '+', value: '+' },
        { label: '-', value: '-' },
        { label: '×', value: '*' },
        { label: '÷', value: '/' },
        { label: '(', value: '(' },
        { label: ')', value: ')' },
      ].map((key) => <button key={key.label} disabled={locked} onClick={() => appendToken(key)}>{key.label}</button>)}
    </div>
    <div className="game24Actions">
      <button onClick={() => setTokens((current) => current.slice(0, -1))} disabled={locked || !tokens.length}>撤销</button>
      <button onClick={() => setTokens([])} disabled={locked || !tokens.length}>清空</button>
      <button onClick={showHint} disabled={locked}>提示</button>
      <button className="gamePrimary" onClick={check} disabled={locked}>检查</button>
    </div>
    <p className="gameNotice">{message}</p>
  </section>;
}

const SUDOKU_PUZZLE = [
  5, 3, 0, 0, 7, 0, 0, 0, 0,
  6, 0, 0, 1, 9, 5, 0, 0, 0,
  0, 9, 8, 0, 0, 0, 0, 6, 0,
  8, 0, 0, 0, 6, 0, 0, 0, 3,
  4, 0, 0, 8, 0, 3, 0, 0, 1,
  7, 0, 0, 0, 2, 0, 0, 0, 6,
  0, 6, 0, 0, 0, 0, 2, 8, 0,
  0, 0, 0, 4, 1, 9, 0, 0, 5,
  0, 0, 0, 0, 8, 0, 0, 7, 9,
];

const SUDOKU_SOLUTION = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
];

function GameSudoku({ locked }: { locked: boolean }) {
  const [cells, setCells] = useState(() => SUDOKU_PUZZLE.map((value) => value ? String(value) : ''));
  const [selected, setSelected] = useState<number | null>(null);
  const [wrongCells, setWrongCells] = useState<number[]>([]);
  const [message, setMessage] = useState('填完后点检查。');
  const selectedValue = selected === null ? '' : cells[selected];

  const reset = () => {
    setCells(SUDOKU_PUZZLE.map((value) => value ? String(value) : ''));
    setSelected(null);
    setWrongCells([]);
    setMessage('填完后点检查。');
  };

  const fillSelected = (value: string) => {
    if (locked || selected === null || SUDOKU_PUZZLE[selected]) return;
    const next = cells.map((item, pos) => pos === selected ? value : item);
    const complete = next.every((item, index) => Number(item) === SUDOKU_SOLUTION[index]);
    setCells(next);
    setWrongCells((current) => {
      const rest = current.filter((index) => index !== selected);
      return value && Number(value) !== SUDOKU_SOLUTION[selected] ? [...rest, selected] : rest;
    });
    if (!value) setMessage('已清除。');
    else if (Number(value) !== SUDOKU_SOLUTION[selected]) setMessage('这个数字不对，再试试。');
    else setMessage(complete ? '数独完成。' : '这个格子填对了。');
  };

  const isRelated = (index: number) => {
    if (selected === null || index === selected) return false;
    const selectedRow = Math.floor(selected / 9);
    const selectedCol = selected % 9;
    const row = Math.floor(index / 9);
    const col = index % 9;
    return row === selectedRow
      || col === selectedCol
      || (Math.floor(row / 3) === Math.floor(selectedRow / 3) && Math.floor(col / 3) === Math.floor(selectedCol / 3));
  };

  const check = () => {
    const wrong = cells
      .map((value, index) => value && Number(value) !== SUDOKU_SOLUTION[index] ? index : -1)
      .filter((index) => index >= 0);
    setWrongCells(wrong);
    if (wrong.length) { setMessage('有几个格子不对，先改红色格子。'); return; }
    const complete = cells.every((value, index) => Number(value) === SUDOKU_SOLUTION[index]);
    setMessage(complete ? '数独完成。' : '目前填的都对，还有空格。');
  };

  return <section className="gamePanel">
    <div className="gameHead"><b>数独</b><button onClick={reset}>重置</button></div>
    <div className="sudokuBoard">
      {cells.map((value, index) => <button
        type="button"
        key={index}
        disabled={locked}
        className={[
          'sudokuCell',
          SUDOKU_PUZZLE[index] ? 'fixed' : '',
          selected === index ? 'selected' : '',
          isRelated(index) ? 'related' : '',
          selectedValue && value === selectedValue ? 'same' : '',
          wrongCells.includes(index) ? 'wrong' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => {
          setSelected(index);
          if (!SUDOKU_PUZZLE[index]) setMessage('选择数字填入格子。');
        }}
        aria-label={`第 ${Math.floor(index / 9) + 1} 行第 ${index % 9 + 1} 列${value ? `，数字 ${value}` : ''}`}
      >{value}</button>)}
    </div>
    <div className="sudokuKeypad">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((value) => <button
        key={value}
        disabled={locked || selected === null || Boolean(SUDOKU_PUZZLE[selected])}
        onClick={() => fillSelected(String(value))}
      >{value}</button>)}
    </div>
    <div className="sudokuActions">
      <button onClick={() => fillSelected('')} disabled={locked || selected === null || Boolean(SUDOKU_PUZZLE[selected])}>清除</button>
      <button className="gamePrimary" onClick={check} disabled={locked}>检查数独</button>
    </div>
    <p className="gameNotice">{message}</p>
  </section>;
}

function checkFive(board: number[], index: number, player: number) {
  const row = Math.floor(index / 15);
  const col = index % 15;
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  return dirs.some(([dr, dc]) => {
    let count = 1;
    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r * 15 + c] === player) {
        count += 1;
        r += dr * sign;
        c += dc * sign;
      }
    }
    return count >= 5;
  });
}

function gomokuCandidates(board: number[]) {
  const occupied = board.some(Boolean);
  if (!occupied) return [112];
  const candidates = new Set<number>();
  board.forEach((value, index) => {
    if (!value) return;
    const row = Math.floor(index / 15);
    const col = index % 15;
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const r = row + dr;
        const c = col + dc;
        const next = r * 15 + c;
        if (r >= 0 && r < 15 && c >= 0 && c < 15 && !board[next]) candidates.add(next);
      }
    }
  });
  return [...candidates];
}

function gomokuLineScore(board: number[], index: number, player: number, dr: number, dc: number) {
  const row = Math.floor(index / 15);
  const col = index % 15;
  let count = 1;
  let open = 0;
  for (const sign of [-1, 1]) {
    let r = row + dr * sign;
    let c = col + dc * sign;
    while (r >= 0 && r < 15 && c >= 0 && c < 15 && board[r * 15 + c] === player) {
      count += 1;
      r += dr * sign;
      c += dc * sign;
    }
    if (r >= 0 && r < 15 && c >= 0 && c < 15 && !board[r * 15 + c]) open += 1;
  }
  if (count >= 5) return 100000;
  if (count === 4 && open) return 12000;
  if (count === 3 && open === 2) return 2800;
  if (count === 3 && open === 1) return 800;
  if (count === 2 && open === 2) return 220;
  return count * count * (open + 1);
}

function gomokuMoveScore(board: number[], index: number, player: number) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  const center = 112;
  const distance = Math.abs(Math.floor(index / 15) - Math.floor(center / 15)) + Math.abs(index % 15 - center % 15);
  return dirs.reduce((score, [dr, dc]) => score + gomokuLineScore(board, index, player, dr, dc), 15 - distance);
}

function chooseGomokuMove(board: number[]) {
  const candidates = gomokuCandidates(board);
  for (const player of [2, 1]) {
    const move = candidates.find((index) => {
      const next = board.map((value, pos) => pos === index ? player : value);
      return checkFive(next, index, player);
    });
    if (move !== undefined) return move;
  }
  return candidates.reduce((best, index) => {
    const score = gomokuMoveScore(board, index, 2) * 1.6 + gomokuMoveScore(board, index, 1);
    return score > best.score ? { index, score } : best;
  }, { index: candidates[0] ?? -1, score: -Infinity }).index;
}

function GameGomoku({ locked }: { locked: boolean }) {
  const [board, setBoard] = useState<number[]>(() => Array(225).fill(0));
  const [mode, setMode] = useState<'human' | 'ai'>('human');
  const [turn, setTurn] = useState(1);
  const [winner, setWinner] = useState(0);

  const reset = (nextMode = mode) => {
    setMode(nextMode);
    setBoard(Array(225).fill(0));
    setTurn(1);
    setWinner(0);
  };

  useEffect(() => {
    if (mode !== 'ai' || locked || winner || turn !== 2) return;
    const timer = window.setTimeout(() => {
      const move = chooseGomokuMove(board);
      if (move < 0) return;
      const next = board.map((value, pos) => pos === move ? 2 : value);
      setBoard(next);
      if (checkFive(next, move, 2)) setWinner(2);
      else setTurn(1);
    }, 420);
    return () => window.clearTimeout(timer);
  }, [board, locked, mode, turn, winner]);

  const place = (index: number) => {
    if (locked || winner || board[index] || (mode === 'ai' && turn === 2)) return;
    const next = board.map((value, pos) => pos === index ? turn : value);
    setBoard(next);
    if (checkFive(next, index, turn)) setWinner(turn);
    else setTurn(turn === 1 ? 2 : 1);
  };

  const status = winner
    ? `${winner === 1 ? '黑子' : '白子'}胜`
    : mode === 'ai' && turn === 2
      ? '电脑思考'
      : `${turn === 1 ? '黑子' : '白子'}落子`;

  return <section className="gamePanel">
    <div className="gameHead"><b>五子棋</b><span>{status}</span><button onClick={() => reset()}>重开</button></div>
    <div className="gomokuMode">
      <button className={mode === 'human' ? 'active' : ''} onClick={() => reset('human')}>双人</button>
      <button className={mode === 'ai' ? 'active' : ''} onClick={() => reset('ai')}>人机</button>
    </div>
    <div className="gomokuBoard">{board.map((value, index) => <button
      className={value === 1 ? 'black' : value === 2 ? 'white' : ''}
      key={index}
      onClick={() => place(index)}
      disabled={locked || Boolean(winner) || Boolean(value) || (mode === 'ai' && turn === 2)}
      aria-label={`第 ${index + 1} 格`}
    />)}</div>
  </section>;
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function GameMemory({ locked }: { locked: boolean }) {
  const makeDeck = () => shuffle([1, 2, 3, 4, 5, 6].flatMap((value) => [value, value]).map((value, index) => ({ id: `${value}-${index}`, value })));
  const [deck, setDeck] = useState(makeDeck);
  const [open, setOpen] = useState<number[]>([]);
  const [done, setDone] = useState<number[]>([]);

  useEffect(() => {
    if (open.length !== 2) return;
    const [a, b] = open;
    if (deck[a].value === deck[b].value) {
      setDone((items) => [...items, a, b]);
      setOpen([]);
    } else {
      const timer = window.setTimeout(() => setOpen([]), 650);
      return () => window.clearTimeout(timer);
    }
  }, [open, deck]);

  const flip = (index: number) => {
    if (locked || open.includes(index) || done.includes(index) || open.length >= 2) return;
    setOpen((items) => [...items, index]);
  };

  return <section className="gamePanel">
    <div className="gameHead"><b>记忆翻牌</b><span>{done.length / 2} / 6</span><button onClick={() => { setDeck(makeDeck()); setOpen([]); setDone([]); }}>重开</button></div>
    <div className="memoryBoard">{deck.map((card, index) => {
      const visible = open.includes(index) || done.includes(index);
      return <button className={visible ? 'open' : ''} key={card.id} onClick={() => flip(index)}>{visible ? card.value : '?'}</button>;
    })}</div>
  </section>;
}

export function EntertainmentCenterPage({ onBack }: { onBack: () => void }) {
  const [active, setActive] = useState<GameKey>('2048');
  const [remainingSeconds, setRemainingSeconds] = useState(localRemainingSeconds);
  const [entertainmentEnabled, setEntertainmentEnabled] = useState(() => readTaskPlanSettings().entertainmentEnabled);
  const [allowedGames, setAllowedGames] = useState<GameKey[]>(() => allowedGameKeys(readTaskPlanSettings().entertainmentAllowedGames));
  const [sessionSource, setSessionSource] = useState<'loading' | 'server' | 'local'>('loading');
  const lastUsageSyncRef = useRef(Date.now());
  const syncInFlightRef = useRef(false);

  const applyServerSession = (session: EntertainmentSessionState) => {
    setEntertainmentEnabled(session.enabled);
    setAllowedGames(allowedGameKeys(session.allowedGames));
    setRemainingSeconds(Math.max(0, Math.floor(session.remainingSeconds)));
    lastUsageSyncRef.current = Date.now();
  };

  const flushUsage = async () => {
    if (sessionSource !== 'server' || syncInFlightRef.current) return;
    const now = Date.now();
    const addSeconds = Math.floor((now - lastUsageSyncRef.current) / 1000);
    if (addSeconds <= 0) return;
    syncInFlightRef.current = true;
    try {
      const session = await addChildEntertainmentUsage(addSeconds);
      applyServerSession(session);
    } catch {
      // Keep the local countdown moving; the next heartbeat will retry accumulated time.
    } finally {
      syncInFlightRef.current = false;
    }
  };

  useEffect(() => {
    let alive = true;
    getChildEntertainmentSession().then((session) => {
      if (!alive) return;
      setSessionSource('server');
      applyServerSession(session);
    }).catch(() => {
      if (!alive) return;
      const localSettings = readTaskPlanSettings();
      setSessionSource('local');
      setEntertainmentEnabled(localSettings.entertainmentEnabled);
      setAllowedGames(allowedGameKeys(localSettings.entertainmentAllowedGames));
      setRemainingSeconds(localRemainingSeconds());
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setRemainingSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const settingsLocked = !entertainmentEnabled || !allowedGames.length;
  const timeLocked = remainingSeconds <= 0;
  const locked = settingsLocked || timeLocked;

  useEffect(() => {
    if (sessionSource !== 'server' || locked) return;
    const timer = window.setInterval(() => { void flushUsage(); }, 10000);
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') void flushUsage();
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', flushWhenHidden);
    };
  }, [sessionSource, locked]);

  useEffect(() => {
    if (sessionSource === 'server' && locked) void flushUsage();
  }, [sessionSource, locked]);

  const games = useMemo<Array<{ key: GameKey; title: string; desc: string }>>(() => {
    const allGames: Array<{ key: GameKey; title: string; desc: string }> = [
      { key: '2048', title: '2048', desc: '滑动合成数字' },
      { key: '24', title: '24 点', desc: '四个数字算出 24' },
      { key: 'sudoku', title: '数独', desc: '观察行列和九宫格' },
      { key: 'gomoku', title: '五子棋', desc: '双人或人机对弈' },
      { key: 'memory', title: '记忆翻牌', desc: '训练观察和记忆' },
    ];
    return allGames.filter((game) => allowedGames.includes(game.key));
  }, [allowedGames]);

  useEffect(() => {
    if (games.length && !games.some((game) => game.key === active)) setActive(games[0].key);
  }, [active, games]);

  return <div className="entertainmentPage">
    <header className="entertainmentHeader">
      <div>
        <span>娱乐中心</span>
        <h1>学习休息时间</h1>
        <p>本次娱乐时间最多 30 分钟，到时会自动锁定。</p>
      </div>
      <div className={locked ? 'gameTimer locked' : 'gameTimer'}>
        <b>{settingsLocked ? '未开启' : timeLocked ? '已结束' : formatLeft(remainingSeconds * 1000)}</b>
        <small>剩余时间</small>
      </div>
      <button onClick={onBack}>返回</button>
    </header>

    {locked && <section className="gameLocked">
      <b>{settingsLocked ? '娱乐中心暂未开放' : '今天的娱乐时间到了'}</b>
      <span>{settingsLocked ? '可以回到学习任务或奖励中心。' : '休息一下眼睛，明天再来玩。现在可以回到学习任务或奖励中心。'}</span>
      <button onClick={onBack}>回到首页</button>
    </section>}

    <main className={locked ? 'gameArea disabled' : 'gameArea'}>
      <aside className="gameMenu">
        {games.map((game) => <button key={game.key} className={active === game.key ? 'active' : ''} onClick={() => setActive(game.key)}>
          <b>{game.title}</b>
          <span>{game.desc}</span>
        </button>)}
      </aside>
      {active === '2048' && <Game2048 locked={locked} />}
      {active === '24' && <Game24 locked={locked} />}
      {active === 'sudoku' && <GameSudoku locked={locked} />}
      {active === 'gomoku' && <GameGomoku locked={locked} />}
      {active === 'memory' && <GameMemory locked={locked} />}
    </main>
  </div>;
}
