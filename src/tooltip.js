/**
 * HTML-тултип поверх SVG. Позиционирование повторяет Highcharts:
 * бокс ставится слева от точки (или справа, если слева нет места),
 * по вертикали центрируется относительно курсора и зажимается в границах
 * контейнера. Если курсор у верхней/нижней кромки — бокс уходит над/под
 * точку и центрируется по горизонтали.
 */
export class Tooltip {
  /**
   * @param {HTMLElement} container
   * @param {{distance:number, hideDelay:number}} options
   */
  constructor(container, options) {
    this.container = container;
    this.options = options;
    this.el = document.createElement('div');
    this.el.className = 'mtc-tooltip';
    this.el.setAttribute('role', 'tooltip');
    container.appendChild(this.el);
    this.isHidden = true;
    this.hideTimer = null;
    this.x = 0;
    this.y = 0;
  }

  /** Меняет содержимое (HTML). */
  setContent(html) {
    this.el.innerHTML = html;
  }

  /** Размер бокса. */
  size() {
    return { w: this.el.offsetWidth, h: this.el.offsetHeight };
  }

  /**
   * Вычисляет координаты бокса.
   * @param {number} w  ширина бокса
   * @param {number} h  высота бокса
   * @param {number} ax якорь X (точка)
   * @param {number} ay якорь Y (курсор)
   * @param {number} W  ширина контейнера
   * @param {number} H  высота контейнера
   */
  getPosition(w, h, ax, ay, W, H) {
    const d = this.options.distance;
    const clampSecond = (point, inner, outer) => {
      if (point < inner / 2) return 1;
      if (point > outer - inner / 2) return outer - inner - 2;
      return point - inner / 2;
    };

    const roomLeft = w < ax - d;
    const roomRight = ax + d + w < W;
    const yInside = ay >= d && ay <= H - d;
    if ((roomLeft || roomRight) && yInside) {
      return { x: roomLeft ? ax - d - w : ax + d, y: clampSecond(ay, h, H) };
    }

    // Меняем измерения местами: сначала вертикаль, потом центр по X.
    const roomAbove = h < ay - d;
    const roomBelow = ay + d + h < H;
    let y;
    if (roomAbove) y = ay - d - h;
    else if (roomBelow) y = ay + d;
    else y = Math.max(0, Math.min(H - h, ay - h / 2));
    return { x: clampSecond(ax, w, W), y };
  }

  /**
   * Показывает/двигает тултип к якорю.
   * @param {number} ax
   * @param {number} ay
   * @param {number} W
   * @param {number} H
   */
  moveTo(ax, ay, W, H) {
    const { w, h } = this.size();
    const pos = this.getPosition(w, h, ax, ay, W, H);
    const wasHidden = this.isHidden;
    if (wasHidden) {
      // Появляемся сразу в нужном месте, без «прилёта» из старой позиции.
      this.el.classList.add('mtc-no-transition');
      this.el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
      // eslint-disable-next-line no-unused-expressions
      this.el.offsetHeight; // reflow
      this.el.classList.remove('mtc-no-transition');
    } else {
      this.el.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
    }
    this.x = pos.x;
    this.y = pos.y;
    this.show();
  }

  show() {
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.isHidden = false;
    this.el.classList.add('mtc-visible');
  }

  /**
   * Прячет тултип с задержкой (как tooltip.hideDelay в Highcharts).
   * @param {number} [delay]
   */
  hide(delay = this.options.hideDelay) {
    if (this.isHidden) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.isHidden = true;
      this.el.classList.remove('mtc-visible');
    }, delay);
  }

  destroy() {
    clearTimeout(this.hideTimer);
    this.el.remove();
  }
}
