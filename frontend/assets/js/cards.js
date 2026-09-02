FlippyAuth.requireAuth();

let decks = FlippyStore.getDecks();
let cards = FlippyStore.getCards();
let editingDeckId = null;   // deck being created/edited via modal
let editingCardId = null;   // card being created/edited via modal
let activeDeckId = null;    // deck currently open in detail view

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

/* --------------------------------- Deck list --------------------------------- */
function renderDeckGrid(filter) {
  const grid = document.getElementById('deck-grid');
  let list = decks;
  if (filter) list = list.filter(d => d.title.toLowerCase().includes(filter));
  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">${filter ? 'No decks match your search.' : "No decks yet — create your first one."}</div>`;
    return;
  }
  grid.innerHTML = list.map(d => {
    const count = cards.filter(c => c.deckId === d.id).length;
    return `
    <div class="deck-card" data-deck-id="${d.id}">
      <h3>${escapeHtml(d.title)}</h3>
      <p>${escapeHtml(d.description || 'No description')}</p>
      <div class="meta"><span>${count} card${count === 1 ? '' : 's'}</span></div>
      <div class="actions">
        <button class="btn btn-ghost btn-sm" data-edit-deck="${d.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-delete-deck="${d.id}">Delete</button>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.deck-card').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openDeckDetail(el.dataset.deckId);
    });
  });
  grid.querySelectorAll('[data-edit-deck]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation(); openDeckModal(b.dataset.editDeck);
  }));
  grid.querySelectorAll('[data-delete-deck]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation(); deleteDeck(b.dataset.deleteDeck);
  }));
}

function openDeckModal(deckId) {
  editingDeckId = deckId || null;
  const deck = decks.find(d => d.id === deckId);
  document.getElementById('deck-modal-title').textContent = deck ? 'Edit deck' : 'New deck';
  document.getElementById('deck-title-input').value = deck ? deck.title : '';
  document.getElementById('deck-desc-input').value = deck ? deck.description || '' : '';
  document.getElementById('deck-modal').classList.add('open');
}
document.getElementById('new-deck-btn').addEventListener('click', () => openDeckModal(null));
document.querySelectorAll('[data-close-deck]').forEach(b => b.addEventListener('click', () => {
  document.getElementById('deck-modal').classList.remove('open');
}));
document.getElementById('save-deck-btn').addEventListener('click', () => {
  const title = document.getElementById('deck-title-input').value.trim();
  if (!title) return;
  const description = document.getElementById('deck-desc-input').value.trim();
  if (editingDeckId) {
    const deck = decks.find(d => d.id === editingDeckId);
    deck.title = title; deck.description = description;
    FlippyApi.trySync(() => FlippyApi.decks.update(deck.id, title, description));
  } else {
    const newDeck = { id: FlippyStore.uid(), title, description, createdAt: new Date().toISOString() };
    decks.push(newDeck);
    FlippyApi.trySync(() => FlippyApi.decks.create(title, description));
  }
  FlippyStore.setDecks(decks);
  document.getElementById('deck-modal').classList.remove('open');
  renderDeckGrid();
  flippyToast('Deck saved');
});
function deleteDeck(id) {
  if (!confirm('Delete this deck and all its cards?')) return;
  decks = decks.filter(d => d.id !== id);
  cards = cards.filter(c => c.deckId !== id);
  FlippyStore.setDecks(decks);
  FlippyStore.setCards(cards);
  FlippyApi.trySync(() => FlippyApi.decks.remove(id));
  renderDeckGrid();
  flippyToast('Deck deleted');
}

/* -------------------------------- Deck detail --------------------------------- */
function openDeckDetail(deckId) {
  activeDeckId = deckId;
  const deck = decks.find(d => d.id === deckId);
  if (!deck) return;
  document.getElementById('deck-list-view').style.display = 'none';
  document.getElementById('deck-detail-view').style.display = 'block';
  document.getElementById('detail-title').textContent = deck.title;
  document.getElementById('detail-desc').textContent = deck.description || '';
  renderCardList();
}
document.getElementById('back-to-decks').addEventListener('click', () => {
  document.getElementById('deck-detail-view').style.display = 'none';
  document.getElementById('deck-list-view').style.display = 'block';
  renderDeckGrid();
});

function renderCardList() {
  const list = document.getElementById('card-list');
  const items = cards.filter(c => c.deckId === activeDeckId);
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">No cards in this deck yet.</div>`;
    return;
  }
  list.innerHTML = items.map(c => `
    <div class="card-row" data-card-id="${c.id}">
      <div>
        <div class="cr-front">${escapeHtml(c.front)}</div>
        <div class="cr-back">${escapeHtml(c.back)}</div>
      </div>
      <div class="cr-actions">
        <button class="btn btn-ghost btn-sm" data-edit-card="${c.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-delete-card="${c.id}">Delete</button>
      </div>
    </div>`).join('');

  list.querySelectorAll('[data-edit-card]').forEach(b => b.addEventListener('click', () => openCardModal(b.dataset.editCard)));
  list.querySelectorAll('[data-delete-card]').forEach(b => b.addEventListener('click', () => deleteCard(b.dataset.deleteCard)));
}

function openCardModal(cardId) {
  editingCardId = cardId || null;
  const card = cards.find(c => c.id === cardId);
  document.getElementById('card-modal-title').textContent = card ? 'Edit card' : 'New card';
  document.getElementById('card-front-input').value = card ? card.front : '';
  document.getElementById('card-back-input').value = card ? card.back : '';
  document.getElementById('card-modal').classList.add('open');
}
document.getElementById('new-card-btn').addEventListener('click', () => openCardModal(null));
document.querySelectorAll('[data-close-card]').forEach(b => b.addEventListener('click', () => {
  document.getElementById('card-modal').classList.remove('open');
}));
document.getElementById('save-card-btn').addEventListener('click', () => {
  const front = document.getElementById('card-front-input').value.trim();
  const back = document.getElementById('card-back-input').value.trim();
  if (!front || !back) return;
  if (editingCardId) {
    const card = cards.find(c => c.id === editingCardId);
    card.front = front; card.back = back;
    FlippyApi.trySync(() => FlippyApi.cards.update(card.id, front, back));
  } else {
    const newCard = { id: FlippyStore.uid(), deckId: activeDeckId, front, back, timesCorrect: 0, timesWrong: 0, lastReviewed: null };
    cards.push(newCard);
    FlippyApi.trySync(() => FlippyApi.cards.create(activeDeckId, front, back));
  }
  FlippyStore.setCards(cards);
  document.getElementById('card-modal').classList.remove('open');
  renderCardList();
  flippyToast('Card saved');
});
function deleteCard(id) {
  if (!confirm('Delete this card?')) return;
  cards = cards.filter(c => c.id !== id);
  FlippyStore.setCards(cards);
  FlippyApi.trySync(() => FlippyApi.cards.remove(id));
  renderCardList();
  flippyToast('Card deleted');
}

/* --------------------------------- Search hookup --------------------------------- */
document.addEventListener('flippy:search', (e) => renderDeckGrid(e.detail));

renderDeckGrid();
