/* er-show.js — the show layer.
   Progressive enhancement on top of the flyer: the page is complete
   without this file. Every module checks prefers-reduced-motion, never
   starts audio on its own, and stops work when its band is off screen. */
(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  root.classList.add('er-js');

  /* ---- the motion switch, shared by every module ---- */
  var mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  var show = { motion: !(mq && mq.matches), sound: false, onMotion: [], onSound: [] };
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () {
      show.motion = !mq.matches;
      show.onMotion.forEach(function (f) { f(show.motion); });
    });
  }
  window.erShow = show;

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---- the sound toggle: off until pressed, remembered after ---- */
  var btn = doc.createElement('button');
  btn.className = 'er-sound';
  btn.type = 'button';
  show.sound = store.get('er-sound') === 'on';
  function paint() {
    btn.setAttribute('aria-pressed', String(show.sound));
    btn.textContent = show.sound ? 'Sound on' : 'Sound off';
  }
  paint();
  btn.addEventListener('click', function () {
    show.sound = !show.sound;
    store.set('er-sound', show.sound ? 'on' : 'off');
    paint();
    show.onSound.forEach(function (f) { f(show.sound); });
  });
  doc.body.appendChild(btn);

  /* ---- doors: one hand stamp where you first click, once per visit ---- */
  var stamped = false;
  try { stamped = sessionStorage.getItem('er-stamped') === '1'; } catch (e) {}
  if (!stamped) {
    doc.addEventListener('pointerdown', function stamp(e) {
      if (e.button) return;
      if (e.target.closest && e.target.closest('.er-sound, input, textarea, select')) return;
      var m = doc.createElement('span');
      m.className = 'er-stamp-mark';
      m.setAttribute('aria-hidden', 'true');
      m.textContent = 'Admit one';
      m.style.left = e.pageX + 'px';
      m.style.top = e.pageY + 'px';
      m.style.setProperty('--er-tilt', (Math.random() * 12 - 6).toFixed(1) + 'deg');
      doc.body.appendChild(m);
      try { sessionStorage.setItem('er-stamped', '1'); } catch (x) {}
      doc.removeEventListener('pointerdown', stamp);
    });
  }

  /* ---- sound check: the ticker says testing before it says anything ---- */
  var ticker = doc.querySelector('.er-ticker');
  if (ticker && show.motion) {
    ticker.classList.add('er-ticker--check');
    setTimeout(function () { ticker.classList.remove('er-ticker--check'); }, 1900);
  }

  /* ---- support act: the amp heads stack as the row comes into view ---- */
  var racks = doc.querySelectorAll('.er-stats');
  function stack(rack) {
    var heads = rack.querySelectorAll('.er-stat'), n = heads.length;
    for (var i = 0; i < n; i++) {
      (function (head, wait) {
        setTimeout(function () { head.classList.add('er-stat--in'); }, show.motion ? wait : 0);
      })(heads[i], (n - 1 - i) * 40);
    }
  }
  if (racks.length) {
    if ('IntersectionObserver' in window && show.motion) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { stack(en.target); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -10% 0px' });
      racks.forEach(function (r) { io.observe(r); });
      /* whatever happens, nothing stays hidden */
      setTimeout(function () { racks.forEach(stack); }, 4000);
    } else {
      racks.forEach(stack);
    }
  }

  /* ---- the pit: ideas as bodies you push through ----
     A fixed-step loop over at most 20 stickers: a slow drift at rest, a
     shove away from the pointer, soft separation between neighbours, and
     the walls of the band. It runs only while the band is on screen and
     the tab is visible, and never under reduced motion. */
  var pit = doc.querySelector('.er-pit');
  if (pit) (function () {
    var floor = pit.querySelector('.er-pit-floor');
    var items = [].slice.call(floor.children, 0, 20);
    var bodies = [], live = false, seen = false, raf = 0, t = 0, ptr = null, W = 0, H = 0;

    function layout() {
      W = floor.clientWidth; H = floor.clientHeight;
      var n = items.length, cols = W > 900 ? 5 : W > 600 ? 4 : 2, rows = Math.ceil(n / cols);
      /* home positions cluster toward the middle of the band, like a crowd does */
      var cw = W / cols, rh = H * 0.78 / rows, top0 = H * 0.11;
      bodies = items.map(function (el, i) {
        var w = el.offsetWidth, h = el.offsetHeight, rot = ((i * 31) % 17) - 8, rad = Math.abs(rot) * Math.PI / 180;
        var hx = cw * (i % cols + 0.5) + ((i * 7919) % 41 - 20) * cw / 110;
        var hy = top0 + rh * (Math.floor(i / cols) + 0.5) + ((i * 104729) % 37 - 18) * rh / 110;
        /* the walls see the rotated box, not the upright one */
        return { el: el, x: hx, y: hy, hx: hx, hy: hy, vx: 0, vy: 0, w: w, h: h,
                 ex: (w * Math.cos(rad) + h * Math.sin(rad)) / 2 + 4,
                 ey: (w * Math.sin(rad) + h * Math.cos(rad)) / 2 + 4,
                 ph: i * 1.7, rot: rot, surf: 0, sx: 0 };
      });
    }

    function step() {
      t += 1 / 60;
      var i, j, a, b, dx, dy, d, f, ox, oy, n = bodies.length;
      for (i = 0; i < n; i++) {
        a = bodies[i];
        var tx = a.hx + Math.sin(t * 0.9 + a.ph) * 3, ty = a.hy + Math.cos(t * 0.7 + a.ph) * 3;
        if (a.surf) { tx = a.sx; ty = -a.h; }
        a.vx += (tx - a.x) * 0.012;
        a.vy += (ty - a.y) * 0.012;
        if (ptr && !a.surf) {
          dx = a.x - ptr.x; dy = a.y - ptr.y; d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < 120) { f = (120 - d) * 0.06; a.vx += dx / d * f; a.vy += dy / d * f; }
        }
      }
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        a = bodies[i]; b = bodies[j];
        if (a.surf || b.surf) continue;
        dx = b.x - a.x; dy = b.y - a.y;
        ox = (a.w + b.w) * 0.47 - Math.abs(dx); oy = (a.h + b.h) * 0.46 - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) { f = ox * 0.03 * (dx < 0 ? -1 : 1); a.vx -= f; b.vx += f; }
          else { f = oy * 0.03 * (dy < 0 ? -1 : 1); a.vy -= f; b.vy += f; }
        }
      }
      for (i = 0; i < n; i++) {
        a = bodies[i];
        a.vx *= 0.86; a.vy *= 0.86; a.x += a.vx; a.y += a.vy;
        if (!a.surf) {
          if (a.x < a.ex) { a.x = a.ex; a.vx *= -0.4; } else if (a.x > W - a.ex) { a.x = W - a.ex; a.vx *= -0.4; }
          if (a.y < a.ey) { a.y = a.ey; a.vy *= -0.4; } else if (a.y > H - a.ey) { a.y = H - a.ey; a.vy *= -0.4; }
        }
        a.el.style.transform = 'translate(' + (a.x - a.w / 2).toFixed(1) + 'px,' + (a.y - a.h / 2).toFixed(1) + 'px) rotate(' + a.rot + 'deg)' + (a.surf ? ' scale(1.15)' : '');
      }
      raf = (live && seen && !doc.hidden) ? requestAnimationFrame(step) : 0;
    }

    function wake() { if (live && seen && !doc.hidden && !raf) raf = requestAnimationFrame(step); }

    function start() {
      if (live || !show.motion) return;
      pit.classList.add('er-pit--live');
      layout();
      live = true;
      wake();
    }

    function stop() {
      live = false;
      pit.classList.remove('er-pit--live');
      items.forEach(function (el) { el.style.transform = ''; el.style.zIndex = ''; });
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }

    function pointAt(e) {
      var rc = floor.getBoundingClientRect();
      ptr = { x: e.clientX - rc.left, y: e.clientY - rc.top };
    }
    function pointGone() { ptr = null; }
    pit.addEventListener('pointermove', pointAt);
    pit.addEventListener('pointerdown', pointAt);
    pit.addEventListener('pointerup', pointGone);
    pit.addEventListener('pointercancel', pointGone);
    pit.addEventListener('pointerleave', pointGone);

    /* click a sticker: it crowd-surfs out of the pile, then the page
       follows it to the section it names */
    floor.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('.er-idea') : null;
      if (!a || !live || !a.hash) return;
      var target = doc.querySelector(a.hash);
      var body = null;
      for (var i = 0; i < bodies.length; i++) if (bodies[i].el === a.parentNode) body = bodies[i];
      if (!body || body.surf || !target) return;
      e.preventDefault();
      body.surf = 1; body.sx = body.x; body.el.style.zIndex = 3;
      a.classList.add('er-idea--surf');
      setTimeout(function () {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (history.replaceState) history.replaceState(null, '', a.hash);
      }, 550);
      setTimeout(function () {
        body.surf = 0; body.el.style.zIndex = '';
        a.classList.remove('er-idea--surf');
      }, 1400);
    });

    /* every thirty seconds one of them stage dives and shows its back */
    setInterval(function () {
      if (!live || !seen || doc.hidden || !bodies.length) return;
      var b = bodies[Math.floor(Math.random() * bodies.length)];
      if (b.surf) return;
      b.vy -= 2;
      b.el.firstElementChild.classList.add('er-idea--dive');
      setTimeout(function () { b.el.firstElementChild.classList.remove('er-idea--dive'); }, 1700);
    }, 30000);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { seen = es[0].isIntersecting; wake(); }).observe(pit);
    } else {
      seen = true;
    }
    doc.addEventListener('visibilitychange', wake);
    var rz = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rz);
      rz = setTimeout(function () { if (live) layout(); }, 150);
    });
    /* feedback from the strum below shoves the whole pile outward once */
    show.shove = function () {
      if (!live) return;
      bodies.forEach(function (b) {
        var dx = b.x - W / 2, dy = b.y - H / 2, d = Math.sqrt(dx * dx + dy * dy) || 1;
        b.vx += dx / d * 7; b.vy += dy / d * 7;
      });
      wake();
    };

    show.onMotion.push(function (m) { if (m) start(); else stop(); });
    start();
  })();

  /* ---- the strum: six strings you drag across ----
     Each crossing plucks: a visible ring first, a sound only if the
     visitor turned sound on. Crossing four or more strings within
     300 ms is a chaotic strum (bloom + shake); five of those inside
     ten seconds feeds back, once, then it calms. */
  var strum = doc.querySelector('.er-strum');
  if (strum) (function () {
    var strings = [].slice.call(strum.querySelectorAll('.er-string'));
    var box = strum.querySelector('.er-strum-strings');
    var prevY = null, crossings = [], strums = [], lastBloom = 0, feedbackUntil = 0;
    var NOTES = [82.41, 110, 146.83, 196, 246.94, 329.63];

    /* ---- sound: nothing exists until the toggle is on and a gesture arrives ---- */
    var ac = null, master = null, grit = null;
    function audio() {
      if (ac) return ac;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      grit = ac.createWaveShaper();
      var curve = new Float32Array(256);
      for (var i = 0; i < 256; i++) curve[i] = Math.tanh((i / 127.5 - 1) * 3);
      grit.curve = curve;
      master = ac.createGain();
      master.gain.value = 0.22; /* never above 0.25 */
      grit.connect(master);
      master.connect(ac.destination);
      show.audio = ac;
      show.master = master;
      return ac;
    }
    function note(i) {
      if (!show.sound || !audio()) return;
      if (ac.state === 'suspended') ac.resume();
      var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
      o.type = 'square';
      o.frequency.value = NOTES[i];
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(grit);
      o.start(t); o.stop(t + 0.2);
    }
    function squall() {
      if (!show.sound || !audio()) return;
      var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(), lfo = ac.createOscillator(), depth = ac.createGain();
      o.type = 'sawtooth';
      o.frequency.value = NOTES[5] * 2;
      lfo.frequency.value = 5.5; depth.gain.value = 9;
      lfo.connect(depth); depth.connect(o.frequency);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      o.connect(g); g.connect(grit);
      lfo.start(t); o.start(t); o.stop(t + 0.85); lfo.stop(t + 0.85);
    }
    /* the toggle click is a gesture: a good moment to create the context */
    show.onSound.push(function (on) { if (on && audio() && ac.state === 'suspended') ac.resume(); });

    function ring(el, dir) {
      if (!show.motion) return;
      el.style.setProperty('--er-pluck', (dir > 0 ? 12 : -12) + 'px');
      el.classList.remove('er-string--ring');
      void el.offsetWidth;
      el.classList.add('er-string--ring');
    }
    function flash(cls, ms) {
      if (!show.motion) return;
      strum.classList.add(cls);
      setTimeout(function () { strum.classList.remove(cls); }, ms);
    }
    function pluck(i, dir, now) {
      ring(strings[i], dir);
      note(i);
      crossings.push(now);
      while (crossings.length && now - crossings[0] > 300) crossings.shift();
      if (crossings.length >= 4) {
        crossings = [];
        strums.push(now);
        while (strums.length && now - strums[0] > 10000) strums.shift();
        /* the bloom is rate-limited to one every 500 ms; the count is not */
        if (now - lastBloom > 500) {
          lastBloom = now;
          flash('er-strum--bloom', 500);
          flash('er-strum--shake', 90);
        }
        if (strums.length >= 5 && now > feedbackUntil) feedback(now);
      }
    }
    function feedback(now) {
      strums = [];
      feedbackUntil = now + 10000;
      flash('er-strum--feedback', 800);
      squall();
      if (show.shove) show.shove();
      var ticker = doc.querySelector('.er-ticker');
      if (ticker && show.motion) {
        ticker.classList.add('er-ticker--fast');
        setTimeout(function () { ticker.classList.remove('er-ticker--fast'); }, 10000);
      }
    }

    function move(e) {
      var rc = box.getBoundingClientRect(), y = e.clientY - rc.top, now = e.timeStamp || Date.now();
      if (prevY !== null) {
        for (var i = 0; i < strings.length; i++) {
          var sy = i * 14 + 8;
          if ((prevY - sy) * (y - sy) < 0) pluck(i, y > prevY ? 1 : -1, now);
        }
      }
      prevY = y;
    }
    function reset() { prevY = null; }
    strum.addEventListener('pointerdown', function (e) { prevY = null; move(e); });
    strum.addEventListener('pointermove', move);
    strum.addEventListener('pointerleave', reset);
    strum.addEventListener('pointercancel', reset);
  })();

  /* ---- stage lights: two spots that swing to the hovered card ---- */
  var stage = doc.querySelector('.er-stage');
  if (stage) (function () {
    var lights = stage.querySelector('.er-lights'), cards = stage.querySelectorAll('.er-grid--4 .er-card');
    if (!lights || !cards.length) return;
    var acid = lights.querySelector('.er-light--acid'), hot = lights.querySelector('.er-light--hot');
    function aim(card) {
      var s = stage.getBoundingClientRect(), c = card.getBoundingClientRect();
      var x = c.left - s.left + c.width / 2, y = c.top - s.top + c.height / 2;
      acid.style.setProperty('--er-x', (x - 120) + 'px'); acid.style.setProperty('--er-y', (y - 70) + 'px');
      hot.style.setProperty('--er-x', (x + 140) + 'px'); hot.style.setProperty('--er-y', (y + 50) + 'px');
      lights.classList.add('er-lights--on');
    }
    cards.forEach(function (card) {
      card.addEventListener('pointerenter', function () { aim(card); });
      card.addEventListener('pointerdown', function () { aim(card); });
      card.addEventListener('focusin', function () { aim(card); });
    });
    /* warmed up on the first card until someone points at another */
    aim(cards[0]);
    window.addEventListener('resize', function () { if (lights.classList.contains('er-lights--on')) aim(cards[0]); });
  })();
})();
