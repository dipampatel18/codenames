/* =====================================================================
   CODENAMES  —  online rooms + LAN party server   (single file, no deps)
   ---------------------------------------------------------------------
   RUN LOCALLY (Termux / any computer):   node codenames.js
     -> prints a URL; everyone on the same Wi-Fi opens it.
   HOST ONLINE (free, e.g. Render):        it just works as a web service.
     -> reads process.env.PORT; players share a 4-letter ROOM CODE.

   Features: room codes, Quick Match, 4-player (2 teams) or 6-player
   (3 teams, yellow) modes, one spymaster per team, sound cues.
   The secret key is only sent to Spymasters (no peeking in DevTools).
   ===================================================================== */

const http = require('http');
const os = require('os');

const PORT = process.env.PORT || 3000;

/* ----------------------------- word bank ----------------------------- */
const WORDS = [
  "AFRICA","AGENT","AIR","ALIEN","AMAZON","ANGEL","ANTARCTICA","APPLE","ARM","ATLANTIS",
  "BAND","BANK","BAR","BARK","BEACH","BEAR","BEAT","BED","BEIJING","BELL",
  "BERLIN","BERMUDA","BERRY","BOARD","BOLT","BOMB","BOND","BOOM","BOOT","BOTTLE",
  "BOW","BOX","BRIDGE","BRUSH","BUCK","BUFFALO","BUG","BUGLE","BUTTON","CALF",
  "CANADA","CAP","CAPITAL","CAR","CARD","CARROT","CASINO","CAST","CAT","CELL",
  "CENTAUR","CENTER","CHAIR","CHANGE","CHARGE","CHECK","CHEST","CHICK","CHINA","CHOCOLATE",
  "CHURCH","CIRCLE","CLIFF","CLOAK","CLUB","CODE","COLD","COMIC","COMPOUND","CONCERT",
  "CONDUCTOR","CONTRACT","COOK","COPPER","COTTON","COURT","COVER","CRANE","CRASH","CRICKET",
  "CROSS","CROWN","CYCLE","CZECH","DANCE","DATE","DAY","DEATH","DECK","DEGREE",
  "DIAMOND","DICE","DINOSAUR","DISEASE","DOCTOR","DOG","DRAFT","DRAGON","DRESS","DRILL",
  "DROP","DUCK","DWARF","EAGLE","EGYPT","EMBASSY","ENGINE","ENGLAND","EUROPE","EYE",
  "FACE","FAIR","FALL","FAN","FENCE","FIELD","FIGHTER","FIGURE","FILE","FILM",
  "FIRE","FISH","FLUTE","FLY","FOOT","FORCE","FOREST","FORK","FRANCE","GAME",
  "GAS","GENIUS","GERMANY","GHOST","GIANT","GLASS","GLOVE","GOLD","GRACE","GRASS",
  "GREECE","GREEN","GROUND","HAM","HAND","HAWK","HEAD","HEART","HELICOPTER","HIMALAYAS",
  "HOLE","HOLLYWOOD","HONEY","HOOD","HOOK","HORN","HORSE","HORSESHOE","HOSPITAL","HOTEL",
  "ICE","INDIA","IRON","IVORY","JACK","JAM","JET","JUPITER","KANGAROO","KETCHUP",
  "KEY","KID","KING","KIWI","KNIFE","KNIGHT","LAB","LAP","LASER","LAWYER",
  "LEAD","LEMON","LEPRECHAUN","LIFE","LIGHT","LIMOUSINE","LINE","LINK","LION","LITTER",
  "LOCK","LOG","LONDON","LUCK","MAIL","MAMMOTH","MAPLE","MARBLE","MARCH","MASS",
  "MATCH","MERCURY","MEXICO","MICROSCOPE","MILLIONAIRE","MINE","MINT","MISSILE","MODEL","MOLE",
  "MOON","MOSCOW","MOUNT","MOUSE","MOUTH","MUG","NAIL","NEEDLE","NERVE","NET",
  "NIGHT","NINJA","NOTE","NOVEL","NURSE","NUT","OCTOPUS","OIL","OLIVE","OLYMPUS",
  "OPERA","ORANGE","ORGAN","PALM","PAN","PANTS","PAPER","PARACHUTE","PARK","PART",
  "PASS","PASTE","PENGUIN","PHOENIX","PIANO","PIE","PILOT","PIN","PIPE","PIRATE",
  "PISTOL","PIT","PITCH","PLANE","PLASTIC","PLATE","PLATYPUS","PLAY","PLOT","POINT",
  "POISON","POLE","POLICE","POOL","PORT","POST","POUND","PRESS","PRINCESS","PUMPKIN",
  "PUPIL","PYRAMID","QUEEN","RABBIT","RACKET","RAY","REVOLUTION","RING","ROBIN","ROBOT",
  "ROCK","ROME","ROOT","ROSE","ROULETTE","ROUND","ROW","RULER","SATELLITE","SATURN",
  "SCALE","SCHOOL","SCIENTIST","SCORPION","SCREEN","SEAL","SERVER","SHADOW","SHARK","SHIP",
  "SHOE","SHOP","SHOT","SINK","SKYSCRAPER","SLIP","SLUG","SMUGGLER","SNOW","SNOWMAN",
  "SOCK","SOLDIER","SOUL","SOUND","SPACE","SPELL","SPIDER","SPIKE","SPINE","SPOT",
  "SPRING","SPY","SQUARE","STADIUM","STAFF","STAR","STATE","STICK","STOCK","STRAW",
  "STREAM","STRIKE","STRING","SUB","SUIT","SUPERHERO","SWING","SWITCH","TABLE","TABLET",
  "TAG","TAIL","TAP","TEACHER","TELESCOPE","TEMPLE","THEATER","THIEF","THUMB","TICK",
  "TIE","TIME","TOKYO","TOOTH","TORCH","TOWER","TRACK","TRAIN","TRIANGLE","TRIP",
  "TRUNK","TUBE","TURKEY","UNDERTAKER","UNICORN","VACUUM","VAN","VET","WAKE","WALL",
  "WAR","WASHER","WASHINGTON","WATCH","WATER","WAVE","WEB","WELL","WHALE","WHIP",
  "WIND","WITCH","WORM","YARD"
];

/* ------------------------------ helpers ------------------------------ */
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const TEAM_NAME = { red: 'RED', blue: 'BLUE', yellow: 'YELLOW' };

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I,L,O,0,1
function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  } while (rooms[code]);
  return code;
}

