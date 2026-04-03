/**
 * Asteroid Defense Surge — Space Invaders variant
 * - Orbital enemy movement: enemies orbit elliptical/circular paths
 * - 5 weapon tiers: Basic, Spread, Charge, Laser, Missile
 * - Boss waves every 5 rounds
 * - Power-up drops with stacking
 * - Shield regeneration, lives, score submission
 */

const CANVAS_W = 700;
const CANVAS_H = 520;

// ── Enemy type definitions ──────────────────────────────────────────────────
const ENEMY_TYPES = {
  scout: { hp: 1, radius: 8, color: '#0ff', points: 10, fireRate: 0.003, speed: 1.0 },
  drone: { hp: 2, radius: 10, color: '#ff0', points: 20, fireRate: 0.005, speed: 0.8 },
  heavy: { hp: 4, radius: 13, color: '#f80', points: 40, fireRate: 0.008, speed: 0.6 },
};

// ── Weapon definitions ──────────────────────────────────────────────────────
const WEAPONS = {
  basic:  { label: 'BASIC',  color: '#0ff', fireDelay: 150 },
  spread: { label: 'SPREAD', color: '#ff0', fireDelay: 250 },
  charge: { label: 'CHARGE', color: '#f80', fireDelay: 0 },
  laser:  { label: 'LASER',  color: '#0f8', fireDelay: 0 },
  missile:{ label: 'MISSILE',color: '#f0f', fireDelay: 400 },
};

const WEAPON_ORDER = ['basic', 'spread', 'charge', 'laser', 'missile'];

// ── Power-up colors ─────────────────────────────────────────────────────────
const POWERUP_COLORS = {
  spread: '#ff0',
  charge: '#f80',
  laser:  '#0f8',
  missile:'#f0f',
  shield: '#fff',
};

// ── Game constants ──────────────────────────────────────────────────────────
const PLAYER_W = 30;
const PLAYER_H = 20;
const PLAYER_SPEED = 4;
const MAX_LIVES = 3;
const MAX_SHIELD = 100;
const SHIELD_REGEN_PER_SEC = 5;
const POWERUP_DROP_CHANCE = 0.20;
const BOSS_WAVE_INTERVAL = 5;

// ── Exportable game logic (for testing) ─────────────────────────────────────
// We build pure-logic classes that can be tested headlessly, then a renderer
// class that uses Canvas.

class Vector2 {
  constructor(x, y) { this.x = x; this.y = y; }
  add(v) { return new Vector2(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vector2(this.x - v.x, this.y - v.y); }
  scale(s) { return new Vector2(this.x * s, this.y * s); }
  mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  normalize() {
    const m = this.mag();
    return m === 0 ? new Vector2(0, 0) : new Vector2(this.x / m, this.y / m);
  }
  distTo(v) { return this.sub(v).mag(); }
}

// ── OrbitalEnemy ────────────────────────────────────────────────────────────
class OrbitalEnemy {
  constructor({ type, centerX, centerY, radiusX, radiusY, angle, angularSpeed, hp }) {
    this.type = type;
    const def = ENEMY_TYPES[type];
    this.centerX = centerX;
    this.centerY = centerY;
    this.radiusX = radiusX;
    this.radiusY = radiusY;
    this.angle = angle;
    this.angularSpeed = angularSpeed;
    this.hp = hp ?? def.hp;
    this.maxHp = this.hp;
    this.drawRadius = def.radius;
    this.color = def.color;
    this.points = def.points;
    this.fireRate = def.fireRate;
    this.alive = true;
    this.isBoss = false;
    this._updatePosition();
  }

  _updatePosition() {
    this.x = this.centerX + Math.cos(this.angle) * this.radiusX;
    this.y = this.centerY + Math.sin(this.angle) * this.radiusY;
  }

  update(dt) {
    this.angle += this.angularSpeed * dt;
    this._updatePosition();
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  getRect() {
    const r = this.drawRadius;
    return { x: this.x - r, y: this.y - r, w: r * 2, h: r * 2 };
  }
}

// ── BossEnemy ───────────────────────────────────────────────────────────────
class BossEnemy extends OrbitalEnemy {
  constructor(opts) {
    super(opts);
    this.isBoss = true;
    this.drawRadius = 28;
    this.color = '#f00';
    this.shieldPhase = false;
    this.shieldTimer = 0;
    this.shieldCooldown = 0;
    this.spreadFireTimer = 0;
  }

