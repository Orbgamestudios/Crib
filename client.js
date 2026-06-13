import { JOKER_ICONS, TAROT_ICONS, PACK_ICONS } from './icons.js?v=4';
import { cardValue } from './lib/cards.js';
import { pegEvents, scoreBreakdown } from './lib/scoring.js';
import { aggregateMods, buildScore } from './lib/jokers.js';

const $ = id => document.getElementById(id);
const SUIT_CHARS = ['♥', '♦', '♣', '♠']; // H D C S
const RANK_NAMES = [null, 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const PEER_PREFIX = 'orbcrib-v1-';
const P2P_LOBBY_TOPIC = 'orbcrib-lobbies-v1';
const P2P_LOBBY_TTL = 16000;
const P2P_LOBBY_BROKERS = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
];
const P2P_ROOM_TOPIC_PREFIX = 'orbcrib-room-v1';
const TOUCH = 'ontouchstart' in window;
const ANIM = 1.9; // global animation slowdown — everything glides ~half speed

// GitHub Pages (or any static host) has no WebSocket server: use P2P rooms.
const P2P_MODE = location.hostname.endsWith('github.io') ||
  new URLSearchParams(location.search).has('p2p');

let ws = null;
let wsOpen = false;
let hostSession = null;   // P2P: I am the host (game runs in this tab)
let guestConn = null;     // P2P: I am a guest
let guestPeer = null;
let mqttGuest = null;
let mqttSyncTimer = null;
let p2pLobbyClients = [];
const p2pRooms = new Map();
let myRoomId = null;
let lastState = null;
let prevState = null;
let selected = [];        // card ids picked for discard
let tarotMode = null;     // { idx, def, targets: [] }
let view = 'lobby';
let pendingFly = null;    // { cardId, rect } captured when I click a peg card
let revealShown = -1;     // last scoring result index already animated
let revealKey = '';
let deckOpen = false;     // deck viewer overlay
let raisedCardId = null;
let selectedShopIdx = -1;
let focusMode = null;
let pointerCardDrag = null;
let lastCoinPopKey = '';
let deferredRender = false; // a state update arrived mid-drag; apply on release

function isDragging() {
  return !!((pointerCardDrag && pointerCardDrag.dragging) || (jokerDrag && jokerDrag.dragging));
}

function flushDeferredRender() {
  if (deferredRender && lastState) {
    deferredRender = false;
    renderGame(lastState); // no animation on the catch-up frame
  }
}

// Joker drag state (pointer-based, works on touch + mouse)
let jokerDrag = null;

// Tutorial mode
let tutorialOn = localStorage.getItem('crib_tutorial') !== '0'; // default on
let lastTutKey = '';

// Remove any drag ghost left orphaned by a re-render that happened mid-gesture
// (the heartbeat re-broadcasts state every 2.5s and rebuilds the hand, which
// would otherwise strand the fixed-position clone on screen forever).
function sweepStrayFx() {
  if (pointerCardDrag && pointerCardDrag.el && !pointerCardDrag.el.isConnected) {
    if (pointerCardDrag.ghost) pointerCardDrag.ghost.remove();
    pointerCardDrag = null;
  }
  if (jokerDrag && jokerDrag.tile && !jokerDrag.tile.isConnected) {
    if (jokerDrag.ghost) jokerDrag.ghost.remove();
    jokerDrag = null;
  }
  const keep = (pointerCardDrag && pointerCardDrag.ghost) || (jokerDrag && jokerDrag.ghost) || null;
  document.querySelectorAll('.drag-ghost').forEach(g => { if (g !== keep) g.remove(); });
}

// ---- transport ----

function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    wsOpen = true;
    const savedRoom = sessionStorage.getItem('crib_room');
    const name = localStorage.getItem('crib_name');
    if (savedRoom && name) {
      ws.send(JSON.stringify({ t: 'joinRoom', roomId: savedRoom, playerName: name }));
    }
  };
  ws.onmessage = e => handle(JSON.parse(e.data));
  ws.onclose = () => {
    wsOpen = false;
    toast('Connection lost — reconnecting…');
    setTimeout(connectWs, 2000);
  };
}

function sendMsg(msg) {
  if (hostSession) hostSession.handleLocal(msg);
  else if (guestConn && guestConn.open) guestConn.send(msg);
  else if (mqttGuest && mqttGuest.open) mqttGuest.send(msg, { qos: 1 });
  else if (wsOpen) ws.send(JSON.stringify(msg));
}

async function hostTable() {
  const { HostSession, makeCode } = await import('./net/host.js');
  const code = makeCode();
  hostSession = new HostSession(code, myName(), msg => handle(msg), (status, detail) => {
    if (status === 'code-taken') { hostSession = null; toast('Code collision — try again.'); }
    else if (status === 'error') { hostSession = null; toast('Connection service error: ' + detail); showView('lobby'); }
  });
  hostSession.peer.on('error', err => {
    console.warn('Host PeerJS error:', err.type);
    toast('Connection service error: ' + err.type);
  });
}

function joinByCode(code) {
  code = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) return toast('Codes are 5 letters/digits.');
  clearGuestTransports();
  sessionStorage.setItem('crib_code', code);
  guestPeer = new Peer({ debug: 1 });
  toast('Connecting…');
  let failTimer = null;
  let fallingBack = false;
  const useRelay = () => {
    if (fallingBack) return;
    fallingBack = true;
    clearTimeout(failTimer);
    clearGuestPeer();
    joinByMqttCode(code);
  };
  guestPeer.on('open', () => {
    guestConn = guestPeer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
    failTimer = setTimeout(() => {
      if (!guestConn || !guestConn.open) useRelay();
    }, 12000);
    guestConn.on('open', () => {
      clearTimeout(failTimer);
      guestConn.send({ t: 'joinRoom', playerName: myName() });
    });
    guestConn.on('data', msg => handle(msg));
    guestConn.on('close', () => { clearTimeout(failTimer); if (!fallingBack) dropGuest('Connection to the host was lost.'); });
    guestConn.on('error', () => useRelay());
  });
  guestPeer.on('error', err => {
    clearTimeout(failTimer);
    if (err.type === 'peer-unavailable' || err.type === 'network') useRelay();
    else dropGuest('Connection error: ' + err.type);
  });
}

function dropGuest(reason) {
  if (!guestPeer && !mqttGuest) return;
  clearGuestTransports();
  toast(reason);
  showView('lobby');
}

function joinByMqttCode(code) {
  if (!window.mqtt) {
    toast('Connecting through lobby relay…');
    setTimeout(() => joinByMqttCode(code), 500);
    return;
  }
  clearMqttGuest();
  toast('Connecting through lobby relay…');
  const guestId = 'g-' + Math.random().toString(36).slice(2);
  const hostTopic = `${P2P_ROOM_TOPIC_PREFIX}/${code}/host`;
  const guestTopic = `${P2P_ROOM_TOPIC_PREFIX}/${code}/guest/${guestId}`;
  const seen = new Set();
  let joined = false;
  const clients = [];
  const joinEnvelope = JSON.stringify({
    id: makeMsgId(),
    guestId,
    msg: { t: 'joinRoom', playerName: myName() },
  });
  const sendEnvelope = (msg, opts = {}) => {
    const envelope = JSON.stringify({ id: makeMsgId(), guestId, msg });
    for (const client of clients) {
      if (client.connected) client.publish(hostTopic, envelope, opts);
    }
  };
  const sendJoin = () => {
    for (const client of clients) {
      if (client.connected) client.publish(hostTopic, joinEnvelope, { qos: 1 });
    }
  };
  mqttGuest = {
    open: true,
    send: sendEnvelope,
    destroy() {
      this.open = false;
      for (const client of clients) client.end(true);
    },
  };
  const failTimer = setTimeout(() => {
    if (!joined) dropGuest('No table found with that code. Make sure the host tab is open.');
  }, 12000);
  const onMessage = (topic, payload) => {
    if (topic !== guestTopic) return;
    let envelope;
    try { envelope = JSON.parse(payload.toString()); } catch { return; }
    if (!envelope || envelope.guestId !== guestId || seen.has(envelope.id)) return;
    seen.add(envelope.id);
    if (envelope.msg && envelope.msg.t === 'joined') {
      joined = true;
      clearTimeout(failTimer);
    }
    if (envelope.msg) handle(envelope.msg);
  };
  for (let i = 0; i < P2P_LOBBY_BROKERS.length; i++) {
    const client = window.mqtt.connect(P2P_LOBBY_BROKERS[i], {
      clientId: `orbcrib-guest-${i}-${guestId}`,
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 3000,
    });
    clients.push(client);
    client.on('connect', () => {
      client.subscribe(guestTopic, { qos: 1 }, sendJoin);
    });
    client.on('message', onMessage);
    client.on('error', err => console.warn('Lobby relay error:', err && err.message || err));
  }
}

function clearGuestPeer() {
  const peer = guestPeer;
  guestPeer = null;
  guestConn = null;
  if (peer) { try { peer.destroy(); } catch { /* gone */ } }
}

function clearMqttGuest() {
  const relay = mqttGuest;
  mqttGuest = null;
  if (relay) relay.destroy();
}

function clearGuestTransports() {
  clearGuestPeer();
  clearMqttGuest();
}

function startMqttSync() {
  stopMqttSync();
  mqttSyncTimer = setInterval(() => {
    if (mqttGuest && mqttGuest.open && view === 'waiting') mqttGuest.send({ t: 'sync' }, { qos: 1 });
  }, 2000);
}

function stopMqttSync() {
  if (mqttSyncTimer) clearInterval(mqttSyncTimer);
  mqttSyncTimer = null;
}

function makeMsgId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function leaveP2p() {
  if (hostSession) { hostSession.destroy('Host closed the table.'); hostSession = null; }
  else clearGuestTransports();
  showView('lobby');
}

window.addEventListener('beforeunload', () => {
  if (hostSession) hostSession.destroy('Host closed the table.');
});

function handle(msg) {
  switch (msg.t) {
    case 'rooms':
      if (view === 'lobby' && !P2P_MODE) renderRoomList(msg.rooms);
      break;
    case 'joined':
      myRoomId = msg.roomId;
      if (!P2P_MODE) sessionStorage.setItem('crib_room', msg.roomId);
      if (mqttGuest) startMqttSync();
      $('log').innerHTML = '';
      (msg.logs || []).forEach(addLog);
      break;
    case 'roomUpdate':
      showView('waiting');
      renderWaiting(msg);
      break;
    case 'state':
      stopMqttSync();
      showView('game');
      if (msg.state.phase !== 'shop') selectedShopIdx = -1;
      // Don't rebuild the table mid-drag — that yanks the card out of your
      // hand ("let go randomly"). Stash it and catch up when the drag ends.
      if (isDragging()) { lastState = msg.state; deferredRender = true; break; }
      prevState = lastState;
      lastState = msg.state;
      renderGame(msg.state);
      runAnimations(prevState, msg.state);
      break;
    case 'log':
      addLog(msg.text);
      break;
    case 'error':
      toast(msg.text);
      break;
    case 'hostLeft':
      dropGuest(msg.text || 'The host closed the table.');
      break;
    case 'left':
      myRoomId = null;
      sessionStorage.removeItem('crib_room');
      hostSession = null;
      stopMqttSync();
      clearGuestTransports();
      showView('lobby');
      if (!P2P_MODE) renderRoomList(msg.rooms || []);
      break;
  }
}

// ---- views ----