/* clue must be ONE word, at least 2 letters, no spaces/commas/digits */
const CLUE_RE = /^[A-Za-z]{2,}(?:[-'][A-Za-z]+)*$/;
function clueError(word, boardWords, revealed) {
  const w = (word || '').trim();
  if (!w) return 'Enter a clue word.';
  if (w.length > 24) return 'That clue is too long.';
  if (/[\s,]/.test(w)) return 'A clue must be a single word — no spaces or commas.';
  if (!CLUE_RE.test(w)) return 'A clue must be one word of letters (2+), no numbers.';
  const up = w.toUpperCase();
  for (let i = 0; i < boardWords.length; i++) {
    if (!revealed[i] && boardWords[i] === up) return "That word is on the board — not allowed.";
  }
  return null;
}

/* ------------------------------- rooms ------------------------------- */
const rooms = {};        // code -> room
let seq = 0;             // global event counter (for sound cues)

function dealGame(threeTeam) {
  const words = shuffle([...WORDS]).slice(0, 25);
  let teams, counts, neutral;
  if (threeTeam) {
    teams = shuffle(['red', 'blue', 'yellow']); // turn order; teams[0] starts
    counts = [8, 7, 6];                          // 21 agents
    neutral = 3;
  } else {
    teams = shuffle(['red', 'blue']);
    counts = [9, 8];                             // 17 agents
    neutral = 7;
  }
  const key = [];
  teams.forEach((t, i) => { for (let k = 0; k < counts[i]; k++) key.push(t); });
  for (let k = 0; k < neutral; k++) key.push('neutral');
  key.push('assassin');
  shuffle(key);

  const remaining = {};
  teams.forEach((t, i) => (remaining[t] = counts[i]));

  return {
    words, key,
    revealed: new Array(25).fill(false),
    teams,
    currentTeam: teams[0],
    remaining,
    eliminated: {},
    winner: null,
    clue: null,
    guessesLeft: 0,
    lastEvent: null,
    log: ['New board dealt. ' + TEAM_NAME[teams[0]] + ' team moves first.'],
  };
}

function createRoom(threeTeam, isPublic) {
  const code = makeCode();
  rooms[code] = {
    code,
    threeTeam: !!threeTeam,
    public: !!isPublic,
    players: {},
    clients: [],
    lastActive: Date.now(),
    game: null,
  };
  rooms[code].game = dealGame(!!threeTeam);
  return rooms[code];
}

/* Rooms self-heal: entering any valid 4-char code joins the existing room or
   instantly recreates it. This survives Render free-tier cold starts / recycles,
   where in-memory rooms would otherwise vanish and show "room closed". */
function ensureRoom(code, threeTeam) {
  if (!/^[A-Z0-9]{4}$/.test(code || '')) return null;
  if (!rooms[code]) {
    rooms[code] = { code, threeTeam: !!threeTeam, public: false, players: {}, clients: [], lastActive: Date.now(), game: dealGame(!!threeTeam) };
  }
  rooms[code].lastActive = Date.now();
  return rooms[code];
}

function aliveTeams(g) { return g.teams.filter((t) => !g.eliminated[t]); }

function nextTeam(g) {
  const idx = g.teams.indexOf(g.currentTeam);
  for (let step = 1; step <= g.teams.length; step++) {
    const t = g.teams[(idx + step) % g.teams.length];
    if (!g.eliminated[t]) return t;
  }
  return g.currentTeam;
}

function endTurn(g) {
  g.clue = null;
  g.guessesLeft = 0;
  g.currentTeam = nextTeam(g);
  g.log.push('Turn passes to ' + TEAM_NAME[g.currentTeam] + '.');
}

function declareWin(g, team) {
  g.winner = team;
  g.clue = null;
  g.guessesLeft = 0;
  g.log.push(TEAM_NAME[team] + ' team wins.');
}

function applyGuess(g, i) {
  g.revealed[i] = true;
  const color = g.key[i];
  const word = g.words[i];
  const team = g.currentTeam;
  let kind;

  if (color === team) {
    g.remaining[team]--;
    g.guessesLeft--;
    kind = 'good';
    g.log.push(TEAM_NAME[team] + ' uncovered "' + word + '" — contact confirmed.');
    if (g.remaining[team] === 0) { g.lastEvent = { seq: ++seq, kind, color, team, word, index: i }; return declareWin(g, team); }
    if (g.guessesLeft <= 0) { g.log.push(TEAM_NAME[team] + ' is out of guesses.'); endTurn(g); }
  } else if (color === 'assassin') {
    kind = 'assassin';
    g.log.push(TEAM_NAME[team] + ' triggered the ASSASSIN ("' + word + '").');
    g.eliminated[team] = true;
    const alive = aliveTeams(g);
    if (alive.length === 1) { g.lastEvent = { seq: ++seq, kind, color, team, word, index: i }; return declareWin(g, alive[0]); }
    g.log.push(TEAM_NAME[team] + ' is eliminated.');
    endTurn(g);
  } else if (color === 'neutral') {
    kind = 'neutral';
    g.log.push(TEAM_NAME[team] + ' uncovered "' + word + '" — a bystander. Turn over.');
    endTurn(g);
  } else {
    kind = 'bad';
    g.remaining[color]--;
    g.log.push(TEAM_NAME[team] + ' uncovered "' + word + '" — that was ' + TEAM_NAME[color] + "'s agent! Turn over.");
    if (g.remaining[color] === 0 && !g.eliminated[color]) { g.lastEvent = { seq: ++seq, kind, color, team, word, index: i }; return declareWin(g, color); }
    endTurn(g);
  }
  g.lastEvent = { seq: ++seq, kind, color, team, word, index: i };
}

/* enforce one spymaster per team; returns the ACTUAL role granted */
function setSeat(room, id, name, team, role) {
  if (role === 'spymaster') {
    const taken = Object.keys(room.players).some(
      (pid) => pid !== id && room.players[pid].team === team && room.players[pid].role === 'spymaster'
    );
    if (taken) role = 'operative';
  }
  room.players[id] = { name, team, role };
  return role;
}

function autoSeat(room, id, name) {
  const teams = room.game.teams;
  const counts = {}; teams.forEach((t) => (counts[t] = 0));
  Object.values(room.players).forEach((p) => { if (counts[p.team] !== undefined) counts[p.team]++; });
  let team = teams[0];
  teams.forEach((t) => { if (counts[t] < counts[team]) team = t; });
  const hasSpy = Object.values(room.players).some((p) => p.team === team && p.role === 'spymaster');
  return { team, role: setSeat(room, id, name, team, hasSpy ? 'operative' : 'spymaster') };
}

function teamSpymaster(room, team) {
  return Object.keys(room.players).find((pid) => room.players[pid].team === team && room.players[pid].role === 'spymaster') || null;
}

/* a transient message shown to everyone (like a clue) via a toast on each client.
   `by` is the acting player's id, so their own client can skip the toast. */
function pushNotice(room, text, by) { room.notice = { seq: ++seq, text, by: by || null }; }

/* ------------------- per-player view (anti-cheat) -------------------- */
function stateFor(room, id) {
  const g = room.game;
  const p = room.players[id];
  const isSpymaster = !!(p && p.role === 'spymaster');
  const reveal = (i) => isSpymaster || g.revealed[i] || g.winner;
  return {
    code: room.code,
    threeTeam: room.threeTeam,
    words: g.words,
    key: g.key.map((c, i) => (reveal(i) ? c : null)),
    revealed: g.revealed,
    teams: g.teams,
    currentTeam: g.currentTeam,
    remaining: g.remaining,
    eliminated: g.eliminated,
    winner: g.winner,
    clue: g.clue,
    guessesLeft: g.guessesLeft,
    lastEvent: g.lastEvent,
    players: Object.keys(room.players).map((pid) => ({
      id: pid, name: room.players[pid].name, team: room.players[pid].team, role: room.players[pid].role,
    })),
    seatRequest: room.seatRequest ? {
      seq: room.seatRequest.seq, fromId: room.seatRequest.fromId, fromName: room.seatRequest.fromName,
      targetId: room.seatRequest.targetId, targetName: room.seatRequest.targetName, team: room.seatRequest.team,
    } : null,
    notice: room.notice || null,
    log: g.log.slice(-40),
  };
}

function broadcast(room) {
  room.lastActive = Date.now();
  room.clients = room.clients.filter((c) => !c.res.writableEnded);
  for (const c of room.clients) {
    try { c.res.write('data: ' + JSON.stringify(stateFor(room, c.id)) + '\n\n'); } catch (e) {}
  }
}

/* heartbeat + prune idle empty rooms */
setInterval(() => {
  for (const code of Object.keys(rooms)) {
    const room = rooms[code];
    room.clients = room.clients.filter((c) => !c.res.writableEnded);
    for (const c of room.clients) { try { c.res.write(':\n\n'); } catch (e) {} }
    if (room.seatRequest && Date.now() - room.seatRequest.ts > 45000) {
      room.seatRequest = null; pushNotice(room, 'A seat request expired.'); broadcast(room);
    }
    if (room.clients.length === 0 && Date.now() - room.lastActive > 30 * 60 * 1000) delete rooms[code];
  }
}, 25000);

/* ------------------------------ actions ------------------------------ */
function handleAction(path, q) {
  // room-less actions
  if (path === '/create') {
    const room = createRoom(q.three === '1', false);
    return { ok: true, code: room.code };
  }
  if (path === '/quick') {
    const name = (q.name || '').toString().trim().slice(0, 20) || 'Agent';
    const QUICK_CAP = 4; // a full 2v2 game per code; a 5th player starts a new room
    let room = null, best = -1;
    for (const code of Object.keys(rooms)) {
      const r = rooms[code];
      if (!r.public || r.game.winner) continue;
      const n = Object.keys(r.players).length;
      if (n >= QUICK_CAP) continue;
      if (n > best) { best = n; room = r; } // fill the fullest open room first
    }
    if (!room) room = createRoom(false, true);
    const seat = autoSeat(room, q.id, name);
    room.game.log.push(name + ' was matched to ' + TEAM_NAME[seat.team] + ' (' + cap(seat.role) + ').');
    pushNotice(room, name + ' joined ' + TEAM_NAME[seat.team] + ' (' + cap(seat.role) + ').', q.id);
    broadcast(room);
    return { ok: true, code: room.code, team: seat.team, role: seat.role };
  }

  // room-scoped actions (self-healing: any valid code re-creates its room)
  const code = (q.room || '').toUpperCase();
  const room = path === '/leave' ? rooms[code] : ensureRoom(code);
  if (path === '/leave' && !room) return { ok: true };
  if (!room) return { ok: false, error: 'no_room' };
  const g = room.game;
  const id = q.id;
  const p = room.players[id];

  if (path === '/join') {
    const name = (q.name || '').toString().trim().slice(0, 20) || 'Agent';
    const team = q.team === 'blue' ? 'blue' : q.team === 'yellow' ? 'yellow' : 'red';
    if (!g.teams.includes(team)) return { ok: false, error: 'That team is not in this game.' };
    const wanted = q.role === 'spymaster' ? 'spymaster' : 'operative';
    const role = setSeat(room, id, name, team, wanted);
    g.log.push(name + ' joined ' + TEAM_NAME[team] + ' as ' + cap(role) + '.');
    broadcast(room);
    return { ok: true, role, note: role !== wanted ? 'That team already has a spymaster — you joined as Operative.' : null };
  }

  if (path === '/leave') {
    if (p) {
      const rq = room.seatRequest;
      if (rq && (rq.fromId === id || rq.targetId === id)) { room.seatRequest = null; pushNotice(room, 'A seat request was cancelled.', id); }
      g.log.push(p.name + ' left the room.');
      delete room.players[id];
      broadcast(room);
    }
    return { ok: true };
  }

  if (path === '/takeseat') {
    const name = (q.name || '').toString().trim().slice(0, 20) || 'Agent';
    const team = q.team === 'blue' ? 'blue' : q.team === 'yellow' ? 'yellow' : 'red';
    if (!g.teams.includes(team)) return { ok: false, error: 'That team is not in this game.' };
    const wanted = q.role === 'spymaster' ? 'spymaster' : 'operative';
    if (wanted === 'spymaster') {
      const holder = teamSpymaster(room, team);
      if (holder && holder !== id) {
        if (room.seatRequest) return { ok: false, error: 'Another seat request is already pending.' };
        room.seatRequest = { seq: ++seq, fromId: id, fromName: name, targetId: holder, targetName: room.players[holder].name, team, ts: Date.now() };
        pushNotice(room, name + ' is requesting the ' + TEAM_NAME[team] + ' spymaster seat.', id);
        g.log.push(name + ' requested the ' + TEAM_NAME[team] + ' spymaster seat.');
        broadcast(room);
        return { ok: true, pending: true, targetName: room.players[holder].name, team };
      }
    }
    const role = setSeat(room, id, name, team, wanted);
    pushNotice(room, name + ' took ' + TEAM_NAME[team] + ' ' + cap(role) + '.', id);
    g.log.push(name + ' is now ' + TEAM_NAME[team] + ' ' + cap(role) + '.');
    broadcast(room);
    return { ok: true, applied: true, role };
  }

  if (path === '/seatrespond') {
    const rq = room.seatRequest;
    if (!rq || rq.targetId !== id) return { ok: false, error: 'No seat request awaiting your response.' };
    room.seatRequest = null;
    if (q.accept === '1') {
      // incumbent (responder) steps down to operative; requester takes spymaster
      room.players[id] = { name: room.players[id].name, team: rq.team, role: 'operative' };
      const rn = room.players[rq.fromId] ? room.players[rq.fromId].name : rq.fromName;
      room.players[rq.fromId] = { name: rn, team: rq.team, role: 'spymaster' };
      pushNotice(room, rn + ' is now the ' + TEAM_NAME[rq.team] + ' spymaster.', id);
      g.log.push(rn + ' took the ' + TEAM_NAME[rq.team] + ' spymaster seat (approved).');
    } else {
      pushNotice(room, 'The ' + TEAM_NAME[rq.team] + ' spymaster declined the seat request.', id);
      g.log.push('A seat request for ' + TEAM_NAME[rq.team] + ' spymaster was declined.');
    }
    broadcast(room);
    return { ok: true };
  }

  if (path === '/seatcancel') {
    const rq = room.seatRequest;
    if (rq && rq.fromId === id) { room.seatRequest = null; pushNotice(room, rq.fromName + ' cancelled the seat request.', id); broadcast(room); }
    return { ok: true };
  }

  if (path === '/newgame') {
    if (q.three === '0' || q.three === '1') room.threeTeam = q.three === '1';
    // drop seats that reference a team no longer present (e.g. yellow -> 2-team)
    room.game = dealGame(room.threeTeam);
    Object.keys(room.players).forEach((pid) => {
      if (!room.game.teams.includes(room.players[pid].team)) delete room.players[pid];
    });
    broadcast(room);
    return { ok: true };
  }

  if (path === '/clue') {
    if (!p) return { ok: false, error: 'Join first.' };
    if (g.winner) return { ok: false, error: 'The round is over.' };
    if (p.role !== 'spymaster' || p.team !== g.currentTeam)
      return { ok: false, error: 'Only the ' + TEAM_NAME[g.currentTeam] + ' spymaster can transmit now.' };
    if (g.clue) return { ok: false, error: 'A clue is already in play.' };
    const err = clueError(q.word, g.words, g.revealed);
    if (err) return { ok: false, error: err };
    const num = parseInt(q.number, 10);
    if (isNaN(num) || num < 0 || num > 9) return { ok: false, error: 'Pick a number 0–9.' };
    const bonus = (q.bonus === '1') && num > 0;
    g.clue = { word: q.word.trim().toUpperCase(), number: num, team: g.currentTeam, bonus };
    g.guessesLeft = num === 0 ? 99 : num + (bonus ? 1 : 0);
    g.lastEvent = { seq: ++seq, kind: 'clue', team: g.currentTeam };
    g.log.push(TEAM_NAME[g.currentTeam] + ' spymaster transmits: ' + g.clue.word + ' / ' + num + (bonus ? ' (+1)' : '') + '.');
    broadcast(room);
    return { ok: true };
  }

  if (path === '/guess') {
    if (!p) return { ok: false, error: 'Join first.' };
    if (g.winner) return { ok: false, error: 'The round is over.' };
    if (!g.clue) return { ok: false, error: 'Wait for a clue.' };
    if (p.role !== 'operative' || p.team !== g.currentTeam)
      return { ok: false, error: 'Only ' + TEAM_NAME[g.currentTeam] + ' operatives can guess now.' };
    const i = parseInt(q.index, 10);
    if (isNaN(i) || i < 0 || i > 24) return { ok: false, error: 'Bad card.' };
    if (g.revealed[i]) return { ok: false, error: 'Already uncovered.' };
    if (g.guessesLeft <= 0) return { ok: false, error: 'No guesses left.' };
    applyGuess(g, i);
    broadcast(room);
    return { ok: true };
  }

  if (path === '/endturn') {
    if (!p) return { ok: false, error: 'Join first.' };
    if (g.winner) return { ok: false, error: 'The round is over.' };
    if (p.role !== 'operative' || p.team !== g.currentTeam)
      return { ok: false, error: 'Only the guessing team can end the turn.' };
    if (!g.clue) return { ok: false, error: 'Nothing to end yet.' };
    g.log.push(TEAM_NAME[g.currentTeam] + ' ends the turn.');
    endTurn(g);
    broadcast(room);
    return { ok: true };
  }

  return { ok: false, error: 'Unknown action.' };
}

/* ------------------------------ server ------------------------------- */
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const path = u.pathname;
  const q = Object.fromEntries(u.searchParams.entries());

  if (path === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }

  if (path === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');
    const room = ensureRoom((q.room || '').toUpperCase());
    if (!room) { res.write('data: ' + JSON.stringify({ error: 'no_room' }) + '\n\n'); res.end(); return; }
    const client = { id: q.id || 'anon', res };
    room.clients.push(client);
    room.lastActive = Date.now();
    res.write('data: ' + JSON.stringify(stateFor(room, client.id)) + '\n\n');
    req.on('close', () => { room.clients = room.clients.filter((c) => c !== client); });
    return;
  }

  if (path === '/state') {
    const room = ensureRoom((q.room || '').toUpperCase());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(room ? stateFor(room, q.id || 'anon') : { error: 'no_room' }));
    return;
  }

  if (['/create', '/quick', '/join', '/leave', '/takeseat', '/seatrespond', '/seatcancel', '/newgame', '/clue', '/guess', '/endturn'].includes(path)) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(handleAction(path, q)));
    return;
  }

  if (path === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
  }
  console.log('\n  CODENAMES is running (port ' + PORT + ').\n');
  console.log('  On THIS device:  http://localhost:' + PORT);
  if (ips.length) {
    console.log('\n  Same Wi-Fi? Others open one of:');
    ips.forEach((ip) => console.log('     http://' + ip + ':' + PORT));
  }
  console.log('\n  Create a room, share the 4-letter code, and play.');
  console.log('  Ctrl+C to stop.\n');
});

