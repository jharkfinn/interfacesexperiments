// Panes hold views side by side, any number of them. Each pane has a weight:
// panes share the row's width by weight, never narrower than MIN_PANE_PX, and
// the row scrolls sideways when they do not fit. A divider between two panes
// moves width from one to the other. The arrangement is kept in this browser.

export const MIN_PANE_PX = 300;
const KEY_STEP_PX = 24;

// New weights for two neighbouring panes after their divider moves `delta`
// pixels to the right. Their total weight and width stay the same, and neither
// gets narrower than `min` pixels.
export function resizeWeights([left, right], [leftPx, rightPx], delta, min = MIN_PANE_PX) {
  const total = leftPx + rightPx;
  const moved = Math.max(min - leftPx, Math.min(rightPx - min, delta));
  if (total <= 2 * min) return [left, right];
  const share = (leftPx + moved) / total;
  const weight = left + right;
  return [weight * share, weight * (1 - share)];
}

// A saved arrangement, checked against the views that exist. Unknown views are
// dropped, the Document view appears at most once, and weights stay positive.
export function restorePanes(saved, known) {
  if (!Array.isArray(saved)) return null;
  const panes = [];
  for (const pane of saved) {
    if (!pane || !known.includes(pane.view)) continue;
    if (pane.view === 'document' && panes.some(other => other.view === 'document')) continue;
    const weight = Number(pane.weight);
    panes.push({
      view: pane.view,
      weight: Number.isFinite(weight) && weight > 0.05 && weight < 20 ? weight : 1,
      follows: pane.follows !== false,
    });
  }
  return panes.length ? panes : null;
}

let paneCount = 0;

