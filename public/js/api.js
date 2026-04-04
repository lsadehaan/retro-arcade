/**
 * Shared fetch wrapper + auth state manager.
 * Provides: api.get(path), api.post(path, body), api.getUser(), api.logout()
 * Auto-handles 401 -> redirect to login page.
 */

/* eslint-disable no-unused-vars */
const api = (() => {
  let _user = null;
  let _checked = false;

  async function request(method, path, body) {
    const opts = {
      method,
      headers: {},
      credentials: 'same-origin',
    };

    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(path, opts);

    if (res.status === 401 && !path.includes('/api/auth/')) {
      window.location.href = '/auth/login.html';
      return null;
    }

    return res;
  }

  async function get(path) {
    return request('GET', path);
  }

  async function post(path, body) {
    return request('POST', path, body);
  }

  /** Check /api/auth/me and cache the user. Returns user or null. */
  async function getUser() {
    if (_checked) return _user;
    try {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (res.ok) {
        _user = await res.json();
      } else {
        _user = null;
      }
    } catch (err) {
      console.warn('getUser network error:', err);
      _user = null;
    }
    _checked = true;
    return _user;
  }

  /** Invalidate cached user (call after login/register/logout). */
  function clearCache() {
    _user = null;
    _checked = false;
  }

  async function logout() {
    await post('/api/auth/logout');
    clearCache();
    window.location.href = '/';
  }

  return { get, post, getUser, logout, clearCache };
})();

/**
 * Updates the navbar auth section.
 * Expects elements: #nav-auth-links, #nav-user-info, #nav-username
 */
async function updateNavAuth() {
  const user = await api.getUser();
  const authLinks = document.getElementById('nav-auth-links');
  const userInfo = document.getElementById('nav-user-info');
  const usernameEl = document.getElementById('nav-username');

  if (!authLinks || !userInfo) return;

  if (user) {
    authLinks.style.display = 'none';
    userInfo.style.display = 'flex';
    if (usernameEl) usernameEl.textContent = user.username;
  } else {
    authLinks.style.display = 'flex';
    userInfo.style.display = 'none';
  }
}

// Run nav update on DOMContentLoaded
document.addEventListener('DOMContentLoaded', updateNavAuth);