  update(dt) {
    super.update(dt);
    // Shield phase: every 4 seconds, become invulnerable for 1.5 seconds
    this.shieldCooldown -= dt;
    if (this.shieldPhase) {
      this.shieldTimer -= dt;
      if (this.shieldTimer <= 0) {
        this.shieldPhase = false;
        this.shieldCooldown = 4;
      }
    } else if (this.shieldCooldown <= 0) {
      this.shieldPhase = true;
      this.shieldTimer = 1.5;
    }
    this.spreadFireTimer -= dt;
  }

  takeDamage(dmg) {
    if (this.shieldPhase) return false;
    return super.takeDamage(dmg);
  }
}

// ── Bullet ──────────────────────────────────────────────────────────────────
class Bullet {
  constructor(x, y, vx, vy, damage, color, piercing = false, homing = false, radius = 3) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.damage = damage;
    this.color = color;
    this.piercing = piercing;
    this.homing = homing;
    this.radius = radius;
    this.alive = true;
  }

  update(dt, enemies) {
    if (this.homing && enemies && enemies.length > 0) {
      // Find closest alive enemy
      let closest = null;
      let minDist = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - this.x, e.y - this.y);
        if (d < minDist) { minDist = d; closest = e; }
      }
      if (closest) {
        const dir = new Vector2(closest.x - this.x, closest.y - this.y).normalize();
        const speed = Math.hypot(this.vx, this.vy);
        // Blend: 90% current direction + 10% towards target
        this.vx = this.vx * 0.9 + dir.x * speed * 0.1;
        this.vy = this.vy * 0.9 + dir.y * speed * 0.1;
        // Re-normalize to keep speed constant
        const currentSpeed = Math.hypot(this.vx, this.vy);
        if (currentSpeed > 0) {
          this.vx = (this.vx / currentSpeed) * speed;
          this.vy = (this.vy / currentSpeed) * speed;
        }
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // Out of bounds
    if (this.x < -20 || this.x > CANVAS_W + 20 || this.y < -20 || this.y > CANVAS_H + 20) {
      this.alive = false;
    }
  }
}

// ── LaserBeam ───────────────────────────────────────────────────────────────
class LaserBeam {
  constructor(x, y, width) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.active = false;
    this.damage = 60; // per second
  }

  getRect() {
    return { x: this.x - this.width / 2, y: 0, w: this.width, h: this.y };
  }
}

// ── PowerUp ─────────────────────────────────────────────────────────────────
class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type; // 'spread', 'charge', 'laser', 'missile', 'shield'
    this.vy = 60; // falls down
    this.alive = true;
    this.radius = 8;
    this.color = POWERUP_COLORS[type];
  }

  update(dt) {
    this.y += this.vy * dt;
    if (this.y > CANVAS_H + 20) this.alive = false;
  }
}

// ── GameEngine (headless, testable) ─────────────────────────────────────────
class GameEngine {
  constructor(width, height) {
    this.width = width ?? CANVAS_W;
    this.height = height ?? CANVAS_H;
    this.reset();
  }

  reset() {
    // Player state
    this.playerX = this.width / 2;
    this.playerY = this.height - 40;
    this.lives = MAX_LIVES;
    this.shield = MAX_SHIELD;
    this.score = 0;
    this.wave = 0;
    this.gameOver = false;

    // Weapon state
    this.weapon = 'basic';
    this.weaponLevel = 1; // 1-3 stacking
    this.chargeTime = 0;
    this.laserCharge = 100; // 0-100
    this.laserActive = false;
    this.laser = new LaserBeam(this.playerX, this.playerY, 6);

    // Collections
    this.enemies = [];
    this.playerBullets = [];
    this.enemyBullets = [];
    this.powerUps = [];

    // Timers
    this.fireTimer = 0;
    this.invincibleTimer = 0;

    // Input state
    this.keys = { left: false, right: false, fire: false };

    this._startNextWave();
  }