function showView(v) {
  view = v;
  $('lobby').classList.toggle('hidden', v !== 'lobby');
  $('waiting').classList.toggle('hidden', v !== 'waiting');
  $('game').classList.toggle('hidden', v !== 'game');
  if (v !== 'game') {
    $('overlay').classList.add('hidden');
    closeFocus();
    lastState = prevState = null;
    lastJokerSig = null;
    lastOverlayPhase = 'none';
    document.body.classList.remove('my-turn');
  }
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3000);
}

function showInfo(title, body) {
  $('infoTitle').textContent = title;
  $('infoBody').innerHTML = body;
  $('infoOverlay').classList.remove('hidden');
}

$('infoClose').onclick = () => $('infoOverlay').classList.add('hidden');
$('infoOverlay').onclick = e => {
  if (e.target === $('infoOverlay')) $('infoOverlay').classList.add('hidden');
};

function showHowToPlay() {
  showInfo('How to Play', `<div class="howto">
    <h4>The goal</h4>
    <p>Cribbage as a roguelike. Each <b>round</b> you must score at least the
    round's <b>blind</b> or you're knocked out. Blinds climb fast, so you build
    an engine of jokers and tarots to keep up. Multiplayer: last player standing
    wins. Solo vs The House: see how many rounds you can survive.</p>

    <h4>A deal, step by step</h4>
    <ol>
      <li><b>Discard</b> to the crib (the dealer's bonus hand).</li>
      <li><b>Cut</b> a starter card - shared by every hand.</li>
      <li><b>Pegging</b> - take turns laying cards, keeping the running count at 31 or under.</li>
      <li><b>The show</b> - hands are counted, then the crib.</li>
    </ol>

    <h4>Scoring - Points x Mult</h4>
    <p>Your hand's combos are <span class="chip-blue">Points</span> (blue):
    fifteens 2, pairs 2, runs 1 per card, flush, and His Nobs (Jack matching the
    starter's suit).</p>
    <p>Everything you peg becomes <span class="chip-red">Mult</span> (red).
    Each hand starts at <b>x2</b>, and every pegging point (15s, 31s, pairs,
    runs, go, His Heels) adds to it.</p>
    <p>At the show, <b>Points x Mult = the deal's score</b>. The dealer's crib is
    scored with the dealer's Mult too. So a fat hand with a big pegging Mult
    snowballs - that's how you beat late blinds.</p>

    <h4>Pegging points</h4>
    <ul>
      <li>Count reaches <b>15</b> or <b>31</b>: +2 Mult</li>
      <li>Pairs / trips / quads as you lay them: +2 / +6 / +12</li>
      <li>Runs of 3+ in a row: +1 per card</li>
      <li><b>Go</b> / last card when nobody else can play: +1</li>
    </ul>

    <h4>Your deck</h4>
    <p>You own a personal deck (starts as a normal 52) and are dealt from it.
    It's permanent - tarots and packs change the actual cards in it. Tap
    <b>Deck</b> any time to view it.</p>

    <h4>Jokers</h4>
    <p>Passive cards bought in the shop. They sit beside your hand and boost your
    Points or Mult automatically - e.g. fifteens worth 3, doubled pegging, a +50%
    crib. Hold up to 5; drag to reorder (<i>Blueprint</i> copies the joker to its
    right).</p>

    <h4>Tarots</h4>
    <p>One-shot cards (hold up to 2), played <b>during the discard phase before
    you discard</b>. They permanently edit your deck - change a card's rank or
    suit, copy or destroy cards, add a copy, redraw your hand, or grab coins.</p>

    <h4>Booster packs &amp; the shop</h4>
    <p>After every deal you earn coins and the shop opens. Buy jokers, tarots, or
    <b>booster packs</b> - open a pack to pick 1 of 3 (jokers, tarots, or cards
    to add to your deck). Tap a shop card to flip it and read it, tap again to
    buy. Reroll for fresh stock.</p>

    <h4>Controls</h4>
    <p>Tap a card to lift it, tap again or <b>drag</b> it onto the crib/pile to
    play. Toggle <b>Tips</b> (top bar) for in-game hints.</p>
  </div>`);
}

$('howToBtn').onclick = () => showHowToPlay();

function addLog(text) {
  const log = $('log');
  const div = document.createElement('div');
  if (text.startsWith('---') || text.startsWith('===')) div.className = 'hl';
  div.textContent = text;
  log.appendChild(div);
  while (log.children.length > 60) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}

function addInfoButton(el, title, body) {
  const btn = document.createElement('button');
  btn.className = 'info-btn';
  btn.type = 'button';
  btn.textContent = 'i';
  btn.onclick = e => {
    e.stopPropagation();
    e.preventDefault();
    showInfo(title, body);
  };
  el.appendChild(btn);
  return btn;
}

function showItemInfo(kind, def, action) {
  const timing = kind === 'joker'
    ? 'Jokers are passive. They trigger automatically whenever their condition is met.'
    : 'Tarots are one-shot cards. Use them before you discard, then pick the required target card(s).';
  showInfo(def.name, `<p>${esc(def.desc)}</p><p>${timing}</p>`);
  if (action) {
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = `Use ${def.name}`;
    btn.onclick = () => {
      $('infoOverlay').classList.add('hidden');
      action();
    };
    $('infoBody').appendChild(btn);
  }
}

// ---- lobby ----

function myName() {
  return $('nameInput').value.trim();
}

$('nameInput').value = localStorage.getItem('crib_name') || '';
$('nameInput').addEventListener('input', () => localStorage.setItem('crib_name', myName()));

if (P2P_MODE) {
  $('wsPanel').classList.add('hidden');
  $('p2pPanel').classList.remove('hidden');
  $('codeInput').value = sessionStorage.getItem('crib_code') || '';
  $('hostBtn').onclick = () => {
    if (!myName()) return toast('Enter a name first.');
    hostTable();
  };
  $('joinCodeBtn').onclick = () => {
    if (!myName()) return toast('Enter a name first.');
    joinByCode($('codeInput').value);
  };
  $('refreshBtn').onclick = () => {
    pruneP2pRooms();
    renderP2pRooms();
  };
  renderP2pRooms();
  startP2pLobbyDiscovery();
} else {
  $('createBtn').onclick = () => {
    if (!myName()) return toast('Enter a name first.');
    sendMsg({ t: 'createRoom', roomName: $('roomNameInput').value.trim() || `${myName()}'s table`, playerName: myName() });
  };
  $('refreshBtn').onclick = () => sendMsg({ t: 'listRooms' });
}

$('soloBtn').onclick = async () => {
  if (!myName()) return toast('Enter a name first.');
  if (P2P_MODE) {
    const { HostSession, makeCode } = await import('./net/host.js');
    hostSession = new HostSession(makeCode(), myName(), msg => handle(msg), () => {}, { solo: true });
  } else {
    sendMsg({ t: 'createSolo', playerName: myName() });
  }
};

$('syncBtn').onclick = () => { sendMsg({ t: 'sync' }); toast('Refreshed.'); };

$('updateBtn').onclick = async () => {
  try {
    if ('caches' in window) {
      for (const k of await caches.keys()) await caches.delete(k);
    }
    if (navigator.serviceWorker) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const r of regs) await r.unregister();
    }
  } catch { /* best effort */ }
  location.reload();
};

function renderRoomList(rooms) {
  const el = $('roomList');
  el.innerHTML = '';
  if (!rooms.length) {
    el.innerHTML = '<div class="empty">No open tables — create one!</div>';
    return;
  }
  for (const r of rooms) {
    const div = document.createElement('div');
    div.className = 'room-item';
    div.innerHTML = `<div><b>${esc(r.name)}</b><div class="meta">${r.count}/6 players — ${esc(r.players.join(', '))}</div></div>`;
    const btn = document.createElement('button');
    btn.className = 'btn small primary';
    btn.textContent = 'Join';
    btn.onclick = () => {
      if (!myName()) return toast('Enter a name first.');
      if (P2P_MODE) joinByMqttCode(r.id);
      else sendMsg({ t: 'joinRoom', roomId: r.id, playerName: myName() });
    };
    div.appendChild(btn);
    el.appendChild(div);
  }
}

function startP2pLobbyDiscovery() {
  if (!P2P_MODE || p2pLobbyClients.length) return;
  if (!window.mqtt) {
    setTimeout(startP2pLobbyDiscovery, 500);
    return;
  }
  const onMessage = (topic, payload) => {
    if (topic !== P2P_LOBBY_TOPIC) return;
    let msg;
    try { msg = JSON.parse(payload.toString()); } catch { return; }
    if (msg.t !== 'lobbyUpdate' || !/^[A-Z0-9]{5}$/.test(String(msg.code || ''))) return;
    p2pRooms.set(msg.code, {
      id: msg.code,
      name: msg.name || `${msg.code} table`,
      count: Number(msg.count) || 1,
      players: Array.isArray(msg.players) ? msg.players : [],
      lastSeen: Date.now(),
    });
    renderP2pRooms();
  };
  p2pLobbyClients = P2P_LOBBY_BROKERS.map((url, idx) => {
    const client = window.mqtt.connect(url, {
      clientId: `orbcrib-list-${idx}-` + Math.random().toString(36).slice(2),
      clean: true,
      connectTimeout: 8000,
      reconnectPeriod: 3000,
    });
    client.on('connect', () => client.subscribe(P2P_LOBBY_TOPIC));
    client.on('message', onMessage);
    client.on('error', err => console.warn('Lobby discovery error:', url, err && err.message || err));
    return client;
  });
  setInterval(() => {
    if (pruneP2pRooms()) renderP2pRooms();
  }, 3000);
}

function pruneP2pRooms() {
  let changed = false;
  const now = Date.now();
  for (const [code, room] of p2pRooms) {
    if (now - room.lastSeen > P2P_LOBBY_TTL) {
      p2pRooms.delete(code);
      changed = true;
    }
  }
  return changed;
}

function renderP2pRooms() {
  renderRoomList([...p2pRooms.values()].sort((a, b) => b.lastSeen - a.lastSeen));
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}

// ---- waiting room ----

function renderWaiting(msg) {
  $('waitRoomName').textContent = msg.room.name;
  $('waitCode').innerHTML = msg.code
    ? `Share this code: <b class="code">${esc(msg.code)}</b><div style="font-size:12px;margin-top:10px;color:#ff7b6e;"><b>Mobile Users:</b> Keep this tab open! Mobile browsers pause background tabs which causes the game to disconnect.</div>`
    : '';
  const el = $('waitPlayers');
  el.innerHTML = '';
  for (const p of msg.players) {
    const div = document.createElement('div');
    div.className = 'wp' + (p.connected ? '' : ' off');
    div.textContent = `${p.name}${p.id === msg.hostId ? ' (host)' : ''}${p.connected ? '' : ' — disconnected'}`;
    el.appendChild(div);
  }
  const isHost = msg.youId === msg.hostId;
  const n = msg.players.filter(p => p.connected).length;
  $('startBtn').classList.toggle('hidden', !isHost);
  $('startBtn').disabled = n < 2;
  $('waitHint').textContent = n < 2
    ? 'Waiting for at least 2 players…'
    : `${n} players. Each round, beat the blind or you're out — last one standing wins.`;
}

$('startBtn').onclick = () => sendMsg({ t: 'startGame' });
$('leaveBtn').onclick = () => { if (P2P_MODE) leaveP2p(); else sendMsg({ t: 'leaveRoom' }); };

// ---- cards ----

