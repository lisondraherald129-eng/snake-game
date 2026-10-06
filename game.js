// ============================================================
//  REALISTIC SNAKE GAME
//  Smooth movement • Particles • Sound • Day/night • Levels
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const startBtn = document.getElementById('startBtn');
const speedFill = document.getElementById('speedFill');
const dayIndicator = document.getElementById('dayIndicator');

// ---------- CONFIG ----------
const GRID = 25;
const CELL = canvas.width / GRID;

// ---------- STATE ----------
let snake, direction, nextDirection, food, score, highScore, level;
let speed, baseSpeed, obstacles, particles, leaves, timeOfDay;
let isRunning = false, isPaused = false, isDead = false;
let gameLoop, lastTick, tickInterval;
let wrapMode = false;
let tongueTimer = 0;
let deathProgress = 0;

// Smooth interpolation state
let renderSnake = [];      // interpolated positions
let prevSnake = [];        // previous positions
let tickProgress = 0;      // 0..1 between ticks

highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
highScoreEl.textContent = highScore;

// ---------- AUDIO (Web Audio API — no files) ----------
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) { audioCtx = null; }
    }
}

function playTone(freq, duration, type = 'sine', volume = 0.15) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function soundEat() {
    playTone(880, 0.08, 'triangle', 0.2);
    setTimeout(() => playTone(1320, 0.08, 'triangle', 0.15), 60);
}

function soundBonus() {
    playTone(660, 0.1, 'sine', 0.2);
    setTimeout(() => playTone(880, 0.1, 'sine', 0.2), 80);
    setTimeout(() => playTone(1320, 0.15, 'sine', 0.2), 160);
}

function soundRotten() {
    playTone(180, 0.2, 'sawtooth', 0.12);
}

function soundDeath() {
    playTone(220, 0.15, 'sawtooth', 0.2);
    setTimeout(() => playTone(160, 0.2, 'sawtooth', 0.18), 120);
    setTimeout(() => playTone(110, 0.35, 'sawtooth', 0.15), 280);
}

function soundTurn() {
    playTone(500, 0.03, 'square', 0.05);
}

// ---------- INIT ----------
function initGame() {
    snake = [
        { x: 12, y: 12 },
        { x: 11, y: 12 },
        { x: 10, y: 12 }
    ];
    prevSnake = snake.map(s => ({ ...s }));
    renderSnake = snake.map(s => ({ ...s }));
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    level = 1;
    baseSpeed = 140;
    speed = baseSpeed;
    tickInterval = speed;
    obstacles = [];
    particles = [];
    leaves = spawnLeaves();
    timeOfDay = 0;
    tongueTimer = 0;
    deathProgress = 0;
    isDead = false;
    scoreEl.textContent = 0;
    levelEl.textContent = 1;
    updateSpeedMeter();
    spawnFood();
}

function spawnLeaves() {
    const arr = [];
    for (let i = 0; i < 8; i++) {
        arr.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: 3 + Math.random() * 4,
            speedY: 0.2 + Math.random() * 0.4,
            speedX: -0.2 + Math.random() * 0.4,
            rot: Math.random() * Math.PI * 2,
            rotSpeed: (-0.02 + Math.random() * 0.04),
            alpha: 0.3 + Math.random() * 0.4
        });
    }
    return arr;
}

// ---------- FOOD ----------
function spawnFood() {
    let type = 'normal';
    const r = Math.random();
    if (r < 0.08) type = 'golden';
    else if (r < 0.13) type = 'rotten';

    do {
        food = {
            x: Math.floor(Math.random() * GRID),
            y: Math.floor(Math.random() * GRID),
            type,
            spawnTime: Date.now()
        };
    } while (
        snake.some(s => s.x === food.x && s.y === food.y) ||
        obstacles.some(o => o.x === food.x && o.y === food.y)
    );
}

// ---------- OBSTACLES (appear as level increases) ----------
function spawnObstacle() {
    let attempts = 0;
    while (attempts < 50) {
        const o = {
            x: Math.floor(Math.random() * GRID),
            y: Math.floor(Math.random() * GRID)
        };
        const nearHead = Math.abs(o.x - snake[0].x) + Math.abs(o.y - snake[0].y) < 3;
        const onSnake = snake.some(s => s.x === o.x && s.y === o.y);
        const onFood = food && food.x === o.x && food.y === o.y;
        const onObstacle = obstacles.some(x => x.x === o.x && x.y === o.y);
        if (!nearHead && !onSnake && !onFood && !onObstacle) {
            obstacles.push(o);
            return;
        }
        attempts++;
    }
}