  // ── Wave generation ─────────────────────────────────────────────────────
  _startNextWave() {
    this.wave++;
    const isBossWave = this.wave % BOSS_WAVE_INTERVAL === 0;
    const waveSpeed = 1 + this.wave * 0.05;
    const enemyCount = Math.min(5 + this.wave * 2, 30);

    if (isBossWave) {
      this._spawnBoss(waveSpeed);
      // Also spawn some support enemies
      const supportCount = Math.min(3 + Math.floor(this.wave / 5), 10);
      this._spawnOrbitalEnemies(supportCount, waveSpeed);
    } else {
      this._spawnOrbitalEnemies(enemyCount, waveSpeed);
    }
  }

  _spawnOrbitalEnemies(count, waveSpeed) {
    // Distribute enemies among several orbital groups
    const groupCount = Math.ceil(count / 5);
    let remaining = count;

    for (let g = 0; g < groupCount && remaining > 0; g++) {
      const inGroup = Math.min(remaining, 5);
      remaining -= inGroup;

      // Random center point in upper portion of screen
      const cx = 100 + Math.random() * (this.width - 200);
      const cy = 60 + Math.random() * 150;
      const rx = 40 + Math.random() * 80;
      const ry = 20 + Math.random() * 50;
      const baseAngle = Math.random() * Math.PI * 2;

      for (let i = 0; i < inGroup; i++) {
        const angle = baseAngle + (i / inGroup) * Math.PI * 2;
        const typeRoll = Math.random();
        const type = typeRoll < 0.5 ? 'scout' : typeRoll < 0.8 ? 'drone' : 'heavy';
        const def = ENEMY_TYPES[type];
        const angSpeed = (0.5 + Math.random() * 0.8) * waveSpeed * def.speed;

        this.enemies.push(new OrbitalEnemy({
          type,
          centerX: cx,
          centerY: cy,
          radiusX: rx + Math.random() * 20,
          radiusY: ry + Math.random() * 15,
          angle,
          angularSpeed: angSpeed,
          hp: def.hp + Math.floor(this.wave / 5),
        }));
      }
    }
  }

  _spawnBoss(waveSpeed) {
    const boss = new BossEnemy({
      type: 'heavy',
      centerX: this.width / 2,
      centerY: 100,
      radiusX: 100,
      radiusY: 40,
      angle: 0,
      angularSpeed: 0.3 * waveSpeed,
      hp: 10 * (ENEMY_TYPES.heavy.hp + Math.floor(this.wave / 5)),
    });
    boss.points = this.wave * 500;
    this.enemies.push(boss);
  }

  // ── Update loop ───────────────────────────────────────────────────────────
  update(dt) {
    if (this.gameOver) return;

    // dt is in seconds
    this._updatePlayer(dt);
    this._updateEnemies(dt);
    this._updatePlayerBullets(dt);
    this._updateEnemyBullets(dt);
    this._updatePowerUps(dt);
    this._updateLaser(dt);
    this._checkCollisions(dt);
    this._regenerateShield(dt);

    // Check wave clear
    if (this.enemies.length === 0) {
      this._startNextWave();
    }
  }

  _updatePlayer(dt) {
    if (this.keys.left) this.playerX -= PLAYER_SPEED * dt * 60;
    if (this.keys.right) this.playerX += PLAYER_SPEED * dt * 60;
    this.playerX = Math.max(PLAYER_W / 2, Math.min(this.width - PLAYER_W / 2, this.playerX));

    // Update laser position
    this.laser.x = this.playerX;
    this.laser.y = this.playerY;

    // Invincibility
    if (this.invincibleTimer > 0) this.invincibleTimer -= dt;

    // Firing
    this.fireTimer -= dt;
    if (this.keys.fire) {
      this._handleFiring(dt);
    } else {
      // Release charge if weapon is charge and was charging
      if (this.weapon === 'charge' && this.chargeTime > 0) {
        this._fireCharge();
      }
      this.chargeTime = 0;
      this.laserActive = false;
      this.laser.active = false;
      // Recharge laser
      this.laserCharge = Math.min(100, this.laserCharge + 30 * dt);
    }
  }