export class Workspace {
  // `create(spec, id)` makes a view for a declaration; `specs()` lists the
  // declarations a pane can show.
  constructor({ root, specs, create, storageKey, onChange }) {
    Object.assign(this, { root, specs, create, storageKey, onChange });
    this.panes = [];
  }
  spec(id) {
    return this.specs().find(spec => spec.id === id) || null;
  }
  has(view) {
    return this.panes.some(pane => pane.view === view);
  }
  // Replaces every pane with the given arrangement.
  set(arrangement) {
    for (const pane of [...this.panes]) this.unmount(pane);
    this.panes = [];
    for (const item of arrangement) this.insert(item, this.panes.length);
    this.layout();
  }
  add(view, at = this.panes.length) {
    if (view === 'document' && this.has('document')) {
      this.reveal(this.panes.find(pane => pane.view === 'document'));
      return;
    }
    const pane = this.insert({ view, weight: 1, follows: true }, at);
    this.layout();
    this.reveal(pane);
    return pane;
  }
  insert({ view, weight, follows }, at) {
    const spec = this.spec(view);
    if (!spec) return null;
    const id = `pane-${++paneCount}`;
    const element = document.createElement('section');
    element.className = 'pane';
    element.dataset.pane = id;
    element.dataset.view = view;
    const bar = document.createElement('header');
    bar.className = 'pane-bar';
    const choose = document.createElement('select');
    choose.className = 'pane-view';
    choose.setAttribute('aria-label', 'View in this pane');
    const sync = this.button('pane-sync', 'Scroll with the other panes', '⇅');
    const left = this.button('pane-left', 'Move this pane left', '‹');
    const right = this.button('pane-right', 'Move this pane right', '›');
    const close = this.button('pane-close', 'Close this pane', '×');
    bar.append(choose, sync, left, right, close);
    const body = document.createElement('div');
    body.className = 'pane-body';
    const content = document.createElement('div');
    content.className = 'pane-content';
    body.append(content);
    element.append(bar, body);
    const pane = {
      id,
      view,
      weight,
      follows,
      element,
      body,
      content,
      choose,
      sync,
      instance: null,
    };
    choose.onchange = () => this.change(pane, choose.value);
    sync.onclick = () => {
      pane.follows = !pane.follows;
      if (pane.instance) pane.instance.follows = pane.follows;
      this.layout();
    };
    left.onclick = () => this.move(pane, -1);
    right.onclick = () => this.move(pane, 1);
    close.onclick = () => this.close(pane);
    this.panes.splice(at, 0, pane);
    this.mount(pane);
    return pane;
  }
  button(className, label, text) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = text;
    return button;
  }
  mount(pane) {
    pane.instance = this.create(this.spec(pane.view), pane.id);
    pane.instance.follows = pane.follows;
    pane.content.append(pane.instance.root);
    pane.instance.mount(pane.body);
  }
  unmount(pane) {
    const instance = pane.instance;
    pane.instance = null;
    if (instance?.unmount) instance.unmount();
    else instance?.destroy();
    pane.element.remove();
  }
  change(pane, view) {
    if (view === pane.view) return;
    if (view === 'document' && this.has('document')) {
      pane.choose.value = pane.view;
      return;
    }
    const instance = pane.instance;
    pane.instance = null;
    if (instance?.unmount) instance.unmount();
    else instance?.destroy();
    pane.view = view;
    pane.element.dataset.view = view;
    this.mount(pane);
    this.layout();
  }
  close(pane) {
    if (this.panes.length < 2) return;
    this.unmount(pane);
    this.panes = this.panes.filter(other => other !== pane);
    this.layout();
  }
  move(pane, step) {
    const at = this.panes.indexOf(pane);
    const to = at + step;
    if (to < 0 || to >= this.panes.length) return;
    this.panes.splice(at, 1);
    this.panes.splice(to, 0, pane);
    this.layout();
    pane.element.querySelector(step < 0 ? '.pane-left' : '.pane-right')?.focus();
  }
  reveal(pane) {
    pane?.element.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }
  // Puts panes and dividers in order, refreshes their controls, and saves.
  layout() {
    const children = [];
    this.panes.forEach((pane, index) => {
      if (index) children.push(this.divider(index));
      pane.element.style.flexGrow = String(pane.weight);
      const options = this.specs().map(spec => {
        const option = document.createElement('option');
        option.value = spec.id;
        option.textContent = spec.title;
        option.disabled =
          spec.id === 'document' && this.has('document') && pane.view !== 'document';
        return option;
      });
      pane.choose.replaceChildren(...options);
      pane.choose.value = pane.view;
      pane.sync.setAttribute('aria-pressed', String(pane.follows));
      pane.element.querySelector('.pane-left').disabled = index === 0;
      pane.element.querySelector('.pane-right').disabled = index === this.panes.length - 1;
      pane.element.querySelector('.pane-close').disabled = this.panes.length < 2;
      children.push(pane.element);
    });
    // Moving a pane's element would reset its scroll position, so dividers are
    // replaced and only panes that are out of order move.
    for (const old of this.root.querySelectorAll(':scope > .pane-divider')) old.remove();
    let previous = null;
    for (const child of children) {
      const expected = previous ? previous.nextSibling : this.root.firstChild;
      if (child !== expected) this.root.insertBefore(child, expected);
      previous = child;
    }
    while (previous?.nextSibling) previous.nextSibling.remove();
    this.save();
    this.onChange?.();
  }
  divider(index) {
    const divider = document.createElement('div');
    divider.className = 'pane-divider';
    divider.tabIndex = 0;
    divider.setAttribute('role', 'separator');
    divider.setAttribute('aria-orientation', 'vertical');
    divider.setAttribute('aria-label', 'Resize the panes on each side');
    const resize = delta => {
      const left = this.panes[index - 1];
      const right = this.panes[index];
      const widths = [left.element.offsetWidth, right.element.offsetWidth];
      [left.weight, right.weight] = resizeWeights([left.weight, right.weight], widths, delta);
      left.element.style.flexGrow = String(left.weight);
      right.element.style.flexGrow = String(right.weight);
    };
    divider.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      divider.setPointerCapture(event.pointerId);
      let x = event.clientX;
      const move = moved => {
        resize(moved.clientX - x);
        x = moved.clientX;
      };
      const end = () => {
        divider.removeEventListener('pointermove', move);
        divider.removeEventListener('pointerup', end);
        divider.removeEventListener('pointercancel', end);
        divider.classList.remove('dragging');
        this.save();
        this.onChange?.();
      };
      divider.classList.add('dragging');
      divider.addEventListener('pointermove', move);
      divider.addEventListener('pointerup', end);
      divider.addEventListener('pointercancel', end);
    });
    divider.addEventListener('keydown', event => {
      const step = { ArrowLeft: -KEY_STEP_PX, ArrowRight: KEY_STEP_PX }[event.key];
      if (!step) return;
      event.preventDefault();
      resize(step);
      this.save();
      this.onChange?.();
    });
    return divider;
  }
  arrangement() {
    return this.panes.map(({ view, weight, follows }) => ({ view, weight, follows }));
  }
  save() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.arrangement()));
    } catch {}
  }
  saved() {
    try {
      return JSON.parse(localStorage.getItem(this.storageKey));
    } catch {
      return null;
    }
  }
}