function cardEl(card, opts = {}) {
  const div = document.createElement('div');
  div.className = 'card' + (card.suit < 2 ? ' red' : '') + (opts.small ? ' small' : '');
  div.innerHTML = `<span>${RANK_NAMES[card.rank]}</span><span class="suit">${SUIT_CHARS[card.suit]}</span>`;
  return div;
}

function backEl(small) {
  const div = document.createElement('div');
  div.className = 'card back' + (small ? ' small' : '');
  return div;
}

// ---- game rendering ----

function renderGame(st) {
  sweepStrayFx();
  $('dealInfo').textContent = `Round ${st.round} · Deal ${st.dealIndexInRound}/${st.dealsInRound}`;
  $('phaseInfo').textContent = phaseLabel(st);
  const turnP = st.players.find(p => p.seat === st.turnSeat);
  $('turnInfo').textContent =
    st.phase === 'pegging' && turnP ? (turnP.seat === st.mySeat ? '▶ Your turn' : `▶ ${turnP.name}'s turn`) : '';

  const myMove = !!st.you && st.you.active &&
    ((st.phase === 'pegging' && st.turnSeat === st.mySeat) || st.you.canDiscard);
  document.body.classList.toggle('my-turn', myMove);

  renderBlindBar(st);
  renderSeats(st);
  renderCenter(st);
  renderMyArea(st);
  renderOverlay(st);
  renderTutorial(st);
}

function phaseLabel(st) {
  switch (st.phase) {
    case 'discard': return `Discard ${st.discardCount} to the crib`;
    case 'pegging': return 'Pegging';
    case 'scoring': return 'Counting hands';
    case 'roundEnd': return 'Blind check';
    case 'shop': return 'Shop';
    case 'gameover': return 'Game over';
    default: return '';
  }
}

// ---- blind progress bar ----

function renderBlindBar(st) {
  const el = $('blindProgress');
  const fill = $('blindBarFill');
  const label = $('blindBarLabel');

  if (!st.you || !st.you.active) {
    el.classList.add('out-label');
    label.textContent = '☠ OUT — spectating';
    label.style.color = '#ff7b6e';
    fill.style.width = '0%';
    fill.className = '';
    return;
  }

  el.classList.remove('out-label');
  const pct = Math.min(100, Math.round(100 * st.you.roundScore / st.blind));
  fill.style.width = pct + '%';

  // Color classes based on progress
  fill.className = '';
  if (pct >= 100) fill.classList.add('done');
  else if (pct >= 75) fill.classList.add('high');
  else if (pct >= 45) fill.classList.add('mid');

  label.style.color = '';
  label.textContent = `${st.you.roundScore} / ${st.blind}  ·  Blind`;
}

function renderSeats(st) {
  const el = $('seats');
  el.innerHTML = '';
  const n = st.players.length;
  const opponents = st.players.filter(p => p.seat !== st.mySeat);
  opponents.sort((a, b) =>
    ((a.seat - st.mySeat + n) % n) - ((b.seat - st.mySeat + n) % n));
  opponents.forEach((p, i) => {
    const k = opponents.length;
    const ang = (180 + (i + 1) * 180 / (k + 1)) * Math.PI / 180;
    const x = 50 + 40 * Math.cos(ang);
    const y = 54 + 38 * Math.sin(ang); // ring lowered so top seats clear the tip banner
    const seat = document.createElement('div');
    seat.className = 'seat' + (p.seat === st.turnSeat ? ' turn' : '')
      + (p.connected ? '' : ' off') + (p.active ? '' : ' out');
    seat.dataset.seat = p.seat;
    seat.style.left = x + '%';
    seat.style.top = y + '%';

    const plaque = document.createElement('div');
    plaque.className = 'plaque';
    plaque.innerHTML =
      `<span class="nm">${esc(p.name)}${p.isBot ? ' 🤖' : ''}</span> ${p.isDealer && p.active ? '<span class="dealer-chip">D</span>' : ''}`;
    seat.appendChild(plaque);

    // the backs of their hand (and any cards they've played to the pile)
    const backs = document.createElement('div');
    backs.className = 'backs';
    for (let c = 0; c < p.handCount; c++) backs.appendChild(backEl(true));
    seat.appendChild(backs);

    if (p.played && p.played.length) {
      const played = document.createElement('div');
      played.className = 'played';
      for (const c of p.played) played.appendChild(cardEl(c, { small: true }));
      seat.appendChild(played);
    }
    el.appendChild(seat);
  });
}

function renderCenter(st) {
  const deck = $('deckPile');
  deck.innerHTML = '';
  deck.appendChild(backEl());
  deck.insertAdjacentHTML('beforeend', '<div class="lbl">Deck</div>');

  const starter = $('starterPile');
  starter.innerHTML = '';
  starter.appendChild(st.starter ? cardEl(st.starter) : backEl());
  starter.insertAdjacentHTML('beforeend', '<div class="lbl">Starter</div>');

  const crib = $('cribPile');
  crib.innerHTML = '';
  crib.appendChild(backEl());
  const dealer = st.players.find(p => p.isDealer);
  crib.insertAdjacentHTML('beforeend',
    `<div class="lbl">Crib ×${st.cribCount} (${esc(dealer ? dealer.name : '')})</div>`);

  const stack = $('pegStack');
  stack.innerHTML = '';
  for (const c of st.pegStack) stack.appendChild(cardEl(c));
  $('pegCount').textContent = st.phase === 'pegging' ? st.pegCount : '';
}

// joker/tarot rendered as a little card tile, Balatro-row style
function jtile(kind, def, opts = {}) {
  const d = document.createElement('div');
  const rarity = kind === 'joker' ? (def.rarity || 'common') : '';
  d.className = 'jtile ' + kind + (rarity ? ' r-' + rarity : '');
  const icon = (kind === 'joker' ? JOKER_ICONS : TAROT_ICONS)[def.id] || '';
  const rarityTag = rarity && rarity !== 'common' ? ` <i class="rar">(${rarity})</i>` : '';
  d.innerHTML = `<span class="jt-foil"></span><span class="jt-icon">${icon}</span>` +
    `<span class="jt-name">${esc(def.name)}</span>` +
    `<div class="tip">${esc(def.desc)}${rarityTag}${opts.tipExtra || ''}</div>`;
  return d;
}

function renderMyArea(st) {
  const you = st.you;
  const mult = you.dealMult || 1;
  renderHandScore(st);
  const myMult = $('myMult');
  myMult.innerHTML = `<span>Mult</span><b>x${mult}</b>`;
  myMult.classList.toggle('boosted', mult > 1);
  $('myCoins').textContent = `🪙 ${you.coins}`;
  const coinKey = `${st.dealNumber}:${st.phase}:${you.coins}`;
  if (prevState && prevState.you && you.coins > prevState.you.coins && coinKey !== lastCoinPopKey) {
    lastCoinPopKey = coinKey;
    showCoinGain(you.coins - prevState.you.coins);
  }
  $('deckBtn').textContent = `🂠 ${you.deck.length}`;

  renderJokerSlots(st);
  renderTarotSlots(st);
  renderHand(st);
  if (deckOpen) renderDeckOverlay(st);
}

function renderHandScore(st) {
  const you = st.you;
  let cards = [];
  if (st.phase === 'discard' && you.canDiscard) {
    cards = you.hand.filter(c => !selected.includes(c.id));
  } else if (you.kept && you.kept.length) {
    cards = you.kept;
  } else {
    cards = you.hand || [];
  }
  const jokerIds = (you.jokers || []).map(j => j.id);
  const mods = aggregateMods(jokerIds);
  const bd = scoreBreakdown(cards, st.starter || null, false, { shortcut: mods.shortcut });
  const score = buildScore(bd, mods, 'hand', cards, { starter: st.starter || null, coins: you.coins }).total;
  $('myScore').innerHTML = `<span>Hand</span><b>${score}</b>`;
}

function showCoinGain(amount) {
  const target = $('myCoins').getBoundingClientRect();
  const pop = document.createElement('div');
  pop.className = 'coin-pop';
  pop.textContent = `+${amount} 🪙`;
  pop.style.left = `${target.left + target.width / 2}px`;
  pop.style.top = `${target.top}px`;
  $('fx').appendChild(pop);
  setTimeout(() => pop.remove(), 1200);
  pulse($('myCoins'));
}

// ---- joker slots (5 fixed, pointer-drag to reorder) ----

let lastJokerSig = null;

function renderJokerSlots(st) {
  const you = st.you;
  $('jokerCount').textContent = `${you.jokers.length}/5`;

  const slots = [...$('jokerRow').querySelectorAll('.jslot')];
  const sig = you.jokers.map(j => j.id).join('|');

  // Rebuilding the tiles restarts their foil/glow CSS animations every render
  // (the 2.5s heartbeat, every tap, etc). When the joker set is unchanged,
  // leave the DOM in place and only rebind handlers so the shimmer keeps going.
  if (sig === lastJokerSig && slots.some(s => s.querySelector('.jtile'))) {
    slots.forEach((slot, i) => {
      const tile = slot.querySelector('.jtile');
      if (tile) attachJokerPointer(tile, i, st);
    });
    return;
  }
  lastJokerSig = sig;

  slots.forEach((slot, i) => {
    slot.innerHTML = '';
    slot.className = 'jslot';
    slot.dataset.slot = i;

    if (i < you.jokers.length) {
      slot.classList.add('filled');
      const tile = jtile('joker', you.jokers[i]);
      tile.dataset.jokerIdx = i;
      attachJokerPointer(tile, i, st);
      slot.appendChild(tile);
    } else {
      slot.classList.add('empty');
    }
  });
}

