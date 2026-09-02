/* ==========================================================================
   FLIPPY — Auth page logic (local simulation)
   Once the SOAP security service exists, replace the bodies of
   handleSignup/handleLogin/handleForgot* with calls through api-client.js —
   the form wiring and validation below stay the same.
   ========================================================================== */

const views = {
  login: document.getElementById('login-view'),
  signup: document.getElementById('signup-view'),
  'forgot-email': document.getElementById('forgot-email-view'),
  'forgot-otp': document.getElementById('forgot-otp-view'),
  'forgot-new': document.getElementById('forgot-new-view')
};
function showView(name) {
  Object.values(views).forEach(v => v.classList.remove('active'));
  views[name].classList.add('active');
  document.querySelectorAll('#mode-tabs button').forEach(b => b.classList.remove('active'));
  const tab = document.querySelector(`#mode-tabs [data-tab="${name}"]`);
  if (tab) tab.classList.add('active');
}

document.querySelectorAll('#mode-tabs button').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.tab));
});
document.querySelectorAll('[data-back-to]').forEach(a => {
  a.addEventListener('click', (e) => { e.preventDefault(); showView(a.dataset.backTo); });
});

if (new URLSearchParams(location.search).get('mode') === 'signup') showView('signup');

/* ------------------------------- Signup ------------------------------- */
const pwInput = document.getElementById('su-pw');
pwInput.addEventListener('input', () => {
  const v = pwInput.value;
  let score = 0;
  if (v.length >= 8) score++;
  if (/[A-Z]/.test(v)) score++;
  if (/[0-9]/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v)) score++;
  const pct = (score / 4) * 100;
  const bar = document.getElementById('strength-bar');
  bar.style.width = pct + '%';
  bar.style.background = score <= 1 ? 'var(--danger)' : score <= 2 ? '#E0A62F' : 'var(--success)';
});

