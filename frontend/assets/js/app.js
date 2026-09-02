/* ==========================================================================
   FLIPPY — Core app layer
   Handles: localStorage data access, theme/accent, session, shared navbar
   widgets (search, profile popover, game placeholder), toasts.

   This file is the seam where a real backend gets wired in later: every
   read/write goes through the FlippyStore functions below, so swapping
   localStorage for fetch() calls to the REST/SOAP API only requires
   editing this one file.
   ========================================================================== */

const FlippyStore = (() => {
  const KEYS = {
    user: 'flippy_user',
    decks: 'flippy_decks',
    cards: 'flippy_cards',
    goals: 'flippy_goals',
    session: 'flippy_session',
    studyLog: 'flippy_study_log' // array of yyyy-mm-dd strings a card was studied
  };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('FlippyStore read error', key, e);
      return fallback;
    }
  }
  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  // Baseline client-side obfuscation only — NOT secure. Real hashing (bcrypt/
  // argon2) happens server-side once the backend exists. See spec §6.
  async function weakHash(text) {
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  return {
    KEYS, uid, weakHash,
    getUser: () => read(KEYS.user, null),
    setUser: (u) => write(KEYS.user, u),
    getSession: () => read(KEYS.session, null),
    setSession: (s) => write(KEYS.session, s),
    clearSession: () => localStorage.removeItem(KEYS.session),
    getDecks: () => read(KEYS.decks, []),
    setDecks: (d) => write(KEYS.decks, d),
    getCards: () => read(KEYS.cards, []),
    setCards: (c) => write(KEYS.cards, c),
    getGoals: () => read(KEYS.goals, []),
    setGoals: (g) => write(KEYS.goals, g),
    getStudyLog: () => read(KEYS.studyLog, []),
    setStudyLog: (l) => write(KEYS.studyLog, l),
    logStudyToday: () => {
      const log = read(KEYS.studyLog, []);
      const today = new Date().toISOString().slice(0, 10);
      if (!log.includes(today)) { log.push(today); write(KEYS.studyLog, log); }
    }
  };
})();

/* ------------------------------ Session guard ------------------------------ */
const FlippyAuth = {
  isLoggedIn() {
    const s = FlippyStore.getSession();
    return !!(s && s.loggedIn);
  },
  requireAuth() {
    if (!this.isLoggedIn()) window.location.href = 'auth.html';
  },
  logout() {
    FlippyStore.clearSession();
    window.location.href = 'index.html';
  }
};

/* -------------------------------- Theme ------------------------------------ */
const FlippyTheme = {
  apply() {
    const user = FlippyStore.getUser() || {};
    const theme = user.theme || 'light';
    const accent = user.accentColor || '#3B6FE0';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.setProperty('--accent', accent);
    // derive a soft tint for backgrounds behind the accent
    document.documentElement.style.setProperty('--accent-soft', accent + '1A');
  },
  set(theme) {
    const user = FlippyStore.getUser() || {};
    user.theme = theme;
    FlippyStore.setUser(user);
    this.apply();
  },
  setAccent(color) {
    const user = FlippyStore.getUser() || {};
    user.accentColor = color;
    FlippyStore.setUser(user);
    this.apply();
  }
};
FlippyTheme.apply();

/* -------------------------------- Toast ------------------------------------ */
function flippyToast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

/* --------------------------- Shared navbar widgets -------------------------- */
function initNavbar() {
  const search = document.querySelector('[data-nav-search]');
  if (search) {
    search.addEventListener('input', (e) => {
      document.dispatchEvent(new CustomEvent('flippy:search', { detail: e.target.value.trim().toLowerCase() }));
    });
  }

  const avatarBtn = document.querySelector('[data-profile-trigger]');
  const pop = document.querySelector('[data-profile-popover]');
  if (avatarBtn && pop) {
    const user = FlippyStore.getUser();
    const avatarImg = pop.parentElement.querySelector('[data-avatar-slot]');
    if (avatarImg && user && user.avatar) {
      avatarImg.innerHTML = `<img src="${user.avatar}" alt="">`;
    } else if (avatarImg && user) {
      avatarImg.textContent = (user.username || '?').slice(0, 1).toUpperCase();
    }
    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.classList.toggle('open');
    });
    document.addEventListener('click', () => pop.classList.remove('open'));
    pop.addEventListener('click', (e) => e.stopPropagation());
  }

  const gameBtn = document.querySelector('[data-game-btn]');
  if (gameBtn) {
    gameBtn.addEventListener('click', () => openGameModal());
  }

  const avatarUpload = document.querySelector('[data-avatar-upload]');
  if (avatarUpload) {
    avatarUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const user = FlippyStore.getUser() || {};
        user.avatar = reader.result;
        FlippyStore.setUser(user);
        flippyToast('Profile picture updated');
        initNavbar();
      };
      reader.readAsDataURL(file);
    });
  }

  document.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', () => FlippyAuth.logout()));

  const openAvatarBtn = document.querySelector('[data-open-avatar-upload]');
  const hiddenInput = document.querySelector('[data-avatar-upload]');
  if (openAvatarBtn && hiddenInput) openAvatarBtn.addEventListener('click', () => hiddenInput.click());

  document.querySelectorAll('[data-modal-close]').forEach(b => {
    b.addEventListener('click', () => b.closest('.modal-overlay').classList.remove('open'));
  });
}

function openGameModal() {
  const overlay = document.getElementById('flippy-generic-modal');
  if (!overlay) return;
  overlay.querySelector('[data-modal-title]').textContent = 'Game mode';
  overlay.querySelector('[data-modal-body]').textContent = "Coming soon — a quick-fire game mode for your decks is in the works.";
  overlay.classList.add('open');
}

document.addEventListener('DOMContentLoaded', initNavbar);
