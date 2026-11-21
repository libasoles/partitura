// Fill the last row first, keeping document and keyboard order unchanged.
export function createTabLayout(bar) {
  let frame = 0;
  function layout() {
    frame = 0;
    const items = [...bar.children].filter((item) => !item.classList.contains('score-tab-break'));
    const style = getComputedStyle(bar);
    const width = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (!width) return;
    const gap = parseFloat(style.columnGap) || 0;
    const starts = [];
    let used = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const size = items[i].getBoundingClientRect().width;
      if (used && size + gap + used > width + 0.5) {
        starts.push(items[i + 1]);
        used = size;
      } else {
        used += size + (used ? gap : 0);
      }
    }
    const breaks = [...bar.querySelectorAll('.score-tab-break')];
    if (breaks.length === starts.length && breaks.every((node) => starts.includes(node.nextElementSibling))) return;
    breaks.forEach((node) => node.remove());
    starts.forEach((item) => {
      const node = document.createElement('span');
      node.className = 'score-tab-break';
      node.setAttribute('aria-hidden', 'true');
      // Inline layout also works for consumers supplying their own tab styles.
      Object.assign(node.style, { flexBasis: '100%', height: '0', marginTop: `-${parseFloat(style.rowGap) || 0}px` });
      bar.insertBefore(node, item);
    });
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(layout);
  }
  const observer = new ResizeObserver(schedule);
  return function refresh() {
    observer.disconnect();
    observer.observe(bar);
    [...bar.children].filter((item) => !item.classList.contains('score-tab-break')).forEach((item) => observer.observe(item));
    schedule();
  };
}
