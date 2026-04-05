/**
 * Retro Arcade — Chiptune SFX engine (Web Audio API)
 * Provides: sfx.play('start'|'score'|'powerup'|'damage'|'gameover'|'levelup')
 *           sfx.toggle(), sfx.enabled
 * Persists mute state in localStorage.
 */
/* eslint-disable no-unused-vars */
const sfx = (() => {
  let ctx = null;
  let _enabled = localStorage.getItem('sfx-enabled') !== 'false'; // default ON

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, duration, type, startTime, gain) {
    const c = getCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.value = gain || 0.12;
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(g);
    g.connect(c.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  function noise(duration, startTime, gain) {
    const c = getCtx();
    const bufferSize = c.sampleRate * duration;
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const g = c.createGain();
    g.gain.value = gain || 0.06;
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    src.connect(g);
    g.connect(c.destination);
    src.start(startTime);
    src.stop(startTime + duration);
  }

  const sounds = {
    start() {
      const t = getCtx().currentTime;
      tone(262, 0.08, 'square', t, 0.10);
      tone(330, 0.08, 'square', t + 0.08, 0.10);
      tone(392, 0.08, 'square', t + 0.16, 0.10);
      tone(523, 0.15, 'square', t + 0.24, 0.12);
    },
    score() {
      const t = getCtx().currentTime;
      tone(880, 0.06, 'square', t, 0.08);
      tone(1175, 0.08, 'square', t + 0.06, 0.08);
    },
    powerup() {
      const t = getCtx().currentTime;
      tone(440, 0.06, 'triangle', t, 0.10);
      tone(554, 0.06, 'triangle', t + 0.06, 0.10);
      tone(659, 0.06, 'triangle', t + 0.12, 0.10);
      tone(880, 0.12, 'triangle', t + 0.18, 0.12);
    },
    damage() {
      const t = getCtx().currentTime;
      tone(220, 0.12, 'sawtooth', t, 0.10);
      tone(110, 0.18, 'sawtooth', t + 0.08, 0.10);
      noise(0.1, t, 0.04);
    },
    gameover() {
      const t = getCtx().currentTime;
      tone(392, 0.15, 'square', t, 0.10);
      tone(330, 0.15, 'square', t + 0.2, 0.10);
      tone(262, 0.15, 'square', t + 0.4, 0.10);
      tone(196, 0.3, 'square', t + 0.6, 0.10);
    },
    levelup() {
      const t = getCtx().currentTime;
      tone(523, 0.08, 'square', t, 0.09);
      tone(659, 0.08, 'square', t + 0.08, 0.09);
      tone(784, 0.08, 'square', t + 0.16, 0.09);
      tone(1047, 0.1, 'square', t + 0.24, 0.11);
      tone(784, 0.06, 'square', t + 0.36, 0.08);
      tone(1047, 0.15, 'square', t + 0.42, 0.12);
    },
  };

  function play(name) {
    if (!_enabled) return;
    try {
      if (sounds[name]) sounds[name]();
    } catch (e) {
      // Ignore AudioContext errors (e.g. user hasn't interacted yet)
    }
  }

  function toggle() {
    _enabled = !_enabled;
    localStorage.setItem('sfx-enabled', _enabled);
    return _enabled;
  }

  function setEnabled(val) {
    _enabled = !!val;
    localStorage.setItem('sfx-enabled', _enabled);
  }

  return {
    play,
    toggle,
    setEnabled,
    get enabled() { return _enabled; },
  };
})();