  _handleFiring(dt) {
    switch (this.weapon) {
      case 'basic':
        if (this.fireTimer <= 0) {
          this._fireBasic();
          this.fireTimer = WEAPONS.basic.fireDelay / 1000;
        }
        break;
      case 'spread':
        if (this.fireTimer <= 0) {
          this._fireSpread();
          this.fireTimer = WEAPONS.spread.fireDelay / 1000;
        }
        break;
      case 'charge':
        this.chargeTime += dt;
        break;
      case 'laser':
        if (this.laserCharge > 0) {
          this.laserActive = true;
          this.laser.active = true;
          this.laserCharge -= 40 * dt;
          if (this.laserCharge <= 0) {
            this.laserCharge = 0;
            this.laserActive = false;
            this.laser.active = false;
          }
        }
        break;
      case 'missile':
        if (this.fireTimer <= 0) {
          this._fireMissile();
          this.fireTimer = WEAPONS.missile.fireDelay / 1000;
        }
        break;
    }
  }

  _fireBasic() {
    const speed = -500;
    const dmg = 1 * this.weaponLevel;
    this.playerBullets.push(
      new Bullet(this.playerX, this.playerY - PLAYER_H / 2, 0, speed, dmg, WEAPONS.basic.color)
    );
  }

  _fireSpread() {
    const speed = -450;
    const dmg = 1 * this.weaponLevel;
    const angles = [-0.2, 0, 0.2];
    if (this.weaponLevel >= 2) angles.push(-0.35, 0.35);
    if (this.weaponLevel >= 3) angles.push(-0.5, 0.5);

    for (const a of angles) {
      const vx = Math.sin(a) * -speed;
      const vy = Math.cos(a) * speed;
      this.playerBullets.push(
        new Bullet(this.playerX, this.playerY - PLAYER_H / 2, vx, vy, dmg, WEAPONS.spread.color)
      );
    }
  }

  _fireCharge() {
    const chargeLevel = Math.min(this.chargeTime / 2, 1); // 2s for full charge
    const dmg = Math.ceil(5 * chargeLevel * this.weaponLevel);
    const radius = 5 + chargeLevel * 10;
    this.playerBullets.push(
      new Bullet(this.playerX, this.playerY - PLAYER_H / 2, 0, -350, dmg, WEAPONS.charge.color, false, false, radius)
    );
    this.chargeTime = 0;
  }

  _fireMissile() {
    const dmg = 3 * this.weaponLevel;
    this.playerBullets.push(
      new Bullet(this.playerX, this.playerY - PLAYER_H / 2, 0, -200, dmg, WEAPONS.missile.color, false, true, 5)
    );
  }

  _updateEnemies(dt) {
    for (const e of this.enemies) {
      e.update(dt);

      // Keep enemies on screen (push center point away from edges)
      if (e.x < 10) e.centerX += 2;
      if (e.x > this.width - 10) e.centerX -= 2;
      if (e.y < 10) e.centerY += 2;
      if (e.y > this.height - 60) e.centerY -= 2;

      // Enemy shooting
      if (e.isBoss && e instanceof BossEnemy) {
        // Boss: spread shot
        if (e.spreadFireTimer <= 0 && !e.shieldPhase) {
          this._bossSpreadFire(e);
          e.spreadFireTimer = 1.5;
        }
      } else {
        // Regular enemies fire randomly
        if (Math.random() < e.fireRate * (1 + this.wave * 0.1)) {
          this._enemyFire(e);
        }
      }
    }
    this.enemies = this.enemies.filter((e) => e.alive);
  }

  _enemyFire(enemy) {
    // Fire towards player
    const dx = this.playerX - enemy.x;
    const dy = this.playerY - enemy.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    const speed = 200 + this.wave * 5;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    this.enemyBullets.push(new Bullet(enemy.x, enemy.y, vx, vy, 1, '#f44', false, false, 3));
  }

