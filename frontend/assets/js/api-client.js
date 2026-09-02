/* ==========================================================================
   FLIPPY — API client
   ============================================================================
   THE single spot to change the backend URL. Everything else imports from
   here. When the API moves (Vercel -> anywhere else), edit API_BASE_URL
   and nothing else in the frontend needs to change.

   Design: local-first with best-effort sync.
   - Auth (signup/login/OTP/password) tries the SOAP API first, since
     that's the authoritative account store; if the API is unreachable it
     falls back to the existing localStorage-only simulation so the app
     still works with zero backend deployed.
   - Decks/cards/goals stay instantly responsive via localStorage (the
     existing FlippyStore), and are best-effort synced to the REST API in
     the background so the API's data doesn't fall silently out of date
     once it's live. Sync failures are swallowed — local mode always wins
     for responsiveness.
   ========================================================================== */

const API_BASE_URL = 'https://your-flippy-api.vercel.app'; // <-- CHANGE ONLY THIS

const FlippyApi = (() => {
  const FETCH_TIMEOUT_MS = 4000;

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    ]);
  }

  function authToken() {
    const session = FlippyStore.getSession();
    return session && session.token ? session.token : null;
  }

  async function restRequest(path, { method = 'GET', body } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = authToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await withTimeout(fetch(`${API_BASE_URL}${path}`, {
      method, headers, body: body ? JSON.stringify(body) : undefined
    }), FETCH_TIMEOUT_MS);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
      throw new Error(data?.error?.message || `Request failed (${res.status})`);
    }
    return data;
  }

  function buildSoapEnvelope(action, params) {
    const fields = Object.entries(params)
      .map(([k, v]) => `<fl:${k}>${escapeXml(String(v ?? ''))}</fl:${k}>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
      <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:fl="urn:flippy-security">
        <soapenv:Body><fl:${action}>${fields}</fl:${action}></soapenv:Body>
      </soapenv:Envelope>`;
  }

  function escapeXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function soapRequest(action, params, token) {
    const headers = { 'Content-Type': 'text/xml', SOAPAction: action };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await withTimeout(fetch(`${API_BASE_URL}/api/auth`, {
      method: 'POST', headers, body: buildSoapEnvelope(action, params)
    }), FETCH_TIMEOUT_MS);
    const text = await res.text();
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const fault = doc.getElementsByTagName('faultstring')[0];
    if (fault) throw new Error(fault.textContent);
    const result = {};
    const responseEl = doc.getElementsByTagName(`fl:${action}Response`)[0] || doc.documentElement.getElementsByTagName('*')[0];
    if (responseEl) {
      Array.from(responseEl.children).forEach(child => {
        const tag = child.tagName.split(':').pop();
        result[tag] = child.textContent;
      });
    }
    return result;
  }

  return {
    // ------------------------------ Auth (SOAP) ------------------------------
    async signup(username, email, password) {
      return soapRequest('Signup', { username, email, password });
    },
    async login(usernameOrEmail, password) {
      return soapRequest('Login', { usernameOrEmail, password });
    },
    async requestPasswordReset(email) {
      return soapRequest('RequestPasswordReset', { email });
    },
    async verifyOtp(email, code) {
      return soapRequest('VerifyOtp', { email, code });
    },
    async setNewPassword(resetToken, newPassword) {
      return soapRequest('SetNewPassword', { resetToken, newPassword });
    },
    async changePassword(currentPassword, newPassword) {
      return soapRequest('ChangePassword', { currentPassword, newPassword }, authToken());
    },

    // --------------------------- General data (REST) --------------------------
    decks: {
      list: () => restRequest('/api/decks'),
      create: (title, description) => restRequest('/api/decks', { method: 'POST', body: { title, description } }),
      update: (id, title, description) => restRequest('/api/decks', { method: 'PATCH', body: { id, title, description } }),
      remove: (id) => restRequest(`/api/decks?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    cards: {
      list: (deckId) => restRequest(`/api/cards?deckId=${encodeURIComponent(deckId)}`),
      create: (deckId, front, back) => restRequest('/api/cards', { method: 'POST', body: { deckId, front, back } }),
      update: (id, front, back) => restRequest('/api/cards', { method: 'PATCH', body: { id, front, back } }),
      recordReview: (id, correct) => restRequest('/api/cards', { method: 'PATCH', body: { id, correct } }),
      remove: (id) => restRequest(`/api/cards?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    goals: {
      list: (week) => restRequest(`/api/goals?week=${encodeURIComponent(week)}`),
      create: (weekStart, label, target) => restRequest('/api/goals', { method: 'POST', body: { weekStart, label, target } }),
      updateProgress: (id, progress) => restRequest('/api/goals', { method: 'PATCH', body: { id, progress } }),
      remove: (id) => restRequest(`/api/goals?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
      logStudyToday: () => restRequest('/api/goals', { method: 'POST', body: { logStudyToday: true } }),
      studyLog: () => restRequest('/api/goals?studyLog=1')
    },
    users: {
      me: () => restRequest('/api/users'),
      update: (patch) => restRequest('/api/users', { method: 'PATCH', body: patch })
    },

    // Fire-and-forget background sync — never throws, never blocks the UI.
    async trySync(fn) {
      try { await fn(); } catch (e) { /* offline or API not deployed yet — local mode carries on */ }
    },

    async isReachable() {
      try {
        await withTimeout(fetch(`${API_BASE_URL}/api/users`, { method: 'OPTIONS' }), 2000);
        return true;
      } catch { return false; }
    }
  };
})();
