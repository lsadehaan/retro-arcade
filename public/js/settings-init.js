/**
 * Retro Arcade — Settings bar initialization
 * Wires up SFX toggle and theme toggle buttons.
 * Requires sfx.js and theme.js to be loaded first.
 */
/* eslint-disable no-unused-vars */
function initSettingsBar() {
  const soundBtn = document.getElementById('sound-toggle');
  const themeBtn = document.getElementById('theme-toggle');

  if (soundBtn) {
    soundBtn.textContent = 'SFX: ' + (sfx.enabled ? 'ON' : 'OFF');
    soundBtn.classList.toggle('active', sfx.enabled);
    soundBtn.addEventListener('click', () => {
      const on = sfx.toggle();
      soundBtn.textContent = 'SFX: ' + (on ? 'ON' : 'OFF');
      soundBtn.classList.toggle('active', on);
    });
  }

  if (themeBtn) {
    themeBtn.textContent = 'THEME: ' + (arcadeTheme.current === 'kids' ? 'KIDS' : 'NEON');
    themeBtn.classList.toggle('active', arcadeTheme.isKids);
    themeBtn.addEventListener('click', () => {
      const t = arcadeTheme.toggle();
      themeBtn.textContent = 'THEME: ' + (t === 'kids' ? 'KIDS' : 'NEON');
      themeBtn.classList.toggle('active', arcadeTheme.isKids);
    });
  }
}

document.addEventListener('DOMContentLoaded', initSettingsBar);