  _bossSpreadFire(boss) {
    const count = 5 + Math.floor(this.wave / 5);
    const speed = 180;
    const divisor = count > 1 ? count - 1 : 1;
    for (let i = 0; i < count; i++) {
      // Spread downward across a 0.8*PI arc centered at PI/2 (straight down)
      const angle = Math.PI / 2 - (Math.PI * 0.4) + (i / divisor) * (Math.PI * 0.8);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      this.enemyBullets.push(new Bullet(boss.x, boss.y + 20, vx, vy, 2, '#f88', false, false, 4));
    }
  }

  _updatePlayerBullets(dt) {
    for (const b of this.playerBullets) {
      b.update(dt, this.enemies);
    }
    this.playerBullets = this.playerBullets.filter((b) => b.alive);
  }

  _updateEnemyBullets(dt) {
    for (const b of this.enemyBullets) {
      b.update(dt);
    }
    this.enemyBullets = this.enemyBullets.filter((b) => b.alive);
  }

  _updatePowerUps(dt) {
    for (const p of this.powerUps) {
      p.update(dt);
    }
    this.powerUps = this.powerUps.filter((p) => p.alive);
  }

  _updateLaser(dt) {
    if (!this.laserActive) return;

    // Laser damages all enemies in its path
    const laserRect = this.laser.getRect();
    for (const e of this.enemies) {
      const eRect = e.getRect();
      if (this._rectsOverlap(laserRect, eRect)) {
        const dmg = this.laser.damage * this.weaponLevel * dt;
        const killed = e.takeDamage(dmg);
        if (killed) {
          this._onEnemyKilled(e);
        }
      }
    }
  }

  _regenerateShield(dt) {
    if (this.shield < MAX_SHIELD) {
      this.shield = Math.min(MAX_SHIELD, this.shield + SHIELD_REGEN_PER_SEC * dt);
    }
  }

  _checkCollisions(dt) {
    // Player bullets vs enemies
    for (const b of this.playerBullets) {
      if (!b.alive) continue;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (this._circlesOverlap(b.x, b.y, b.radius, e.x, e.y, e.drawRadius)) {
          const killed = e.takeDamage(b.damage);
          if (killed) {
            this._onEnemyKilled(e);
          }
          if (!b.piercing) {
            b.alive = false;
          }
          break; // non-piercing hits one enemy
        }
      }
    }

    // Enemy bullets vs player
    if (this.invincibleTimer <= 0) {
      for (const b of this.enemyBullets) {
        if (!b.alive) continue;
        if (this._circleRectOverlap(b.x, b.y, b.radius,
          this.playerX - PLAYER_W / 2, this.playerY - PLAYER_H / 2, PLAYER_W, PLAYER_H)) {
          b.alive = false;
          this._playerHit(b.damage);
        }
      }
    }

    // Enemy body vs player
    if (this.invincibleTimer <= 0) {
      for (const e of this.enemies) {
        if (!e.alive) continue;
        if (this._circleRectOverlap(e.x, e.y, e.drawRadius,
          this.playerX - PLAYER_W / 2, this.playerY - PLAYER_H / 2, PLAYER_W, PLAYER_H)) {
          this._playerHit(20);
        }
      }
    }

