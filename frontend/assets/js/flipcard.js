/* ==========================================================================
   FLIPPY — Flipcard component
   Renders one interactive card. Tap/click flips it. On touch devices,
   swipe left = mark wrong, swipe right = mark correct (only once flipped).
   ========================================================================== */

function createFlipcard({ front, back, onSwipeLeft, onSwipeRight, container }) {
  const el = document.createElement('div');
  el.className = 'flipcard';
  el.innerHTML = `
    <div class="flipcard-inner">
      <div class="flipcard-face front"><span class="tab"></span><span>${front}</span></div>
      <div class="flipcard-face back"><span class="tab"></span><span>${back}</span></div>
    </div>`;

  el.addEventListener('click', () => el.classList.toggle('flipped'));

  let startX = 0, startY = 0, dragging = false;
  el.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    dragging = true;
  }, { passive: true });

  el.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && onSwipeLeft) onSwipeLeft();
      if (dx > 0 && onSwipeRight) onSwipeRight();
    }
  }, { passive: true });

  if (container) container.appendChild(el);
  return el;
}

// Keyboard support for desktop study sessions: left/right arrows.
function bindStudyKeyboard({ onLeft, onRight, onFlip }) {
  function handler(e) {
    if (e.key === 'ArrowLeft' && onLeft) onLeft();
    if (e.key === 'ArrowRight' && onRight) onRight();
    if (e.key === ' ' && onFlip) { e.preventDefault(); onFlip(); }
  }
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}
