/**
 * Стили компонента. Подключаются один раз при создании первого графика,
 * чтобы потребителю не нужно было импортировать CSS отдельно.
 */
const STYLE_ID = 'mtc-styles';

export const CSS = `
.mtc-container {
  position: relative;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}
.mtc-svg {
  display: block;
  overflow: visible;
}
.mtc-graph {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
  transition: stroke-width .15s ease;
}
.mtc-area-fill { stroke: none; }
.mtc-marker { transition: none; }
.mtc-halo {
  pointer-events: none;
  transition: transform .15s ease, opacity .15s ease;
}
.mtc-bar { transition: fill .15s ease; }
.mtc-tooltip {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 2;
  pointer-events: none;
  white-space: nowrap;
  box-sizing: border-box;
  padding: 8px;
  border-radius: 3px;
  background: #ffffff;
  color: #333333;
  font-size: .8em;
  box-shadow: 1px 1px 4px rgba(0,0,0,.35), 0 0 1px rgba(0,0,0,.2);
  opacity: 0;
  will-change: transform;
  transition: opacity .15s ease, transform .3s cubic-bezier(.25,.1,.25,1);
}
.mtc-tooltip.mtc-no-transition { transition: opacity .15s ease; }
.mtc-tooltip.mtc-visible { opacity: 1; }
.mtc-tooltip-header {
  font-size: .8em;
  line-height: 13px;
}
.mtc-tooltip-row { line-height: 15px; }
.mtc-tooltip-row b { font-weight: 700; }
.mtc-tooltip-dot {
  display: inline-block;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: -1px;
}
`;

export function ensureStyles(doc = document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}
