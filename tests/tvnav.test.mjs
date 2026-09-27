import test from 'node:test';
import assert from 'node:assert/strict';
import { tvNavKeyHandler } from '../components/TvNav.js';

/* ── minimal sahte DOM ─────────────────────────────────────────── */

class El {
  constructor(tag, attrs = {}, rect = { left: 0, top: 0, width: 100, height: 40 }) {
    this.tagName = tag.toUpperCase();
    this.attrs = attrs;
    this.children = [];
    this.parent = null;
    this.rect = rect;
    this.disabled = false;
    this._blurs = 0;
    this._clicks = 0;
  }
  append(...cs) {
    for (const c of cs) { c.parent = this; this.children.push(c); }
    return this;
  }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  closest(sel) {
    const attr = sel.replace(/[[\]]/g, '');
    let el = this;
    while (el) {
      if (el.tagName !== 'BODY' && el.attrs && el.hasAttribute && el.hasAttribute(attr)) return el;
      el = el.parent;
    }
    return null;
  }
  querySelectorAll(sel) {
    const attr = sel.replace(/[[\]]/g, '');
    const out = [];
    const walk = (el) => {
      for (const c of el.children) {
        if (c.hasAttribute && c.hasAttribute(attr)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  getBoundingClientRect() { return this.rect; }
  focus() { this._doc.activeElement = this; }
  blur() { this._blurs += 1; if (this._doc.activeElement === this) this._doc.activeElement = this._doc.body; }
  click() { this._clicks += 1; }
  scrollIntoView() {}
}

function makeDom() {
  const body = new El('body');
  const doc = {
    body,
    activeElement: body,
    querySelectorAll: (s) => body.querySelectorAll(s),
    querySelector: (s) => body.querySelector(s),
  };
  return { doc, body };
}

function buildScene(doc) {
  const stage = new El('div', { 'data-stage': '' });
  // satır 0: üst bar (a cx=25, b cx=125)
  const row0 = new El('header', { 'data-row': '' });
  const a = new El('button', { 'data-fn': '', 'data-exit': '' }, { left: 0, top: 10, width: 50, height: 40 });
  const b = new El('button', { 'data-fn': '' }, { left: 100, top: 10, width: 50, height: 40 });
  row0.append(a, b);
  // satır 1: hero (h1 cx=60, h2 cx=200, h3 cx=350)
  const row1 = new El('section', { 'data-row': '' });
  const h1 = new El('button', { 'data-fn': '' }, { left: 10, top: 80, width: 100, height: 40 });
  const h2 = new El('button', { 'data-fn': '' }, { left: 150, top: 80, width: 100, height: 40 });
  const h3 = new El('button', { 'data-fn': '' }, { left: 300, top: 80, width: 100, height: 40 });
  row1.append(h1, h2, h3);
  // satır 2: 2x2 grid (c1,c2 çizgi-1 · c3,c4 çizgi-2)
  const row2 = new El('div', { 'data-row': '' });
  const c1 = new El('div', { 'data-fn': '' }, { left: 10, top: 200, width: 100, height: 100 });
  const c2 = new El('div', { 'data-fn': '' }, { left: 120, top: 200, width: 100, height: 100 });
  const c3 = new El('div', { 'data-fn': '' }, { left: 10, top: 320, width: 100, height: 100 });
  const c4 = new El('div', { 'data-fn': '' }, { left: 120, top: 320, width: 100, height: 100 });
  row2.append(c1, c2, c3, c4);
  // oynatıcı alanı
  const player = new El('div', { 'data-player': '' }, { left: 0, top: 500, width: 600, height: 340 });
  stage.append(row0, row1, row2, player);
  const input = new El('input', {});
  for (const el of [stage, input]) { el._doc = doc; doc.body.append(el); }
  // _doc'u tüm elemanlara işle
  const wire = (el) => { el._doc = doc; el.children.forEach(wire); };
  wire(stage);
  return { stage, row0, row1, row2, a, b, h1, h2, h3, c1, c2, c3, c4, player, input };
}

const key = (doc, target, k, extra = {}) => {
  const e = { key: k, target, prevented: false, preventDefault() { this.prevented = true; }, ...extra };
  tvNavKeyHandler(e, ctx(doc));
  return e;
};
const ctx = (doc) => ({ doc, playerExitKey: 'ArrowUp', playerExitFocus: '[data-exit]', onEscape: undefined });

/* ─────────────────────────────────────────────────────────────── */

test('odak yokken ilk tuş ilk satırın ilk elemanına gider', () => {
  const { doc, body } = makeDom();
  const s = buildScene(doc);
  key(doc, body, 'ArrowRight');
  assert.equal(doc.activeElement, s.a);
});

test('sağ/sol aynı satırda ve sınırlarda takılır', () => {
  const { doc } = makeDom();
  const s = buildScene(doc);
  doc.activeElement = s.a;
  key(doc, s.a, 'ArrowRight');
  assert.equal(doc.activeElement, s.b);
  key(doc, s.b, 'ArrowRight');
  assert.equal(doc.activeElement, s.b); // clamp
  key(doc, s.b, 'ArrowLeft');
  assert.equal(doc.activeElement, s.a);
});

test('aşağı: X merkezine en yakın elemana atlar', () => {
  const { doc } = makeDom();
  const s = buildScene(doc);
  doc.activeElement = s.b; // cx=125 → h1(60,d65) / h2(200,d75)
  key(doc, s.b, 'ArrowDown');
  assert.equal(doc.activeElement, s.h1);
  doc.activeElement = s.h3; // cx=350 → grid satırında c2/c4 (170, d180)
  key(doc, s.h3, 'ArrowDown');
  assert.equal(doc.activeElement, s.c2); // ilk minimum kazanır
});

test('grid içinde 2D: aynı görsel çizgide sağa, sonra aşağıya', () => {
  const { doc } = makeDom();
  const s = buildScene(doc);
  doc.activeElement = s.c1;
  key(doc, s.c1, 'ArrowRight');
  assert.equal(doc.activeElement, s.c2);
  key(doc, s.c2, 'ArrowDown'); // aynı satırın 2. çizgisine, en yakın c4
  assert.equal(doc.activeElement, s.c4);
  key(doc, s.c4, 'ArrowUp'); // geri 1. çizgiye c2
  assert.equal(doc.activeElement, s.c2);
});

test('Enter: aktif [data-fn] elemanını tetikler', () => {
  const { doc } = makeDom();
  const s = buildScene(doc);
  doc.activeElement = s.c1;
  key(doc, s.c1, 'Enter');
  assert.equal(s.c1._clicks, 1);
});

test('Escape: onEscape çağrılır (data-fn veya body odakta)', () => {
  const { doc, body } = makeDom();
  const s = buildScene(doc);
  let esc = 0;
  const e1 = { key: 'Escape', target: s.a, preventDefault() {} };
  tvNavKeyHandler(e1, { ...ctx(doc), onEscape: () => { esc += 1; } });
  const e2 = { key: 'Escape', target: body, preventDefault() {} };
  tvNavKeyHandler(e2, { ...ctx(doc), onEscape: () => { esc += 1; } });
  assert.equal(esc, 2);
  // player odaktayken ESC TV'ye devredilmez (player menü kapatır)
  doc.activeElement = s.player;
  const e3 = { key: 'Escape', target: s.player, preventDefault() {} };
  tvNavKeyHandler(e3, { ...ctx(doc), onEscape: () => { esc += 1; } });
  assert.equal(esc, 2);
});

test('input odaktayken ok tuşları TV nav\'a ait değil, ESC blur', () => {
  const { doc } = makeDom();
  const s = buildScene(doc);
  key(doc, s.input, 'ArrowRight');
  assert.equal(doc.activeElement, doc.body); // değişmedi
  key(doc, s.input, 'Escape');
  assert.equal(s.input._blurs, 1);
});

test('player odaktayken: oklar TV\'de pasif, çıkış tuşu UI\'ya döndürür', () => {
  const { doc } = makeDom();
  const s = buildScene(doc);
  doc.activeElement = s.player;
  key(doc, s.player, 'ArrowRight');
  assert.equal(doc.activeElement, s.player); // seek → player'a kaldı
  const e = key(doc, s.player, 'ArrowUp');
  assert.ok(e.prevented);
  assert.equal(doc.activeElement, s.a); // [data-exit] hedefine
});

test('son sahne kazanır: ikinci data-stage açılınca ilk sahne kilitlenir', () => {
  const { doc, body } = makeDom();
  const s = buildScene(doc);
  // modal açıldı (son stage)
  const modal = new El('div', { 'data-stage': '' });
  const mRow = new El('div', { 'data-row': '' });
  const mBtn = new El('button', { 'data-fn': '' }, { left: 0, top: 0, width: 80, height: 36 });
  mRow.append(mBtn);
  modal.append(mRow);
  for (const el of [modal, mRow, mBtn]) el._doc = doc;
  doc.body.append(modal);
  key(doc, body, 'ArrowRight');
  assert.equal(doc.activeElement, mBtn);
  key(doc, mBtn, 'ArrowDown'); // modalda başka satır yok → gitme
  assert.equal(doc.activeElement, mBtn);
});
