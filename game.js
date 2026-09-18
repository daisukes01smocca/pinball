(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  const ui = {
    score: document.getElementById('score'),
    highScore: document.getElementById('highScore'),
    balls: document.getElementById('balls'),
    multiplier: document.getElementById('multiplier'),
    message: document.getElementById('message'),
    start: document.getElementById('startBtn'),
    pause: document.getElementById('pauseBtn'),
    table: document.getElementById('tableSelect'),
    sound: document.getElementById('soundBtn'),
    left: document.getElementById('leftBtn'),
    right: document.getElementById('rightBtn'),
    launch: document.getElementById('launchBtn'),
    tableDesc: document.getElementById('tableDesc')
  };

  let running = false;
  let paused = false;
  let lastTime = 0;
  let score = 0;
  let balls = 3;
  let multiplier = 1;
  let bonus = 0;
  let tableKey = 'neon';
  let highScore = Number(localStorage.getItem('pinballHighScore') || 0);
  let shake = 0;
  let zoneCooldown = 0;
  let specialCooldown = 0;
  let lastBounceSound = 0;

  const keys = { left: false, right: false };
  // ボールの存在感をさらに少し強くする。
  // 直径32px -> 36px。LAUNCHレーンとフリッパー間の通過幅は確保する。
  const BALL_R = 18;
  // ボールだけを少しゆっくり動かし、フリッパー操作のレスポンスは維持する。
  const BALL_TIME_SCALE = 0.90;
  const gravity = 610;

  // LAUNCHプランジャー。SPACE / LAUNCH を押している時間に応じて
  // バネが縮み、離した瞬間に発射力へ変換する。
  const LAUNCH_X = 677;
  const LAUNCH_REST_Y = 1010;
  const LAUNCH_PULL = 50;
  const launcher = {
    charging: false,
    chargeStart: 0,
    charge: 0,
    maxChargeMs: 1450
  };

  const ball = {
    x: LAUNCH_X,
    y: LAUNCH_REST_Y,
    vx: 0,
    vy: 0,
    r: BALL_R,
    inLauncher: true,
    enteredField: false,
    topGuideTriggered: false,
    alive: true
  };

  const tables = {
    neon: {
      name: 'NEON CITY',
      description: '高速バウンド＋左右に動くNEON GATE。連続ヒットでテンポ良く得点を狙うスピード台。',
      image: 'assets/neon-city.svg',
      bg1: '#071427', bg2: '#120529', line: '#55f3ff', accent: '#ff45db', bumper: '#ffe05e',
      gravity: 625, wallRestitution: 0.90, bumperBounce: 1.42,
      bumpers: [
        {id:'n-b1', x: 208, y: 328, r: 52, value: 250, shape:'ring'},
        {id:'n-b2', x: 472, y: 286, r: 45, value: 320, shape:'hex'},
        {id:'n-b3', x: 378, y: 515, r: 63, value: 450, shape:'star'}
      ],
      targets: [
        {id:'n-t1', x: 132, y: 610, w: 30, h: 90, value: 180, shape:'capsule'},
        {id:'n-t2', x: 525, y: 665, w: 42, h: 42, value: 220, shape:'diamond'}
      ],
      posts: [{x: 245, y: 760, r: 21}, {x: 470, y: 805, r: 18}, {x: 535, y: 560, r: 15}],
      extraSegments: [
        {id:'n-r1', x1:110, y1:515, x2:182, y2:458, restitution:.94, value:70, boost:45, kind:'rail'},
        {id:'n-r2', x1:548, y1:430, x2:500, y2:500, restitution:.96, value:90, boost:55, kind:'rail'}
      ]
    },
    space: {
      name: 'SPACE ORBIT',
      description: '低重力フィールド。中央のGRAVITY WELLがボールを引き寄せ、軌道が大きく変化するテクニカル台。',
      image: 'assets/space-orbit.svg',
      bg1: '#030715', bg2: '#07133c', line: '#94a5ff', accent: '#72ffba', bumper: '#ff8cff',
      gravity: 500, wallRestitution: 0.85, bumperBounce: 1.18,
      gravityWell: {x:350, y:575, radius:190, strength:760},
      bumpers: [
        {id:'s-b1', x:326, y:292, r:62, value:380, shape:'planet'},
        {id:'s-b2', x:190, y:505, r:43, value:260, shape:'orb'},
        {id:'s-b3', x:514, y:430, r:35, value:300, shape:'satellite'},
        {id:'s-b4', x:428, y:710, r:40, value:220, shape:'moon'}
      ],
      targets: [
        {id:'s-t1', x:108, y:382, w:40, h:48, value:240, shape:'triangle'},
        {id:'s-t2', x:535, y:575, w:44, h:44, value:280, shape:'diamond'}
      ],
      posts: [{x:238, y:790, r:22}, {x:505, y:820, r:18}, {x:548, y:300, r:14}],
      extraSegments: [
        {id:'s-orbitL', x1:145, y1:655, x2:230, y2:714, restitution:.88, value:90, boost:28, kind:'orbit'},
        {id:'s-orbitR', x1:560, y1:740, x2:500, y2:790, restitution:.90, value:110, boost:32, kind:'orbit'}
      ]
    },
    jungle: {
      name: 'JUNGLE RUINS',
      description: '石柱と倒木が多い遺跡台。中央のWATER ZONEではボールが減速するため、フリッパーで立て直す必要あり。',
      image: 'assets/jungle-ruins.svg',
      bg1: '#07180d', bg2: '#173316', line: '#85ff70', accent: '#ffc65e', bumper: '#ffd759',
      gravity: 680, wallRestitution: 0.78, bumperBounce: 1.25,
      waterZone: {x:255, y:610, w:190, h:120},
      bumpers: [
        {id:'j-b1', x:208, y:342, r:58, value:320, shape:'sun'},
        {id:'j-b2', x:486, y:405, r:44, value:340, shape:'flower'},
        {id:'j-b3', x:352, y:548, r:50, value:460, shape:'stone'}
      ],
      targets: [
        {id:'j-t1', x:118, y:565, w:42, h:78, value:260, shape:'totem'},
        {id:'j-t2', x:522, y:645, w:48, h:52, value:300, shape:'crystal'},
        {id:'j-t3', x:292, y:770, w:48, h:48, value:340, shape:'diamond'}
      ],
      posts: [{x:224, y:805, r:25}, {x:465, y:835, r:21}, {x:555, y:545, r:17}],
      extraSegments: [
        {id:'j-logL', x1:102, y1:472, x2:188, y2:526, restitution:.68, value:80, boost:20, kind:'log'},
        {id:'j-stoneR', x1:500, y1:730, x2:558, y2:770, restitution:.74, value:70, boost:14, kind:'stone'}
      ]
    }
  };

  const backgroundImages = {};
  Object.entries(tables).forEach(([key, table]) => {
    const img = new Image();
    img.src = table.image;
    img.onload = () => { if (key === tableKey) draw(); };
    backgroundImages[key] = img;
  });

  const neonGate = {
    id: 'neon-moving-gate', baseX1: 300, baseX2: 400, y1: 695, y2: 695,
    x1: 300, x2: 400, value: 150, restitution: 1.02, boost: 90
  };

  // 外枠はプレイフィールドとLAUNCHレーンをまとめて1つの筐体として囲う。
  // 右側のLAUNCHレーンは「外付け」ではなく外枠の内側に置き、
  // プレイフィールドとの仕切り壁（launchDivider）は上部で途切れさせる。
  // その開口部から、打ち上げられたボールが物理的にフィールドへ入る。
  const walls = [
    // --- 外周：左上から上辺 ---
    {id:'outerLT1', x1: 64, y1: 205, x2: 64, y2: 160},
    {id:'outerLT2', x1: 64, y1: 160, x2: 76, y2: 120},
    {id:'outerLT3', x1: 76, y1: 120, x2: 102, y2: 88},
    {id:'outerLT4', x1: 102, y1: 88, x2: 142, y2: 66},
    {id:'outerLT5', x1: 142, y1: 66, x2: 192, y2: 56},
    {id:'outerTop', x1: 192, y1: 56, x2: 610, y2: 56},

    // --- 外周：LAUNCHレーンを含む右上カーブ ---
    // x=658付近を上昇したボールがこの斜面に当たり、左方向へ流れる。
    {id:'outerRT1', x1: 610, y1: 56, x2: 650, y2: 62},
    {id:'outerRT2', x1: 650, y1: 62, x2: 682, y2: 82},
    {id:'outerRT3', x1: 682, y1: 82, x2: 700, y2: 112},
    {id:'outerRT4', x1: 700, y1: 112, x2: 706, y2: 156},
    {id:'outerRight', x1: 706, y1: 156, x2: 706, y2: 1140},

    // LAUNCHレーン下端。ここは発射待機位置を囲う。
    {id:'launchBottom', x1: 648, y1: 1140, x2: 706, y2: 1140},

    // --- プレイフィールド左側と下部 ---
    {id:'outerLeft', x1: 64, y1: 205, x2: 64, y2: 850},
    {id:'lowerL1', x1: 64, y1: 850, x2: 78, y2: 916},
    {id:'lowerL2', x1: 78, y1: 916, x2: 105, y2: 974},
    {id:'lowerL3', x1: 105, y1: 974, x2: 154, y2: 1058},

    // --- プレイフィールド右下部 ---
    // 細くしたLAUNCHレーンの仕切り壁へ自然につなぐ。
    {id:'lowerR1', x1: 648, y1: 850, x2: 632, y2: 916},
    {id:'lowerR2', x1: 632, y1: 916, x2: 598, y2: 974},
    {id:'lowerR3', x1: 598, y1: 974, x2: 538, y2: 1058},

    // --- 内側のLAUNCH仕切り壁 ---
    // 参考画像の右側シュートのように、レーン幅を細くし、
    // 仕切りを高い位置まで立ち上げてからプレイフィールド側へカーブさせる。
    // 衝突判定は複数の短い線分で滑らかなカーブを近似している。
    {id:'launchDivider0', x1: 648, y1: 1140, x2: 648, y2: 235},
    {id:'launchDivider1', x1: 648, y1: 235, x2: 647, y2: 212},
    {id:'launchDivider2', x1: 647, y1: 212, x2: 643, y2: 190},
    {id:'launchDivider3', x1: 643, y1: 190, x2: 636, y2: 170},
    {id:'launchDivider4', x1: 636, y1: 170, x2: 626, y2: 152},
    {id:'launchDivider5', x1: 626, y1: 152, x2: 613, y2: 137},
    {id:'launchDivider6', x1: 613, y1: 137, x2: 597, y2: 126},
    {id:'launchDivider7', x1: 597, y1: 126, x2: 578, y2: 119}
  ];

  // インレーン側ガイドはフリッパー支点まで直接つなぐ。
  // 前版より傾斜を緩くし、ボールがガイド上を滑ってフリッパー根元へ
  // 自然に落ちるよう左右対称の配置にする。
  const laneGuides = [
    {id:'leftReturnGuide',  x1: 82,  y1: 885, x2: 205, y2: 1010},
    {id:'rightReturnGuide', x1: 618, y1: 885, x2: 495, y2: 1010}
  ];

  const leftSling = {id:'slingL', x1: 168, y1: 842, x2: 252, y2: 905, value: 80};
  const rightSling = {id:'slingR', x1: 532, y1: 842, x2: 448, y2: 905, value: 80};

  // 先端間に約85pxの隙間を確保。ボール直径32pxでも中央ドレインが成立する。
  const leftFlipper = {
    pivotX: 205, pivotY: 1010, length: 105, width: 26,
    angle: 0.24, rest: 0.24, active: -0.62, side: 'left', angularVelocity: 0
  };
  const rightFlipper = {
    pivotX: 495, pivotY: 1010, length: 105, width: 26,
    angle: Math.PI - 0.24, rest: Math.PI - 0.24, active: Math.PI + 0.62, side: 'right', angularVelocity: 0
  };

  const topLanes = [
    {x1: 105, x2: 235, label: '200', value: 200, lit: false},
    {x1: 285, x2: 415, label: '500', value: 500, lit: false},
    {x1: 465, x2: 585, label: '200', value: 200, lit: false}
  ];

  let audioCtx = null;
  let masterGain = null;
  let soundOn = true;
  let humOsc = null;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = soundOn ? 0.2 : 0;
    masterGain.connect(audioCtx.destination);

    humOsc = audioCtx.createOscillator();
    const humGain = audioCtx.createGain();
    humOsc.type = 'sine';
    humOsc.frequency.value = 52;
    humGain.gain.value = 0.012;
    humOsc.connect(humGain).connect(masterGain);
    humOsc.start();
  }

  function tone(freq, duration = 0.08, type = 'sine', volume = 0.18, slideTo = null) {
    if (!soundOn) return;
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), audioCtx.currentTime + duration);
    g.gain.setValueAtTime(volume, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    o.connect(g).connect(masterGain);
    o.start();
    o.stop(audioCtx.currentTime + duration);
  }

  function sfxBounce(impact = 220, material = 'rail') {
    if (!soundOn) return;
    const now = performance.now();
    if (now - lastBounceSound < 34) return;
    lastBounceSound = now;

    const strength = Math.max(0, Math.min(1, (impact - 70) / 700));
    const base = material === 'post' ? 480 : material === 'flipper' ? 250 : 330;
    const freq = base + strength * (material === 'post' ? 520 : 360);
    const volume = 0.035 + strength * 0.085;
    tone(freq, 0.028 + strength * 0.035, material === 'flipper' ? 'square' : 'triangle', volume, freq * 0.72);
    if (strength > .72) tone(freq * 1.8, .018, 'sine', volume * .32);
  }

  function sfx(kind) {
    if (kind === 'launch') { tone(120, .18, 'sawtooth', .18, 620); tone(760, .07, 'square', .05); }
    if (kind === 'flip') tone(105, .045, 'square', .1, 72);
    if (kind === 'bumper') tone(470 + Math.random() * 180, .075, 'sine', .18, 920);
    if (kind === 'target') tone(830, .065, 'square', .11, 1120);
    if (kind === 'sling') tone(310, .05, 'triangle', .09, 540);
    if (kind === 'lane') { tone(620, .06, 'sine', .09); setTimeout(() => tone(820, .05, 'sine', .07), 45); }
    if (kind === 'wall') tone(170, .035, 'triangle', .045);
    if (kind === 'drain') tone(165, .23, 'sawtooth', .13, 52);
    if (kind === 'gameover') { tone(220, .15, 'square', .12); setTimeout(() => tone(130, .28, 'triangle', .12), 120); }
  }

  function resetBall() {
    launcher.charging = false;
    launcher.chargeStart = 0;
    launcher.charge = 0;
    Object.assign(ball, {
      x: LAUNCH_X, y: LAUNCH_REST_Y, vx: 0, vy: 0,
      inLauncher: true,
      enteredField: false,
      topGuideTriggered: false,
      alive: true
    });
  }

  function resetFeatures() {
    bonus = 0;
    multiplier = 1;
    zoneCooldown = 0;
    specialCooldown = 0;
    topLanes.forEach(lane => { lane.lit = false; });
    Object.values(tables).forEach(table => {
      [...table.bumpers, ...table.targets].forEach(obj => { obj._lastHit = 0; });
    });
    leftSling._lastHit = 0;
    rightSling._lastHit = 0;
  }

  function startGame() {
    initAudio();
    score = 0;
    balls = 3;
    resetFeatures();
    running = true;
    paused = false;
    ui.pause.textContent = '一時停止';
    resetBall();
    showMessage('BALL 1', 'SPACE / LAUNCH でボールを発射');
    setTimeout(() => { if (running && ball.inLauncher) hideMessage(); }, 850);
    updateUI();
  }

  function endGame() {
    running = false;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('pinballHighScore', String(highScore));
    }
    updateUI();
    showMessage('GAME OVER', `SCORE ${score.toLocaleString()} / もう一度「ゲーム開始」`);
    sfx('gameover');
  }

  function loseBall() {
    if (!running || !ball.enteredField) return;

    sfx('drain');
    const ballBonus = bonus * multiplier;
    if (ballBonus > 0) score += ballBonus;
    balls -= 1;

    if (balls <= 0) {
      updateUI();
      endGame();
      return;
    }

    resetFeatures();
    resetBall();
    updateUI();
    showMessage('BALL LOST', `BONUS +${ballBonus.toLocaleString()} / 残り ${balls} 球`);
    setTimeout(() => {
      if (running && ball.inLauncher) showMessage('READY', 'SPACE / LAUNCH で発射');
    }, 700);
    setTimeout(() => {
      if (running && ball.inLauncher) hideMessage();
    }, 1350);
  }

  function beginLaunchCharge() {
    if (!running || paused || !ball.inLauncher || launcher.charging) return;
    initAudio();
    hideMessage();
    launcher.charging = true;
    launcher.chargeStart = performance.now();
    launcher.charge = 0;
  }

  function updateLaunchCharge(now = performance.now()) {
    if (!launcher.charging) return launcher.charge;
    launcher.charge = Math.min(1, (now - launcher.chargeStart) / launcher.maxChargeMs);
    return launcher.charge;
  }

  function releaseLaunch() {
    if (!launcher.charging) return;
    const charge = updateLaunchCharge();
    launcher.charging = false;

    if (!running || paused || !ball.inLauncher) {
      launcher.charge = 0;
      return;
    }

    // 短押しでもフィールドへ届く最低速度を確保し、
    // 長押しでは上部カーブへより強く打ち込めるようにする。
    const launchSpeed = 1180 + 470 * charge;
    ball.inLauncher = false;
    ball.enteredField = false;
    ball.topGuideTriggered = false;
    ball.vx = 0;
    ball.vy = -launchSpeed;
    launcher.charge = 0;
    sfx('launch');
  }

  function addScore(value, addToBonus = true) {
    score += value * multiplier;
    if (addToBonus) bonus = Math.min(9000, bonus + Math.max(10, Math.round(value * 0.12)));
    if (score > highScore) highScore = score;
    updateUI();
  }

  function updateUI() {
    ui.score.textContent = score.toLocaleString();
    ui.highScore.textContent = highScore.toLocaleString();
    ui.balls.textContent = balls;
    ui.multiplier.textContent = `x${multiplier}`;
  }

  function showMessage(title, text, effect = '') {
    ui.message.innerHTML = `<strong>${title}</strong><span>${text}</span>`;
    ui.message.classList.remove('complete-fx');
    if (effect === 'complete') ui.message.classList.add('complete-fx');
    ui.message.classList.add('visible');
  }

  function hideMessage() {
    ui.message.classList.remove('visible', 'complete-fx');
  }

  function closestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return { x: x1 + t * dx, y: y1 + t * dy, t };
  }

  function hitReady(obj, ms = 90) {
    const now = performance.now();
    if (now - (obj._lastHit || 0) < ms) return false;
    obj._lastHit = now;
    return true;
  }

  function collideSegment(seg, restitution = 0.82, options = null) {
    const p = closestPointOnSegment(ball.x, ball.y, seg.x1, seg.y1, seg.x2, seg.y2);
    let dx = ball.x - p.x;
    let dy = ball.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= ball.r || dist <= 0.001) return false;

    const nx = dx / dist;
    const ny = dy / dist;
    ball.x = p.x + nx * (ball.r + 0.8);
    ball.y = p.y + ny * (ball.r + 0.8);
    const dot = ball.vx * nx + ball.vy * ny;

    if (dot < 0) {
      ball.vx -= (1 + restitution) * dot * nx;
      ball.vy -= (1 + restitution) * dot * ny;

      if (options?.boost) {
        ball.vx += nx * options.boost;
        ball.vy += ny * options.boost;
      }

      if (options?.value && hitReady(seg, 130)) {
        addScore(options.value);
        sfx(options.sound || 'sling');
        shake = Math.max(shake, 3.5);
      } else if (!options?.value && Math.abs(dot) > 75) {
        sfxBounce(Math.abs(dot), options?.material || 'rail');
      }
    }
    return true;
  }

  function collideCircle(c, bounce = 1.22, scoreValue = 0) {
    const dx = ball.x - c.x;
    const dy = ball.y - c.y;
    const d = Math.hypot(dx, dy);
    const minD = ball.r + c.r;
    if (d >= minD || d <= 0.001) return false;

    const nx = dx / d;
    const ny = dy / d;
    ball.x = c.x + nx * (minD + 1);
    ball.y = c.y + ny * (minD + 1);
    const dot = ball.vx * nx + ball.vy * ny;
    const impulse = Math.max(320, Math.abs(dot) * bounce + 235);

    ball.vx = ball.vx - 2 * dot * nx + nx * impulse * .42;
    ball.vy = ball.vy - 2 * dot * ny + ny * impulse * .42;

    if (scoreValue && hitReady(c, 115)) {
      addScore(scoreValue);
      sfx('bumper');
      shake = 6;
      // バンパー接触時は短時間に複数回発光させ、ヒットを視覚的にも強調する。
      c._flashUntil = performance.now() + 260;
    } else if (!scoreValue && Math.abs(dot) > 60 && hitReady(c, 70)) {
      sfxBounce(Math.abs(dot), 'post');
    }
    return true;
  }

  function collideRect(t) {
    const cx = Math.max(t.x, Math.min(ball.x, t.x + t.w));
    const cy = Math.max(t.y, Math.min(ball.y, t.y + t.h));
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= ball.r || d <= 0.001) return false;

    const nx = dx / d;
    const ny = dy / d;
    const dot = ball.vx * nx + ball.vy * ny;
    ball.x = cx + nx * (ball.r + 1);
    ball.y = cy + ny * (ball.r + 1);

    if (dot < 0) {
      ball.vx -= 1.8 * dot * nx;
      ball.vy -= 1.8 * dot * ny;
    }

    if (hitReady(t, 150)) {
      addScore(t.value || 120);
      sfx('target');
    }
    return true;
  }

  function flipperEndpoints(f) {
    return {
      x1: f.pivotX,
      y1: f.pivotY,
      x2: f.pivotX + Math.cos(f.angle) * f.length,
      y2: f.pivotY + Math.sin(f.angle) * f.length
    };
  }

  function updateFlipper(f, active, dt) {
    const target = active ? f.active : f.rest;
    const previous = f.angle;
    const speed = active ? 20 : 13;
    const diff = target - f.angle;
    f.angle += diff * Math.min(1, speed * dt);
    f.angularVelocity = (f.angle - previous) / Math.max(dt, 0.001);
  }

  function collideFlipper(f, active) {
    const ep = flipperEndpoints(f);
    const p = closestPointOnSegment(ball.x, ball.y, ep.x1, ep.y1, ep.x2, ep.y2);
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const dist = Math.hypot(dx, dy);
    const radius = f.width / 2 + ball.r;
    if (dist >= radius || dist <= 0.001) return false;

    const nx = dx / dist;
    const ny = dy / dist;
    ball.x = p.x + nx * (radius + 1);
    ball.y = p.y + ny * (radius + 1);

    const dot = ball.vx * nx + ball.vy * ny;
    if (dot < 0) {
      ball.vx -= 1.82 * dot * nx;
      ball.vy -= 1.82 * dot * ny;
    }

    if (Math.abs(dot) > 60 && hitReady(f, 58)) {
      sfxBounce(Math.abs(dot) + (active ? 260 : 0), 'flipper');
    }

    if (active && Math.abs(f.angularVelocity) > 0.35) {
      const tipFactor = 0.4 + p.t * 0.75;
      const outward = f.side === 'left' ? 1 : -1;
      const boost = 720 * tipFactor;
      ball.vx += outward * boost * 0.58;
      ball.vy -= boost;
    }
    return true;
  }

  function handleLauncherGuide() {
    // 発射レーン上端は全台共通のガイド特性にする。
    // JUNGLE RUINSのように台全体の反発係数が低い場合でも、ここだけは
    // カーブに沿って左へ抜ける最低限の横方向速度を与え、発射不能を防ぐ。
    // ボール座標を瞬間移動させるのではなく、実際の速度を補助する。
    if (!ball.inLauncher && !ball.enteredField && !ball.topGuideTriggered && ball.y < 158 && ball.x > 622) {
      ball.topGuideTriggered = true;
      ball.vx = Math.min(ball.vx, -520);
      ball.vy = Math.min(ball.vy, -120);
    }

    // カーブ先端を回り込み、プレイフィールド側へ入った時点でエントリー成立。
    if (!ball.inLauncher && !ball.enteredField && ball.x < 616 && ball.y < 205) {
      ball.enteredField = true;
      addScore(500, false);
      sfx('lane');
    }

    // 一度フィールドへ出たボールが上部の開口からLAUNCHレーンへ戻った場合は、
    // ボールロストにせず、そのままレーンを落下させてプランジャーへ再装填する。
    if (!ball.inLauncher && ball.enteredField && ball.x > 656 && ball.y > 255) {
      ball.enteredField = false;
      ball.topGuideTriggered = true;
    }

    // 発射失敗時、またはフィールドからLAUNCHレーンへ戻ったボールを再装填。
    if (!ball.inLauncher && !ball.enteredField && ball.x > 650 && ball.y > 1085) {
      resetBall();
      showMessage('READY', 'SPACE / LAUNCH 長押し→離して再発射');
      setTimeout(() => { if (running && ball.inLauncher && !launcher.charging) hideMessage(); }, 1000);
    }
  }

  function handleTopLanes() {
    if (!ball.enteredField || ball.vy <= 0 || ball.y < 170 || ball.y > 255) return;

    for (const lane of topLanes) {
      if (!lane.lit && ball.x >= lane.x1 && ball.x <= lane.x2) {
        lane.lit = true;
        addScore(lane.value, false);
        sfx('lane');
        break;
      }
    }

    if (topLanes.every(lane => lane.lit)) {
      topLanes.forEach(lane => { lane.lit = false; });
      multiplier = Math.min(5, multiplier + 1);
      score += 750 * multiplier;
      updateUI();
      showMessage('COMPLETE', `BONUS MULTIPLIER x${multiplier}`, 'complete');
      setTimeout(() => { if (running && !paused) hideMessage(); }, 650);
      tone(980, .1, 'square', .11, 1320);
    }
  }

  function handleReturnLanes(dt) {
    zoneCooldown = Math.max(0, zoneCooldown - dt);
    if (zoneCooldown > 0 || !ball.enteredField || ball.vy < 0) return;

    const inLeftReturn = ball.x > 105 && ball.x < 220 && ball.y > 885 && ball.y < 1018;
    const inRightReturn = ball.x > 480 && ball.x < 595 && ball.y > 885 && ball.y < 1018;
    if (inLeftReturn || inRightReturn) {
      addScore(150, false);
      sfx('lane');
      zoneCooldown = 0.6;
    }
  }

  function updateTableSpecials(dt, t) {
    specialCooldown = Math.max(0, specialCooldown - dt);

    if (tableKey === 'neon') {
      const shift = Math.sin(performance.now() / 620) * 72;
      neonGate.x1 = neonGate.baseX1 + shift;
      neonGate.x2 = neonGate.baseX2 + shift;
    }

    if (tableKey === 'space' && ball.enteredField) {
      const g = t.gravityWell;
      const dx = g.x - ball.x;
      const dy = g.y - ball.y;
      const d = Math.hypot(dx, dy);
      if (d > 30 && d < g.radius) {
        const pull = g.strength * (1 - d / g.radius);
        ball.vx += (dx / d) * pull * dt;
        ball.vy += (dy / d) * pull * dt;
        if (d < 82 && specialCooldown <= 0) {
          addScore(300, false);
          sfx('lane');
          specialCooldown = .9;
        }
      }
    }

    if (tableKey === 'jungle' && ball.enteredField) {
      const z = t.waterZone;
      const inside = ball.x > z.x && ball.x < z.x + z.w && ball.y > z.y && ball.y < z.y + z.h;
      if (inside) {
        const damp = Math.max(.93, 1 - 1.35 * dt);
        ball.vx *= damp;
        ball.vy *= damp;
        ball.vx += Math.sin(performance.now() / 330) * 18 * dt;
        if (specialCooldown <= 0) {
          addScore(120, false);
          tone(220, .09, 'sine', .05, 170);
          specialCooldown = 1.2;
        }
      }
    }
  }

  function updateTableInfo() {
    const t = tables[tableKey];
    if (ui.tableDesc) ui.tableDesc.textContent = t.description;
  }

  function update(dt) {
    if (!running || paused) return;

    updateFlipper(leftFlipper, keys.left, dt);
    updateFlipper(rightFlipper, keys.right, dt);

    if (ball.inLauncher) {
      const charge = launcher.charging ? updateLaunchCharge() : 0;
      ball.x = LAUNCH_X;
      // 長押し中はボールごと少し下へ引き、バネの圧縮を視覚化する。
      ball.y = LAUNCH_REST_Y + LAUNCH_PULL * charge;
      ball.vx = 0;
      ball.vy = 0;
      return;
    }

    const t = tables[tableKey];
    const ballDt = dt * BALL_TIME_SCALE;
    ball.vy += t.gravity * ballDt;
    updateTableSpecials(ballDt, t);
    const speed = Math.hypot(ball.vx, ball.vy);
    const maxSpeed = 1650;
    if (speed > maxSpeed) {
      const s = maxSpeed / speed;
      ball.vx *= s;
      ball.vy *= s;
    }

    // 速度が速い時も壁をすり抜けにくいようサブステップで進める。
    const subSteps = speed > 1000 ? 3 : speed > 650 ? 2 : 1;
    const step = ballDt / subSteps;
    for (let i = 0; i < subSteps; i++) {
      ball.x += ball.vx * step;
      ball.y += ball.vy * step;

      handleLauncherGuide();

      for (const w of walls) {
        const launcherWall = !ball.enteredField && !ball.inLauncher &&
          (w.id.startsWith('outerRT') || w.id.startsWith('launchDivider'));
        collideSegment(w, launcherWall ? 0.94 : t.wallRestitution);
      }
      for (const g of laneGuides) collideSegment(g, 0.42);

      for (const b of t.bumpers) collideCircle(b, t.bumperBounce, b.value);
      for (const p of t.posts) collideCircle(p, 0.96, 0);
      for (const target of t.targets) collideRect(target);
      for (const seg of t.extraSegments) {
        collideSegment(seg, seg.restitution ?? .84, { value: seg.value || 0, sound: 'sling', boost: seg.boost || 0 });
      }
      if (tableKey === 'neon') {
        collideSegment(neonGate, neonGate.restitution, { value: neonGate.value, sound: 'target', boost: neonGate.boost });
      }

      collideSegment(leftSling, 1.08, { value: leftSling.value, sound: 'sling', boost: 85 });
      collideSegment(rightSling, 1.08, { value: rightSling.value, sound: 'sling', boost: 85 });

      collideFlipper(leftFlipper, keys.left);
      collideFlipper(rightFlipper, keys.right);

      handleTopLanes();
    }

    handleReturnLanes(ballDt);

    // アウトホール／アウトレーン。中央フリッパー間の隙間もここへ落下する。
    if (ball.enteredField && ball.y > 1145) loseBall();

    if (shake > 0) shake = Math.max(0, shake - 24 * dt);
  }

  function drawRoundedRect(x, y, w, h, r, fill, stroke) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function drawSegment(seg, color, width = 8, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawCabinetFrame(t) {
    // 参考画像と同じ考え方で、プレイフィールドとLAUNCHレーンを
    // 1つの大きな外枠（筐体）でまとめて囲う。
    // LAUNCHレーンだけを別筐体として描くことはしない。
    ctx.save();

    const shell = ctx.createLinearGradient(0, 0, W, H);
    shell.addColorStop(0, 'rgba(255,255,255,.11)');
    shell.addColorStop(.48, 'rgba(255,255,255,.025)');
    shell.addColorStop(1, 'rgba(0,0,0,.24)');

    ctx.beginPath();
    ctx.moveTo(44, 1148);
    ctx.lineTo(44, 185);
    ctx.quadraticCurveTo(44, 78, 170, 40);
    ctx.quadraticCurveTo(380, 8, 620, 38);
    ctx.quadraticCurveTo(706, 50, 724, 146);
    ctx.lineTo(724, 1148);
    ctx.quadraticCurveTo(724, 1162, 708, 1164);
    ctx.lineTo(60, 1164);
    ctx.quadraticCurveTo(44, 1162, 44, 1148);
    ctx.closePath();
    ctx.fillStyle = shell;
    ctx.fill();

    ctx.shadowColor = t.line;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.lineWidth = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = t.line;
    ctx.globalAlpha = .38;
    ctx.lineWidth = 6;
    ctx.stroke();

    // LAUNCHレーンは参考画像のように外周右側へ寄せた細いシュートとして描く。
    // 上側は内側ガイドが左へカーブし、外周との間にボール1個分強の通路を確保する。
    ctx.globalAlpha = 1;
    const laneGrad = ctx.createLinearGradient(646, 0, 706, 0);
    laneGrad.addColorStop(0, 'rgba(255,255,255,.015)');
    laneGrad.addColorStop(1, 'rgba(255,255,255,.085)');
    ctx.fillStyle = laneGrad;
    ctx.beginPath();
    ctx.moveTo(653, 1138);
    ctx.lineTo(700, 1138);
    ctx.lineTo(700, 158);
    ctx.quadraticCurveTo(697, 112, 678, 88);
    ctx.quadraticCurveTo(655, 68, 625, 64);
    ctx.quadraticCurveTo(640, 92, 615, 122);
    ctx.quadraticCurveTo(648, 150, 653, 228);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function polygonPath(cx, cy, radius, sides, rotation = -Math.PI / 2) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = rotation + i * Math.PI * 2 / sides;
      const x = cx + Math.cos(a) * radius;
      const y = cy + Math.sin(a) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function starPath(cx, cy, outerR, innerR, points = 8) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const a = -Math.PI / 2 + i * Math.PI / points;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function drawBumperShape(b, t, flashOn) {
    const shape = b.shape || 'ring';
    const hot = flashOn ? '#ffffff' : t.bumper;
    ctx.save();
    ctx.shadowColor = flashOn ? '#ffffff' : t.bumper;
    ctx.shadowBlur = flashOn ? 62 : 24;
    ctx.lineWidth = flashOn ? 9 : 6;
    ctx.strokeStyle = flashOn ? '#ffffff' : 'rgba(255,255,255,.68)';

    const grad = ctx.createRadialGradient(b.x - b.r*.22, b.y - b.r*.28, 4, b.x, b.y, b.r);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(.22, hot);
    grad.addColorStop(1, flashOn ? t.bumper : 'rgba(0,0,0,.42)');
    ctx.fillStyle = grad;

    if (shape === 'hex') {
      polygonPath(b.x, b.y, b.r, 6);
      ctx.fill(); ctx.stroke();
      polygonPath(b.x, b.y, b.r*.55, 6, 0);
      ctx.strokeStyle = t.accent; ctx.lineWidth = 4; ctx.stroke();
    } else if (shape === 'star') {
      starPath(b.x, b.y, b.r, b.r*.58, 10);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r*.31, 0, Math.PI*2); ctx.fillStyle = '#fff7b0'; ctx.fill();
    } else if (shape === 'planet') {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r*.78, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(-.28);
      ctx.beginPath(); ctx.ellipse(0, 0, b.r*1.08, b.r*.34, 0, 0, Math.PI*2);
      ctx.strokeStyle = flashOn ? '#fff' : t.accent; ctx.lineWidth = 8; ctx.stroke(); ctx.restore();
    } else if (shape === 'satellite') {
      polygonPath(b.x, b.y, b.r*.7, 4, Math.PI/4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = t.accent;
      ctx.fillRect(b.x-b.r*1.05, b.y-8, b.r*.48, 16);
      ctx.fillRect(b.x+b.r*.57, b.y-8, b.r*.48, 16);
    } else if (shape === 'moon') {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(25,35,70,.45)';
      [[-.28,-.2,.16],[.3,.12,.13],[-.08,.35,.1]].forEach(([ox,oy,rr])=>{ctx.beginPath();ctx.arc(b.x+b.r*ox,b.y+b.r*oy,b.r*rr,0,Math.PI*2);ctx.fill();});
    } else if (shape === 'sun') {
      starPath(b.x, b.y, b.r, b.r*.78, 12); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r*.52, 0, Math.PI*2); ctx.fillStyle = '#ffe38a'; ctx.fill();
    } else if (shape === 'flower') {
      ctx.fillStyle = grad;
      for (let i=0;i<7;i++) {
        const a=i*Math.PI*2/7;
        ctx.beginPath(); ctx.arc(b.x+Math.cos(a)*b.r*.47,b.y+Math.sin(a)*b.r*.47,b.r*.39,0,Math.PI*2); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r*.48,0,Math.PI*2); ctx.fillStyle='#fff3a5'; ctx.fill(); ctx.stroke();
    } else if (shape === 'stone') {
      const pts = [1,.9,1.02,.84,.94,.88,.98,.86];
      ctx.beginPath();
      for (let i=0;i<pts.length;i++) {
        const a=-Math.PI/2+i*Math.PI*2/pts.length;
        const rr=b.r*pts[i];
        const x=b.x+Math.cos(a)*rr, y=b.y+Math.sin(a)*rr;
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle='rgba(70,45,18,.38)'; ctx.lineWidth=3;
      ctx.beginPath(); ctx.moveTo(b.x-b.r*.35,b.y-b.r*.1);ctx.lineTo(b.x+b.r*.2,b.y+b.r*.2);ctx.lineTo(b.x+b.r*.42,b.y-b.r*.12);ctx.stroke();
    } else if (shape === 'orb') {
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.arc(b.x,b.y,b.r*.58,0,Math.PI*2);ctx.strokeStyle=t.accent;ctx.lineWidth=5;ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r*.58, 0, Math.PI*2); ctx.strokeStyle=t.accent;ctx.lineWidth=4;ctx.stroke();
    }

    if (flashOn) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = .5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r*.72, 0, Math.PI*2); ctx.fill();
      ctx.globalAlpha = .85;
      ctx.lineWidth = 5; ctx.strokeStyle = t.bumper;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 13, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawTargetShape(tg, t) {
    const shape = tg.shape || 'capsule';
    const cx = tg.x + tg.w/2;
    const cy = tg.y + tg.h/2;
    ctx.save();
    ctx.shadowColor = t.accent;
    ctx.shadowBlur = 12;
    ctx.fillStyle = t.accent;
    ctx.strokeStyle = 'rgba(255,255,255,.82)';
    ctx.lineWidth = 3;

    if (shape === 'diamond' || shape === 'crystal') {
      ctx.beginPath();
      ctx.moveTo(cx, tg.y);
      ctx.lineTo(tg.x + tg.w, cy);
      ctx.lineTo(cx, tg.y + tg.h);
      ctx.lineTo(tg.x, cy);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (shape === 'crystal') {
        ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(cx,tg.y);ctx.lineTo(cx,cy);ctx.lineTo(tg.x+tg.w,cy);ctx.stroke();
      }
    } else if (shape === 'triangle') {
      ctx.beginPath();ctx.moveTo(cx,tg.y);ctx.lineTo(tg.x+tg.w,tg.y+tg.h);ctx.lineTo(tg.x,tg.y+tg.h);ctx.closePath();ctx.fill();ctx.stroke();
    } else if (shape === 'totem') {
      drawRoundedRect(tg.x,tg.y,tg.w,tg.h,12,t.accent,'rgba(255,255,255,.82)');
      ctx.fillStyle='rgba(20,50,20,.55)';
      for(let y=tg.y+14;y<tg.y+tg.h-8;y+=18) ctx.fillRect(tg.x+7,y,tg.w-14,7);
    } else {
      drawRoundedRect(tg.x,tg.y,tg.w,tg.h,Math.min(14,tg.w/2),t.accent,'rgba(255,255,255,.82)');
    }
    ctx.restore();
  }

  function drawSpecialSegment(seg, t) {
    if (seg.kind === 'log') {
      drawSegment(seg, '#7a4b24', 20, .95);
      drawSegment(seg, '#c98a43', 5, .8);
    } else if (seg.kind === 'stone') {
      drawSegment(seg, '#8e927d', 18, .92);
      drawSegment(seg, 'rgba(255,255,255,.34)', 4, .8);
    } else if (seg.kind === 'orbit') {
      drawSegment(seg, t.accent, 8, .82);
      ctx.save();ctx.setLineDash([8,8]);drawSegment(seg,'rgba(255,255,255,.55)',3,.7);ctx.restore();
    } else {
      drawSegment(seg, t.accent, 10, .88);
    }
  }

  function drawTable() {
    const t = tables[tableKey];
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, t.bg1);
    grad.addColorStop(1, t.bg2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const bgImage = backgroundImages[tableKey];
    if (bgImage && bgImage.complete && bgImage.naturalWidth) {
      ctx.save();
      ctx.globalAlpha = .74;
      ctx.drawImage(bgImage, 0, 0, W, H);
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.fillRect(0, 0, W, H);
    }

    drawCabinetFrame(t);

    ctx.save();
    ctx.globalAlpha = .14;
    ctx.strokeStyle = t.line;
    ctx.lineWidth = 2;
    for (let y = 120; y < 900; y += 95) {
      ctx.beginPath();
      ctx.moveTo(90, y);
      ctx.lineTo(590, y + 35);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.shadowColor = t.line;
    ctx.shadowBlur = 18;
    for (const w of walls) drawSegment(w, t.line, 10);
    for (const g of laneGuides) drawSegment(g, t.line, 8, .88);
    ctx.restore();

    // プランジャー／発射レーン。
    // 枠の上端は描かず、内側仕切り壁の切れ目からフィールドへ入れることを示す。
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = 'bold 18px system-ui';
    ctx.translate(680, 1045);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('PLUNGER / LAUNCH', 0, 0);
    ctx.restore();

    // 開口部を分かりやすくする小さなENTRY表示。
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.62)';
    ctx.font = '800 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('ENTRY', 592, 105);
    ctx.beginPath();
    ctx.moveTo(616, 112);
    ctx.lineTo(584, 112);
    ctx.lineTo(596, 103);
    ctx.moveTo(584, 112);
    ctx.lineTo(596, 121);
    ctx.strokeStyle = 'rgba(255,255,255,.62)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    drawLauncherPlunger(t);

    // タイトル
    ctx.fillStyle = t.accent;
    ctx.font = '900 36px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(t.name, 345, 122);

    // トップレーン
    for (const lane of topLanes) {
      const cx = (lane.x1 + lane.x2) / 2;
      ctx.save();
      ctx.globalAlpha = lane.lit ? 1 : .42;
      ctx.strokeStyle = lane.lit ? '#fff6a8' : t.line;
      ctx.lineWidth = lane.lit ? 8 : 5;
      ctx.beginPath();
      ctx.moveTo(lane.x1, 174);
      ctx.lineTo(lane.x1, 245);
      ctx.moveTo(lane.x2, 174);
      ctx.lineTo(lane.x2, 245);
      ctx.stroke();
      ctx.fillStyle = lane.lit ? '#fff6a8' : 'rgba(255,255,255,.65)';
      ctx.font = '900 17px system-ui';
      ctx.fillText(lane.label, cx, 215);
      ctx.restore();
    }

    // 台ごとの専用ギミックを描画。
    ctx.save();
    if (tableKey === 'neon') {
      ctx.shadowColor = t.accent;
      ctx.shadowBlur = 22;
      drawSegment(neonGate, t.accent, 13, .95);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.font = '800 13px system-ui';
      ctx.fillText('NEON GATE', (neonGate.x1 + neonGate.x2) / 2, neonGate.y1 - 15);
    } else if (tableKey === 'space') {
      const g = t.gravityWell;
      const rg = ctx.createRadialGradient(g.x, g.y, 10, g.x, g.y, g.radius);
      rg.addColorStop(0, 'rgba(0,0,0,.78)');
      rg.addColorStop(.22, 'rgba(112,244,255,.18)');
      rg.addColorStop(1, 'rgba(112,244,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(160,180,255,.38)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 125, 55, -.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.72)';
      ctx.font = '800 13px system-ui';
      ctx.fillText('GRAVITY WELL', g.x, g.y + 6);
    } else if (tableKey === 'jungle') {
      const z = t.waterZone;
      ctx.fillStyle = 'rgba(70,205,203,.16)';
      ctx.strokeStyle = 'rgba(118,255,226,.36)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(z.x + z.w/2, z.y + z.h/2, z.w/2, z.h/2, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(220,255,239,.72)';
      ctx.font = '800 13px system-ui';
      ctx.fillText('WATER ZONE', z.x + z.w/2, z.y + z.h/2 + 5);
    }
    ctx.restore();

    // 各台固有のレール／倒木／軌道ガイド。素材ごとに描き分ける。
    ctx.save();
    ctx.shadowColor = t.accent;
    ctx.shadowBlur = 10;
    for (const seg of t.extraSegments) drawSpecialSegment(seg, t);
    ctx.restore();

    // バンパー：台ごとに形状を変え、円形だけに偏らないデザインにする。
    // 当たり判定は安定性のため円形を維持し、見た目だけを多彩にしている。
    for (const b of t.bumpers) {
      const now = performance.now();
      const remaining = Math.max(0, (b._flashUntil || 0) - now);
      const elapsed = 260 - remaining;
      const flashOn = remaining > 0 && Math.sin(elapsed * 0.085) >= 0;
      drawBumperShape(b, t, flashOn);
    }

    // ヒットターゲットもカプセル、ダイヤ、三角、トーテム等に描き分ける。
    for (const tg of t.targets) drawTargetShape(tg, t);

    // ポスト
    for (const p of t.posts) {
      ctx.beginPath();
      ctx.fillStyle = '#e9f3ff';
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = t.accent;
      ctx.arc(p.x, p.y, p.r * .48, 0, Math.PI * 2);
      ctx.fill();
    }

    // スリングショット
    ctx.save();
    ctx.shadowColor = t.accent;
    ctx.shadowBlur = 12;
    drawSegment(leftSling, t.accent, 16);
    drawSegment(rightSling, t.accent, 16);
    ctx.restore();

    // リターンレーン／アウトレーン表示
    ctx.save();
    ctx.font = '800 14px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    ctx.textAlign = 'center';
    ctx.fillText('OUT', 92, 965);
    ctx.fillText('RETURN', 170, 925);
    ctx.fillText('RETURN', 530, 925);
    ctx.fillText('OUT', 608, 965);
    ctx.restore();

    drawFlipper(leftFlipper, t.accent);
    drawFlipper(rightFlipper, t.accent);

    // アウトホール（中央ドレイン）
    ctx.save();
    const drainGrad = ctx.createLinearGradient(0, 1048, 0, 1150);
    drainGrad.addColorStop(0, 'rgba(0,0,0,.20)');
    drainGrad.addColorStop(1, 'rgba(0,0,0,.88)');
    ctx.fillStyle = drainGrad;
    ctx.beginPath();
    ctx.moveTo(300, 1048);
    ctx.lineTo(400, 1048);
    ctx.lineTo(438, 1150);
    ctx.lineTo(262, 1150);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.34)';
    ctx.font = '700 12px system-ui';
    ctx.fillText('OUTHOLE', 350, 1120);
    ctx.restore();
  }

  function drawLauncherPlunger(t) {
    const baseY = 1132;
    const relaxedTop = LAUNCH_REST_Y + BALL_R + 9;
    const topY = ball.inLauncher
      ? Math.min(baseY - 20, ball.y + BALL_R + 9)
      : relaxedTop;
    const centerX = LAUNCH_X;
    const coils = 9;
    const amp = 10;

    ctx.save();

    // プランジャーのロッド／台座
    ctx.strokeStyle = 'rgba(225,235,245,.82)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(centerX, baseY + 1);
    ctx.lineTo(centerX, 1150);
    ctx.stroke();
    ctx.fillStyle = 'rgba(230,238,248,.88)';
    ctx.fillRect(centerX - 18, 1147, 36, 8);

    // バネ。圧縮時も巻数を保つことで「縮んでいる」ことが分かる。
    ctx.strokeStyle = t.accent;
    ctx.shadowColor = t.accent;
    ctx.shadowBlur = 10;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(centerX, baseY);
    const span = Math.max(24, baseY - topY);
    const points = coils * 2;
    for (let i = 1; i <= points; i++) {
      const u = i / points;
      const y = baseY - span * u;
      const x = centerX + (i % 2 ? amp : -amp);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(centerX, topY);
    ctx.stroke();

    // ボールを押すプランジャーヘッド
    ctx.shadowBlur = 5;
    ctx.fillStyle = 'rgba(245,248,255,.92)';
    ctx.fillRect(centerX - 15, topY - 4, 30, 8);

    // 長押し量を示す小さなPOWERゲージ。
    const meterX = 653;
    const meterY = 1025;
    const meterH = 105;
    const charge = ball.inLauncher ? launcher.charge : 0;
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(meterX, meterY, 8, meterH);
    ctx.fillStyle = charge > .72 ? '#ff6868' : charge > .38 ? '#ffd45e' : '#73ff9b';
    ctx.fillRect(meterX + 2, meterY + meterH - (meterH - 4) * charge - 2, 4, (meterH - 4) * charge);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.font = '700 10px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('P', meterX + 4, meterY - 6);

    ctx.restore();
  }

  function drawFlipper(f, color) {
    const ep = flipperEndpoints(f);
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = color;
    ctx.lineWidth = f.width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ep.x1, ep.y1);
    ctx.lineTo(ep.x2, ep.y2);
    ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.globalAlpha = .7;
    ctx.beginPath();
    ctx.moveTo(ep.x1, ep.y1);
    ctx.lineTo(ep.x2, ep.y2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBall() {
    const g = ctx.createRadialGradient(ball.x - 5, ball.y - 7, 2, ball.x, ball.y, ball.r);
    g.addColorStop(0, '#fff');
    g.addColorStop(.35, '#cbd6e5');
    g.addColorStop(1, '#596579');
    ctx.save();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    drawTable();
    drawBall();
    ctx.restore();
  }

  function loop(ts) {
    const dt = Math.min(.024, (ts - lastTime) / 1000 || .016);
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function setControl(button, prop, down) {
    keys[prop] = down;
    button.classList.toggle('active', down);
    if (down) {
      initAudio();
      sfx('flip');
    }
  }

  function bindHold(button, prop) {
    const down = e => { e.preventDefault(); setControl(button, prop, true); };
    const up = e => { e.preventDefault(); setControl(button, prop, false); };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('pointerleave', e => { if (e.buttons === 0) up(e); });
  }

  bindHold(ui.left, 'left');
  bindHold(ui.right, 'right');

  ui.launch.addEventListener('pointerdown', e => {
    e.preventDefault();
    ui.launch.setPointerCapture?.(e.pointerId);
    ui.launch.classList.add('active');
    beginLaunchCharge();
  });
  const releaseLaunchPointer = e => {
    e?.preventDefault?.();
    ui.launch.classList.remove('active');
    releaseLaunch();
  };
  ui.launch.addEventListener('pointerup', releaseLaunchPointer);
  ui.launch.addEventListener('pointercancel', releaseLaunchPointer);

  window.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'Space', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault();
    if ((e.code === 'ArrowLeft' || e.code === 'KeyA') && !keys.left) setControl(ui.left, 'left', true);
    if ((e.code === 'ArrowRight' || e.code === 'KeyD') && !keys.right) setControl(ui.right, 'right', true);
    if (e.code === 'Space' && !e.repeat) beginLaunchCharge();
  }, { passive: false });

  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') setControl(ui.left, 'left', false);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') setControl(ui.right, 'right', false);
    if (e.code === 'Space') releaseLaunch();
  });

  ui.start.addEventListener('click', startGame);

  ui.pause.addEventListener('click', () => {
    if (!running) return;
    paused = !paused;
    ui.pause.textContent = paused ? '再開' : '一時停止';
    if (paused) showMessage('PAUSE', '「再開」を押してください');
    else hideMessage();
  });

  ui.table.addEventListener('change', () => {
    tableKey = ui.table.value;
    resetBall();
    updateTableInfo();
    draw();
  });

  ui.sound.addEventListener('click', () => {
    soundOn = !soundOn;
    ui.sound.textContent = soundOn ? '🔊' : '🔇';
    if (masterGain) masterGain.gain.value = soundOn ? .2 : 0;
    if (soundOn) {
      initAudio();
      tone(660, .08, 'sine', .1);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && running && !paused) {
      paused = true;
      ui.pause.textContent = '再開';
      showMessage('PAUSE', '画面復帰後に「再開」を押してください');
    }
  });

  updateUI();
  updateTableInfo();
  draw();
  requestAnimationFrame(loop);
})();