// ---------- PARTICLES ----------
function burstParticles(x, y, color, count = 14) {
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 1 + Math.random() * 3;
        particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 1,
            color,
            size: 2 + Math.random() * 3
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life -= 0.025;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

// ---------- GAME LOOP ----------
function tick() {
    if (!isRunning || isPaused || isDead) return;

    prevSnake = snake.map(s => ({ ...s }));
    direction = nextDirection;

    const head = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y
    };

    // Wraparound
    if (wrapMode) {
        head.x = (head.x + GRID) % GRID;
        head.y = (head.y + GRID) % GRID;
    } else {
        if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
            return die();
        }
    }

    // Self collision (skip tail which is about to move)
    if (snake.slice(0, -1).some(s => s.x === head.x && s.y === head.y)) {
        return die();
    }

    // Obstacle collision
    if (obstacles.some(o => o.x === head.x && o.y === head.y)) {
        return die();
    }

    snake.unshift(head);

    // Eat?
    if (food && head.x === food.x && head.y === food.y) {
        const cx = food.x * CELL + CELL / 2;
        const cy = food.y * CELL + CELL / 2;

        if (food.type === 'golden') {
            score += 30;
            burstParticles(cx, cy, '#fbbf24', 24);
            soundBonus();
        } else if (food.type === 'rotten') {
            score = Math.max(0, score - 5);
            // Shrink by 2 (only if long enough)
            if (snake.length > 3) snake.pop();
            if (snake.length > 3) snake.pop();
            burstParticles(cx, cy, '#78350f', 18);
            soundRotten();
        } else {
            score += 10;
            burstParticles(cx, cy, '#ef4444', 16);
            soundEat();
        }

        scoreEl.textContent = score;

        if (score > highScore) {
            highScore = score;
            highScoreEl.textContent = highScore;
            localStorage.setItem('snakeHighScore', highScore);
        }

        // Level up every 50 points
        const newLevel = Math.floor(score / 50) + 1;
        if (newLevel > level) {
            level = newLevel;
            levelEl.textContent = level;
            // Speed up
            baseSpeed = Math.max(70, 140 - (level - 1) * 8);
            tickInterval = baseSpeed;
            // Add an obstacle
            spawnObstacle();
        }

        // Slight speed ramp for each food
        tickInterval = Math.max(65, tickInterval - 2);
        restartLoop();

        spawnFood();
    } else {
        snake.pop();
    }

    // Update HUD meter
    updateSpeedMeter();

    // Sound when changing direction (handled in input)
}

function restartLoop() {
    clearInterval(gameLoop);
    gameLoop = setInterval(tick, tickInterval);
}

// ---------- DEATH ----------
function die() {
    isDead = true;
    deathProgress = 0;
    clearInterval(gameLoop);
    soundDeath();

    // Burst at head
    const hx = snake[0].x * CELL + CELL / 2;
    const hy = snake[0].y * CELL + CELL / 2;
    burstParticles(hx, hy, '#ef4444', 30);

    // Death animation
    animateDeath();
}

function animateDeath() {
    deathProgress += 0.02;
    if (deathProgress < 1) {
        requestAnimationFrame(() => {
            updateParticles();
            draw();
            animateDeath();
        });
    } else {
        overlayTitle.textContent = '💀 Game Over';
        overlayText.textContent = `Final Score: ${score} • Level ${level}`;
        startBtn.textContent = 'Play Again';
        overlay.classList.remove('hidden');
    }
}

