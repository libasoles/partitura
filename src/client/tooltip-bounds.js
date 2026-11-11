// The CSS tooltips (`.tooltip`, text in data-tooltip) are centred over their element, so near a screen edge they can
// leave the viewport. On hover/focus this measures the text and sets --tooltip-shift so the box stays inside.
const MARGIN = 8;
const canvas = document.createElement('canvas').getContext('2d');

function shiftFor(el) {
  const text = el.dataset.tooltip;
  const box = getComputedStyle(el, '::after');
  if (!text || box.position !== 'absolute' || box.left === 'auto') return 0;
  canvas.font = `${box.fontWeight} ${box.fontSize} ${box.fontFamily}`;
  const width = canvas.measureText(text).width + parseFloat(box.paddingLeft) + parseFloat(box.paddingRight);
  const rect = el.getBoundingClientRect();
  const center = rect.left + rect.width / 2;
  const viewport = document.documentElement.clientWidth;
  const overflowLeft = MARGIN - (center - width / 2);
  const overflowRight = center + width / 2 - (viewport - MARGIN);
  if (overflowLeft > 0) return overflowLeft;
  if (overflowRight > 0) return -overflowRight;
  return 0;
}

function place(event) {
  const el = event.target.closest?.('.tooltip');
  if (el) el.style.setProperty('--tooltip-shift', `${shiftFor(el)}px`);
}

document.addEventListener('pointerover', place);
document.addEventListener('focusin', place);
