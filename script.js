// ─── ALGAE CANVAS ANIMATION ───
const canvas = document.getElementById('algae-canvas');
const ctx = canvas.getContext('2d');

let W, H, cells = [];

function resize() {
  W = canvas.width = canvas.offsetWidth;
  H = canvas.height = canvas.offsetHeight;
}

class Cell {
  constructor() { this.reset(true); }
  reset(init) {
    this.x = Math.random() * W;
    this.y = init ? Math.random() * H : H + 20;
    this.r = 3 + Math.random() * 9;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = -0.2 - Math.random() * 0.4;
    this.alpha = 0.3 + Math.random() * 0.5;
    this.hue = 180 + Math.random() * 40; // teal range
    this.divTimer = 200 + Math.random() * 400;
    this.age = 0;
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleSpeed = 0.02 + Math.random() * 0.03;
  }
  update() {
    this.x += this.vx + Math.sin(this.wobble) * 0.3;
    this.y += this.vy;
    this.wobble += this.wobbleSpeed;
    this.age++;
    if (this.y + this.r < -20) this.reset(false);
    if (this.age > this.divTimer && cells.length < 120) {
      const child = new Cell();
      child.x = this.x + (Math.random() - 0.5) * this.r * 3;
      child.y = this.y;
      child.r = this.r * 0.7;
      cells.push(child);
      this.divTimer = 999999;
    }
  }
  draw() {
    ctx.save();
    // Cell body
    const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.r);
    grad.addColorStop(0, `hsla(${this.hue}, 90%, 65%, ${this.alpha})`);
    grad.addColorStop(0.6, `hsla(${this.hue}, 80%, 50%, ${this.alpha * 0.6})`);
    grad.addColorStop(1, `hsla(${this.hue}, 70%, 35%, 0)`);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    // Division line (membrane)
    ctx.beginPath();
    ctx.moveTo(this.x - this.r * 0.7, this.y);
    ctx.lineTo(this.x + this.r * 0.7, this.y);
    ctx.strokeStyle = `hsla(${this.hue}, 90%, 80%, ${this.alpha * 0.4})`;
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }
}

function init() {
  resize();
  cells = [];
  for (let i = 0; i < 60; i++) cells.push(new Cell());
}

function animate() {
  ctx.clearRect(0, 0, W, H);
  cells = cells.filter(c => c.y + c.r > -20);
  while (cells.length < 60) cells.push(new Cell());
  cells.forEach(c => { c.update(); c.draw(); });
  requestAnimationFrame(animate);
}

window.addEventListener('resize', () => { resize(); });
init();
animate();

// ─── NAV SCROLL EFFECT ───
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 60) {
    nav.style.background = 'rgba(3,4,94,0.97)';
  } else {
    nav.style.background = 'rgba(3,4,94,0.85)';
  }
});

// ─── HAMBURGER ───
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');
hamburger.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
});
mobileMenu.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => mobileMenu.classList.remove('open'));
});

// ─── SMOOTH SCROLL OFFSET FOR FIXED NAV ───
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const offset = 64;
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
  });
});

// ─── INTERSECTION OBSERVER: FADE IN ───
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll('.offering-card, .tech-block, .product-card, .testimonial, .step, .impact-item').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(20px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

document.addEventListener('DOMContentLoaded', () => {
  // Add visible class via JS after observer triggers
  const style = document.createElement('style');
  style.textContent = '.visible { opacity: 1 !important; transform: translateY(0) !important; }';
  document.head.appendChild(style);
});

// ─── SAMPLE ORDER SYSTEM ───
const PRICES = {
  'Primary Blue™': 75,
  'Primary Green': 75,
  'Primary Yellow™': 75,
  'Primary Orange': 75,
  'Primary Red': 0,     // POA
  'Full Palette Bundle': 250
};

let selectedSamples = new Set();

function selectSample(name) {
  if (name === 'Primary Red') {
    // Scroll to contact for POA
    document.querySelector('#contact').scrollIntoView({ behavior: 'smooth' });
    return;
  }

  if (selectedSamples.has(name)) {
    selectedSamples.delete(name);
  } else {
    // If bundle selected, clear individual items; if individual selected, clear bundle
    if (name === 'Full Palette Bundle') {
      selectedSamples.clear();
    } else {
      selectedSamples.delete('Full Palette Bundle');
    }
    selectedSamples.add(name);
  }

  updateSampleUI();
  
  // Scroll to form
  if (selectedSamples.size > 0) {
    setTimeout(() => {
      document.querySelector('#sample-form-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }
}

function removeSample(name) {
  selectedSamples.delete(name);
  updateSampleUI();
}

function updateSampleUI() {
  // Update buttons
  document.querySelectorAll('.btn-sample').forEach(btn => {
    btn.classList.remove('selected');
  });
  document.querySelectorAll('.sample-card').forEach(card => {
    const productName = Object.keys(PRICES).find(k =>
      card.querySelector('h4')?.textContent.includes(k.replace('™',''))
    );
    if (productName && selectedSamples.has(productName)) {
      card.querySelector('.btn-sample')?.classList.add('selected');
    }
  });

  // Update selected tags
  const container = document.getElementById('selected-items');
  if (selectedSamples.size === 0) {
    container.innerHTML = '<p class="no-selection">Select a sample above to get started.</p>';
    document.getElementById('order-total').textContent = '';
    document.getElementById('selected-products-input').value = '';
    return;
  }

  container.innerHTML = [...selectedSamples].map(name => `
    <div class="selected-tag">
      ${name}
      <button onclick="removeSample('${name}')" aria-label="Remove">&times;</button>
    </div>
  `).join('');

  // Calculate total
  const total = [...selectedSamples].reduce((sum, name) => sum + (PRICES[name] || 0), 0);
  const count = selectedSamples.size;
  document.getElementById('order-total').textContent = 
    total > 0 ? `Total: $${total} · ${count} sample${count > 1 ? 's' : ''}` : '';
  
  document.getElementById('selected-products-input').value = [...selectedSamples].join(', ');
}