    // Power-ups vs player
    for (const p of this.powerUps) {
      if (!p.alive) continue;
      if (this._circleRectOverlap(p.x, p.y, p.radius,
        this.playerX - PLAYER_W / 2, this.playerY - PLAYER_H / 2, PLAYER_W, PLAYER_H)) {
        this._collectPowerUp(p);
        p.alive = false;
      }
    }
  }

  _onEnemyKilled(enemy) {
    // Score: wave_number * enemy_type_multiplier
    const multiplier = enemy.isBoss ? 500 : enemy.points;
    this.score += this.wave * multiplier;

    // Power-up drop
    if (enemy.isBoss) {
      // Boss always drops a weapon upgrade
      const weaponTypes = ['spread', 'charge', 'laser', 'missile'];
      const dropType = weaponTypes[Math.floor(Math.random() * weaponTypes.length)];
      this.powerUps.push(new PowerUp(enemy.x, enemy.y, dropType));
    } else if (Math.random() < POWERUP_DROP_CHANCE) {
      const types = ['spread', 'charge', 'laser', 'missile', 'shield'];
      const dropType = types[Math.floor(Math.random() * types.length)];
      this.powerUps.push(new PowerUp(enemy.x, enemy.y, dropType));
    }
  }

  _playerHit(damage) {
    if (this.invincibleTimer > 0) return;

    if (this.shield > 0) {
      this.shield -= damage * 10;
      if (this.shield < 0) this.shield = 0;
    } else {
      this.lives--;
      this.invincibleTimer = 2; // 2 seconds of invincibility
      if (this.lives <= 0) {
        this.lives = 0;
        this.gameOver = true;
      }
    }
  }

  _collectPowerUp(powerUp) {
    if (powerUp.type === 'shield') {
      // Shield refill
      this.shield = Math.min(MAX_SHIELD, this.shield + 30 * this.weaponLevel);
      return;
    }

    // Weapon power-up
    if (this.weapon === powerUp.type) {
      // Same weapon type: stack (upgrade level)
      this.weaponLevel = Math.min(3, this.weaponLevel + 1);
    } else {
      // Different weapon: switch
      this.weapon = powerUp.type;
      this.weaponLevel = 1;
    }
    this.chargeTime = 0;
    this.laserActive = false;
    this.laser.active = false;
    this.laserCharge = 100;
  }

  // ── Collision helpers ─────────────────────────────────────────────────────
  _circlesOverlap(x1, y1, r1, x2, y2, r2) {
    const d = Math.hypot(x2 - x1, y2 - y1);
    return d < r1 + r2;
  }

  _circleRectOverlap(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < (cr * cr);
  }

  _rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ── Accessors for HUD ────────────────────────────────────────────────────
  getState() {
    return {
      score: this.score,
      wave: this.wave,
      lives: this.lives,
      shield: Math.round(this.shield),
      weapon: this.weapon,
      weaponLevel: this.weaponLevel,
      gameOver: this.gameOver,
      enemyCount: this.enemies.length,
      chargeTime: this.chargeTime,
      laserCharge: this.laserCharge,
      laserActive: this.laserActive,
    };
  }
}

// ── Renderer (Canvas) ───────────────────────────────────────────────────────
class AsteroidDefenseRenderer {
  constructor(canvas, overlay, hud) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.overlay = overlay;
    this.hud = hud;
    this.engine = new GameEngine(canvas.width, canvas.height);
    this._rafId = null;
    this._lastTime = 0;
    this._running = false;

    this.highScore = parseInt(localStorage.getItem('asteroidDefenseHighScore') ?? '0', 10);