// ---------- DRAWING ----------
function draw() {
    // Background — day/night gradient
    const dayPhase = (Math.sin(timeOfDay) + 1) / 2; // 0..1
    const topCol = mixColor([10, 26, 13], [40, 80, 50], dayPhase);
    const botCol = mixColor([5, 10, 6], [20, 40, 25], dayPhase);
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, `rgb(${topCol.join(',')})`);
    grad.addColorStop(1, `rgb(${botCol.join(',')})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grass texture (subtle blades)
    ctx.strokeStyle = `rgba(74, 222, 128, ${0.04 + dayPhase * 0.05})`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 60; i++) {
        const gx = (i * 47) % canvas.width;
        const gy = (i * 71) % canvas.height;
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(gx + 1, gy - 4);
        ctx.stroke();
    }

    // Falling leaves
    leaves.forEach(l => {
        l.x += l.speedX;
        l.y += l.speedY;
        l.rot += l.rotSpeed;
        if (l.y > canvas.height + 10) {
            l.y = -10;
            l.x = Math.random() * canvas.width;
        }
        if (l.x < -10) l.x = canvas.width + 10;
        if (l.x > canvas.width + 10) l.x = -10;

        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.rot);
        ctx.fillStyle = `rgba(120, 180, 90, ${l.alpha})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, l.size, l.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    });

    // Grid
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 1; i < GRID; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL, 0);
        ctx.lineTo(i * CELL, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * CELL);
        ctx.lineTo(canvas.width, i * CELL);
        ctx.stroke();
    }

    // Obstacles (rocks)
    obstacles.forEach(o => {
        const x = o.x * CELL + CELL / 2;
        const y = o.y * CELL + CELL / 2;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath();
        ctx.ellipse(x + 2, y + 3, CELL * 0.42, CELL * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        const rockGrad = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, CELL * 0.5);
        rockGrad.addColorStop(0, '#6b7280');
        rockGrad.addColorStop(1, '#374151');
        ctx.fillStyle = rockGrad;
        ctx.beginPath();
        ctx.arc(x, y, CELL * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // Speckles
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.arc(x + 4, y + 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - 5, y - 3, 1, 0, Math.PI * 2);
        ctx.fill();
    });

    // Food
    if (food) drawFood();

    // Snake
    drawSnake();

    // Particles
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Death flash overlay
    if (isDead && deathProgress < 1) {
        ctx.fillStyle = `rgba(239, 68, 68, ${0.3 * (1 - deathProgress)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

function drawFood() {
    const fx = food.x * CELL + CELL / 2;
    const fy = food.y * CELL + CELL / 2;
    const pulse = 1 + Math.sin(Date.now() / 180) * 0.12;
    const bob = Math.sin(Date.now() / 250) * 1.5;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(fx + 2, fy + CELL * 0.4, CELL * 0.35, CELL * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    if (food.type === 'golden') {
        ctx.shadowColor = '#fbbf24';
        ctx.shadowBlur = 25;
        const g = ctx.createRadialGradient(fx - 3, fy - 3, 1, fx, fy, CELL * 0.45);
        g.addColorStop(0, '#fef3c7');
        g.addColorStop(0.5, '#fbbf24');
        g.addColorStop(1, '#b45309');
        ctx.fillStyle = g;
    } else if (food.type === 'rotten') {
        ctx.shadowColor = '#78350f';
        ctx.shadowBlur = 12;
        const g = ctx.createRadialGradient(fx - 3, fy - 3, 1, fx, fy, CELL * 0.45);
        g.addColorStop(0, '#a16207');
        g.addColorStop(1, '#451a03');
        ctx.fillStyle = g;
    } else {
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 18;
        const g = ctx.createRadialGradient(fx - 3, fy - 3, 1, fx, fy, CELL * 0.45);
        g.addColorStop(0, '#fca5a5');
        g.addColorStop(0.5, '#ef4444');
        g.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = g;
    }

    ctx.beginPath();
    ctx.arc(fx, fy + bob, (CELL * 0.36) * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Stem
    ctx.strokeStyle = '#4d2b12';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy + bob - CELL * 0.32);
    ctx.lineTo(fx + 1, fy + bob - CELL * 0.48);
    ctx.stroke();

    // Leaf
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(fx + 4, fy + bob - CELL * 0.44, 4, 2.5, -0.4, 0, Math.PI * 2);
    ctx.fill();

    // Highlight
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(fx - 3, fy + bob - 3, 2, 0, Math.PI * 2);
    ctx.fill();
}

function drawSnake() {
    const N = snake.length;

    // Interpolated positions
    const t = Math.min(1, tickProgress);
    const positions = [];
    for (let i = 0; i < N; i++) {
        const cur = snake[i];
        const prev = prevSnake[i] || cur;
        // Only interpolate if segment moved (wrap-aware)
        let dx = cur.x - prev.x;
        let dy = cur.y - prev.y;
        if (wrapMode) {
            if (dx > 1) dx = -1;
            if (dx < -1) dx = 1;
            if (dy > 1) dy = -1;
            if (dy < -1) dy = 1;
        }
        positions.push({
            x: (prev.x + dx * t) * CELL,
            y: (prev.y + dy * t) * CELL
        });
    }

    // Death animation: curl and fade
    let deathAlpha = 1;
    let curlFactor = 0;
    if (isDead) {
        deathAlpha = Math.max(0, 1 - deathProgress);
        curlFactor = deathProgress * 0.6;
    }

    // Ground shadow
    ctx.fillStyle = `rgba(0,0,0,${0.3 * deathAlpha})`;
    positions.forEach((p, i) => {
        const size = (CELL * 0.42) * (1 - (i / N) * 0.35);
        ctx.beginPath();
        ctx.ellipse(p.x + CELL / 2 + 2, p.y + CELL / 2 + 4, size, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
    });

    // Body (draw back to front so head is on top)
    for (let i = N - 1; i >= 0; i--) {
        const p = positions[i];
        const taperFactor = 1 - (i / N) * 0.5; // tail is thinner
        const size = CELL * 0.42 * taperFactor;

        // Body wave
        const wave = Math.sin(Date.now() / 150 - i * 0.6) * 1.5 * (1 - i / N);

        const cx = p.x + CELL / 2 + wave * curlFactor;
        const cy = p.y + CELL / 2 + Math.cos(Date.now() / 150 - i * 0.6) * curlFactor * 2;

        ctx.globalAlpha = deathAlpha;

        if (i === 0) {
            // Head — brighter, glowing
            ctx.shadowColor = '#4ade80';
            ctx.shadowBlur = 15;
            const hg = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, size * 1.2);
            hg.addColorStop(0, '#bbf7d0');
            hg.addColorStop(0.5, '#4ade80');
            hg.addColorStop(1, '#166534');
            ctx.fillStyle = hg;
        } else {
            ctx.shadowBlur = 0;
            const shade = 0.7 - (i / N) * 0.4;
            const g = ctx.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, size * 1.1);
            g.addColorStop(0, `rgba(190, 240, 200, ${shade + 0.2})`);
            g.addColorStop(0.6, `rgba(74, 222, 128, ${shade})`);
            g.addColorStop(1, `rgba(22, 101, 52, ${shade + 0.1})`);
            ctx.fillStyle = g;
        }

        // Body segment
        ctx.beginPath();
        ctx.ellipse(cx, cy, size, size * 0.95, 0, 0, Math.PI * 2);
        ctx.fill();

        // Scale dots
        if (i > 0 && i % 2 === 0) {
            ctx.fillStyle = 'rgba(0, 60, 20, 0.35)';
            ctx.beginPath();
            ctx.arc(cx - size * 0.2, cy - size * 0.2, size * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Head details: eyes + tongue
    if (N > 0) {
        const hp = positions[0];
        const cx = hp.x + CELL / 2;
        const cy = hp.y + CELL / 2;
        const size = CELL * 0.42;

        // Eyes (blink occasionally)
        const blink = (Math.floor(Date.now() / 3000) % 2 === 0)
            ? (Date.now() % 3000 < 120 ? 0.1 : 1)
            : 1;

        let eye1, eye2;
        const off = CELL * 0.18;
        if (direction.x === 1) {
            eye1 = { x: cx + off, y: cy - off };
            eye2 = { x: cx + off, y: cy + off };
        } else if (direction.x === -1) {
            eye1 = { x: cx - off, y: cy - off };
            eye2 = { x: cx - off, y: cy + off };
        } else if (direction.y === 1) {
            eye1 = { x: cx - off, y: cy + off };
            eye2 = { x: cx + off, y: cy + off };
        } else {
            eye1 = { x: cx - off, y: cy - off };
            eye2 = { x: cx + off, y: cy - off };
        }

        // Eye whites
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.ellipse(eye1.x, eye1.y, 3.5, 3.5 * blink, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(eye2.x, eye2.y, 3.5, 3.5 * blink, 0, 0, Math.PI * 2);
        ctx.fill();

        // Pupils (follow direction)
        if (blink > 0.5) {
            ctx.fillStyle = '#0a1a0d';
            const px = direction.x * 1.2;
            const py = direction.y * 1.2;
            ctx.beginPath();
            ctx.arc(eye1.x + px, eye1.y + py, 1.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(eye2.x + px, eye2.y + py, 1.8, 0, Math.PI * 2);
            ctx.fill();
        }

        // Tongue (flicks every ~1.5s)
        tongueTimer += 1;
        if (tongueTimer % 90 < 15 && !isDead) {
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            const tx = cx + direction.x * (size + 4);
            const ty = cy + direction.y * (size + 4);
            const forkX = direction.x * 4;
            const forkY = direction.y * 4;

            ctx.beginPath();
            ctx.moveTo(cx + direction.x * size * 0.8, cy + direction.y * size * 0.8);
            ctx.lineTo(tx, ty);
            ctx.stroke();

            // Fork
            ctx.beginPath();
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + forkX * 0.5 - direction.y * 3, ty + forkY * 0.5 - direction.x * 3);
            ctx.moveTo(tx, ty);
            ctx.lineTo(tx + forkX * 0.5 + direction.y * 3, ty + forkY * 0.5 + direction.x * 3);
            ctx.stroke();
        }
    }

    ctx.globalAlpha = 1;
}

// ---------- COLOR UTIL ----------
function mixColor(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t)
    ];
}

// ---------- HUD ----------
function updateSpeedMeter() {
    const pct = Math.max(0, Math.min(100,
        ((140 - tickInterval) / (140 - 65)) * 100
    ));
    speedFill.style.width = pct + '%';
}

// ---------- START / PAUSE ----------
function startGame() {
    initAudio();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    initGame();
    overlay.classList.add('hidden');
    isRunning = true;
    isPaused = false;
    lastTick = performance.now();
    restartLoop();
    requestAnimationFrame(renderLoop);
}

function togglePause() {
    if (!isRunning || isDead) return;
    isPaused = !isPaused;
    if (isPaused) {
        overlayTitle.textContent = '⏸️ Paused';
        overlayText.textContent = 'Press Space to resume';
        startBtn.textContent = 'Resume';
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// ---------- RENDER LOOP ----------
function renderLoop() {
    if (!isRunning) { draw(); return; }

    // Update tick progress for smooth movement
    const now = performance.now();
    tickProgress = Math.min(1, (now - lastTick) / tickInterval);

    // Time of day — 30 second cycle
    timeOfDay += 0.002;
    const dayPhase = (Math.sin(timeOfDay) + 1) / 2;
    dayIndicator.textContent = dayPhase > 0.5 ? '☀️' : '🌙';

    updateParticles();
    draw();

    requestAnimationFrame(renderLoop);
}

// ---------- INPUT ----------
let tickReset = false;

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault();
    }

    let changed = false;

    if ((key === 'arrowup' || key === 'w') && direction.y === 0) {
        nextDirection = { x: 0, y: -1 };
        changed = true;
    } else if ((key === 'arrowdown' || key === 's') && direction.y === 0) {
        nextDirection = { x: 0, y: 1 };
        changed = true;
    } else if ((key === 'arrowleft' || key === 'a') && direction.x === 0) {
        nextDirection = { x: -1, y: 0 };
        changed = true;
    } else if ((key === 'arrowright' || key === 'd') && direction.x === 0) {
        nextDirection = { x: 1, y: 0 };
        changed = true;
    } else if (key === ' ') {
        togglePause();
        return;
    } else if (key === 'r') {
        startGame();
        return;
    } else if (key === 'q') {
        wrapMode = !wrapMode;
        return;
    }

    if (changed) {
        soundTurn();
        lastTick = performance.now();
        tickProgress = 0;
    }
});

// Mobile buttons
document.querySelectorAll('.mob-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const dir = btn.dataset.dir;
        let changed = false;
        if (dir === 'up' && direction.y === 0) { nextDirection = { x: 0, y: -1 }; changed = true; }
        if (dir === 'down' && direction.y === 0) { nextDirection = { x: 0, y: 1 }; changed = true; }
        if (dir === 'left' && direction.x === 0) { nextDirection = { x: -1, y: 0 }; changed = true; }
        if (dir === 'right' && direction.x === 0) { nextDirection = { x: 1, y: 0 }; changed = true; }
        if (changed) { soundTurn(); lastTick = performance.now(); tickProgress = 0; }
    });
});

startBtn.addEventListener('click', () => {
    if (isPaused) togglePause();
    else startGame();
});

// ---------- INITIAL RENDER ----------
initGame();
draw();