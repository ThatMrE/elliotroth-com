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
})();
