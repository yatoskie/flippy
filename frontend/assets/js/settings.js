FlippyAuth.requireAuth();

const user = FlippyStore.getUser();
document.getElementById('set-username').value = user.username;
document.getElementById('set-email').value = user.email;

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('profile-error');
  errEl.style.display = 'none';
  const pw = document.getElementById('set-current-pw').value;
  const newUsername = document.getElementById('set-username').value.trim();
  const newEmail = document.getElementById('set-email').value.trim();

  // Try the REST API first (profile updates are general CRUD, not a
  // security operation, so this goes through REST rather than SOAP).
  try {
    await FlippyApi.users.update({ username: newUsername, email: newEmail, currentPassword: pw });
    const current = FlippyStore.getUser();
    current.username = newUsername; current.email = newEmail;
    FlippyStore.setUser(current);
    document.getElementById('set-current-pw').value = '';
    flippyToast('Profile updated');
    return;
  } catch (apiErr) {
    if (apiErr.message && !/timeout|Failed to fetch|NetworkError/i.test(apiErr.message)) {
      errEl.textContent = apiErr.message;
      errEl.style.display = 'block';
      return;
    }
  }

  // API unreachable — local-only fallback.
  const hash = await FlippyStore.weakHash(pw);
  const current = FlippyStore.getUser();
  if (hash !== current.passwordHash) {
    errEl.textContent = 'Current password is incorrect.';
    errEl.style.display = 'block';
    return;
  }
  current.username = newUsername;
  current.email = newEmail;
  FlippyStore.setUser(current);
  document.getElementById('set-current-pw').value = '';
  flippyToast('Profile updated');
});

document.getElementById('password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('password-error');
  errEl.style.display = 'none';
  const currentPw = document.getElementById('pw-current').value;
  const newPw = document.getElementById('pw-new').value;
  const newPw2 = document.getElementById('pw-new2').value;
  if (newPw !== newPw2 || newPw.length < 8) {
    errEl.textContent = 'New passwords must match and be at least 8 characters.';
    errEl.style.display = 'block';
    return;
  }

  // Password changes are an account-security operation -> SOAP, per the
  // architecture split (see api/auth.py).
  try {
    await FlippyApi.changePassword(currentPw, newPw);
    document.getElementById('password-form').reset();
    flippyToast('Password updated');
    return;
  } catch (apiErr) {
    if (apiErr.message && !/timeout|Failed to fetch|NetworkError/i.test(apiErr.message)) {
      errEl.textContent = apiErr.message;
      errEl.style.display = 'block';
      return;
    }
  }

  // API unreachable — local-only fallback.
  const current = FlippyStore.getUser();
  const hash = await FlippyStore.weakHash(currentPw);
  if (hash !== current.passwordHash) {
    errEl.textContent = 'Current password is incorrect.';
    errEl.style.display = 'block';
    return;
  }
  current.passwordHash = await FlippyStore.weakHash(newPw);
  FlippyStore.setUser(current);
  document.getElementById('password-form').reset();
  flippyToast('Password updated');
});

/* -------------------------------- Appearance -------------------------------- */
function refreshThemeButtons() {
  const u = FlippyStore.getUser();
  document.getElementById('theme-light').classList.toggle('active', (u.theme || 'light') === 'light');
  document.getElementById('theme-dark').classList.toggle('active', u.theme === 'dark');
  document.getElementById('accent-picker').value = u.accentColor || '#3B6FE0';
}
document.getElementById('theme-light').addEventListener('click', () => { FlippyTheme.set('light'); FlippyApi.trySync(() => FlippyApi.users.update({ theme: 'light' })); refreshThemeButtons(); });
document.getElementById('theme-dark').addEventListener('click', () => { FlippyTheme.set('dark'); FlippyApi.trySync(() => FlippyApi.users.update({ theme: 'dark' })); refreshThemeButtons(); });
document.getElementById('accent-picker').addEventListener('input', (e) => { FlippyTheme.setAccent(e.target.value); FlippyApi.trySync(() => FlippyApi.users.update({ accentColor: e.target.value })); });
document.querySelectorAll('[data-accent]').forEach(b => {
  b.addEventListener('click', () => {
    FlippyTheme.setAccent(b.dataset.accent);
    FlippyApi.trySync(() => FlippyApi.users.update({ accentColor: b.dataset.accent }));
    document.getElementById('accent-picker').value = b.dataset.accent;
  });
});
refreshThemeButtons();
