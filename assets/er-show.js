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

  /* ---- the synth: one AudioContext for every instrument on the page ----
     Nothing exists until sound is on and a gesture arrives. Master gain
     0.22, never above 0.25, through a compressor so stacked notes don't
     clip. Notes come from a major pentatonic scale, so any two agree
     (the same trick that keeps a grid sequencer from ever sounding wrong). */
  var synth = (function () {
    var ac = null, master = null, grit = null, noiseBuf = null;
    var PENTA = [0, 2, 4, 7, 9];
    function ctx() {
      if (!show.sound) return null;
      if (!ac) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
        var comp = ac.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 6;
        master = ac.createGain();
        master.gain.value = 0.22; /* never above 0.25 */
        master.connect(comp); comp.connect(ac.destination);
        grit = ac.createWaveShaper();
        var curve = new Float32Array(256);
        for (var i = 0; i < 256; i++) curve[i] = Math.tanh((i / 127.5 - 1) * 3);
        grit.curve = curve;
        grit.connect(master);
        show.audio = ac;
        show.master = master;
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    /* step n of the pentatonic scale, counted up from C3 (MIDI 48) */
    function freq(step, base) {
      var oct = Math.floor(step / 5), deg = ((step % 5) + 5) % 5;
      return 440 * Math.pow(2, ((base || 48) + oct * 12 + PENTA[deg] - 69) / 12);
    }
    function tone(f, o) {
      o = o || {};
      var c = ctx();
      if (!c) return;
      var t = c.currentTime + (o.at || 0), d = o.dur || 0.25, v = o.vel == null ? 0.4 : o.vel;
      var osc = c.createOscillator(), g = c.createGain();
      osc.type = o.wave || 'triangle';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(g); g.connect(o.dirty ? grit : master);
      osc.start(t); osc.stop(t + d + 0.02);
    }
    function noise(c) {
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
        var data = noiseBuf.getChannelData(0);
        for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      }
      var src = c.createBufferSource();
      src.buffer = noiseBuf;
      return src;
    }
    /* a three-piece kit: kick, snare, hat */
    function drum(kind, at) {
      var c = ctx();
      if (!c) return;
      var t = c.currentTime + (at || 0), g = c.createGain();
      g.connect(master);
      if (kind === 'kick') {
        var o = c.createOscillator();
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
        g.gain.setValueAtTime(0.9, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); o.start(t); o.stop(t + 0.32);
        return;
      }
      var n = noise(c), f = c.createBiquadFilter();
      f.type = kind === 'snare' ? 'bandpass' : 'highpass';
      f.frequency.value = kind === 'snare' ? 1800 : 7000;
      g.gain.setValueAtTime(kind === 'snare' ? 0.7 : 0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'snare' ? 0.16 : 0.05));
      n.connect(f); f.connect(g); n.start(t); n.stop(t + 0.2);
    }
    return { ctx: ctx, freq: freq, tone: tone, drum: drum, grit: function () { ctx(); return grit; } };
  })();
  show.synth = synth;
  /* the toggle click is a gesture: the moment to create the context */
  show.onSound.push(function (on) { if (on) synth.ctx(); });

  /* the first time sound goes on in a visit, say what plays */
  var toast = doc.createElement('p');
  toast.className = 'er-toast';
  toast.setAttribute('role', 'status');
  doc.body.appendChild(toast);
  btn.title = 'Sound for the strings, the keyboard, the headline and the catalog';
  show.onSound.push(function (on) {
    if (!on) return;
    var told = false;
    try { told = sessionStorage.getItem('er-told') === '1'; sessionStorage.setItem('er-told', '1'); } catch (e) {}
    if (told) return;
    toast.textContent = doc.querySelector('.er-seq, .er-strum, .er-wave')
      ? 'Sound on. Type any letter, sweep the headline, drag across the strings, play the catalog.'
      : doc.querySelector('.er-poem')
        ? 'Sound on. Press play, or run down the poem a line at a time. The vowels pick the notes.'
        : 'Sound on. Type away.';
    toast.classList.add('er-toast--on');
    setTimeout(function () { toast.classList.remove('er-toast--on'); }, 4200);
  });

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

    function note(i) {
      synth.tone(NOTES[i], { wave: 'square', dur: 0.18, vel: 0.5, dirty: true });
    }
    function squall() {
      var c = synth.ctx();
      if (!c) return;
      var t = c.currentTime, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), depth = c.createGain();
      o.type = 'sawtooth';
      o.frequency.value = NOTES[5] * 2;
      lfo.frequency.value = 5.5; depth.gain.value = 9;
      lfo.connect(depth); depth.connect(o.frequency);
      g.gain.setValueAtTime(0.001, t);
      g.gain.exponentialRampToValueAtTime(0.35, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
      o.connect(g); g.connect(synth.grit());
      lfo.start(t); o.start(t); o.stop(t + 0.85); lfo.stop(t + 0.85);
    }

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

  /* =================================================================
     THE MUSICAL LAYER (needs d3). Every instrument here plays the
     site's own data, and every one works silently: sound only follows
     the SOUND toggle, motion only follows prefers-reduced-motion.
     ================================================================= */
  var d3 = window.d3;

  /* ---- the back catalog is a drum machine ----
     After Chrome Music Lab's Song Maker: a grid of years across and
     classes down, one cell per year and class, lit when a project in
     the catalog below belongs there. Play sweeps a playhead across it:
     wet projects hit the kick, hard ones the snare, infra the hat, and
     each project adds a note on top. */
  var built = doc.querySelector('#built .er-built');
  if (d3 && built) (function () {
    var CLASSES = [
      { key: 'wet', label: 'wet', drum: 'kick', base: 0, ink: '#f2ff3d' },
      { key: 'hard', label: 'hard', drum: 'snare', base: 5, ink: '#ff2d6f' },
      { key: 'infra', label: 'infra', drum: 'hat', base: 10, ink: '#f5f2e8' }
    ];
    var cards = [].slice.call(built.querySelectorAll('.er-artifact'));
    var items = cards.map(function (el) {
      var meta = el.querySelectorAll('.er-artifact-meta span');
      return { el: el, year: meta[0] ? meta[0].textContent.trim() : '', cls: el.getAttribute('data-class'),
               title: (el.querySelector('h3') || {}).textContent || '' };
    }).filter(function (d) { return /^\d{4}$/.test(d.year); });
    if (!items.length) return;
    var years = Array.from(new Set(items.map(function (d) { return d.year; }))).sort();
    var cells = [];
    years.forEach(function (y, xi) {
      CLASSES.forEach(function (c, yi) {
        var here = items.filter(function (d) { return d.year === y && d.cls === c.key; });
        cells.push({ year: y, cls: c, x: xi, y: yi, items: here });
      });
    });

    var wrap = doc.createElement('div');
    wrap.className = 'er-seq';
    wrap.innerHTML = '<div class="er-seq-bar"><button class="er-btn er-seq-play" type="button" aria-pressed="false">' +
      '<svg class="er-icon"><use href="#er-i-play"></use></svg> <span>Play the catalog</span></button>' +
      '<p class="er-seq-key">Each lit square is a project below. Wet is the kick, hard the snare, infra the hat.</p></div>' +
      '<div class="er-seq-grid" aria-hidden="true"></div>';
    built.parentNode.insertBefore(wrap, built);
    var grid = wrap.querySelector('.er-seq-grid'), btn = wrap.querySelector('.er-seq-play');
    var svg = d3.select(grid).append('svg').attr('class', 'er-seq-svg');
    var playhead, rects, W = 0, H = 0, lab = 54, top = 26, cw = 0, ch = 0;

    function draw() {
      W = grid.clientWidth || 600;
      ch = W < 520 ? 34 : 44;
      lab = W < 520 ? 42 : 58;
      cw = (W - lab) / years.length;
      H = top + ch * CLASSES.length + 4;
      svg.attr('viewBox', '0 0 ' + W + ' ' + H).attr('width', W).attr('height', H);
      svg.selectAll('*').remove();
      svg.append('g').selectAll('text').data(years).join('text')
        .attr('class', 'er-seq-year').attr('x', function (d, i) { return lab + cw * i + cw / 2; }).attr('y', 16)
        .attr('text-anchor', 'middle').text(function (d) { return W < 520 ? "'" + d.slice(2) : d; });
      svg.append('g').selectAll('text').data(CLASSES).join('text')
        .attr('class', 'er-seq-cls').attr('x', 0).attr('y', function (d, i) { return top + ch * i + ch / 2 + 4; })
        .text(function (d) { return d.label; });
      playhead = svg.append('rect').attr('class', 'er-seq-head').attr('y', top - 4).attr('height', ch * CLASSES.length + 6)
        .attr('width', cw).attr('x', lab).attr('opacity', 0);
      var g = svg.append('g').selectAll('g').data(cells).join('g')
        .attr('class', function (d) { return 'er-seq-cell' + (d.items.length ? ' is-lit' : ''); })
        .attr('transform', function (d) { return 'translate(' + (lab + cw * d.x + cw / 2) + ',' + (top + ch * d.y + ch / 2) + ')'; });
      rects = g.append('rect')
        .attr('x', -(cw - 6) / 2).attr('y', -(ch - 6) / 2).attr('width', cw - 6).attr('height', ch - 6)
        .attr('fill', function (d) { return d.items.length ? d.cls.ink : 'none'; });
      g.filter(function (d) { return d.items.length > 1; }).append('text')
        .attr('class', 'er-seq-n').attr('text-anchor', 'middle').attr('y', 5).text(function (d) { return '×' + d.items.length; });
      g.append('title').text(function (d) {
        return d.items.length ? d.year + ' · ' + d.items.map(function (i) { return i.title; }).join(', ') : d.year + ' · ' + d.cls.label + ': nothing filed';
      });
      g.filter(function (d) { return d.items.length; }).style('cursor', 'pointer').on('click', function (e, d) { hit(d, 0); });
    }

    function hit(d, at) {
      d.items.forEach(function (it, k) {
        synth.tone(synth.freq(d.cls.base + ((d.x + k * 2) % 5)), { at: at, dur: 0.3, vel: 0.32, wave: d.cls.key === 'hard' ? 'square' : 'triangle' });
        it.el.classList.add('er-artifact--hit');
        setTimeout(function () { it.el.classList.remove('er-artifact--hit'); }, 420);
      });
      if (d.items.length) synth.drum(d.cls.drum, at);
      var node = svg.selectAll('.er-seq-cell').filter(function (c) { return c === d; });
      if (show.motion) {
        node.select('rect').interrupt().attr('transform', 'scale(1.18)')
          .transition().duration(260).ease(d3.easeBackOut).attr('transform', 'scale(1)');
      }
    }

    var timer = null, col = -1, BEAT = 380;
    function stop() {
      if (timer) clearInterval(timer);
      timer = null; col = -1;
      playhead.attr('opacity', 0);
      btn.setAttribute('aria-pressed', 'false');
      btn.querySelector('span').textContent = 'Play the catalog';
      btn.querySelector('use').setAttribute('href', '#er-i-play');
    }
    function step() {
      col++;
      if (col >= years.length) { stop(); return; }
      var x = lab + cw * col;
      if (show.motion) playhead.attr('opacity', 1).transition().duration(120).attr('x', x);
      else playhead.attr('opacity', 1).attr('x', x);
      cells.filter(function (c) { return c.x === col && c.items.length; }).forEach(function (c) { hit(c, 0); });
    }
    btn.addEventListener('click', function () {
      if (timer) { stop(); return; }
      synth.ctx();
      btn.setAttribute('aria-pressed', 'true');
      btn.querySelector('span').textContent = 'Stop';
      btn.querySelector('use').setAttribute('href', '#er-i-pause');
      playhead.attr('x', lab);
      step();
      timer = setInterval(step, BEAT);
    });

    draw();
    var rz = 0;
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { var was = timer; if (was) stop(); draw(); }, 150); });
  })();

  /* ---- the keyboard is an instrument ----
     After Patatap: outside a form, every letter or digit plays a note
     and throws a shape on the screen. After Typatone: inside the
     contact form, typing plays your message back, quietly, one note a
     letter. Keys with a modifier, held keys and every other key are
     left alone, so shortcuts, Tab, Enter and the arrows work as ever. */
  (function () {
    var SHAPES = d3 ? [d3.symbolCircle, d3.symbolStar, d3.symbolTriangle, d3.symbolDiamond, d3.symbolCross, d3.symbolWye, d3.symbolSquare] : [];
    var INKS = ['#f2ff3d', '#ff2d6f', '#f5f2e8'];
    var layer = null, live = 0;
    function burst(code) {
      if (!d3 || !show.motion || live > 24) return;
      if (!layer) layer = d3.select(doc.body).append('svg').attr('class', 'er-keys-layer').attr('aria-hidden', 'true').attr('focusable', 'false');
      var w = window.innerWidth, h = window.innerHeight;
      var x = w * (0.12 + 0.76 * Math.random()), y = h * (0.18 + 0.64 * Math.random());
      var ink = INKS[code % INKS.length], g = layer.append('g').attr('transform', 'translate(' + x + ',' + y + ')');
      live++;
      g.append('circle').attr('r', 6).attr('fill', 'none').attr('stroke', ink).attr('stroke-width', 4)
        .transition().duration(700).ease(d3.easeCubicOut).attr('r', 130).attr('stroke-width', 0.5).style('opacity', 0);
      g.append('path').attr('d', d3.symbol(SHAPES[code % SHAPES.length], 3600)()).attr('fill', ink)
        .attr('transform', 'scale(0.1) rotate(0)')
        .transition().duration(520).ease(d3.easeBackOut.overshoot(2.4)).attr('transform', 'scale(1) rotate(' + (code % 2 ? 90 : -90) + ')')
        .transition().duration(380).ease(d3.easeCubicIn).attr('transform', 'scale(0.6) rotate(180)').style('opacity', 0);
      d3.range(7).forEach(function (i) {
        var a = (i / 7) * Math.PI * 2 + code, r = 70 + 50 * Math.random();
        g.append('circle').attr('r', 5).attr('fill', INKS[(code + i) % INKS.length])
          .transition().duration(650).ease(d3.easeCubicOut)
          .attr('cx', Math.cos(a) * r).attr('cy', Math.sin(a) * r).attr('r', 1).style('opacity', 0);
      });
      setTimeout(function () { g.remove(); live--; }, 1150);
    }
    doc.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      var k = (e.key || '').toLowerCase();
      if (!/^[a-z0-9]$/.test(k)) return;
      var code = /[0-9]/.test(k) ? 26 + +k : k.charCodeAt(0) - 97;
      var t = e.target || {};
      var field = t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName || '');
      if (field) {
        /* Typatone: only in the contact form, and only for typing */
        if (t.form && t.form.getAttribute('name') === 'contact' && /^(text|email|textarea)$/i.test(t.type || t.tagName)) {
          var vowel = 'aeiou'.indexOf(k) >= 0;
          synth.tone(synth.freq((code % 10) + (vowel ? 10 : 5)), { wave: 'sine', dur: 0.22, vel: 0.14 });
        }
        return;
      }
      synth.tone(synth.freq(code % 15 + 3), { wave: 'triangle', dur: 0.4, vel: 0.42 });
      burst(code);
    });
  })();

  /* ---- the headline is a xylophone ----
     Sweep across the hero's three words and each letter rings, one
     step up the scale at a time, and hops. The words stay whole for
     screen readers: the letters are a decorative copy beside them. */
  var headline = doc.querySelector('.sqsrte-scaled-text h1');
  if (headline) (function () {
    var letters = [];
    function split(node) {
      [].slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 1 && n.tagName !== 'BR') { split(n); return; }
        if (n.nodeType !== 3 || !n.textContent.trim()) return;
        var frag = doc.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(doc.createTextNode(part)); return; }
          var word = doc.createElement('span');
          word.className = 'er-xylo-word';
          var said = doc.createElement('span');
          said.className = 'er-sr';
          said.textContent = part;
          var shown = doc.createElement('span');
          shown.setAttribute('aria-hidden', 'true');
          part.split('').forEach(function (ch) {
            var l = doc.createElement('span');
            l.className = 'er-xylo';
            l.textContent = ch;
            l.dataset.i = letters.length;
            letters.push(l);
            shown.appendChild(l);
          });
          word.appendChild(said); word.appendChild(shown);
          frag.appendChild(word);
        });
        node.replaceChild(frag, n);
      });
    }
    split(headline);
    headline.classList.add('er-xylo-ready');
    var last = null;
    function ring(l) {
      if (!l || l === last) return;
      last = l;
      var i = +l.dataset.i;
      synth.tone(synth.freq(i % 15 + 5), { wave: 'triangle', dur: 0.3, vel: 0.3 });
      if (!show.motion) return;
      l.classList.remove('er-xylo--hop');
      void l.offsetWidth;
      l.classList.add('er-xylo--hop');
    }
    headline.addEventListener('pointermove', function (e) {
      var el = doc.elementFromPoint(e.clientX, e.clientY);
      if (el && el.classList && el.classList.contains('er-xylo')) ring(el);
    });
    headline.addEventListener('pointerdown', function (e) {
      if (e.target.classList && e.target.classList.contains('er-xylo')) { last = null; ring(e.target); }
    });
    headline.addEventListener('pointerleave', function () { last = null; });
  })();

  /* ---- the zine is a waveform ----
     Every numbered piece is a bar, oldest on the left, as tall as it is
     long (the square root of its words, so a 3,000-word essay doesn't
     flatten the rest). Scrub across it and each piece sounds its length:
     longer is lower, the way a data sonification maps value to pitch.
     Pieces still on Medium have no word count here; they are the short
     dashed stubs. Click a bar to open the piece. */
  var wave = doc.querySelector('.er-wave'), waveData = doc.getElementById('er-zine-data');
  if (d3 && wave && waveData) (function () {
    var data = JSON.parse(waveData.textContent).sort(function (a, b) { return a.no - b.no; });
    var maxW = d3.max(data, function (d) { return d.w; }) || 1;
    var pitch = d3.scaleQuantize().domain([Math.sqrt(maxW), 0]).range(d3.range(3, 18));
    var svg = d3.select(wave).append('svg').attr('class', 'er-wave-svg').attr('aria-hidden', 'true');
    var label = d3.select(wave).append('p').attr('class', 'er-wave-label').attr('aria-hidden', 'true')
      .text('Scrub across: every piece, oldest first, sounds its length.');
    var bars, x, y, W, H = 120, last = null;

    function draw() {
      W = wave.clientWidth || 600;
      x = d3.scaleBand().domain(data.map(function (d) { return d.no; })).range([0, W]).padding(0.28);
      y = d3.scaleSqrt().domain([0, maxW]).range([0, H - 14]);
      svg.attr('viewBox', '0 0 ' + W + ' ' + H).attr('width', W).attr('height', H);
      svg.selectAll('*').remove();
      svg.append('line').attr('class', 'er-wave-axis').attr('x1', 0).attr('x2', W).attr('y1', H / 2).attr('y2', H / 2);
      bars = svg.append('g').selectAll('rect').data(data).join('rect')
        .attr('class', function (d) { return 'er-wave-bar' + (d.here ? '' : ' er-wave-bar--away'); })
        .attr('x', function (d) { return x(d.no); }).attr('width', x.bandwidth())
        .attr('y', H / 2).attr('height', 0);
      var size = function (d) { return d.here ? Math.max(6, y(d.w)) : 10; };
      (show.motion ? bars.transition().duration(700).delay(function (d, i) { return i * 18; }).ease(d3.easeBackOut) : bars)
        .attr('y', function (d) { return H / 2 - size(d) / 2; }).attr('height', size);
    }

    function at(clientX) {
      var rc = wave.getBoundingClientRect(), px = clientX - rc.left, best = null, bd = Infinity;
      data.forEach(function (d) { var c = x(d.no) + x.bandwidth() / 2, dd = Math.abs(c - px); if (dd < bd) { bd = dd; best = d; } });
      return best;
    }
    function touch(d) {
      if (!d || d === last) return;
      last = d;
      synth.tone(synth.freq(d.here ? pitch(Math.sqrt(d.w)) : 17), { wave: d.here ? 'triangle' : 'sine', dur: 0.26, vel: d.here ? 0.34 : 0.14 });
      bars.classed('is-on', function (b) { return b === d; });
      label.text('no. ' + String(d.no).padStart(3, '0') + ' \u00b7 ' + d.t + (d.here ? ' \u00b7 ' + d.w.toLocaleString() + ' words' : ' \u00b7 on Medium'));
    }
    wave.addEventListener('pointermove', function (e) { touch(at(e.clientX)); });
    wave.addEventListener('pointerdown', function (e) { last = null; touch(at(e.clientX)); });
    wave.addEventListener('pointerleave', function () { last = null; bars.classed('is-on', false); });
    wave.addEventListener('click', function (e) {
      var d = at(e.clientX);
      if (!d) return;
      if (d.here) window.location.href = d.u;
      else window.open(d.u, '_blank', 'noopener');
    });
    draw();
    var rz = 0;
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(draw, 150); });
  })();

  /* ---- a poem is a score ----
     Each line is a bar and each syllable a note. The five vowels are
     the five notes of the scale (a e i o u, low to high; y sings with
     i), so a line's assonance is its melody. Long words jump an octave.
     A line break is a short rest, a stanza break a longer one. Play
     performs the poem top to bottom; pointing at a line, or scrolling
     it through the middle of the screen, plays that line alone. With
     sound off, Play still keeps the place, silently. */
  function scoreOf(poem, bar) {
    var UNIT = 0.15, lines = [], score = [];
    var timer = 0, at = -1, lastRing = 0, offs = [], io = null, scrolled = false;
    function notes(text) {
      var out = [];
      text.split(/\s+/).forEach(function (word) {
        var w = word.toLowerCase().replace(/[^a-z]/g, '');
        if (!w) { if (/\d/.test(word)) out.push(5); return; }
        var groups = w.match(/[aeiouy]+/g) || ['e'];
        /* the silent e of "time" and "shapes", but not of "slices" or "simple" */
        if (groups.length > 1 && /[^aeiouyl]es?$/.test(w) && !/(s|x|z|c|g|ch|sh)es$/.test(w)) groups.pop();
        groups.forEach(function (g) {
          var deg = 'aeiou'.indexOf(g.charAt(0));
          out.push(5 + (deg < 0 ? 2 : deg) + (w.length > 7 ? 5 : 0));
        });
      });
      return out;
    }
    function light(b, secs) {
      b.el.classList.add('er-line--on');
      offs.push(setTimeout(function () { b.el.classList.remove('er-line--on'); }, secs * 1000));
    }
    /* sound one bar; returns how long it lasts */
    function ring(b, unit, cap) {
      var n = cap ? b.notes.slice(0, cap) : b.notes;
      n.forEach(function (step, i) {
        synth.tone(synth.freq(step), { wave: 'triangle', dur: unit * 1.9, vel: i ? 0.26 : 0.34, at: i * unit });
      });
      var secs = Math.max(n.length, 2) * unit;
      light(b, secs);
      return secs;
    }
    function solo(el, unit, cap) {
      var now = Date.now();
      if (timer || now - lastRing < 140) return;
      var b = score[lines.indexOf(el)];
      if (!b) return;
      lastRing = now;
      ring(b, unit, cap);
    }

    if (!bar) {
      bar = doc.createElement('div');
      bar.className = 'er-poem-bar';
      bar.innerHTML = '<p class="er-poem-key">Each line is a bar. The vowels pick the notes: a, e, i, o, u, low to high. A line break is a rest.</p>';
      poem.parentNode.insertBefore(bar, poem);
    }
    var play = doc.createElement('button');
    play.className = 'er-btn er-poem-play';
    play.type = 'button';
    play.setAttribute('aria-pressed', 'false');
    play.textContent = 'Play the poem';
    bar.insertBefore(play, bar.querySelector('.er-poem-key'));
    function stop() {
      clearTimeout(timer); timer = 0; at = -1;
      offs.forEach(clearTimeout); offs = [];
      lines.forEach(function (l) { l.classList.remove('er-line--on'); });
      play.setAttribute('aria-pressed', 'false');
      play.textContent = 'Play the poem';
    }
    function step() {
      at++;
      if (at >= score.length) { stop(); return; }
      var b = score[at], secs = ring(b, UNIT);
      if (show.motion) { /* keep the sung line on screen; under reduced motion the page stays put */
        var r = b.el.getBoundingClientRect();
        if (r.top < 90 || r.bottom > window.innerHeight - 90) b.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      timer = setTimeout(step, (secs + UNIT * (b.ends ? 5 : 2)) * 1000);
    }
    play.addEventListener('click', function () {
      if (timer) { stop(); return; }
      if (!score.length) return;
      play.setAttribute('aria-pressed', 'true');
      play.textContent = 'Stop';
      if (show.sound) synth.ctx();
      step();
    });

    function lineOf(t) { return t && t.closest ? t.closest('.er-line') : null; }
    poem.addEventListener('pointerover', function (e) {
      var l = lineOf(e.target);
      if (l && e.pointerType === 'mouse' && show.sound) solo(l, UNIT);
    });
    poem.addEventListener('pointerdown', function (e) {
      var l = lineOf(e.target);
      if (l && show.sound) solo(l, UNIT);
    });
    /* scrolling: a line crossing the middle of the screen sounds its opening */
    if ('IntersectionObserver' in window) {
      window.addEventListener('scroll', function () { scrolled = true; }, { passive: true });
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && scrolled && show.sound) solo(en.target, UNIT * 0.7, 6);
        });
      }, { rootMargin: '-49% 0px -49% 0px' });
    }
    /* (re)read the lines on the page: once for a poem, after every deal for the cut-up */
    function read() {
      stop();
      if (io) io.disconnect();
      lines = [].slice.call(poem.querySelectorAll('.er-line'));
      score = lines.map(function (el) {
        return { el: el, notes: notes(el.textContent), ends: !el.nextElementSibling };
      });
      scrolled = false;
      if (io) lines.forEach(function (l) { io.observe(l); });
    }
    read();
    return { read: read, stop: stop };
  }
  var poemEl = doc.querySelector('.er-poem');
  if (poemEl) scoreOf(poemEl);

  /* ---- the cut-up: a poem randomizer ----
     The old zine trick, done by machine: lines pulled at random from the
     poems on this site and dealt into two or three short stanzas. Every
     line is Elliot's and carries the number of the poem it came from;
     the order is nobody's, and the card says so. It reads the lines the
     generator printed into #er-poem-data, and the result plays like any
     other poem. */
  var cut = doc.querySelector('.er-cut'), cutData = doc.getElementById('er-poem-data');
  if (cut) (function () {
    var poems = [];
    try { poems = JSON.parse(cutData.textContent); } catch (e) {}
    var pool = [];
    poems.forEach(function (p) { p.lines.forEach(function (l) { pool.push({ t: l, p: p }); }); });
    if (poems.length < 2 || pool.length < 12) { cut.parentNode.removeChild(cut); return; }
    function el(tag, cls, text) {
      var n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text) n.textContent = text;
      return n;
    }
    function pick(n) { return Math.floor(Math.random() * n); }
    var label = el('p', 'er-label');
    label.appendChild(el('span', '', 'the cut-up'));
    label.appendChild(el('span', '', 'dealt by a machine'));
    var bar = el('div', 'er-poem-bar'), deal = el('button', 'er-btn er-cut-deal', 'Deal again');
    deal.type = 'button';
    bar.appendChild(deal);
    var body = el('div', 'er-prose er-prose--poem'), out = el('div', 'er-poem er-poem--cut');
    out.setAttribute('aria-live', 'polite');
    body.appendChild(out);
    var src = el('p', 'er-cut-src'), more = el('p', 'er-sub-links'), any = el('a', 'er-cut-any', 'or read a whole poem, picked at random \u2192');
    more.appendChild(any);
    cut.appendChild(label);
    cut.appendChild(el('h3', 'er-book-t', 'Poem randomizer'));
    cut.appendChild(el('p', 'er-cut-note', 'Lines pulled at random from the poems here. I wrote every line. The order is the machine\u2019s.'));
    cut.appendChild(bar);
    cut.appendChild(body);
    cut.appendChild(src);
    cut.appendChild(more);
    var score = scoreOf(out, bar);

    function draw() {
      /* shuffle a copy, then deal two or three stanzas of two to four lines */
      var deck = pool.slice(), i, j, t;
      for (i = deck.length - 1; i > 0; i--) { j = pick(i + 1); t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
      var stanzas = 2 + pick(2), used = [], k = 0;
      out.textContent = '';
      for (i = 0; i < stanzas; i++) {
        var st = el('p', 'er-stanza'), size = 2 + pick(3);
        for (j = 0; j < size; j++) {
          var card = deck[k++], line = el('span', 'er-line', card.t);
          line.setAttribute('data-no', String(card.p.no).padStart(3, '0'));
          line.title = 'from ' + card.p.t;
          if (j) st.appendChild(doc.createElement('br'));
          st.appendChild(line);
          if (used.indexOf(card.p) < 0) used.push(card.p);
        }
        out.appendChild(st);
      }
      src.textContent = 'lines from ';
      used.sort(function (a, b) { return a.no - b.no; }).forEach(function (p, n) {
        if (n) src.appendChild(doc.createTextNode(', '));
        var a = el('a', '', 'no. ' + String(p.no).padStart(3, '0') + ' ' + p.t);
        a.href = p.u;
        src.appendChild(a);
      });
      any.href = poems[pick(poems.length)].u;
      score.read();
    }
    deal.addEventListener('click', draw);
    draw();
  })();
})();