function attachJokerPointer(tile, idx, st) {
  tile.style.touchAction = 'none';
  tile.onpointerdown = e => {
    if (e.button && e.button !== 0) return;
    jokerDrag = {
      idx, tile, startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY, dragging: false, ghost: null,
    };
    try { tile.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  tile.onpointermove = e => {
    if (!jokerDrag || jokerDrag.tile !== tile) return;
    jokerDrag.x = e.clientX; jokerDrag.y = e.clientY;
    const dx = e.clientX - jokerDrag.startX;
    const dy = e.clientY - jokerDrag.startY;
    if (!jokerDrag.dragging && Math.hypot(dx, dy) > 7) {
      jokerDrag.dragging = true;
      const g = tile.cloneNode(true);
      g.classList.add('drag-ghost');
      g.style.width = `${tile.offsetWidth}px`;
      g.style.height = `${tile.offsetHeight}px`;
      document.body.appendChild(g);
      jokerDrag.ghost = g;
      tile.classList.add('dragging');
    }
    if (jokerDrag.dragging) {
      e.preventDefault();
      jokerDrag.ghost.style.left = `${jokerDrag.x}px`;
      jokerDrag.ghost.style.top = `${jokerDrag.y}px`;
      highlightJokerSlot(e.clientX, e.clientY);
    }
  };
  const finish = e => {
    if (!jokerDrag || jokerDrag.tile !== tile) return;
    const drag = jokerDrag;
    jokerDrag = null;
    try { tile.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    tile.classList.remove('dragging');
    if (drag.ghost) drag.ghost.remove();
    [...$('jokerRow').querySelectorAll('.jslot')].forEach(s => s.classList.remove('drag-over'));
    if (!drag.dragging) {
      openOwnedFocus('joker', st.you.jokers[idx], idx, st); // a tap just opens the big card
      flushDeferredRender();
      return;
    }
    const toIdx = jokerSlotAt(e.clientX, e.clientY);
    if (toIdx == null || toIdx === drag.idx) { flushDeferredRender(); return; }
    const jokers = st.you.jokers.slice();
    const [moved] = jokers.splice(drag.idx, 1);
    jokers.splice(Math.min(toIdx, jokers.length), 0, moved);
    st.you.jokers = jokers;
    renderJokerSlots(st);
    sendMsg({ t: 'reorderJokers', order: jokers.map(j => j.id) });
    deferredRender = false; // the reorder ack will re-render us
  };
  tile.onpointerup = finish;
  tile.onpointercancel = finish;
}

function highlightJokerSlot(x, y) {
  const slots = [...$('jokerRow').querySelectorAll('.jslot')];
  slots.forEach(s => s.classList.remove('drag-over'));
  const idx = jokerSlotAt(x, y);
  if (idx != null && slots[idx]) slots[idx].classList.add('drag-over');
}

function jokerSlotAt(x, y) {
  const slots = [...$('jokerRow').querySelectorAll('.jslot')];
  const M = 10;
  for (let i = 0; i < slots.length; i++) {
    const r = slots[i].getBoundingClientRect();
    if (x >= r.left - M && x <= r.right + M && y >= r.top - M && y <= r.bottom + M) return i;
  }
  return null;
}

// ---- tarot slots (2 fixed) ----

function renderTarotSlots(st) {
  const you = st.you;
  $('tarotCount').textContent = `${you.tarots.length}/2`;

  const slots = $('tarotRow').querySelectorAll('.tslot');
  slots.forEach((slot, i) => {
    slot.innerHTML = '';
    slot.className = 'tslot';
    slot.dataset.slot = i;

    if (i < you.tarots.length) {
      const t = you.tarots[i];
      slot.classList.add('filled');
      const tile = jtile('tarot', t, {
        tipExtra: you.canDiscard ? '<br><i>Click to use</i>' : '<br><i>Usable before you discard</i>',
      });
      tile.onclick = () => openOwnedFocus('tarot', t, i, st);
      slot.appendChild(tile);
    } else {
      slot.classList.add('empty');
    }
  });
}

function renderHand(st) {
  const you = st.you;
  const handEl = $('hand');
  handEl.innerHTML = '';
  const myTurn = st.phase === 'pegging' && st.turnSeat === st.mySeat;

  selected = selected.filter(id => you.hand.some(c => c.id === id));
  if (!you.hand.some(c => c.id === raisedCardId)) raisedCardId = null;
  setupCardDropTargets(st);

  const mid = (you.hand.length - 1) / 2;
  you.hand.forEach((c, idx) => {
    const el = cardEl(c);
    const preview = myTurn ? peggingPreview(c, st) : null;
    el.dataset.cardId = c.id;
    el.style.setProperty('--fan-rot', `${(idx - mid) * 5}deg`);
    el.style.setProperty('--fan-y', `${Math.abs(idx - mid) * 3}px`);
    el.style.zIndex = String(20 + idx);
    if (you.canDiscard) {
      el.classList.add('clickable');
      addPointerCardDrag(el, c.id);
      if (selected.includes(c.id)) el.classList.add('selected');
      el.onclick = () => {
        if (el.dataset.dragged === '1') {
          el.dataset.dragged = '';
          return;
        }
        const i = selected.indexOf(c.id);
        if (i >= 0) selected.splice(i, 1);
        else if (selected.length < st.discardCount) selected.push(c.id);
        renderGame(lastState);
      };
    } else if (myTurn) {
      const legal = st.pegCount + Math.min(c.rank, 10) <= 31;
      if (legal) {
        el.classList.add('clickable');
        addPointerCardDrag(el, c.id);
        if (raisedCardId === c.id) el.classList.add('raised');
        if (preview && preview.points > 0) {
          el.classList.add('scores');
          el.insertAdjacentHTML('beforeend', `<span class="scoretag">+${preview.points}</span>`);
        }
        el.onclick = () => {
          if (el.dataset.dragged === '1') {
            el.dataset.dragged = '';
            return;
          }
          if (raisedCardId === c.id) playHandCard(c.id);
          else {
            raisedCardId = c.id;
            renderGame(lastState);
          }
        };
      } else {
        el.classList.add('dim');
      }
    }
    handEl.appendChild(el);
  });

  const prompt = $('prompt');
  const btn = $('actionBtn');
  const cancel = $('cancelBtn');
  btn.classList.add('hidden');
  cancel.classList.add('hidden');
  prompt.textContent = '';

  if (!you.active) {
    prompt.textContent = "You're out — spectating the table.";
  } else if (you.canDiscard) {
    prompt.textContent = `Select ${st.discardCount} card(s) for ${dealerName(st)} crib`;
    btn.textContent = `Send ${st.discardCount} to Crib`;
    btn.disabled = selected.length !== st.discardCount;
    btn.classList.remove('hidden');
    btn.onclick = () => { sendMsg({ t: 'discard', cards: selected }); selected = []; };
  } else if (st.phase === 'discard') {
    prompt.textContent = 'Waiting for the others to discard…';
  } else if (st.phase === 'pegging') {
    if (myTurn) {
      const canAny = you.hand.some(c => st.pegCount + Math.min(c.rank, 10) <= 31);
      prompt.textContent = canAny ? 'Play a card' : 'No legal play — go!';
    } else {
      prompt.textContent = 'Waiting for your turn…';
    }
  }
}

function setupCardDropTargets(st) {
  const clear = el => {
    el.ondragover = null;
    el.ondragleave = null;
    el.ondrop = null;
    el.classList.remove('drop-ready');
  };
  const crib = $('cribPile');
  const peg = $('pegArea');
  const stack = $('pegStack');
  [crib, peg, stack].forEach(clear);

  if (st.you.canDiscard) {
    setupDropTarget(crib, cardId => dropHandCard(cardId));
  }
  if (st.phase === 'pegging' && st.turnSeat === st.mySeat) {
    setupDropTarget(peg, cardId => playHandCard(cardId));
    setupDropTarget(stack, cardId => playHandCard(cardId));
  }
}

function setupDropTarget(el, onDrop) {
  el.ondragover = e => {
    e.preventDefault();
    el.classList.add('drop-ready');
  };
  el.ondragleave = () => el.classList.remove('drop-ready');
  el.ondrop = e => {
    e.preventDefault();
    el.classList.remove('drop-ready');
    const cardId = e.dataTransfer.getData('text/plain');
    if (cardId) onDrop(cardId);
  };
}

function addPointerCardDrag(el, cardId) {
  el.onpointerdown = e => {
    if (e.button && e.button !== 0) return;
    pointerCardDrag = {
      cardId,
      el,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      dragging: false,
      ghost: null,
    };
    el.setPointerCapture(e.pointerId);
  };
  el.onpointermove = e => {
    if (!pointerCardDrag || pointerCardDrag.el !== el) return;
    pointerCardDrag.x = e.clientX;
    pointerCardDrag.y = e.clientY;
    const dx = e.clientX - pointerCardDrag.startX;
    const dy = e.clientY - pointerCardDrag.startY;
    if (!pointerCardDrag.dragging && Math.hypot(dx, dy) > 8) {
      pointerCardDrag.dragging = true;
      pointerCardDrag.ghost = el.cloneNode(true);
      pointerCardDrag.ghost.classList.add('drag-ghost');
      pointerCardDrag.ghost.style.width = `${el.offsetWidth}px`;
      pointerCardDrag.ghost.style.height = `${el.offsetHeight}px`;
      document.body.appendChild(pointerCardDrag.ghost);
      el.classList.add('drag-source');
    }
    if (pointerCardDrag.dragging) {
      e.preventDefault();
      movePointerGhost(pointerCardDrag);
      highlightPointerDropTarget(e.clientX, e.clientY);
    }
  };
  el.onpointerup = e => finishPointerCardDrag(e, el);
  el.onpointercancel = e => finishPointerCardDrag(e, el);
}

function movePointerGhost(drag) {
  drag.ghost.style.left = `${drag.x}px`;
  drag.ghost.style.top = `${drag.y}px`;
}

function highlightPointerDropTarget(x, y) {
  for (const el of [$('cribPile'), $('pegArea'), $('pegStack')]) el.classList.remove('drop-ready');
  const target = cardDropTargetAt(x, y);
  if (target) target.classList.add('drop-ready');
}

function finishPointerCardDrag(e, el) {
  if (!pointerCardDrag || pointerCardDrag.el !== el) return;
  const drag = pointerCardDrag;
  pointerCardDrag = null;
  try { el.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
  for (const drop of [$('cribPile'), $('pegArea'), $('pegStack')]) drop.classList.remove('drop-ready');
  if (drag.ghost) drag.ghost.remove();
  el.classList.remove('drag-source');
  if (!drag.dragging) { flushDeferredRender(); return; }
  el.dataset.dragged = '1';
  const target = cardDropTargetAt(e.clientX, e.clientY);
  if (!target) { flushDeferredRender(); return; }
  if (target.id === 'cribPile') dropHandCard(drag.cardId);
  else playHandCard(drag.cardId);
  flushDeferredRender();
}

function cardDropTargetAt(x, y) {
  // generous hit area so cards don't need to land precisely on the small pile
  const M = 90;
  const targets = [$('cribPile'), $('pegStack'), $('pegArea')];
  return targets.find(el => {
    if (!el.ondrop) return false;
    const r = el.getBoundingClientRect();
    return x >= r.left - M && x <= r.right + M && y >= r.top - M && y <= r.bottom + M;
  });
}

function dropHandCard(cardId) {
  const st = lastState;
  if (!st || !st.you.canDiscard) return;
  if (!selected.includes(cardId)) selected.push(cardId);
  selected = selected.slice(-st.discardCount);
  if (selected.length === st.discardCount) {
    sendMsg({ t: 'discard', cards: selected });
    selected = [];
  } else {
    renderGame(st);
  }
}

function playHandCard(cardId) {
  const st = lastState;
  const card = st && st.you.hand.find(c => c.id === cardId);
  if (!st || !card || st.phase !== 'pegging' || st.turnSeat !== st.mySeat) return;
  if (st.pegCount + cardValue(card.rank) > 31) return;
  const el = [...document.querySelectorAll('#hand .card')].find(card => card.dataset.cardId === cardId);
  pendingFly = { cardId, rect: el ? el.getBoundingClientRect() : null };
  raisedCardId = null;
  sendMsg({ t: 'playCard', card: cardId });
}

function peggingPreview(card, st) {
  const count = st.pegCount + cardValue(card.rank);
  if (count > 31) return { legal: false, points: 0, events: [] };
  const events = pegEvents(st.pegStack.concat([card]), count);
  return {
    legal: true,
    points: events.reduce((sum, e) => sum + e.pts, 0),
    events,
  };
}

function peggingEventText(ev) {
  if (ev.type === 'fifteen') return 'making 15';
  if (ev.type === 'thirtyone') return 'hitting 31';
  if (ev.type === 'pair') {
    if (ev.size === 2) return 'pairing the last card';
    if (ev.size === 3) return 'making trips';
    return 'making four of a kind';
  }
  if (ev.type === 'run') return `making a run of ${ev.size}`;
  return ev.type;
}

function scoringOpportunity(st) {
  if (st.phase !== 'pegging' || st.turnSeat !== st.mySeat || !st.you || !st.you.active) return null;
  const options = st.you.hand
    .map(card => ({ card, preview: peggingPreview(card, st) }))
    .filter(o => o.preview.legal && o.preview.points > 0)
    .sort((a, b) => b.preview.points - a.preview.points);
  if (!options.length) return null;
  const best = options[0];
  const why = best.preview.events.map(peggingEventText).join(' and ');
  const count = st.pegCount + cardValue(best.card.rank);
  return {
    key: `score-${best.card.id}-${st.pegCount}-${best.preview.points}`,
    text: `Scoring chance: play ${cardLabel(best.card)} to make the count ${count} and gain +${best.preview.points} Mult for ${why}.`
  };
}

function cardLabel(card) {
  return `${RANK_NAMES[card.rank]}${SUIT_CHARS[card.suit]}`;
}

function cardInfo(card, st, preview) {
  const value = cardValue(card.rank);
  const bits = [`<p>${cardLabel(card)} counts as ${value} while pegging.</p>`];
  if (st.phase === 'discard' && st.you.canDiscard) bits.push('<p>Discard phase: select it or drag it to the crib pile.</p>');
  if (st.phase === 'pegging') {
    if (preview && preview.legal) {
      const events = preview.events.map(e => e.type === 'thirtyone' ? '31' : e.type).join(', ');
      bits.push(`<p>Pegging now: playing it makes the count ${st.pegCount + value}${preview.points ? ` and scores ${preview.points} (${events})` : ' with no immediate points'}.</p>`);
    } else {
      bits.push('<p>Pegging now: this card would push the count over 31, so it cannot be played.</p>');
    }
  }
  return bits.join('');
}

function shopKindTitle(kind) {
  return kind === 'joker' ? 'About Jokers'
    : kind === 'tarot' ? 'About Tarots'
    : kind === 'pack' ? 'About Booster Packs'
    : 'About Playing Cards';
}

function shopKindHelp(kind) {
  if (kind === 'joker') return '<p><b>Jokers</b> are permanent, passive upgrades. Once bought they sit in your joker row and boost your scoring automatically every hand — they\'re never used up. Drag them to reorder (order matters for Blueprint).</p>';
  if (kind === 'tarot') return '<p><b>Tarots</b> are one-time cards. Buy one, then play it during the discard phase before you throw to the crib. Most permanently change cards in your own deck.</p>';
  if (kind === 'pack') return '<p><b>Booster packs</b> open instantly and let you choose one of three rewards — a joker, tarot, or playing card — then the rest vanish. You can also skip.</p>';
  return '<p>A <b>playing card</b> bought here is added permanently to your deck, changing what you can draw in future hands.</p>';
}

function shopCardFace(item) {
  const face = document.createElement('div');
  face.className = `shop-card-face ${item.kind}`;
  if (item.kind === 'card') {
    face.appendChild(cardEl(item));
    return face;
  }
  const icon = item.kind === 'joker' ? JOKER_ICONS[item.id]
    : item.kind === 'tarot' ? TAROT_ICONS[item.id]
    : PACK_ICONS[item.id];
  face.innerHTML = `<div class="shop-art">${icon || ''}</div>`;
  return face;
}

function dealerName(st) {
  const d = st.players.find(p => p.isDealer);
  return d ? (d.seat === st.mySeat ? 'your' : `${d.name}'s`) : '';
}

// ---- deck viewer ----

$('deckBtn').onclick = () => {
  deckOpen = !deckOpen;
  if (deckOpen && lastState) renderDeckOverlay(lastState);
  else $('deckOverlay').classList.add('hidden');
};
$('deckClose').onclick = () => { deckOpen = false; $('deckOverlay').classList.add('hidden'); };
$('deckOverlay').onclick = e => {
  if (e.target === $('deckOverlay')) { deckOpen = false; $('deckOverlay').classList.add('hidden'); }
};

function renderDeckOverlay(st) {
  $('deckOverlay').classList.remove('hidden');
  const body = $('deckBody');
  const deck = st.you.deck;
  $('deckTitle').textContent = `Your deck — ${deck.length} cards`;
  body.innerHTML = '';
  for (let s = 0; s < 4; s++) {
    const cards = deck.filter(c => c.suit === s);
    const row = document.createElement('div');
    row.className = 'deck-row';
    row.innerHTML = `<span class="deck-suit ${s < 2 ? 'red' : ''}">${SUIT_CHARS[s]}<b>${cards.length}</b></span>`;
    const wrap = document.createElement('div');
    wrap.className = 'deck-cards';
    for (const c of cards) wrap.appendChild(cardEl(c, { small: true }));
    row.appendChild(wrap);
    body.appendChild(row);
  }
}

function startTarot(idx, def) {
  tarotMode = { idx, def, targets: [] };
  renderGame(lastState);
}

function toggleTarotTarget(cardId) {
  const i = tarotMode.targets.indexOf(cardId);
  if (i >= 0) tarotMode.targets.splice(i, 1);
  else if (tarotMode.targets.length < tarotMode.def.targets) tarotMode.targets.push(cardId);
  renderGame(lastState);
}

// ---- overlays: scoring, blind check, shop, game over ----

let lastOverlayPhase = 'none';

function renderOverlay(st) {
  const ov = $('overlay');
  const oc = $('overlayContent');
  const key = st.phase + '-' + st.dealNumber;
  if (key !== revealKey) { revealShown = -1; revealKey = key; }

  const phase = ['scoring', 'roundEnd', 'shop', 'gameover'].includes(st.phase) ? st.phase : 'none';
  if (st.phase !== 'shop' && focusMode === 'market') closeFocus(); // dismiss shop-buy zoom when the phase moves on
  const build = () => {
    if (st.phase === 'scoring') renderScoring(oc, st);
    else if (st.phase === 'roundEnd') renderRoundEnd(oc, st);
    else if (st.phase === 'shop') renderShop(oc, st);
    else if (st.phase === 'gameover') renderGameover(oc, st);
  };

  if (phase === 'none') {
    if (lastOverlayPhase !== 'none') slideOutOverlay(); // glide the panel away left
    lastOverlayPhase = 'none';
    return;
  }

  ov.classList.remove('hidden');
  if (phase !== lastOverlayPhase) slideOverlayTransition(build, lastOverlayPhase !== 'none');
  else build();
  lastOverlayPhase = phase;
}

function renderGameover(oc, st) {
  if (st.solo) {
    const me = (st.standings || []).find(s => s.seat === st.mySeat) || { score: 0 };
    oc.innerHTML = `<h2>Run Over</h2>` +
      `<div class="run-summary">You reached <b>Round ${st.round}</b> against The House.<br>` +
      `Final score: <b>${me.score}</b> · Blinds beaten: <b>${st.you.blindsPassed}</b></div>`;
  } else {
    oc.innerHTML = '<h2>Final Standings</h2>';
    (st.standings || []).forEach((s, i) => {
      const tag = s.eliminatedRound === null ? '🏆 winner' : `out round ${s.eliminatedRound}`;
      oc.insertAdjacentHTML('beforeend',
        `<div class="standing${i === 0 ? ' winner' : ''}"><span>${i + 1}. ${esc(s.name)}</span>` +
        `<span class="standing-tag">${tag}</span><span>${s.score} pts</span></div>`);
    });
  }
  const btn = document.createElement('button');
  btn.className = 'btn primary';
  btn.textContent = 'Back to Lobby';
  btn.onclick = () => { if (P2P_MODE) leaveP2p(); else sendMsg({ t: 'backToLobby' }); };
  oc.appendChild(btn);
}

// Cross-slide: the outgoing screen flies left while the new one flies in
// from the right. Used for scoring → shop → next deal, etc.
function slideOverlayTransition(build, hadPrev) {
  const oc = $('overlayContent');
  if (hadPrev && oc.innerHTML.trim()) {
    const rect = oc.getBoundingClientRect();
    const ghost = oc.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.classList.add('overlay-ghost');
    ghost.style.cssText += `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;max-height:${rect.height}px;margin:0;`;
    $('overlay').appendChild(ghost);
    const a = ghost.animate(
      [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-60vw)', opacity: 0 }],
      { duration: 300 * ANIM, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
    const done = () => ghost.remove();
    a.onfinish = done; a.oncancel = done;
  }
  build();
  oc.animate(
    [{ transform: 'translateX(60vw)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
    { duration: 320 * ANIM, easing: 'cubic-bezier(.2,.8,.3,1)' });
}

function slideOutOverlay() {
  const oc = $('overlayContent');
  const ov = $('overlay');
  if (!oc.innerHTML.trim()) { ov.classList.add('hidden'); return; }
  const a = oc.animate(
    [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-60vw)', opacity: 0 }],
    { duration: 300 * ANIM, easing: 'cubic-bezier(.5,0,.3,1)' });
  const done = () => { ov.classList.add('hidden'); oc.style.transform = ''; };
  a.onfinish = done; a.oncancel = done;
}

function renderScoring(oc, st) {
  oc.innerHTML = `<h2>Counting — Deal ${st.dealIndexInRound}/${st.dealsInRound}</h2>` +
    `<div class="starter-row">Starter: </div>`;
  oc.lastChild.appendChild(cardEl(st.starter, { small: true }));

  const done = st.revealIndex >= st.scoringResults.length - 1;
  for (let i = 0; i <= st.revealIndex && i < st.scoringResults.length; i++) {
    const fresh = i > revealShown;
    oc.appendChild(scoreBlock(st.scoringResults[i], st, fresh));
  }
  revealShown = Math.max(revealShown, st.revealIndex);

  if (done) {
    oc.insertAdjacentHTML('beforeend',
      `<div style="margin:8px 0">You earned <b style="color:#ffd76e">🪙 ${st.you.coinGain}</b> this deal.</div>`);
    const last = st.dealIndexInRound >= st.dealsInRound;
    if (st.you.active) appendReadyBtn(oc, st, last ? 'Blind Check' : 'To the Shop');
  } else {
    oc.insertAdjacentHTML('beforeend', '<div class="counting-hint">Counting…</div>');
  }
  oc.scrollTop = oc.scrollHeight;
}

function scoreBlock(r, st, fresh) {
  const div = document.createElement('div');
  div.className = 'score-block' + (fresh ? ' reveal' : '');
  const title = r.kind === 'crib'
    ? `👑 ${esc(r.name)} — Crib`
    : esc(r.name) + (r.seat === st.mySeat ? ' (you)' : '');
  div.innerHTML = `<div class="sb-head"><span>${title}</span></div>`;

  // hand cards + the shared starter (shows how the hand is scored)
  const cards = document.createElement('div');
  cards.className = 'sb-cards';
  r.cards.forEach((c, i) => {
    const el = cardEl(c, { small: true });
    if (fresh) { el.classList.add('deal-in'); el.style.animationDelay = (i * 80) + 'ms'; }
    cards.appendChild(el);
  });
  if (r.starter) {
    cards.insertAdjacentHTML('beforeend', '<span class="sb-plus">+</span>');
    const sEl = cardEl(r.starter, { small: true });
    sEl.classList.add('sb-starter');
    sEl.title = 'Starter';
    if (fresh) { sEl.classList.add('deal-in'); sEl.style.animationDelay = (r.cards.length * 80) + 'ms'; }
    cards.appendChild(sEl);
  }
  div.appendChild(cards);

  // chip lines
  r.lines.forEach((line, i) => {
    const lineEl = document.createElement('div');
    const isJoker = typeof line.label === 'string' && line.label.indexOf('🃏') >= 0;
    lineEl.className = 'sb-line' + (fresh ? ' anim' : '') + (isJoker ? ' joker-line' : '');
    if (fresh) lineEl.style.animationDelay = (250 + i * 130) + 'ms';
    lineEl.innerHTML = `<span>${esc(line.label)}</span><span>${line.pts == null ? '' : '+' + line.pts}</span>`;
    div.appendChild(lineEl);
  });
  if (!r.lines.length) {
    div.insertAdjacentHTML('beforeend', '<div class="sb-line"><span>Nothing scored</span><span>+0</span></div>');
  }

  // Points × Mult = Total  (Balatro-style)
  const eqDelay = 300 + r.lines.length * 130;
  const eq = document.createElement('div');
  eq.className = 'sb-equation' + (fresh ? ' anim' : '');
  if (fresh) eq.style.animationDelay = eqDelay + 'ms';
  eq.innerHTML =
    `<span class="chips" title="Hand points">${r.points}</span>` +
    `<span class="eq-op">×</span>` +
    `<span class="mult" title="Pegging multiplier">${r.mult}</span>` +
    `<span class="eq-op">=</span>` +
    `<span class="eq-total">${r.total}</span>`;
  div.appendChild(eq);
  if (fresh) countUp(eq.querySelector('.eq-total'), r.total, eqDelay + 250);
  return div;
}

function countUp(el, total, duration, prefix = '') {
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = prefix + Math.round(t * total);
    if (t < 1 && el.isConnected) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderRoundEnd(oc, st) {
  const d = st.roundEndData;
  oc.innerHTML = `<h2>Blind Check — Round ${d.round}</h2>` +
    `<div class="blind-target">Blind: <b>${d.blind}</b></div>`;
  if (d.rescued) {
    oc.insertAdjacentHTML('beforeend',
      '<div class="rescued">Nobody beat the blind — top score survives!</div>');
  }
  for (const row of d.rows) {
    const pct = Math.min(100, Math.round(100 * row.roundScore / d.blind));
    const bonus = row.bonusCoins > 0 ? ` +${row.bonusCoins}🪙` : '';
    const place = row.passed && row.place ? `<span class="br-place">#${row.place}</span> ` : '';
    oc.insertAdjacentHTML('beforeend',
      `<div class="blind-row${row.passed ? '' : ' failed'}">` +
      `<span class="br-name">${esc(row.name)}${row.seat === st.mySeat ? ' (you)' : ''}</span>` +
      `<div class="br-bar"><div class="br-fill${row.passed ? ' pass' : ''}" style="width:${pct}%"></div></div>` +
      `<span class="br-score">${row.roundScore}/${d.blind}</span>` +
      `<span class="br-tag">${row.passed ? place + 'SAFE' + bonus : 'ELIMINATED'}</span></div>`);
  }
  const left = st.players.filter(p => p.active).length;
  if (st.solo) {
    oc.insertAdjacentHTML('beforeend',
      '<div class="hint" style="margin-top:10px">The House is exempt — your run lasts as long as you beat the blinds.</div>');
  } else {
    oc.insertAdjacentHTML('beforeend',
      `<div class="hint" style="margin-top:10px">${left <= 1 ? 'We have a winner!' : left + ' players remain.'}</div>`);
  }
  if (st.you.active) appendReadyBtn(oc, st, left <= 1 ? 'Final Standings' : 'Continue');
  else oc.insertAdjacentHTML('beforeend', '<div class="hint">Spectating…</div>');
}

function renderShop(oc, st) {
  const you = st.you;
  if (!you.active) {
    oc.innerHTML = '<h2>Shop</h2><div class="hint">The survivors are shopping… you\'re spectating.</div>';
    return;
  }
  if (you.pendingPack) return renderPackOpen(oc, st);

  oc.innerHTML = `<h2>Shop</h2><div class="row spread"><span class="shop-coins">🪙 ${you.coins}</span>` +
    `<span style="opacity:.7;font-size:13px">Jokers ${you.jokers.length}/5 · Tarots ${you.tarots.length}/2 · Deck ${you.deck.length}</span></div>`;
  const grid = document.createElement('div');
  grid.className = 'shop-grid shop-grid-market';
  (you.shopOffer || []).forEach((item, idx) => {
    const div = document.createElement('div');
    div.className = `shop-item shop-card ${item.kind}` + (item.sold ? ' sold' : '') +
      (item.kind === 'pack' ? ' shiny' : '') + (item.rarity ? ' r-' + item.rarity : '');
    div.appendChild(shopCardFace(item));
    div.insertAdjacentHTML('beforeend',
      `<div class="si-name">${esc(item.name)}</div>` +
      (item.rarity && item.rarity !== 'common' ? `<div class="rar-pill ${item.rarity}">${item.rarity}</div>` : '') +
      `<div class="shop-price">🪙${item.cost}</div>`);
    addInfoButton(div, shopKindTitle(item.kind), shopKindHelp(item.kind));
    div.onclick = () => {
      if (item.sold || you.ready) return;
      openShopFocus(item, idx, you); // tap a card → it enlarges to centre
    };
    grid.appendChild(div);
  });
  oc.appendChild(grid);

  // your collection — tap an owned card to inspect, sell, or use it
  if ((you.jokers && you.jokers.length) || (you.tarots && you.tarots.length)) {
    const sell = document.createElement('div');
    sell.className = 'shop-sell';
    sell.innerHTML = '<div class="sell-label">Your collection</div>';
    const sellRow = document.createElement('div');
    sellRow.className = 'sell-row';
    const addCell = (kind, def, idx) => {
      const cell = document.createElement('div');
      cell.className = 'sell-cell';
      cell.appendChild(jtile(kind, def));
      cell.onclick = () => openOwnedFocus(kind, def, idx, st);
      sellRow.appendChild(cell);
    };
    (you.jokers || []).forEach((j, idx) => addCell('joker', j, idx));
    (you.tarots || []).forEach((t, idx) => addCell('tarot', t, idx));
    sell.appendChild(sellRow);
    oc.appendChild(sell);
  }

  const row = document.createElement('div');
  row.className = 'row';
  const reroll = document.createElement('button');
  reroll.className = 'btn';
  reroll.textContent = 'Reroll 🪙2';
  reroll.disabled = you.coins < 2 || you.ready;
  reroll.onclick = () => sendMsg({ t: 'reroll' });
  row.appendChild(reroll);
  oc.appendChild(row);
  const nextRound = st.dealIndexInRound >= st.dealsInRound;
  appendReadyBtn(oc, st, nextRound ? `Round ${st.round + 1}` : 'Next Deal');
}

// Tapping a shop card enlarges it to the centre of the screen for a clear look,
// with its text auto-shrunk to fit. Tap the backdrop to go back; Buy to purchase.
function openShopFocus(item, idx, you) {
  closeFocus();
  focusMode = 'market';
  selectedShopIdx = idx;
  const wrap = document.createElement('div');
  wrap.id = 'shopFocus';
  wrap.onclick = e => { if (e.target === wrap) closeFocus(); };

  const card = focusCardShell(item);

  const canAfford = !item.sold && you.coins >= item.cost && !you.ready;
  const buy = document.createElement('button');
  buy.className = 'btn primary focus-buy';
  buy.textContent = item.sold ? 'Sold'
    : you.ready ? 'Locked in'
    : you.coins < item.cost ? `Need 🪙${item.cost}`
    : `Buy · 🪙${item.cost}`;
  buy.disabled = !canAfford;
  buy.onclick = e => { e.stopPropagation(); sendMsg({ t: 'buy', idx }); closeFocus(); };
  card.appendChild(buy);

  wrap.appendChild(card);
  document.body.appendChild(wrap);
  requestAnimationFrame(() => fitText(card.querySelector('.focus-desc')));
}

function focusCardShell(item) {
  const card = document.createElement('div');
  card.className = `focus-card ${item.kind}` + (item.rarity ? ' r-' + item.rarity : '');

  const art = document.createElement('div');
  art.className = 'focus-art ' + item.kind;
  if (item.kind === 'card') {
    art.appendChild(cardEl(item));
  } else {
    art.innerHTML = (item.kind === 'joker' ? JOKER_ICONS : item.kind === 'tarot' ? TAROT_ICONS : PACK_ICONS)[item.id] || '';
  }
  card.appendChild(art);

  card.insertAdjacentHTML('beforeend',
    `<div class="focus-name">${esc(item.name)}</div>` +
    (item.rarity && item.rarity !== 'common' ? `<div class="rar-pill ${item.rarity}">${item.rarity}</div>` : '') +
    `<div class="focus-desc">${esc(item.desc)}</div>`);

  if (item.rarity === 'rare' || item.rarity === 'ultra') {
    card.insertAdjacentHTML('beforeend', '<span class="jt-foil"></span>');
  }
  return card;
}

function openOwnedFocus(kind, def, idx, st, targetMode = false) {
  closeFocus();
  focusMode = targetMode ? 'tarotTargets' : 'owned';
  const item = { ...def, kind };
  const wrap = document.createElement('div');
  wrap.id = 'shopFocus';
  wrap.onclick = e => { if (e.target === wrap) closeFocus(); };

  const card = focusCardShell(item);
  if (targetMode) addTarotTargetPicker(card, def, idx, st);
  else addOwnedActions(card, kind, def, idx, st);

  wrap.appendChild(card);
  document.body.appendChild(wrap);
  requestAnimationFrame(() => fitText(card.querySelector('.focus-desc')));
}

function addOwnedActions(card, kind, def, idx, st) {
  const actions = document.createElement('div');
  actions.className = 'focus-actions';
  if (kind === 'tarot') {
    const use = document.createElement('button');
    use.className = 'btn primary focus-btn';
    const canUse = canUseTarotNow(def, st);
    use.textContent = tarotUseLabel(def, st);
    use.disabled = !canUse;
    use.onclick = e => {
      e.stopPropagation();
      if (!canUse) return;
      if (def.targets > 0) openOwnedFocus('tarot', def, idx, st, true);
      else { sendMsg({ t: 'useTarot', idx, targets: [] }); closeFocus(); }
    };
    actions.appendChild(use);
  }
  if (st.phase === 'shop' && st.you.active && !st.you.ready) {
    const refund = Math.max(1, Math.floor((def.cost || 2) / 2));
    const sell = document.createElement('button');
    sell.className = 'btn focus-btn';
    sell.textContent = `Sell · 🪙${refund}`;
    sell.onclick = e => {
      e.stopPropagation();
      sendMsg({ t: kind === 'joker' ? 'sellJoker' : 'sellTarot', idx });
      closeFocus();
    };
    actions.appendChild(sell);
  }
  if (actions.children.length) card.appendChild(actions);
  else card.insertAdjacentHTML('beforeend', `<div class="focus-note">${kind === 'joker' ? 'Passive joker: it triggers automatically.' : 'Use this tarot during discard before you throw to the crib.'}</div>`);
}

function tarotNeedsHand(def) {
  return def.targets > 0 || def.id === 'wheel';
}

function canUseTarotNow(def, st) {
  if (!st || !st.you || !st.you.active) return false;
  if (st.phase === 'discard' && st.you.canDiscard) return true;
  return st.phase === 'shop' && !st.you.ready && def.targets === 0 && !tarotNeedsHand(def);
}

function tarotUseLabel(def, st) {
  if (canUseTarotNow(def, st)) return def.targets > 0 ? 'Use: choose hand cards' : 'Use now';
  if (tarotNeedsHand(def)) return 'Use during discard';
  return 'Use in shop or discard';
}

function addTarotTargetPicker(card, def, idx, st) {
  const targets = [];
  card.classList.add('targeting');
  card.insertAdjacentHTML('beforeend', `<div class="focus-note">Choose ${def.targets} card${def.targets === 1 ? '' : 's'} from your hand.</div>`);
  const hand = document.createElement('div');
  hand.className = 'focus-hand';
  const use = document.createElement('button');
  use.className = 'btn primary focus-btn';
  use.textContent = `Use ${def.name}`;
  use.disabled = true;
  const sync = () => {
    hand.querySelectorAll('.card').forEach(el => {
      const pos = targets.indexOf(el.dataset.cardId);
      el.classList.toggle('selected', pos >= 0);
      const old = el.querySelector('.ordertag');
      if (old) old.remove();
      if (pos >= 0 && def.targets > 1) el.insertAdjacentHTML('beforeend', `<span class="ordertag">${pos + 1}</span>`);
    });
    use.disabled = targets.length !== def.targets;
  };
  st.you.hand.forEach(c => {
    const el = cardEl(c);
    el.classList.add('clickable');
    el.dataset.cardId = c.id;
    el.onclick = e => {
      e.stopPropagation();
      const pos = targets.indexOf(c.id);
      if (pos >= 0) targets.splice(pos, 1);
      else if (targets.length < def.targets) targets.push(c.id);
      sync();
    };
    hand.appendChild(el);
  });
  use.onclick = e => {
    e.stopPropagation();
    if (targets.length !== def.targets) return;
    sendMsg({ t: 'useTarot', idx, targets });
    closeFocus();
  };
  card.appendChild(hand);
  card.appendChild(use);
}

function closeFocus() {
  const f = document.getElementById('shopFocus');
  if (f) f.remove();
  selectedShopIdx = -1;
  focusMode = null;
}

function closeShopFocus() { closeFocus(); }

// shrink text until it stops overflowing its (capped) box
function fitText(el, maxPx = 17, minPx = 10) {
  if (!el) return;
  let size = maxPx;
  el.style.fontSize = size + 'px';
  let guard = 0;
  while ((el.scrollHeight > el.clientHeight + 1) && size > minPx && guard++ < 48) {
    size -= 0.5;
    el.style.fontSize = size + 'px';
  }
}

function renderPackOpen(oc, st) {
  const pack = st.you.pendingPack;
  // first time we see this pack? sync the pick entrance with the burst FX
  const firstReveal = !(prevState && prevState.you && prevState.you.pendingPack);
  oc.innerHTML = `<h2>✨ ${esc(pack.name)}</h2><div class="hint">Pick one:</div>`;
  const grid = document.createElement('div');
  grid.className = 'shop-grid pack-grid';
  pack.options.forEach((opt, idx) => {
    const div = document.createElement('div');
    const kindCls = opt.kind === 'card' ? 'standardcard' : opt.kind;
    div.className = `shop-item shiny pick ${kindCls}` + (opt.rarity ? ' r-' + opt.rarity : '') +
      (firstReveal ? ' pack-rise' : '');
    if (firstReveal) div.style.animationDelay = (900 + idx * 230) + 'ms';
    if (opt.kind === 'card') {
      div.innerHTML = `<div class="si-bigcard"></div><div class="si-name">${RANK_NAMES[opt.rank]}${SUIT_CHARS[opt.suit]} — add to your deck</div>`;
      div.querySelector('.si-bigcard').appendChild(cardEl(opt));
    } else {
      const icon = (opt.kind === 'joker' ? JOKER_ICONS : TAROT_ICONS)[opt.id] || '';
      div.innerHTML = `<div class="si-icon">${icon}</div><div class="si-name">${esc(opt.name)}</div>` +
        `<div class="si-desc">${esc(opt.desc)}</div>`;
    }
    addInfoButton(div, opt.name || cardLabel(opt), opt.kind === 'card'
      ? `<p>Adds this exact ${cardLabel(opt)} to your permanent deck.</p>`
      : `<p>${esc(opt.desc)}</p><p>${opt.kind === 'joker' ? 'Passive once taken.' : 'Consumable before discard once taken.'}</p>`);
    const full = (opt.kind === 'joker' && st.you.jokers.length >= 5) ||
      (opt.kind === 'tarot' && st.you.tarots.length >= 2);
    const btn = document.createElement('button');
    btn.className = 'btn small primary';
    btn.textContent = full ? (opt.kind === 'joker' ? 'Jokers full' : 'Tarots full') : 'Take';
    btn.disabled = full;
    const take = e => {
      if (e) e.stopPropagation();
      if (full) return;
      sendMsg({ t: 'pickPack', idx });
    };
    btn.onclick = take;
    div.onclick = take;
    if (full) div.classList.add('sold');
    div.appendChild(btn);
    grid.appendChild(div);
  });
  oc.appendChild(grid);
  const skip = document.createElement('button');
  skip.className = 'btn';
  skip.textContent = 'Skip pack';
  skip.onclick = () => sendMsg({ t: 'pickPack', idx: -1 });
  oc.appendChild(skip);
}

function appendReadyBtn(oc, st, label) {
  const div = document.createElement('div');
  div.className = 'ready-box';
  if (st.you.ready) {
    const waiting = st.players.filter(p => p.active && !p.ready && p.connected).map(p => p.name);
    div.innerHTML = `<span style="opacity:.7">Waiting for ${esc(waiting.join(', ') || '…')}</span>`;
  } else {
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = label;
    btn.onclick = () => sendMsg({ t: 'ready' });
    div.appendChild(btn);
  }
  div.appendChild(readyDots(st));
  oc.appendChild(div);
}

function readyDots(st) {
  const wrap = document.createElement('div');
  wrap.className = 'ready-dots';
  for (const p of st.players.filter(p => p.active)) {
    const dot = document.createElement('span');
    dot.className = 'ready-dot' + (p.ready ? ' on' : '') + (!p.connected ? ' off' : '');
    dot.title = `${p.name}: ${p.ready ? 'ready' : p.connected ? 'waiting' : 'offline'}`;
    wrap.appendChild(dot);
  }
  return wrap;
}

// ---- animations ----

function runAnimations(prev, st) {
  if (!prev || prev === st) return;

  const newDeal = prev.dealNumber !== st.dealNumber;
  if (newDeal && st.phase === 'discard') {
    const deckRect = $('deckPile').getBoundingClientRect();
    shuffleAnim(deckRect);
    const SHUFFLE_MS = 520 * ANIM;
    document.querySelectorAll('#hand .card').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--dx', (deckRect.left - r.left) + 'px');
      el.style.setProperty('--dy', (deckRect.top - r.top) + 'px');
      el.classList.add('deal-in');
      el.style.animationDelay = (SHUFFLE_MS + i * 120) + 'ms';
    });
    document.querySelectorAll('.seat .backs .card').forEach((el, i) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--dx', (deckRect.left - r.left) + 'px');
      el.style.setProperty('--dy', (deckRect.top - r.top) + 'px');
      el.classList.add('deal-in');
      el.style.animationDelay = (SHUFFLE_MS + i * 70) + 'ms';
    });
  }

  if (st.starter && !prev.starter) {
    const el = document.querySelector('#starterPile .card');
    if (el) el.classList.add('flip-in');
  }

  // discards glide (face down) from each player's hand to the crib pile
  if (prev.dealNumber === st.dealNumber && prev.players) {
    const cribCard = document.querySelector('#cribPile .card');
    for (const p of st.players) {
      const pp = prev.players.find(q => q.seat === p.seat);
      if (!pp || pp.discarded || !p.discarded || !p.active || !cribCard) continue;
      const fromEl = p.seat === st.mySeat
        ? $('hand')
        : document.querySelector(`.seat[data-seat="${p.seat}"] .backs`) ||
          document.querySelector(`.seat[data-seat="${p.seat}"]`);
      if (!fromEl) continue;
      const fromRect = fromEl.getBoundingClientRect();
      for (let i = 0; i < st.discardCount; i++) {
        setTimeout(() => {
          const tgt = document.querySelector('#cribPile .card');
          if (tgt) flyClone(backEl(), fromRect, tgt.getBoundingClientRect(), 460, { rot: p.seat === st.mySeat ? -8 : 8 });
        }, i * 110);
      }
    }
  }

  if (st.phase === 'pegging' && prev.dealNumber === st.dealNumber &&
      Array.isArray(prev.pegStack) && st.pegStack.length > prev.pegStack.length) {
    const played = st.pegStack[st.pegStack.length - 1];
    const stackCards = document.querySelectorAll('#pegStack .card');
    const target = stackCards[stackCards.length - 1];
    let fromRect = null;
    if (pendingFly && pendingFly.cardId === played.id) {
      fromRect = pendingFly.rect;
    } else {
      const seatEl = document.querySelector(`.seat[data-seat="${played.seat}"] .backs`) ||
        document.querySelector(`.seat[data-seat="${played.seat}"]`);
      if (seatEl) fromRect = seatEl.getBoundingClientRect();
    }
    pendingFly = null;
    if (fromRect && target) flyCard(played, fromRect, target);
    pulse($('pegCount'));

    // how much pegging Mult this play earned (raw event points), shown rising
    // off the count; if it was MY play, orbs stream into the Mult box.
    const gained = pegEvents(st.pegStack, st.pegCount).reduce((s, e) => s + e.pts, 0);
    if (gained > 0) {
      const pc = $('pegCount').getBoundingClientRect();
      floatRise(pc.left + pc.width / 2, pc.top - 6, `+${gained} Mult`, 'fx-mult');
      if (played.seat === st.mySeat && prev.you && st.you && st.you.dealMult > prev.you.dealMult) {
        const b = $('myMult').querySelector('b');
        if (b) b.textContent = 'x' + prev.you.dealMult; // hold old until orbs land
        const mb = $('myMult').getBoundingClientRect();
        flingOrbs(pc.left + pc.width / 2, pc.top + pc.height / 2,
          mb.left + mb.width / 2, mb.top + mb.height / 2,
          Math.min(9, 3 + gained), () => bumpMult(st.you.dealMult));
        if (st.you.jokers && st.you.jokers.length) flashEl($('jokerRow'));
      }
    }
  }

  // booster pack just opened — burst it before the picks rise in
  if (st.phase === 'shop' && st.you && st.you.pendingPack &&
      !(prev.you && prev.you.pendingPack)) {
    playPackOpen(st.you.pendingPack);
  }

  // a tarot was consumed — sparkle the tarot row and shimmer the edited hand
  if (prev.you && st.you && st.you.tarots && prev.you.tarots &&
      st.you.tarots.length < prev.you.tarots.length && st.phase === 'discard') {
    const row = $('tarotRow').getBoundingClientRect();
    burstSparkles(row.left + row.width / 2, row.top + row.height / 2, 18, 275);
    flashEl($('tarotRow'));
    document.querySelectorAll('#hand .card').forEach(c => {
      c.classList.remove('tarot-flash'); void c.offsetWidth; c.classList.add('tarot-flash');
    });
  }

  // a finished 31/go count sweeps off the table
  if (prev.dealNumber === st.dealNumber && Array.isArray(prev.pegStack) &&
      prev.pegStack.length > 1 && st.pegStack.length === 0 &&
      (st.phase === 'pegging' || st.phase === 'scoring')) {
    const area = $('pegStack').getBoundingClientRect();
    prev.pegStack.forEach((c, i) => {
      const clone = cardEl(c);
      clone.classList.add('sweep');
      clone.style.left = (area.left + i * 28) + 'px';
      clone.style.top = area.top + 'px';
      clone.style.animationDelay = (i * 70) + 'ms';
      $('fx').appendChild(clone);
      setTimeout(() => clone.remove(), 1200 + i * 70);
    });
  }

  for (const p of st.players) {
    const pp = prev.players && prev.players.find(q => q.seat === p.seat);
    if (pp && p.score > pp.score) {
      floatAtSeat(st, p.seat, `+${p.score - pp.score}`, 'fx-pts');
    }
  }
  if (prev.you && st.you && st.you.coins > prev.you.coins && st.phase !== 'shop') {
    floatAtSeat(st, st.mySeat, `+🪙${st.you.coins - prev.you.coins}`, 'fx-coin');
  }
}

function shuffleAnim(deckRect) {
  for (let i = 0; i < 6; i++) {
    const clone = backEl();
    clone.classList.add('shuffling', i % 2 ? 'shuf-r' : 'shuf-l');
    clone.style.left = deckRect.left + 'px';
    clone.style.top = deckRect.top + 'px';
    clone.style.animationDelay = (i * 70) + 'ms';
    $('fx').appendChild(clone);
    setTimeout(() => clone.remove(), 1100 + i * 70);
  }
}

// Smooth arced flight via the Web Animations API. WAAPI runs off the main
// thread and always fires onfinish, so cards glide the whole way instead of
// teleporting when a rAF/transition gets pre-empted.
function flyClone(el, fromRect, toRect, ms = 440, opts = {}) {
  el.classList.add('flying');
  el.style.left = fromRect.left + 'px';
  el.style.top = fromRect.top + 'px';
  $('fx').appendChild(el);
  const dx = toRect.left - fromRect.left;
  const dy = toRect.top - fromRect.top;
  const dist = Math.hypot(dx, dy);
  const arc = opts.arc != null ? opts.arc : -Math.min(150, dist * 0.3);
  const rot = opts.rot || 0;
  const anim = el.animate([
    { transform: 'translate(0px,0px) rotate(0deg) scale(1)' },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 + arc}px) rotate(${rot * 0.6}deg) scale(1.07)`, offset: 0.55 },
    { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(1)` },
  ], { duration: ms * ANIM, easing: 'cubic-bezier(.3,.85,.25,1)', fill: 'forwards' });
  const done = () => { el.remove(); if (opts.onfinish) opts.onfinish(); };
  anim.onfinish = done;
  anim.oncancel = done;
  return anim;
}

function flyCard(card, fromRect, target, opts = {}) {
  const toRect = target.getBoundingClientRect();
  target.style.visibility = 'hidden';
  flyClone(cardEl(card), fromRect, toRect, opts.ms || 440, {
    rot: opts.rot || 0,
    onfinish: () => { target.style.visibility = ''; if (opts.onfinish) opts.onfinish(); },
  });
}

// ---- particle / burst helpers ----

function floatRise(x, y, text, cls) {
  const div = document.createElement('div');
  div.className = 'fx-float ' + (cls || '');
  div.textContent = text;
  div.style.left = x + 'px';
  div.style.top = y + 'px';
  $('fx').appendChild(div);
  div.addEventListener('animationend', () => div.remove());
}

function flingOrbs(fromX, fromY, toX, toY, count, onArrive) {
  let landed = 0;
  const finishOne = () => { if (++landed >= count && onArrive) onArrive(); };
  for (let i = 0; i < count; i++) {
    const orb = document.createElement('div');
    orb.className = 'fx-orb';
    orb.style.left = fromX + 'px';
    orb.style.top = fromY + 'px';
    $('fx').appendChild(orb);
    const jx = (Math.random() - 0.5) * 70;
    const jy = (Math.random() - 0.5) * 50 - 24;
    const anim = orb.animate([
      { transform: 'translate(-50%,-50%) scale(0.5)', opacity: 0.25 },
      { transform: `translate(calc(-50% + ${jx}px), calc(-50% + ${jy}px)) scale(1.15)`, opacity: 1, offset: 0.3 },
      { transform: `translate(calc(-50% + ${toX - fromX}px), calc(-50% + ${toY - fromY}px)) scale(0.35)`, opacity: 0.85 },
    ], { duration: (520 + Math.random() * 240) * ANIM, delay: i * 80, easing: 'cubic-bezier(.45,.05,.55,1)', fill: 'forwards' });
    const done = () => { orb.remove(); finishOne(); };
    anim.onfinish = done;
    anim.oncancel = done;
  }
}

function burstSparkles(cx, cy, count, hue) {
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'fx-spark';
    s.style.left = cx + 'px';
    s.style.top = cy + 'px';
    if (hue != null) s.style.background = `hsl(${hue + (Math.random() - 0.5) * 50}, 95%, 66%)`;
    $('fx').appendChild(s);
    const ang = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 150;
    const anim = s.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(0.2)`, opacity: 0 },
    ], { duration: (600 + Math.random() * 520) * ANIM, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
    const done = () => s.remove();
    anim.onfinish = done;
    anim.oncancel = done;
  }
}

function flashEl(el) {
  if (!el) return;
  el.classList.remove('fx-flash');
  void el.offsetWidth;
  el.classList.add('fx-flash');
  el.addEventListener('animationend', () => el.classList.remove('fx-flash'), { once: true });
}

function bumpMult(toValue) {
  const m = $('myMult');
  const b = m.querySelector('b');
  if (b && toValue != null) b.textContent = 'x' + toValue;
  m.classList.remove('bump');
  void m.offsetWidth;
  m.classList.add('bump');
  setTimeout(() => m.classList.remove('bump'), 540);
}

function playPackOpen(pack) {
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2 - 30;
  const packEl = document.createElement('div');
  packEl.className = 'fx-pack';
  packEl.innerHTML = PACK_ICONS[pack.type] || '';
  packEl.style.left = cx + 'px';
  packEl.style.top = cy + 'px';
  $('fx').appendChild(packEl);
  const anim = packEl.animate([
    { transform: 'translate(-50%,-50%) scale(0.6) rotate(0deg)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(1.15) rotate(-5deg)', opacity: 1, offset: 0.22 },
    { transform: 'translate(-50%,-50%) scale(1.08) rotate(5deg)', offset: 0.4 },
    { transform: 'translate(-50%,-50%) scale(1.16) rotate(-3deg)', offset: 0.55 },
    { transform: `translate(-50%, ${window.innerHeight * 0.75}px) scale(0.7) rotate(22deg)`, opacity: 0 },
  ], { duration: 1150 * ANIM, easing: 'cubic-bezier(.4,0,.55,1)', fill: 'forwards' });
  const done = () => packEl.remove();
  anim.onfinish = done;
  anim.oncancel = done;
  const hue = pack.type === 'arcana' ? 275 : pack.type === 'buffoon' ? 45 : 200;
  setTimeout(() => burstSparkles(cx, cy, 26, hue), 470 * ANIM);
  setTimeout(() => burstSparkles(cx, cy, 16, hue), 650 * ANIM);
}

function floatAtSeat(st, seat, text, cls) {
  let rect;
  if (seat === st.mySeat) {
    rect = $('myScore').getBoundingClientRect();
  } else {
    const el = document.querySelector(`.seat[data-seat="${seat}"] .plaque`);
    if (!el) return;
    rect = el.getBoundingClientRect();
  }
  const div = document.createElement('div');
  div.className = 'fx-float ' + cls;
  div.textContent = text;
  div.style.left = (rect.left + rect.width / 2) + 'px';
  div.style.top = rect.top + 'px';
  $('fx').appendChild(div);
  div.addEventListener('animationend', () => div.remove());
}

function pulse(el) {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

// ---- tutorial mode ----

$('tutCheck').checked = tutorialOn;
$('tutCheck').onchange = () => {
  tutorialOn = $('tutCheck').checked;
  localStorage.setItem('crib_tutorial', tutorialOn ? '1' : '0');
  lastTutKey = '';
  if (!tutorialOn) $('tutorialBar').classList.add('hidden');
  else if (lastState) renderTutorial(lastState);
};
$('tutClose').onclick = () => $('tutorialBar').classList.add('hidden');

function tutorialMessage(st) {
  if (!st.you) return null;
  if (st.phase === 'scoring') {
    return { key: 'scoring', text: "Scoring reveal - each hand is counted in order, then the dealer's crib scores last. Your deal total is hand Points times your red Mult, and any coins you earn will pop in before the shop." };
  }
  if (st.phase === 'roundEnd') {
    return { key: 'round', text: st.solo
      ? 'Blind check - your round score is compared to the target blind. Beat it to keep the run alive; The House can score points, but it cannot knock you out.'
      : 'Blind check - everyone compares their round score to the target blind. Players who cleared it survive and earn bonus coins; anyone short is eliminated.' };
  }
  if (st.phase === 'shop') {
    return { key: 'shop', text: 'Shop - spend coins before the next deal. Tap a card once to enlarge it and read the effect, tap it again to buy; jokers stay passive, tarots are single-use, and packs let you choose one reward.' };
  }
  if (!st.you.active && st.phase !== 'gameover') {
    return { key: 'spectate', text: "You've busted out — sit back and watch the rest of the table." };
  }
  switch (st.phase) {
    case 'discard':
      return st.you.canDiscard
        ? { key: 'discard', text: `Discard phase — send ${st.discardCount} card${st.discardCount > 1 ? 's' : ''} to ${dealerName(st)} crib. Tap a card to pick it (or drag it onto the crib pile), then press the button. Holding a tarot? Play it first.` }
        : { key: 'discardWait', text: 'Everyone secretly throws to the crib. Waiting for the other players…' };
    case 'pegging':
      {
        const chance = scoringOpportunity(st);
        if (chance) return chance;
      }
      return st.turnSeat === st.mySeat
        ? { key: 'pegMine', text: 'Your turn to peg! Every pegging point (15s, 31s, pairs, runs, go) adds to your red MULT for this deal. Keep the count at 31 or under. Tap a card to lift it, tap again or drag it to the pile.' }
        : { key: 'pegWait', text: 'Pegging — players take turns laying cards. Pegging points build your red MULT, applied to your hand at the show.' };
    case 'scoring':
      return { key: 'scoring', text: 'The show — your hand Points × your pegging Mult = the deal total. Hands count left of the dealer first, dealer next, crib last (crib uses the dealer\'s Mult).' };
    case 'roundEnd':
      return { key: 'round', text: st.solo
        ? 'Blind check — beat the blind score or your run ends. The House can never knock you out.'
        : "Blind check — beat this round's blind score or you're eliminated to the rail." };
    case 'shop':
      return { key: 'shop', text: 'Shop — jokers boost your hand Points or pegging Mult. Tap a card to flip it and read what it does, tap again to buy. The “i” button explains each type. Reroll for fresh stock.' };
    case 'gameover':
      return { key: 'over', text: 'The run is over — start another from the lobby!' };
  }
  return null;
}

function renderTutorial(st) {
  const bar = $('tutorialBar');
  if (!tutorialOn) { bar.classList.add('hidden'); return; }
  const msg = tutorialMessage(st);
  if (!msg) { bar.classList.add('hidden'); return; }
  if (msg.key === lastTutKey) return; // already showing this step
  lastTutKey = msg.key;
  $('tutorialText').textContent = msg.text;
  bar.classList.remove('hidden');
  bar.classList.remove('flash'); void bar.offsetWidth; bar.classList.add('flash');
}

// ---- boot ----

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline shell is optional */ });
}

if (!P2P_MODE) connectWs();