    this._bindKeys();
  }

  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (!this._running) return;
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A':
          this.engine.keys.left = true;
          e.preventDefault();
          break;
        case 'ArrowRight': case 'd': case 'D':
          this.engine.keys.right = true;
          e.preventDefault();
          break;
        case ' ':
          this.engine.keys.fire = true;
          e.preventDefault();
          break;
      }
    });

    document.addEventListener('keyup', (e) => {
      switch (e.key) {
        case 'ArrowLeft': case 'a': case 'A':
          this.engine.keys.left = false;
          break;
        case 'ArrowRight': case 'd': case 'D':
          this.engine.keys.right = false;
          break;
        case ' ':
          this.engine.keys.fire = false;
          break;
      }
    });
  }

  start() {
    this.engine.reset();
    this._running = true;
    this._lastTime = performance.now();
    this.overlay.style.display = 'none';
    this._loop(this._lastTime);
  }

  _loop(ts) {
    if (!this._running) return;

    const dt = Math.min((ts - this._lastTime) / 1000, 0.05); // cap at 50ms
    this._lastTime = ts;

    this.engine.update(dt);
    this._draw();
    this._updateHUD();

    if (this.engine.gameOver) {
      this._endGame();
      return;
    }

    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  _endGame() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);

    const state = this.engine.getState();

    if (state.score > this.highScore) {
      this.highScore = state.score;
      localStorage.setItem('asteroidDefenseHighScore', String(this.highScore));
    }

    // Submit score
    fetch('/api/scores/space-invaders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ score: state.score }),
    }).catch(() => {});

    this._showGameOver(state);
  }

  _showGameOver(state) {
    const ov = this.overlay;
    ov.innerHTML = '';

    const h2 = document.createElement('h2');
    h2.textContent = 'GAME OVER';

    const p = document.createElement('p');
    p.textContent = `Score: ${state.score}  |  Wave: ${state.wave}  |  Best: ${this.highScore}`;

    const btn = document.createElement('button');
    btn.textContent = 'PLAY AGAIN';
    btn.addEventListener('click', () => {
      this.start();
    });

    ov.appendChild(h2);
    ov.appendChild(p);
    ov.appendChild(btn);
    ov.style.display = 'flex';
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
  _draw() {
    const ctx = this.ctx;
    const e = this.engine;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background: dark space
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Stars
    this._drawStars(ctx);

    // Enemies
    for (const enemy of e.enemies) {
      this._drawEnemy(ctx, enemy);
    }

    // Player bullets
    for (const b of e.playerBullets) {
      this._drawBullet(ctx, b);
    }

    // Enemy bullets
    for (const b of e.enemyBullets) {
      this._drawBullet(ctx, b);
    }

    // Laser
    if (e.laserActive) {
      this._drawLaser(ctx, e.laser);
    }

    // Power-ups
    for (const p of e.powerUps) {
      this._drawPowerUp(ctx, p);
    }

    // Player
    this._drawPlayer(ctx, e);

    // Shield bar
    this._drawShieldBar(ctx, e);

    // Charge indicator
    if (e.weapon === 'charge' && e.chargeTime > 0) {
      this._drawChargeIndicator(ctx, e);
    }

    // Laser charge meter
    if (e.weapon === 'laser') {
      this._drawLaserMeter(ctx, e);
    }
  }

  _drawStars(ctx) {
    // Deterministic stars based on time
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 50; i++) {
      const x = ((i * 137.5) % CANVAS_W);
      const y = ((i * 73.1 + this._lastTime * 0.005 * (0.5 + (i % 3) * 0.3)) % CANVAS_H);
      const s = 1 + (i % 3);
      ctx.fillRect(x, y, s, s);
    }
  }

  _drawEnemy(ctx, enemy) {
    ctx.save();
    if (enemy.isBoss) {
      // Boss: larger, with glow
      ctx.shadowColor = enemy.shieldPhase ? '#08f' : '#f00';
      ctx.shadowBlur = 20;

      if (enemy.shieldPhase) {
        // Shield visual
        ctx.strokeStyle = '#08f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.drawRadius + 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = enemy.shieldPhase ? '#448' : '#f00';
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.drawRadius, 0, Math.PI * 2);
      ctx.fill();

      // Boss HP bar
      const barW = enemy.drawRadius * 2;
      const barH = 4;
      const hpPct = enemy.hp / enemy.maxHp;
      ctx.fillStyle = '#300';
      ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.drawRadius - 10, barW, barH);
      ctx.fillStyle = '#f00';
      ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.drawRadius - 10, barW * hpPct, barH);
    } else {
      // Regular enemy
      ctx.shadowColor = enemy.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = enemy.color;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.drawRadius, 0, Math.PI * 2);
      ctx.fill();

      // Orbit trail hint (faint)
      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = enemy.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(enemy.centerX, enemy.centerY, enemy.radiusX, enemy.radiusY, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawBullet(ctx, bullet) {
    ctx.save();
    ctx.shadowColor = bullet.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  _drawLaser(ctx, laser) {
    ctx.save();
    const grad = ctx.createLinearGradient(laser.x, 0, laser.x, laser.y);
    grad.addColorStop(0, 'rgba(0,255,128,0.1)');
    grad.addColorStop(1, 'rgba(0,255,128,0.9)');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#0f8';
    ctx.shadowBlur = 20;
    const w = laser.width + this.engine.weaponLevel * 2;
    ctx.fillRect(laser.x - w / 2, 0, w, laser.y);
    ctx.restore();
  }

  _drawPowerUp(ctx, powerUp) {
    ctx.save();
    const pulse = Math.sin(this._lastTime / 200) * 0.3 + 0.7;
    ctx.shadowColor = powerUp.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = powerUp.color;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(powerUp.x, powerUp.y, powerUp.radius * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.globalAlpha = 0.8;
    ctx.font = '8px Courier New';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(powerUp.type.toUpperCase(), powerUp.x, powerUp.y + powerUp.radius + 10);
    ctx.restore();
  }

  _drawPlayer(ctx, engine) {
    ctx.save();
    const px = engine.playerX;
    const py = engine.playerY;

    // Invincibility blink
    if (engine.invincibleTimer > 0 && Math.floor(this._lastTime / 100) % 2 === 0) {
      ctx.globalAlpha = 0.3;
    }

    // Ship body
    ctx.shadowColor = WEAPONS[engine.weapon].color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = WEAPONS[engine.weapon].color;

    ctx.beginPath();
    ctx.moveTo(px, py - PLAYER_H);
    ctx.lineTo(px - PLAYER_W / 2, py);
    ctx.lineTo(px + PLAYER_W / 2, py);
    ctx.closePath();
    ctx.fill();

    // Cockpit
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(px, py - PLAYER_H / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  _drawShieldBar(ctx, engine) {
    const barW = 100;
    const barH = 6;
    const x = 10;
    const y = CANVAS_H - 15;
    const pct = engine.shield / MAX_SHIELD;

    ctx.save();
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, barW, barH);
    ctx.fillStyle = pct > 0.3 ? '#0af' : '#f44';
    ctx.fillRect(x, y, barW * pct, barH);
    ctx.strokeStyle = '#0af';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, barW, barH);
    ctx.restore();
  }

  _drawChargeIndicator(ctx, engine) {
    const pct = Math.min(engine.chargeTime / 2, 1);
    const x = engine.playerX;
    const y = engine.playerY + 15;
    const w = 30;

    ctx.save();
    ctx.fillStyle = '#333';
    ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = pct >= 1 ? '#ff0' : '#f80';
    ctx.fillRect(x - w / 2, y, w * pct, 4);
    ctx.restore();
  }

  _drawLaserMeter(ctx, engine) {
    const pct = engine.laserCharge / 100;
    const x = engine.playerX;
    const y = engine.playerY + 15;
    const w = 30;

    ctx.save();
    ctx.fillStyle = '#333';
    ctx.fillRect(x - w / 2, y, w, 4);
    ctx.fillStyle = '#0f8';
    ctx.fillRect(x - w / 2, y, w * pct, 4);
    ctx.restore();
  }

  _updateHUD() {
    const state = this.engine.getState();
    this.hud.score.textContent = state.score;
    this.hud.wave.textContent = state.wave;
    this.hud.shield.textContent = state.shield;
    this.hud.weapon.textContent = `${WEAPONS[state.weapon].label}${state.weaponLevel > 1 ? ' Lv' + state.weaponLevel : ''}`;

    // Lives as stars
    let livesStr = '';
    for (let i = 0; i < state.lives; i++) livesStr += '\u2733';
    this.hud.lives.textContent = livesStr || '\u2717';
  }
}

// ── Bootstrap ───────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');

const hud = {
  score: document.getElementById('score'),
  wave: document.getElementById('wave'),
  lives: document.getElementById('lives'),
  shield: document.getElementById('shield'),
  weapon: document.getElementById('weapon'),
};

const renderer = new AsteroidDefenseRenderer(canvas, overlay, hud);

startBtn.addEventListener('click', () => {
  renderer.start();
});

// Export for testing (Node.js environment detection)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GameEngine,
    OrbitalEnemy,
    BossEnemy,
    Bullet,
    LaserBeam,
    PowerUp,
    Vector2,
    ENEMY_TYPES,
    WEAPONS,
    WEAPON_ORDER,
    CANVAS_W,
    CANVAS_H,
    POWERUP_DROP_CHANCE,
    BOSS_WAVE_INTERVAL,
    MAX_LIVES,
    MAX_SHIELD,
    SHIELD_REGEN_PER_SEC,
  };
}
