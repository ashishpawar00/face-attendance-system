// ═══════════════════════════════════════════
//  auth-helper.js — Shared auth utilities
// ═══════════════════════════════════════════

function getToken() {
  // Check cookie first, then localStorage
  const cookie = document.cookie.split(';').find(c => c.trim().startsWith('token='));
  if (cookie) return cookie.split('=')[1];
  return localStorage.getItem('faceattend_token');
}

function setToken(token) {
  localStorage.setItem('faceattend_token', token);
  document.cookie = `token=${token};path=/;max-age=${7*24*60*60};samesite=lax`;
}

function clearToken() {
  localStorage.removeItem('faceattend_token');
  document.cookie = 'token=;path=/;max-age=0';
}

function isLoggedIn() {
  return !!getToken();
}

// Redirect to login if not authenticated
async function requireAuth() {
  const token = getToken();
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('Invalid token');
    return true;
  } catch (e) {
    clearToken();
    window.location.href = '/login.html';
    return false;
  }
}

// Wrapper for fetch that adds auth header
async function authFetch(url, options = {}) {
  const token = getToken();
  if (!options.headers) options.headers = {};

  // Add Authorization header if we have a token
  if (token) {
    options.headers['Authorization'] = 'Bearer ' + token;
  }

  // IMPORTANT: Do NOT set Content-Type for FormData — browser sets it with boundary automatically
  if (options.body instanceof FormData) {
    delete options.headers['Content-Type'];
  }

  const res = await fetch(url, options);
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login.html';
    throw new Error('Session expired');
  }
  return res;
}

function logout() {
  clearToken();
  fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login.html';
}
