/**
 * Retro Arcade — Theme switcher (neon / kids)
 * Provides: arcadeTheme.toggle(), arcadeTheme.current, arcadeTheme.isKids
 * Adds/removes `data-theme="kids"` on <html>. CSS handles the rest via :root overrides.
 * Persists in localStorage.
 */
/* eslint-disable no-unused-vars */
const arcadeTheme = (() => {
  let _current = localStorage.getItem('arcade-theme') || 'neon';

  function apply() {
    document.documentElement.setAttribute('data-theme', _current);
  }

  function set(theme) {
    _current = theme;
    localStorage.setItem('arcade-theme', _current);
    apply();
  }

  function toggle() {
    set(_current === 'neon' ? 'kids' : 'neon');
    return _current;
  }

  // Apply on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }

  return {
    toggle,
    set,
    get current() { return _current; },
    get isKids() { return _current === 'kids'; },
  };
})();