/* =====================================================================
   THE WEB PAGE  (HTML + CSS + JS, one string, no external assets)
   ===================================================================== */
const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<meta name="theme-color" content="#171b24">
<title>Codenames</title>
<style>
  :root{
    --ink:#151922; --panel:#1e2431; --panel2:#252c3b; --line:#39445a; --line2:#4a5670;
    --red:#b23a48; --red-l:#e7b9bd; --red-d:#7d2530;
    --blue:#2f6f8f; --blue-l:#abccd9; --blue-d:#1d4a62;
    --yellow:#c6a02a; --yellow-l:#ecdca0; --yellow-d:#8a6f17;
    --tan:#cdbf9a; --black:#14110f; --bone:#efe9da;
    --amber:#cf9a37; --amber-soft:#e7c277;
    --txt:#e9e5d9; --muted:#98a1b1; --muted2:#727c8d;
    --ok:#5ad07a;
    --mono:ui-monospace,"SF Mono","Roboto Mono",Menlo,Consolas,monospace;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    --safe-b:env(safe-area-inset-bottom,0px);
  }
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  html,body{height:100%;margin:0}
  body{
    background:var(--ink); color:var(--txt); font-family:var(--sans);
    background-image:radial-gradient(1000px 560px at 50% -12%, #232a39 0%, var(--ink) 62%);
    overscroll-behavior:none; -webkit-text-size-adjust:100%;
  }
  .mono{font-family:var(--mono)}
  button{font-family:inherit}
  input,select{font-family:inherit}

  /* app shell fills the viewport exactly (no page scroll) */
  .app{
    height:100vh; height:100dvh;
    max-width:520px; margin:0 auto; display:flex; flex-direction:column; overflow:hidden;
  }
  .topbar{display:flex; align-items:center; gap:9px; padding:9px 12px 8px; flex:0 0 auto}
  .brand{font-family:var(--mono); font-weight:700; letter-spacing:.28em; font-size:13px; text-transform:uppercase; color:var(--txt)}
  .brand .sub{display:block; font-size:8px; letter-spacing:.2em; color:var(--muted2); margin-top:1px}
  .codechip{font-family:var(--mono); font-size:12px; letter-spacing:.14em; color:var(--amber-soft); border:1px solid var(--line); border-radius:6px; padding:4px 8px; background:#20283680}
  .conn{margin-left:auto; display:flex; align-items:center; gap:6px; font-family:var(--mono); font-size:9px; color:var(--muted2); letter-spacing:.1em}
  .dot{width:8px;height:8px;border-radius:50%;background:#59606f}
  .dot.on{background:var(--ok); box-shadow:0 0 8px #3cae5e}
  .dot.off{background:var(--red)}
  .iconbtn{margin-left:2px; width:34px;height:34px; border-radius:8px; border:1px solid var(--line); background:#1a2130; color:var(--txt); font-size:17px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center}

  .stage{position:relative; flex:1 1 auto; min-height:0}
  .screen{position:absolute; inset:0; display:none; flex-direction:column; padding:6px 12px calc(12px + var(--safe-b)); overflow:auto}
  .screen.on{display:flex}
  .screen.game{overflow:hidden; padding-bottom:calc(6px + var(--safe-b))}

  .panel{background:linear-gradient(180deg,var(--panel),var(--panel2)); border:1px solid var(--line); border-radius:12px}

  /* ---------- HOME ---------- */
  #home{justify-content:center; gap:14px}
  .hero{padding:22px 18px 20px; text-align:center}
  .hero .k{font-family:var(--mono); letter-spacing:.34em; text-transform:uppercase; font-size:22px; font-weight:700}
  .hero .k .b{color:var(--blue-l)} .hero .k .r{color:var(--red-l)}
  .hero .tl{font-family:var(--mono); font-size:10px; letter-spacing:.24em; color:var(--muted2); text-transform:uppercase; margin-top:8px}
  .home-actions{display:flex; flex-direction:column; gap:11px}
  .bigbtn{padding:16px; border-radius:12px; border:1px solid var(--line); background:linear-gradient(180deg,var(--panel),var(--panel2)); color:var(--txt); text-align:left; cursor:pointer; display:flex; align-items:center; gap:13px}
  .bigbtn .em{font-size:22px; width:26px; text-align:center; flex:0 0 auto}
  .bigbtn > span:nth-child(2){display:flex; flex-direction:column; min-width:0}
  .bigbtn .t{display:block; font-family:var(--mono); font-weight:700; letter-spacing:.12em; text-transform:uppercase; font-size:14px}
  .bigbtn .d{display:block; font-size:11px; color:var(--muted); margin-top:3px; text-transform:none; letter-spacing:normal; line-height:1.35}
  .bigbtn.accent{background:linear-gradient(180deg,var(--amber-soft),var(--amber)); border:none; color:#1a1205}
  .bigbtn.accent .d{color:#5c4410}
  .bigbtn:active{transform:translateY(1px)}
  .joinrow{display:flex; gap:9px}
  .joinrow input{flex:1; text-transform:uppercase; letter-spacing:.26em; text-align:center; font-family:var(--mono); font-weight:700}
  .credit{text-align:center; font-size:10px; color:var(--muted2); font-family:var(--mono); letter-spacing:.06em; margin-top:2px}

  /* shared inputs */
  input[type=text]{width:100%; padding:13px 12px; font-size:16px; color:var(--txt); background:#131a25; border:1px solid var(--line); border-radius:10px}
  input[type=text]:focus{outline:none; border-color:var(--amber)}
  .fld{display:block; font-family:var(--mono); font-size:10px; letter-spacing:.16em; color:var(--muted); text-transform:uppercase; margin:14px 2px 6px}

  .seg{display:flex; gap:8px}
  .seg button{flex:1; padding:13px 6px; border-radius:10px; border:1px solid var(--line); background:#131a25; color:var(--muted); font-family:var(--mono); font-size:12px; letter-spacing:.1em; text-transform:uppercase; font-weight:700; cursor:pointer}
  .seg button.sel{color:#fff; border-color:transparent}
  .seg button.sel.red{background:var(--red)} .seg button.sel.blue{background:var(--blue)} .seg button.sel.yellow{background:var(--yellow); color:#2b2510}
  .seg button.sel.amber{background:var(--amber); color:#1a1205}
  .seg button:disabled{opacity:.4; cursor:not-allowed}

  /* ---------- LOBBY ---------- */
  #lobby{gap:2px}
  .lobcard{padding:16px 15px 18px; margin-top:6px}
  .lobcard h2{margin:0 0 3px; font-family:var(--mono); letter-spacing:.18em; font-size:13px; text-transform:uppercase; color:var(--amber-soft)}
  .lobcard .sub{font-size:11px; color:var(--muted); margin:0 0 4px}
  .roster{display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; min-height:4px}
  .rchip{font-family:var(--mono); font-size:10px; padding:4px 9px; border-radius:14px; border:1px solid var(--line); letter-spacing:.03em}
  .rchip.red{color:var(--red-l); border-color:#5a3a42} .rchip.blue{color:var(--blue-l); border-color:#2f4f60} .rchip.yellow{color:var(--yellow-l); border-color:#6a5a2a}
  .rchip .star{color:var(--amber-soft)}
  .primary{width:100%; margin-top:16px; padding:15px; border:none; border-radius:11px; cursor:pointer; background:linear-gradient(180deg,var(--amber-soft),var(--amber)); color:#1a1205; font-family:var(--mono); font-weight:700; letter-spacing:.16em; text-transform:uppercase; font-size:14px}
  .primary:active{transform:translateY(1px)}
  .ghostbtn{width:100%; margin-top:9px; padding:12px; background:transparent; border:1px solid var(--line); border-radius:10px; color:var(--muted); font-family:var(--mono); letter-spacing:.12em; text-transform:uppercase; font-size:12px; cursor:pointer}

  /* ---------- GAME ---------- */
  .game{gap:7px}
  .score{display:flex; gap:7px; flex:0 0 auto}
  .tc{flex:1; padding:8px 6px 7px; border-radius:11px; text-align:center; border:1px solid var(--line); position:relative; overflow:hidden; min-width:0}
  .tc .n{font-family:var(--mono); font-size:26px; font-weight:700; line-height:1}
  .tc .l{font-family:var(--mono); font-size:8px; letter-spacing:.14em; text-transform:uppercase; margin-top:3px; opacity:.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .tc.red{background:linear-gradient(180deg,#33222a,#241a20); color:var(--red-l)}
  .tc.blue{background:linear-gradient(180deg,#1f2f39,#172530); color:var(--blue-l)}
  .tc.yellow{background:linear-gradient(180deg,#302a17,#211d10); color:var(--yellow-l)}
  .tc.act::before{content:"▶ TURN"; position:absolute; top:4px; left:0; right:0; font-family:var(--mono); font-size:7px; letter-spacing:.18em; opacity:.9}
  .tc.act{box-shadow:0 0 0 1px currentColor, 0 0 16px -5px currentColor}
  .tc.act .n{margin-top:6px}
  .tc.out{opacity:.42}
  .tc.out .n{text-decoration:line-through}

  .transmit{padding:9px 12px; flex:0 0 auto; border-left:4px solid var(--line)}
  .transmit.red{border-left-color:var(--red)} .transmit.blue{border-left-color:var(--blue)} .transmit.yellow{border-left-color:var(--yellow)}
  .transmit .tag{font-family:var(--mono); font-size:8px; letter-spacing:.2em; text-transform:uppercase; color:var(--muted2)}
  .transmit .body{display:flex; align-items:baseline; gap:9px; margin-top:4px; flex-wrap:wrap}
  .clueword{font-family:var(--mono); font-weight:700; font-size:21px; letter-spacing:.1em; text-transform:uppercase}
  .cluenum{font-family:var(--mono); font-weight:700; font-size:14px; color:#1a1205; background:var(--amber-soft); padding:1px 9px; border-radius:5px}
  .bonusbadge{font-family:var(--mono); font-size:9px; font-weight:700; letter-spacing:.08em; color:#12200f; background:var(--ok); padding:2px 6px; border-radius:4px; text-transform:uppercase}
  .gleft{font-family:var(--mono); font-size:11px; color:var(--amber-soft); margin-left:auto; letter-spacing:.05em}
  .waiting{font-size:12px; color:var(--muted); line-height:1.45}
  .cur{display:inline-block; width:8px; height:15px; background:var(--amber-soft); margin-left:1px; transform:translateY(2px); animation:blink 1s steps(1) infinite}
  @keyframes blink{50%{opacity:0}}

  .ticker{flex:0 0 auto; font-family:var(--mono); font-size:10px; color:var(--muted2); letter-spacing:.02em; padding:0 4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer}

  /* board fills remaining space */
  .boardwrap{flex:1 1 auto; min-height:0; display:flex}
  .board{
    flex:1; display:grid; grid-template-columns:repeat(5,1fr); grid-template-rows:repeat(5,1fr); gap:6px;
    background:linear-gradient(180deg,#efe8d4,#e4dcc4); border:1px solid #d8cdb1; border-radius:12px; padding:7px;
    box-shadow:inset 0 0 0 2px #f3eeddaa, 0 8px 22px -14px #000;
  }
  .card{
    position:relative; border-radius:6px; display:flex; align-items:center; justify-content:center; padding:2px; min-width:0; min-height:0;
    background:linear-gradient(180deg,#fbf7ec,#efe7d3); border:1px solid #d7ccb0; box-shadow:0 1px 0 #fff inset, 0 2px 3px -2px #0003;
    transition:transform .06s ease;
  }
  .card .w{font-weight:800; text-transform:uppercase; text-align:center; line-height:1.0; color:#33302a; letter-spacing:.01em; font-size:clamp(7px, 2.7vw, 13px); word-break:break-word; overflow:hidden}
  .card.click{cursor:pointer; border-color:var(--amber)}
  .card.click:active{transform:scale(.95)}
  .card.click::after{content:""; position:absolute; inset:0; border-radius:6px; box-shadow:0 0 0 2px var(--amber) inset; opacity:0}
  .card.click:hover::after{opacity:.7}
  /* spymaster key tints */
  .card.key-red{background:linear-gradient(180deg,#f0c7cb,#e7b3b8); border-color:#cf8d93}
  .card.key-blue{background:linear-gradient(180deg,#bdd8e3,#a9c9d7); border-color:#82aabb}
  .card.key-yellow{background:linear-gradient(180deg,#eaddaf,#ddca8f); border-color:#c2ab6a}
  .card.key-neutral{background:linear-gradient(180deg,#e6dcbe,#dccfa9); border-color:#c4b386}
  .card.key-assassin{background:linear-gradient(180deg,#2a2622,#16130f); border-color:#000}
  .card.key-assassin .w{color:#e9e2d2}
  /* revealed */
  .card.r-red{background:linear-gradient(180deg,var(--red),var(--red-d)); border-color:var(--red-d)}
  .card.r-blue{background:linear-gradient(180deg,var(--blue),var(--blue-d)); border-color:var(--blue-d)}
  .card.r-yellow{background:linear-gradient(180deg,var(--yellow),var(--yellow-d)); border-color:var(--yellow-d)}
  .card.r-neutral{background:linear-gradient(180deg,var(--tan),#b6a87f); border-color:#9c8f68}
  .card.r-assassin{background:linear-gradient(180deg,#2a2622,var(--black)); border-color:#000}
  .card.r-red .w,.card.r-blue .w,.card.r-assassin .w{color:#fff}
  .card.r-yellow .w,.card.r-neutral .w{color:#33280f}
  .card.reveal .w{opacity:.92}
  .card .mark{position:absolute; top:2px; right:4px; font-family:var(--mono); font-size:9px; opacity:.85}
  .card.r-assassin .mark{font-size:12px}

  /* contextual controls under board */
  .controls{flex:0 0 auto; padding:10px 12px}
  .ctitle{font-family:var(--mono); font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); margin-bottom:8px}
  .cluerow{display:flex; gap:7px}
  .cluerow input[type=text]{flex:1; padding:12px 11px}
  .numsel{width:62px; padding:12px 4px; font-size:16px; text-align:center; background:#131a25; color:var(--txt); border:1px solid var(--line); border-radius:10px}
  .btn{padding:12px 13px; border-radius:10px; border:1px solid var(--line); cursor:pointer; background:#131a25; color:var(--txt); font-family:var(--mono); font-weight:700; letter-spacing:.09em; text-transform:uppercase; font-size:12px}
  .btn:active{transform:translateY(1px)}
  .btn.go{background:linear-gradient(180deg,var(--amber-soft),var(--amber)); color:#1a1205; border:none}
  .btn.wide{width:100%}
  .bonusline{display:flex; align-items:center; gap:8px; margin-top:9px; font-family:var(--mono); font-size:11px; color:var(--muted); letter-spacing:.03em; cursor:pointer; user-select:none}
  .chk{width:20px;height:20px;border-radius:5px;border:1px solid var(--line2); background:#131a25; display:inline-flex; align-items:center; justify-content:center; color:#12200f; font-size:13px; font-weight:700; flex:0 0 auto}
  .chk.on{background:var(--ok); border-color:var(--ok)}

  /* winner banner (overlays controls area) */
  .winner{padding:12px; text-align:center; border-radius:11px; border:1px solid var(--line)}
  .winner.red{background:linear-gradient(180deg,#3a2530,#241920)} .winner.blue{background:linear-gradient(180deg,#1f323d,#172530)} .winner.yellow{background:linear-gradient(180deg,#332c18,#211d10)}
  .winner .h{font-family:var(--mono); font-weight:700; letter-spacing:.14em; text-transform:uppercase; font-size:17px}
  .winner.red .h{color:var(--red-l)} .winner.blue .h{color:var(--blue-l)} .winner.yellow .h{color:var(--yellow-l)}
  .winner .s{font-size:11px; color:var(--muted); margin-top:3px}

  /* ---------- overlays: toast / sheet / modal ---------- */
  .toast{position:fixed; left:50%; bottom:calc(20px + var(--safe-b)); transform:translateX(-50%); background:#2a2230; border:1px solid var(--line2); color:#fff; font-family:var(--mono); font-size:12px; padding:10px 15px; border-radius:9px; box-shadow:0 10px 24px -10px #000; opacity:0; transition:opacity .2s, transform .2s; pointer-events:none; max-width:88vw; text-align:center; z-index:60}
  .toast.show{opacity:1; transform:translateX(-50%) translateY(-2px)}
  .toast.bad{background:#4a1f27}

  .scrim{position:fixed; inset:0; background:#0b0e14cc; opacity:0; pointer-events:none; transition:opacity .18s; z-index:40}
  .scrim.show{opacity:1; pointer-events:auto}

  .sheet{position:fixed; left:0; right:0; bottom:0; z-index:50; transform:translateY(102%); transition:transform .22s cubic-bezier(.2,.8,.2,1); }
  .sheet.show{transform:translateY(0)}
  .sheet-inner{max-width:520px; margin:0 auto; background:var(--panel2); border-top-left-radius:16px; border-top-right-radius:16px; border:1px solid var(--line); border-bottom:none; padding:8px 14px calc(16px + var(--safe-b)); max-height:80vh; overflow:auto}
  .grab{width:38px;height:4px;border-radius:3px;background:var(--line2); margin:6px auto 10px}
  .sheet h3{font-family:var(--mono); font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); margin:14px 2px 8px}
  .sheet h3:first-of-type{margin-top:4px}
  .invitebox{display:flex; align-items:center; gap:10px; padding:12px; border:1px dashed var(--line2); border-radius:10px}
  .invitebox .cd{font-family:var(--mono); font-size:28px; font-weight:700; letter-spacing:.24em; color:var(--amber-soft)}
  .sheetbtn{width:100%; margin-top:8px; padding:13px; border-radius:10px; border:1px solid var(--line); background:#1a2130; color:var(--txt); font-family:var(--mono); font-weight:700; letter-spacing:.1em; text-transform:uppercase; font-size:12px; cursor:pointer; text-align:center}
  .sheetbtn.warn{color:var(--red-l); border-color:#5a3a42}
  .loglist{margin-top:4px; max-height:34vh; overflow:auto; border-top:1px solid var(--line); padding-top:6px}
  .logline{font-family:var(--mono); font-size:11px; color:#b9c0cd; padding:3px 0; border-bottom:1px dashed #2b3344; line-height:1.4}
  .logline:last-child{border-bottom:none; color:#e7e2d6}

  .modal{position:fixed; inset:0; z-index:55; display:none; align-items:center; justify-content:center; padding:22px}
  .modal.show{display:flex}
  .modal-card{max-width:400px; width:100%; background:var(--panel2); border:1px solid var(--line); border-radius:14px; padding:18px 18px 16px; box-shadow:0 20px 50px -18px #000}
  .modal-card h3{margin:0 0 6px; font-family:var(--mono); letter-spacing:.1em; text-transform:uppercase; font-size:15px; color:var(--txt)}
  .modal-card p{margin:0 0 12px; font-size:13px; color:var(--muted); line-height:1.5}
  .modal-actions{display:flex; gap:9px; margin-top:14px}
  .modal-actions .btn{flex:1; padding:13px}

  .hidden{display:none!important}

  /* while typing a clue on mobile, hide the board so the 5x5 grid never squishes;
     the clue form parks just above the keyboard. Restores on blur. */
  .app.kbd .boardwrap{display:none}
  .app.kbd .ticker{display:none}
  .app.kbd .controls{margin-top:auto}

  /* desktop: present the app like a device */
  @media (min-width:700px){
    body{display:flex; align-items:center; justify-content:center}
    .app{height:min(100dvh, 860px); max-height:860px; border:1px solid var(--line); border-radius:20px; box-shadow:0 30px 80px -30px #000, inset 0 0 0 1px #ffffff08; overflow:hidden}
  }
</style>
</head>
<body>
<div class="app">

  <div class="topbar">
    <div class="brand">Codenames</div>
    <span class="codechip hidden" id="codeChip"></span>
    <div class="conn"><span class="dot" id="dot"></span><span id="connTxt"></span></div>
    <button class="iconbtn hidden" id="menuBtn" aria-label="Menu">⋯</button>
  </div>

  <div class="stage">

    <!-- HOME -->
    <section id="home" class="screen">
      <div class="panel hero">
        <div class="k"><span class="r">CODE</span><span class="b">NAMES</span></div>
        <div class="tl">Two spymasters. One assassin. Clearance required.</div>
      </div>
      <div class="home-actions">
        <button class="bigbtn accent" id="createBtn"><span class="em">✦</span><span><span class="t">Create room</span><span class="d">Start a game and get a code to share</span></span></button>
        <div class="joinrow">
          <input type="text" id="codeIn" maxlength="4" placeholder="CODE" autocomplete="off" autocapitalize="characters" inputmode="text">
          <button class="btn go" id="joinCodeBtn" style="padding:0 18px">Join</button>
        </div>
        <button class="bigbtn" id="quickBtn"><span class="em">⚡</span><span><span class="t">Quick match</span><span class="d">Get dropped into an open game — no code needed</span></span></button>
      </div>
    </section>

    <!-- LOBBY -->
    <section id="lobby" class="screen">
      <div class="panel lobcard">
        <h2 id="lobTitle">Pick your seat</h2>
        <p class="sub">Room <b id="lobCode" class="mono"></b> · share this code so friends land here too.</p>

        <label class="fld">Call sign</label>
        <input type="text" id="nameIn" maxlength="20" placeholder="e.g. Falcon" autocomplete="off">

        <label class="fld">Team</label>
        <div class="seg" id="teamSeg">
          <button data-v="red" class="red">Red</button>
          <button data-v="blue" class="blue">Blue</button>
          <button data-v="yellow" class="yellow">Yellow</button>
        </div>

        <label class="fld">Role</label>
        <div class="seg" id="roleSeg">
          <button data-v="operative" class="amber">Operative</button>
          <button data-v="spymaster" class="amber">Spymaster</button>
        </div>

        <label class="fld">Agents in this room</label>
        <div class="roster" id="lobRoster"></div>

        <button class="primary" id="enterBtn">Enter the field</button>
        <button class="ghostbtn" id="backGameBtn">Back to board</button>
        <button class="ghostbtn" id="leaveHomeBtn">Leave room</button>
      </div>
    </section>

    <!-- GAME -->
    <section id="game" class="screen game">
      <div class="score" id="score"></div>
      <div class="transmit panel" id="transmit">
        <div class="tag" id="trTag">// transmission</div>
        <div class="body" id="trBody"></div>
      </div>
      <div class="ticker" id="ticker"></div>
      <div class="boardwrap"><div class="board" id="board"></div></div>
      <div class="controls panel" id="controls"></div>
    </section>

  </div>
</div>

<!-- overlays -->
<div class="scrim" id="scrim"></div>
<div class="sheet" id="menuSheet">
  <div class="sheet-inner">
    <div class="grab"></div>
    <h3>Invite</h3>
    <div class="invitebox"><span class="cd" id="sheetCode">----</span>
      <button class="btn" id="copyBtn" style="margin-left:auto">Copy link</button>
      <button class="btn hidden" id="shareBtn">Share</button>
    </div>
    <h3>Table</h3>
    <div class="roster" id="sheetRoster"></div>
    <button class="sheetbtn" id="newRoundBtn">Deal a new round</button>
    <button class="sheetbtn" id="changeSeatBtn">Change seat</button>
    <button class="sheetbtn warn" id="leaveBtn">Leave room</button>
    <h3>Operations log</h3>
    <div class="loglist" id="sheetLog"></div>
  </div>
</div>

<div class="modal" id="modal"><div class="modal-card" id="modalCard"></div></div>
<div class="toast" id="toast"></div>

<script>
/* ============================ helpers ============================ */
function $(id){ return document.getElementById(id); }
function el(tag, props, kids){
  var e=document.createElement(tag);
  if(props) for(var k in props){
    if(k==='class') e.className=props[k];
    else if(k==='text') e.textContent=props[k];
    else if(k.slice(0,2)==='on') e.addEventListener(k.slice(2).toLowerCase(), props[k]);
    else if(k==='style') e.setAttribute('style', props[k]);
    else e.setAttribute(k, props[k]);
  }
  if(kids!=null){ if(!Array.isArray(kids)) kids=[kids];
    for(var i=0;i<kids.length;i++){ var c=kids[i]; if(c==null) continue;
      e.appendChild(typeof c==='string'?document.createTextNode(c):c); } }
  return e;
}
var TEAMS={ red:'Red', blue:'Blue', yellow:'Yellow' };
function cap(s){ return s?s.charAt(0).toUpperCase()+s.slice(1):s; }

/* ============================ identity ============================ */
var myId = localStorage.getItem('cn_id');
if(!myId){ myId='p_'+Math.random().toString(36).slice(2,10); localStorage.setItem('cn_id', myId); }
var pick = { team: localStorage.getItem('cn_team')||'red', role: localStorage.getItem('cn_role')||'operative' };

var room = null;        // current room code
var joined = false;     // has a seat in this room
var state = null;
var es = null;
var screen = 'home';
var lastSeq = -1, firstState = true, priorWinner = null;
var lastNoticeSeq = -1, myPendingTeam = null, seatReqSeqShown = null, currentModal = null;

/* ============================ sound (Web Audio) ============================ */
var AC=null;
function actx(){ if(!AC){ var C=window.AudioContext||window.webkitAudioContext; if(C){ try{ AC=new C(); }catch(e){} } } return AC; }
function unlock(){ var c=actx(); if(c && c.state==='suspended'){ c.resume(); } }
document.addEventListener('pointerdown', unlock);
document.addEventListener('keydown', unlock);
var soundOn = localStorage.getItem('cn_sound')!=='0';

function blip(freq, t0, dur, type, vol){
  var c=actx(); if(!c || !soundOn) return;
  var o=c.createOscillator(), g=c.createGain();
  o.type=type||'triangle'; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol||0.14, t0+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
  o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0+dur+0.02);
}
function sweep(f1, f2, t0, dur, type, vol){
  var c=actx(); if(!c || !soundOn) return;
  var o=c.createOscillator(), g=c.createGain();
  o.type=type||'sawtooth'; o.frequency.setValueAtTime(f1, t0); o.frequency.exponentialRampToValueAtTime(f2, t0+dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol||0.16, t0+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0+dur);
  o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0+dur+0.02);
}
function now(){ var c=actx(); return c?c.currentTime:0; }
function sGood(){ var t=now(); blip(587,t,0.12,'triangle',0.13); blip(880,t+0.09,0.16,'triangle',0.14); }
function sNeutral(){ var t=now(); blip(300,t,0.11,'sine',0.12); blip(240,t+0.06,0.10,'sine',0.08); }
function sBad(){ var t=now(); sweep(320,140,t,0.28,'sawtooth',0.15); }
function sAssassin(){ var t=now(); sweep(200,60,t,0.6,'sawtooth',0.18); blip(70,t+0.1,0.5,'square',0.1); }
function sClue(){ var t=now(); blip(760,t,0.07,'sine',0.08); blip(1010,t+0.08,0.09,'sine',0.09); }
function sWin(){ var t=now(); [523,659,784,1046].forEach(function(f,i){ blip(f,t+i*0.11,0.2,'triangle',0.14); }); }
function sLose(){ var t=now(); [440,392,311,233].forEach(function(f,i){ blip(f,t+i*0.13,0.26,'triangle',0.12); }); }

/* ============================ networking ============================ */
function setConn(on){ $('dot').className='dot '+(on?'on':'off'); $('connTxt').textContent=on?'SECURE':'···'; }
function openStream(){
  if(es){ es.close(); es=null; }
  es = new EventSource('/events?room='+encodeURIComponent(room)+'&id='+encodeURIComponent(myId));
  es.onmessage=function(ev){
    var s=JSON.parse(ev.data);
    if(s.error==='no_room'){ es.close(); es=null; goHome(); return; }
    state=s; setConn(true); onState();
  };
  es.onerror=function(){ setConn(false); };
}
function api(path, params){
  var qs=Object.keys(params).map(function(k){ return encodeURIComponent(k)+'='+encodeURIComponent(params[k]); }).join('&');
  return fetch(path+'?'+qs).then(function(r){ return r.json(); }).then(function(res){
    if(res && res.ok===false && res.error && res.error!=='no_room') toast(res.error, true);
    return res||{};
  }).catch(function(){ toast('Connection hiccup — retrying.', true); return {}; });
}

/* ============================ navigation ============================ */
function showScreen(name){
  screen=name;
  ['home','lobby','game'].forEach(function(s){ $(s).classList.toggle('on', s===name); });
  var inRoom = (name!=='home');
  $('menuBtn').classList.toggle('hidden', name!=='game');
  $('codeChip').classList.toggle('hidden', !inRoom || !room);
  var conn=document.querySelector('.conn'); if(conn) conn.style.display = (name==='home') ? 'none' : '';
  if(room) $('codeChip').textContent=room;
  if(state){ if(name==='game') renderGame(mySeat()); else if(name==='lobby') renderLobby(); }
}
function goHome(){
  if(es){ es.close(); es=null; }
  room=null; joined=false; state=null; setConn(false); $('connTxt').textContent='';
  myPendingTeam=null; seatReqSeqShown=null; if(currentModal) closeModal();
  try{ history.replaceState(null,'',location.pathname); }catch(e){}
  localStorage.removeItem('cn_room');
  showScreen('home');
}
function enterRoom(code, autoseat){
  room=code.toUpperCase();
  localStorage.setItem('cn_room', room);
  try{ history.replaceState(null,'','#'+room); }catch(e){}
  firstState=true; lastSeq=-1; priorWinner=null; lastNoticeSeq=-1; myPendingTeam=null; seatReqSeqShown=null;
  joined = !!autoseat;
  showScreen(autoseat ? 'game' : 'lobby');
  openStream();
}

/* ============================ home actions ============================ */
function makeCodeLocal(){ var A='ABCDEFGHJKMNPQRSTUVWXYZ23456789', s=''; for(var i=0;i<4;i++){ s+=A.charAt(Math.floor(Math.random()*A.length)); } return s; }
$('createBtn').addEventListener('click', function(){ unlock(); pick.role='spymaster'; enterRoom(makeCodeLocal(), false); });
$('joinCodeBtn').addEventListener('click', function(){
  var code=$('codeIn').value.trim().toUpperCase();
  if(code.length!==4){ toast('Enter the 4-letter code.', true); return; }
  unlock(); enterRoom(code, false);
});
$('codeIn').addEventListener('keydown', function(e){ if(e.key==='Enter') $('joinCodeBtn').click(); });
$('quickBtn').addEventListener('click', function(){
  unlock();
  var name=localStorage.getItem('cn_name');
  if(!name){ name='Agent'+Math.floor(Math.random()*900+100); localStorage.setItem('cn_name', name); }
  api('/quick', { id:myId, name:name }).then(function(res){
    if(res.code){ pick.team=res.team; pick.role=res.role; localStorage.setItem('cn_team',res.team); localStorage.setItem('cn_role',res.role); enterRoom(res.code, true); }
  });
});

/* ============================ lobby actions ============================ */
function paintSeg(segId, val){
  var seg=$(segId);
  Array.prototype.forEach.call(seg.children, function(b){ b.classList.toggle('sel', b.getAttribute('data-v')===val); });
}
$('teamSeg').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b||b.disabled) return; pick.team=b.getAttribute('data-v'); paintSeg('teamSeg',pick.team); });
$('roleSeg').addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; pick.role=b.getAttribute('data-v'); paintSeg('roleSeg',pick.role); });
$('enterBtn').addEventListener('click', function(){
  var name=$('nameIn').value.trim();
  if(!name){ toast('Enter a call sign.', true); $('nameIn').focus(); return; }
  localStorage.setItem('cn_name',name); localStorage.setItem('cn_team',pick.team); localStorage.setItem('cn_role',pick.role);
  api('/takeseat', { room:room, id:myId, name:name, team:pick.team, role:pick.role }).then(function(res){
    if(res && res.ok){
      if(res.applied){
        if(res.role){ pick.role=res.role; localStorage.setItem('cn_role',res.role); }
        joined=true; showScreen('game');
      } else if(res.pending){
        joined=true; myPendingTeam=res.team; openWaitingModal(res.targetName, res.team);
      }
    }
  });
});
$('backGameBtn').addEventListener('click', function(){ showScreen('game'); });
$('leaveHomeBtn').addEventListener('click', function(){ api('/leave',{room:room,id:myId}); goHome(); });

/* ============================ menu / sheet ============================ */
function openSheet(){ $('menuSheet').classList.add('show'); $('scrim').classList.add('show'); renderSheet(); }
function closeSheet(){ $('menuSheet').classList.remove('show'); $('scrim').classList.remove('show'); }
$('menuBtn').addEventListener('click', openSheet);
$('scrim').addEventListener('click', function(){ if(currentModal==='seatreq'||currentModal==='waiting') return; closeSheet(); closeModal(); });
$('changeSeatBtn').addEventListener('click', function(){ closeSheet(); showScreen('lobby'); });
$('leaveBtn').addEventListener('click', function(){ closeSheet(); api('/leave',{room:room,id:myId}); goHome(); });
$('copyBtn').addEventListener('click', function(){
  var link=location.origin+location.pathname+'#'+room;
  copyText(link);
});
if(navigator.share){ $('shareBtn').classList.remove('hidden');
  $('shareBtn').addEventListener('click', function(){ navigator.share({ title:'Codenames', text:'Join my Codenames room: '+room, url:location.origin+location.pathname+'#'+room }).catch(function(){}); });
}
function copyText(t){
  if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(function(){ toast('Invite link copied.'); }, function(){ fallbackCopy(t); }); }
  else fallbackCopy(t);
}
function fallbackCopy(t){
  var i=el('input',{ type:'text' }); i.value=t; document.body.appendChild(i); i.select();
  try{ document.execCommand('copy'); toast('Invite link copied.'); }catch(e){ toast(t); }
  document.body.removeChild(i);
}

/* ============================ New Round modal ============================ */
$('newRoundBtn').addEventListener('click', function(){ closeSheet(); openNewRound(); });
function openNewRound(){
  var three = state ? !!state.threeTeam : false;
  var card=$('modalCard'); card.innerHTML='';
  card.appendChild(el('h3',{ text:'Deal a new round?' }));
  card.appendChild(el('p',{ text:'This ends the current round for everyone and reshuffles the board. Seats are kept.' }));
  card.appendChild(el('div',{ class:'fld', style:'margin:2px 0 6px' }, 'Mode'));
  var seg=el('div',{ class:'seg' });
  var b2=el('button',{ class:'amber'+(three?'':' sel'), text:'2 teams · 4p' , onClick:function(){ three=false; sync(); }});
  var b3=el('button',{ class:'amber'+(three?' sel':''), text:'3 teams · 6p', onClick:function(){ three=true; sync(); }});
  function sync(){ b2.classList.toggle('sel',!three); b3.classList.toggle('sel',three); }
  seg.appendChild(b2); seg.appendChild(b3); card.appendChild(seg);
  var acts=el('div',{ class:'modal-actions' });
  acts.appendChild(el('button',{ class:'btn', text:'Cancel', onClick:closeModal }));
  acts.appendChild(el('button',{ class:'btn go', text:'Deal', onClick:function(){ closeModal(); api('/newgame',{ room:room, three: three?1:0 }); }}));
  card.appendChild(acts);
  showModalEl('newround');
}
function showModalEl(kind){ currentModal=kind||'modal'; $('modal').classList.add('show'); $('scrim').classList.add('show'); }
function closeModal(){ currentModal=null; $('modal').classList.remove('show'); if(!$('menuSheet').classList.contains('show')) $('scrim').classList.remove('show'); }

/* ---- seat-change requests (Spymaster seat is the only contested one) ---- */
function openSeatReqDialog(req){
  var card=$('modalCard'); card.innerHTML='';
  card.appendChild(el('h3',{ text:'Seat request' }));
  card.appendChild(el('p',{ text: req.fromName+' wants your '+TEAMS[req.team]+' Spymaster seat. If you allow it, you become an Operative on '+TEAMS[req.team]+'.' }));
  var acts=el('div',{ class:'modal-actions' });
  acts.appendChild(el('button',{ class:'btn', text:'Deny', onClick:function(){ closeModal(); api('/seatrespond',{ room:room, id:myId, accept:0 }); } }));
  acts.appendChild(el('button',{ class:'btn go', text:'Allow', onClick:function(){ closeModal(); api('/seatrespond',{ room:room, id:myId, accept:1 }); } }));
  card.appendChild(acts);
  showModalEl('seatreq');
}
function openWaitingModal(targetName, team){
  var card=$('modalCard'); card.innerHTML='';
  card.appendChild(el('h3',{ text:'Request sent' }));
  card.appendChild(el('p',{ text:'Waiting for '+targetName+' to hand over the '+TEAMS[team]+' Spymaster seat…' }));
  var acts=el('div',{ class:'modal-actions' });
  acts.appendChild(el('button',{ class:'btn', text:'Cancel request', onClick:function(){ closeModal(); api('/seatcancel',{ room:room, id:myId }); } }));
  card.appendChild(acts);
  showModalEl('waiting');
}
function handleNotice(wasFirst){
  var n=state.notice;
  if(n && n.seq!==lastNoticeSeq){ if(!wasFirst && n.by!==myId) toast(n.text); lastNoticeSeq=n.seq; }
}
function handleSeat(seat){
  var req=state.seatRequest;
  if(req && req.targetId===myId){
    if(currentModal!=='seatreq'){ openSeatReqDialog(req); }
  } else if(req && req.fromId===myId){
    myPendingTeam=req.team;
    if(currentModal!=='waiting'){ openWaitingModal(req.targetName, req.team); }
  } else {
    if(currentModal==='seatreq' || currentModal==='waiting'){ closeModal(); }
    if(myPendingTeam!=null){
      var mine = seat && seat.role==='spymaster' && seat.team===myPendingTeam;
      myPendingTeam=null;
      if(mine) showScreen('game');   // approved: the broadcast notice announces it to the table
    }
  }
}

/* ============================ toast ============================ */
var toastT;
function toast(msg, bad){ var e=$('toast'); e.textContent=msg; e.className='toast show'+(bad?' bad':''); clearTimeout(toastT); toastT=setTimeout(function(){ e.className='toast'+(bad?' bad':''); }, 2600); }

/* ============================ state handling ============================ */
function mySeat(){ if(!state) return null; for(var i=0;i<state.players.length;i++) if(state.players[i].id===myId) return state.players[i]; return null; }

function onState(){
  if(!state) return;
  var seat=mySeat();
  var wasFirst=firstState;
  // restore a lost seat only for someone actively on the board (e.g. after a server restart)
  if(joined && !seat && screen==='game' && myPendingTeam==null && localStorage.getItem('cn_name') && state.teams.indexOf(pick.team)>=0){
    api('/join', { room:room, id:myId, name:localStorage.getItem('cn_name'), team:pick.team, role:pick.role });
  }
  playCues(seat);
  handleNotice(wasFirst);
  handleSeat(seat);
  seat=mySeat();
  // mirror our real seat so a restart-restore reconnects to the right role (but never
  // override an in-progress choice on the lobby screen)
  if(seat && screen!=='lobby'){ pick.team=seat.team; pick.role=seat.role; localStorage.setItem('cn_team',seat.team); localStorage.setItem('cn_role',seat.role); }
  if(screen==='game') renderGame(seat);
  if(screen==='lobby') renderLobby();
  if($('menuSheet').classList.contains('show')) renderSheet();
  if(room) $('codeChip').textContent=room;
}

function playCues(seat){
  if(!state) return;
  var ev=state.lastEvent;
  if(ev && ev.seq!==lastSeq){
    if(!firstState){
      if(ev.kind==='good') sGood();
      else if(ev.kind==='neutral') sNeutral();
      else if(ev.kind==='bad') sBad();
      else if(ev.kind==='assassin') sAssassin();
      else if(ev.kind==='clue') sClue();
    }
    lastSeq=ev.seq;
  }
  if(state.winner && state.winner!==priorWinner){
    if(!firstState){
      var mine = seat && seat.team===state.winner;
      if(mine) sWin(); else sLose();
    }
    priorWinner=state.winner;
  }
  if(!state.winner) priorWinner=null;
  firstState=false;
}

/* ---------- lobby render ---------- */
function renderLobby(){
  $('lobCode').textContent=room||'----';
  $('lobTitle').textContent = mySeat() ? 'Change seat' : 'Pick your seat';
  $('backGameBtn').classList.toggle('hidden', !mySeat());
  // team availability for current mode
  var teams = state ? state.teams : ['red','blue'];
  Array.prototype.forEach.call($('teamSeg').children, function(b){
    var v=b.getAttribute('data-v'); var avail=teams.indexOf(v)>=0;
    b.disabled=!avail; b.style.display = (v==='yellow' && !avail) ? 'none' : '';
  });
  if(teams.indexOf(pick.team)<0){ pick.team=teams[0]; }
  paintSeg('teamSeg', pick.team); paintSeg('roleSeg', pick.role);
  if(!$('nameIn').value) $('nameIn').value=localStorage.getItem('cn_name')||'';
  renderRoster($('lobRoster'));
}

/* ---------- roster ---------- */
function renderRoster(box){
  box.innerHTML='';
  if(!state){ return; }
  var order = state.players.slice().sort(function(a,b){
    var ta=state.teams.indexOf(a.team), tb=state.teams.indexOf(b.team);
    if(ta!==tb) return ta-tb;
    return (a.role==='spymaster'?0:1)-(b.role==='spymaster'?0:1);
  });
  if(!order.length){ box.appendChild(el('span',{ class:'waiting', text:'No one here yet — you are first.' })); return; }
  order.forEach(function(p){
    var star = p.role==='spymaster' ? el('span',{ class:'star', text:'★ ' }) : null;
    box.appendChild(el('span',{ class:'rchip '+p.team }, [ star, p.name+' ', el('span',{ style:'opacity:.6', text:(p.role==='spymaster'?'SM':'OP') }) ]));
  });
}

/* ---------- sheet render ---------- */
function renderSheet(){
  $('sheetCode').textContent=room||'----';
  renderRoster($('sheetRoster'));
  var box=$('sheetLog'); box.innerHTML='';
  if(state){ state.log.forEach(function(l){ box.appendChild(el('div',{ class:'logline', text:l })); }); box.scrollTop=box.scrollHeight; }
}

/* ---------- game render ---------- */
function renderGame(seat){
  renderScore(seat);
  renderTransmit(seat);
  renderTicker();
  renderBoard(seat);
  renderControls(seat);
}

function renderScore(seat){
  var box=$('score'); box.innerHTML='';
  state.teams.forEach(function(t){
    var out = !!state.eliminated[t];
    var act = state.currentTeam===t && !state.winner && !out;
    var cell=el('div',{ class:'tc '+t+(act?' act':'')+(out?' out':'') },[
      el('div',{ class:'n', text:String(state.remaining[t]) }),
      el('div',{ class:'l', text: TEAMS[t]+(out?' · out':' left') })
    ]);
    box.appendChild(cell);
  });
}

function renderTransmit(seat){
  var t=$('transmit'), body=$('trBody'), tag=$('trTag');
  body.innerHTML='';
  if(state.winner){
    t.className='transmit panel '+state.winner;
    tag.textContent='// mission complete';
    var assassin = state.log.some(function(l){ return l.indexOf('ASSASSIN')>=0; });
    body.appendChild(el('div',{ class:'winner '+state.winner, style:'flex:1' },[
      el('div',{ class:'h', text: TEAMS[state.winner]+' team wins' }),
      el('div',{ class:'s', text: assassin ? 'The assassin was uncovered.' : 'All field agents accounted for.' })
    ]));
    return;
  }
  if(state.clue){
    var ct=state.clue.team;
    t.className='transmit panel '+ct;
    tag.textContent='// '+TEAMS[ct]+' spymaster — incoming';
    var col = ct==='red'?'var(--red-l)':ct==='blue'?'var(--blue-l)':'var(--yellow-l)';
    body.appendChild(el('span',{ class:'clueword', style:'color:'+col, text:state.clue.word }));
    body.appendChild(el('span',{ class:'cluenum', text: state.clue.number===0?'∞':String(state.clue.number) }));
    if(state.clue.bonus) body.appendChild(el('span',{ class:'bonusbadge', text:'+1 bonus' }));
    var g = state.guessesLeft>=99 ? '∞' : String(state.guessesLeft);
    body.appendChild(el('span',{ class:'gleft', text: g+' guess'+(g==='1'?'':'es')+' left' }));
  } else {
    t.className='transmit panel '+state.currentTeam;
    tag.textContent='// transmission';
    body.appendChild(el('span',{ class:'waiting' },[ 'Awaiting '+TEAMS[state.currentTeam]+' spymaster… ', el('span',{ class:'cur' }) ]));
  }
}

function renderTicker(){
  var last = state.log[state.log.length-1] || '';
  $('ticker').textContent = last;
}
$('ticker').addEventListener('click', openSheet);

function renderBoard(seat){
  var board=$('board'); board.innerHTML='';
  var canGuess = seat && seat.role==='operative' && seat.team===state.currentTeam && state.clue && !state.winner;
  for(var i=0;i<state.words.length;i++){
    var color=state.key[i], revealed=state.revealed[i];
    var cls='card';
    if(revealed) cls='card reveal r-'+color;
    else if(color) cls='card key-'+color;
    var card=el('div',{ class:cls });
    if(revealed){
      var mk = color==='assassin'?'☠':(color==='neutral'?'•':'✓');
      card.appendChild(el('span',{ class:'mark', text:mk }));
    }
    if(!revealed && canGuess){
      card.classList.add('click');
      (function(idx){ card.addEventListener('click', function(){ api('/guess', { room:room, id:myId, index:idx }); }); })(i);
    }
    card.appendChild(el('div',{ class:'w', text:state.words[i] }));
    board.appendChild(card);
  }
}

function renderControls(seat){
  var box=$('controls'); box.innerHTML='';
  if(state.winner){
    box.appendChild(el('div',{ class:'ctitle', text:'Round complete' }));
    box.appendChild(el('button',{ class:'btn go wide', text:'Deal a new round', onClick:openNewRound }));
    return;
  }
  if(!seat){
    box.appendChild(el('div',{ class:'ctitle', text:'Spectating' }));
    box.appendChild(el('button',{ class:'btn wide', text:'Take a seat', onClick:function(){ showScreen('lobby'); } }));
    return;
  }
  var myTurn = seat.team===state.currentTeam;
  function teamHas(role){ return state.players.some(function(p){ return p.team===seat.team && p.role===role; }); }

  if(seat.role==='spymaster'){
    if(!myTurn){ box.appendChild(el('div',{ class:'ctitle', text:'Spymaster · standby' })); box.appendChild(el('div',{ class:'waiting', text:'It is '+TEAMS[state.currentTeam]+"'s turn. You transmit when control returns to your team." })); return; }
    if(state.clue){
      box.appendChild(el('div',{ class:'ctitle', text:'Clue transmitted' }));
      box.appendChild(el('div',{ class:'waiting', text: teamHas('operative') ? 'Your operatives are guessing. Sit tight until the turn ends.' : 'No operative has joined your team yet — a teammate must join this room as Operative to make guesses.' }));
      return;
    }
    box.appendChild(el('div',{ class:'ctitle', text:'Transmit a clue' }));
    if(!teamHas('operative')) box.appendChild(el('div',{ class:'waiting', style:'margin-bottom:8px', text:'Heads up: no operative on your team yet. Someone needs to join as Operative to guess your clues.' }));
    var word=el('input',{ type:'text', id:'clueWord', placeholder:'one word', autocomplete:'off' });
    var sel=el('select',{ class:'numsel', id:'clueNum' });
    for(var n=0;n<=9;n++){ sel.appendChild(el('option',{ value:String(n), text: n===0?'∞':String(n) })); }
    sel.value='1';
    var send=el('button',{ class:'btn go', text:'Send', onClick:sendClue });
    box.appendChild(el('div',{ class:'cluerow' },[ word, sel, send ]));
    var bonus=false;
    var chk=el('span',{ class:'chk', text:'' });
    var bl=el('div',{ class:'bonusline', onClick:function(){ bonus=!bonus; chk.className='chk'+(bonus?' on':''); chk.textContent=bonus?'✓':''; } },[ chk, 'Allow one extra guess (+1)' ]);
    box.appendChild(bl);
    word.addEventListener('keydown', function(e){ if(e.key==='Enter') sendClue(); });
    function sendClue(){
      var w=$('clueWord').value.trim();
      if(!w){ toast('Enter a clue word.', true); return; }
      api('/clue', { room:room, id:myId, word:w, number:$('clueNum').value, bonus: bonus?1:0 }).then(function(res){ if(res && res.ok){ $('clueWord').value=''; } });
    }
    return;
  }

  // operative
  if(!myTurn){ box.appendChild(el('div',{ class:'ctitle', text:'Operative · standby' })); box.appendChild(el('div',{ class:'waiting', text:TEAMS[state.currentTeam]+' is up. Wait for control to pass to your team.' })); return; }
  if(!state.clue){ box.appendChild(el('div',{ class:'ctitle', text:'Operative · ready' })); box.appendChild(el('div',{ class:'waiting', text: teamHas('spymaster') ? 'Waiting for your spymaster. When a clue arrives, tap the cards you think are yours.' : 'Your team has no spymaster yet — someone needs to join this room as Spymaster to send clues.' })); return; }
  box.appendChild(el('div',{ class:'ctitle', text:'Your move — tap a card to guess' }));
  box.appendChild(el('button',{ class:'btn wide', text:'End turn', onClick:function(){ api('/endturn', { room:room, id:myId }); } }));
}

/* ---- keep the app inside the *visible* viewport (mobile keyboards) ---- */
var clueFocused=false;
function keyboardOpen(){
  if(!window.visualViewport) return false;
  var full=Math.max(window.innerHeight||0, document.documentElement.clientHeight||0);
  return (full - window.visualViewport.height) > 120;
}
function updateKbd(){
  var a=document.querySelector('.app'); if(!a) return;
  // hide the board ONLY while the keyboard is actually on screen; the moment it's
  // dismissed (even with the cursor still in the box) the board comes back.
  a.classList.toggle('kbd', clueFocused && window.innerWidth<700 && keyboardOpen());
}
function fitViewport(){
  var app=document.querySelector('.app');
  if(!app){ return; }
  if(window.innerWidth<700 && window.visualViewport){ app.style.height=window.visualViewport.height+'px'; }
  else { app.style.height=''; }
  updateKbd();
}
if(window.visualViewport){ window.visualViewport.addEventListener('resize', fitViewport); window.visualViewport.addEventListener('scroll', fitViewport); }
window.addEventListener('resize', fitViewport);
window.addEventListener('orientationchange', function(){ setTimeout(fitViewport, 250); });

/* track whether the clue box holds the cursor; board visibility is decided by updateKbd */
document.addEventListener('focusin', function(e){ if(e.target && e.target.id==='clueWord'){ clueFocused=true; updateKbd(); } });
document.addEventListener('focusout', function(e){ if(e.target && e.target.id==='clueWord'){ clueFocused=false; updateKbd(); } });

/* ============================ boot ============================ */
(function boot(){
  fitViewport();
  showScreen('home');
  setConn(false);
  var hash = (location.hash||'').replace('#','').trim().toUpperCase();
  if(hash && /^[A-Z0-9]{4}$/.test(hash)){ enterRoom(hash, false); }
})();
window.addEventListener('hashchange', function(){
  var h=(location.hash||'').replace('#','').trim().toUpperCase();
  if(h && /^[A-Z0-9]{4}$/.test(h) && h!==room){ enterRoom(h, false); }
});
</script>
</body>
</html>`;