document.getElementById('signup-view').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('su-username').value.trim();
  const email = document.getElementById('su-email').value.trim();
  const pw = document.getElementById('su-pw').value;
  const pw2 = document.getElementById('su-pw2').value;
  const errEl = document.getElementById('signup-error');
  errEl.style.display = 'none';

  if (pw !== pw2) { errEl.textContent = "Passwords don't match."; errEl.style.display = 'block'; return; }
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    errEl.textContent = 'Username must be 3-24 characters, letters/numbers/underscore only.';
    errEl.style.display = 'block'; return;
  }

  // Try the real SOAP API first; if it's unreachable (not deployed yet,
  // or the person is offline), fall back to the local-only simulation so
  // signup still works with zero backend.
  try {
    const result = await FlippyApi.signup(username, email, pw);
    const user = { id: result.userId, username, email, avatar: null, theme: 'light', accentColor: '#3B6FE0' };
    FlippyStore.setUser(user);
    FlippyStore.setSession({ loggedIn: true, userId: user.id, token: result.token, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
    window.location.href = 'dashboard.html';
    return;
  } catch (apiErr) {
    if (apiErr.message && !/timeout|Failed to fetch|NetworkError/i.test(apiErr.message)) {
      // API reachable but rejected the request (e.g. username taken) — show it.
      errEl.textContent = apiErr.message;
      errEl.style.display = 'block';
      return;
    }
    // else: API unreachable — fall through to local simulation below.
  }

  const passwordHash = await FlippyStore.weakHash(pw);
  const user = {
    id: FlippyStore.uid(),
    username, email, passwordHash,
    avatar: null, theme: 'light', accentColor: '#3B6FE0'
  };
  FlippyStore.setUser(user);
  FlippyStore.setSession({ loggedIn: true, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  window.location.href = 'dashboard.html';
});

/* -------------------------------- Login -------------------------------- */
document.getElementById('login-view').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('login-id').value.trim();
  const pw = document.getElementById('login-pw').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';

  try {
    const result = await FlippyApi.login(id, pw);
    FlippyStore.setSession({ loggedIn: true, userId: result.userId, token: result.token, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
    window.location.href = 'dashboard.html';
    return;
  } catch (apiErr) {
    if (apiErr.message && !/timeout|Failed to fetch|NetworkError/i.test(apiErr.message)) {
      errEl.textContent = apiErr.message;
      errEl.style.display = 'block';
      return;
    }
    // API unreachable — fall through to local simulation.
  }

  const user = FlippyStore.getUser();
  if (!user || (user.username !== id && user.email !== id)) {
    errEl.textContent = 'No account matches that username or email on this device.';
    errEl.style.display = 'block'; return;
  }
  const hash = await FlippyStore.weakHash(pw);
  if (hash !== user.passwordHash) {
    errEl.textContent = 'Incorrect password.';
    errEl.style.display = 'block'; return;
  }
  FlippyStore.setSession({ loggedIn: true, userId: user.id, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  window.location.href = 'dashboard.html';
});

/* --------------------------- Forgot password ---------------------------- */
document.getElementById('forgot-link').addEventListener('click', (e) => {
  e.preventDefault();
  showView('forgot-email');
});

let pendingOtp = null;   // local-simulation fallback only
let pendingEmail = null;
let resetToken = null;   // set when the real API verifies the OTP

document.getElementById('forgot-email-view').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('fg-email').value.trim();
  pendingEmail = email;

  try {
    await FlippyApi.requestPasswordReset(email);
    document.getElementById('otp-dev-hint').textContent = 'Check your email for the 6-digit code.';
    showView('forgot-otp');
    return;
  } catch (apiErr) {
    if (apiErr.message && !/timeout|Failed to fetch|NetworkError/i.test(apiErr.message)) {
      // API reachable but errored for a real reason — still proceed to
      // the OTP screen without revealing account existence.
    }
  }
  // API unreachable — local demo mode shows the code directly since
  // there's no email server available in frontend-only mode.
  pendingOtp = Math.floor(100000 + Math.random() * 900000).toString();
  document.getElementById('otp-dev-hint').textContent = `Local demo mode — your code is ${pendingOtp} (a real deployment emails this).`;
  showView('forgot-otp');
});

document.getElementById('forgot-otp-view').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('fg-otp').value.trim();
  const errEl = document.getElementById('otp-error');

  try {
    const result = await FlippyApi.verifyOtp(pendingEmail, code);
    resetToken = result.resetToken;
    errEl.style.display = 'none';
    showView('forgot-new');
    return;
  } catch (apiErr) {
    if (apiErr.message && !/timeout|Failed to fetch|NetworkError/i.test(apiErr.message)) {
      errEl.textContent = apiErr.message;
      errEl.style.display = 'block';
      return;
    }
  }
  // API unreachable — fall back to comparing against the locally-generated code.
  if (code !== pendingOtp) {
    errEl.textContent = 'That code is incorrect or expired.';
    errEl.style.display = 'block';
    return;
  }
  errEl.style.display = 'none';
  showView('forgot-new');
});

document.getElementById('forgot-new-view').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = document.getElementById('fg-new-pw').value;
  const pw2 = document.getElementById('fg-new-pw2').value;
  const errEl = document.getElementById('fg-error');
  if (pw !== pw2 || pw.length < 8) {
    errEl.textContent = 'Passwords must match and be at least 8 characters.';
    errEl.style.display = 'block';
    return;
  }

  if (resetToken) {
    try {
      await FlippyApi.setNewPassword(resetToken, pw);
      flippyToast('Password updated — log in with your new password.');
      showView('login');
      return;
    } catch (apiErr) {
      errEl.textContent = apiErr.message;
      errEl.style.display = 'block';
      return;
    }
  }

  // Local-simulation fallback path.
  const user = FlippyStore.getUser();
  if (user) {
    user.passwordHash = await FlippyStore.weakHash(pw);
    FlippyStore.setUser(user);
  }
  flippyToast('Password updated — log in with your new password.');
  showView('login');
});
