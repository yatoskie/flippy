FlippyAuth.requireAuth();

const user = FlippyStore.getUser();
document.getElementById('greeting').textContent = `Welcome back, ${user?.username || 'friend'}`;

let decks = FlippyStore.getDecks();
let allCards = FlippyStore.getCards();
let activeDeckId = decks[0]?.id || null;
let queue = [];
let queueIndex = 0;

function cardsForDeck(deckId) {
  return allCards.filter(c => c.deckId === deckId);
}

function renderDeckPicker() {
  const el = document.getElementById('deck-picker');
  if (!decks.length) {
    el.innerHTML = `<p>You don't have any decks yet. <a href="cards.html" style="color:var(--accent);font-weight:600;">Create one in My Cards →</a></p>`;
    return;
  }
  el.innerHTML = `<select id="deck-select" style="padding:10px 14px;border-radius:8px;border:1px solid var(--border);background:var(--surface);color:var(--ink);">
    ${decks.map(d => `<option value="${d.id}">${d.title} (${cardsForDeck(d.id).length} cards)</option>`).join('')}
  </select>`;
  document.getElementById('deck-select').addEventListener('change', (e) => {
    activeDeckId = e.target.value;
    startSession();
  });
}

function startSession() {
  const slot = document.getElementById('flipcard-slot');
  const progress = document.getElementById('study-progress');
  const controls = document.getElementById('study-controls');
  slot.innerHTML = '';
  queue = cardsForDeck(activeDeckId);
  queueIndex = 0;

  if (!queue.length) {
    slot.innerHTML = `<div class="empty-state">This deck has no cards yet.<br><a href="cards.html" style="color:var(--accent);font-weight:600;">Add some →</a></div>`;
    progress.textContent = '';
    controls.style.display = 'none';
    return;
  }
  controls.style.display = 'flex';
  renderCurrentCard();
}

function renderCurrentCard() {
  const slot = document.getElementById('flipcard-slot');
  const progress = document.getElementById('study-progress');
  slot.innerHTML = '';
  if (queueIndex >= queue.length) {
    slot.innerHTML = `<div class="empty-state">Deck complete for this session. Nice work.<br><button class="btn btn-primary btn-sm" style="margin-top:10px;" id="restart-btn">Study again</button></div>`;
    progress.textContent = `${queue.length}/${queue.length} reviewed`;
    document.getElementById('restart-btn').addEventListener('click', () => { queueIndex = 0; renderCurrentCard(); });
    return;
  }
  const card = queue[queueIndex];
  progress.textContent = `Card ${queueIndex + 1} of ${queue.length}`;
  createFlipcard({
    front: escapeHtml(card.front),
    back: escapeHtml(card.back),
    container: slot,
    onSwipeLeft: () => markCard(card, false),
    onSwipeRight: () => markCard(card, true)
  });
}

function markCard(card, correct) {
  card.timesCorrect = card.timesCorrect || 0;
  card.timesWrong = card.timesWrong || 0;
  if (correct) card.timesCorrect++; else card.timesWrong++;
  card.lastReviewed = new Date().toISOString();
  FlippyStore.setCards(allCards);
  FlippyStore.logStudyToday();
  FlippyApi.trySync(() => FlippyApi.cards.recordReview(card.id, correct));
  FlippyApi.trySync(() => FlippyApi.goals.logStudyToday());
  bumpGoalsProgress();
  queueIndex++;
  renderCurrentCard();
  renderCalendar();
}

document.getElementById('btn-wrong').addEventListener('click', () => queue[queueIndex] && markCard(queue[queueIndex], false));
document.getElementById('btn-right').addEventListener('click', () => queue[queueIndex] && markCard(queue[queueIndex], true));
bindStudyKeyboard({
  onLeft: () => queue[queueIndex] && markCard(queue[queueIndex], false),
  onRight: () => queue[queueIndex] && markCard(queue[queueIndex], true),
  onFlip: () => document.querySelector('.flipcard')?.classList.toggle('flipped')
});

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* --------------------------------- Calendar --------------------------------- */
function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const log = FlippyStore.getStudyLog();
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const first = new Date(year, month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = now.toISOString().slice(0, 10);

  let html = ['S','M','T','W','T','F','S'].map(d => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < startOffset; i++) html += `<div class="day empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const studied = log.includes(dateStr);
    const isToday = dateStr === todayStr;
    html += `<div class="day ${studied ? 'studied' : ''} ${isToday ? 'today' : ''}">${day}</div>`;
  }
  grid.innerHTML = html;
}

/* ----------------------------------- Goals ------------------------------------ */
function currentWeekStart() {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function renderGoals() {
  const list = document.getElementById('goals-list');
  const goals = FlippyStore.getGoals().filter(g => g.weekStart === currentWeekStart());
  if (!goals.length) {
    list.innerHTML = `<li style="border:none;color:var(--ink-soft);font-size:.85rem;">No goals set for this week yet.</li>`;
    return;
  }
  list.innerHTML = goals.map(g => `
    <li>
      <span class="goal-check ${g.completed ? 'done' : ''}">${g.completed ? '✓' : ''}</span>
      <span class="goal-text ${g.completed ? 'done-text' : ''}">
        ${escapeHtml(g.label)}
        <span class="progress">${g.progress}/${g.target}</span>
      </span>
    </li>`).join('');
}

function bumpGoalsProgress() {
  const goals = FlippyStore.getGoals();
  const week = currentWeekStart();
  let changed = false;
  goals.forEach(g => {
    if (g.weekStart === week && !g.completed) {
      g.progress++;
      if (g.progress >= g.target) g.completed = true;
      changed = true;
    }
  });
  if (changed) { FlippyStore.setGoals(goals); renderGoals(); }
}

document.getElementById('add-goal-btn').addEventListener('click', () => {
  document.getElementById('goal-modal').classList.add('open');
});
document.querySelectorAll('[data-close-goal]').forEach(b => b.addEventListener('click', () => {
  document.getElementById('goal-modal').classList.remove('open');
}));
document.getElementById('save-goal-btn').addEventListener('click', () => {
  const label = document.getElementById('goal-label').value.trim();
  const target = parseInt(document.getElementById('goal-target').value, 10) || 1;
  if (!label) return;
  const goals = FlippyStore.getGoals();
  const newGoal = { id: FlippyStore.uid(), weekStart: currentWeekStart(), label, target, progress: 0, completed: false };
  goals.push(newGoal);
  FlippyStore.setGoals(goals);
  FlippyApi.trySync(() => FlippyApi.goals.create(newGoal.weekStart, label, target));
  document.getElementById('goal-label').value = '';
  document.getElementById('goal-modal').classList.remove('open');
  renderGoals();
  flippyToast('Goal added');
});

/* -------------------------------- Search hookup -------------------------------- */
document.addEventListener('flippy:search', (e) => {
  const q = e.detail;
  if (!q) { renderDeckPicker(); return; }
  const el = document.getElementById('deck-picker');
  const matches = decks.filter(d => d.title.toLowerCase().includes(q));
  el.innerHTML = matches.length
    ? matches.map(d => `<span style="margin-right:8px;">${d.title}</span>`).join('')
    : `<p>No decks match "${escapeHtml(q)}".</p>`;
});

renderDeckPicker();
startSession();
renderCalendar();
renderGoals();
