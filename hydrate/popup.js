const CIRCUMFERENCE = 2 * Math.PI * 52; // r=52 matches SVG

const els = {
  cupsToday: document.getElementById('cupsToday'),
  targetCups: document.getElementById('targetCups'),
  ml: document.getElementById('ml'),
  ring: document.querySelector('.ring-fg'),
  schedule: document.getElementById('schedule'),
  drinkBtn: document.getElementById('drinkBtn'),
  undoBtn: document.getElementById('undoBtn'),
  resetBtn: document.getElementById('resetBtn'),
  openOptions: document.getElementById('openOptions'),
  confetti: document.getElementById('confetti')
};

function setProgress(current, target) {
  const ratio = Math.max(0, Math.min(1, target ? current / target : 0));
  const offset = CIRCUMFERENCE * (1 - ratio);
  els.ring.style.strokeDasharray = String(CIRCUMFERENCE);
  els.ring.style.strokeDashoffset = String(offset);
}

function renderState(s) {
  els.cupsToday.textContent = s.cupsToday;
  els.targetCups.textContent = s.targetCups;
  els.ml.textContent = s.cupsToday * s.cupSizeMl;
  setProgress(s.cupsToday, s.targetCups);
  els.schedule.textContent = s.notificationsEnabled
    ? `Reminding every ${s.intervalMin} min · ${fmtHour(s.startHour)}–${fmtHour(s.endHour)}`
    : `Notifications off`;
}

function fmtHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:00 ${ampm}`;
}

function confettiBurst() {
  const colors = [ '#60a5fa', '#a78bfa', '#34d399', '#f472b6', '#f59e0b' ];
  for (let i = 0; i < 30; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.transform = `translateY(0) rotate(${Math.random()*180}deg)`;
    piece.style.animationDelay = (Math.random() * 0.6) + 's';
    els.confetti.appendChild(piece);
    setTimeout(() => piece.remove(), 1800);
  }
}

async function fetchState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, resolve);
  });
}

async function drinkOne() {
  await new Promise((res) => chrome.runtime.sendMessage({ type: 'DRINK_ONE' }, res));
  const s = await fetchState();
  renderState(s);
  if (s.cupsToday >= s.targetCups) confettiBurst();
}

async function undoOne() {
  await new Promise((res) => chrome.runtime.sendMessage({ type: 'UNDO_ONE' }, res));
  renderState(await fetchState());
}

async function resetToday() {
  await new Promise((res) => chrome.runtime.sendMessage({ type: 'RESET_TODAY' }, res));
  renderState(await fetchState());
}

els.drinkBtn.addEventListener('click', drinkOne);
els.undoBtn.addEventListener('click', undoOne);
els.resetBtn.addEventListener('click', resetToday);
els.openOptions.addEventListener('click', () => chrome.runtime.openOptionsPage());

// Inline gradient for the ring stroke
(function injectDefs(){
  const svg = document.querySelector('.ring-svg');
  const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
  const lg = document.createElementNS('http://www.w3.org/2000/svg','linearGradient');
  lg.setAttribute('id','strokeGrad');
  lg.setAttribute('x1','0%'); lg.setAttribute('y1','0%');
  lg.setAttribute('x2','100%'); lg.setAttribute('y2','0%');
  const stop1 = document.createElementNS('http://www.w3.org/2000/svg','stop');
  stop1.setAttribute('offset','0%'); stop1.setAttribute('stop-color','#60a5fa');
  const stop2 = document.createElementNS('http://www.w3.org/2000/svg','stop');
  stop2.setAttribute('offset','100%'); stop2.setAttribute('stop-color','#a78bfa');
  lg.append(stop1, stop2);
  defs.append(lg);
  svg.prepend(defs);
})();

// Initial render
fetchState().then(renderState);
