'use client';

import { useEffect, useRef } from 'react';

/**
 * TV / Uzaktan Kumanda Navigasyonu (Vestel stili)
 *
 * Kurallar:
 * - [data-stage]   : aktif sahneler. En sonda olan (DOM'da en üstteki) kazanır → modal açılınca ana grid kilitlenir.
 * - [data-row]     : satır. Yukarı/Aşağı önce aynı satırın görsel çizgileri arasında, sonra komşu satıra atlar.
 * - [data-fn]      : odak elemanı (kart, buton, link). Sağ/Sol aynı görsel çizgide ilerler, Enter/Boşluk tetikler.
 * - [data-fn-sub]  : alt etkileşim (kart üzeri ℹ/Favori) — mouse/Tab ile, TV okları görmezden gelir.
 * - [data-player]  : oynatıcı alanı. Odak içerideyken oklar oynatıcıya aittir (seek/vol),
 *                   sadece playerExitKey TV nav'a devredilir (UI'ya dönüş).
 * - Escape         : onEscape çağrılır (modal kapat / geri git).
 *
 * Saf anahtar işleyici tvNavKeyHandler(e, ctx) olarak export edilir → node testlerinde sahte DOM ile test edilir.
 */
export function tvNavKeyHandler(e, ctx) {
  const { doc, playerExitKey, playerExitFocus, onEscape } = ctx;

  const t = e.target;
  // Metin girişi aktifse TV nav devre dışı (Escape ile çıkış hariç)
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
    if (e.key === 'Escape' && t.blur) t.blur();
    return;
  }

  const stages = doc.querySelectorAll('[data-stage]');
  const stage = stages.length ? stages[stages.length - 1] : null;
  if (!stage) return;

  const rows = Array.from(stage.querySelectorAll('[data-row]'));
  if (!rows.length) return;

  const itemsIn = (row) => Array.from(row.querySelectorAll('[data-fn]'));
  const centerX = (el) => {
    const r = el.getBoundingClientRect();
    return r.left + r.width / 2;
  };
  const focusEl = (el) => {
    if (!el || el.disabled) return;
    el.focus({ preventScroll: true });
    if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'center' });
  };

  const active = doc.activeElement;
  const inPlayer = !!active && active.closest && active.closest('[data-player]');

  // Oynatıcı odaktayken: sadece çıkış tuşu TV'ye devreder, gerisi player'a
  if (inPlayer) {
    if (playerExitKey && e.key === playerExitKey) {
      e.preventDefault();
      const target = playerExitFocus ? doc.querySelector(playerExitFocus) : itemsIn(rows[0])[0];
      if (target) focusEl(target);
    }
    return;
  }

  const activeItem = active && active.hasAttribute && active.hasAttribute('data-fn') ? active : null;
  const activeRow = activeItem ? activeItem.closest('[data-row]') : null;
  const activeRowIndex = activeRow ? rows.indexOf(activeRow) : -1;

  const topOf = (el) => el.getBoundingClientRect().top;

  // Aynı [data-row] içindeki görsel çizgiler (grid'ler için 2D gezinme)
  const visualLines = (row) => {
    const items = itemsIn(row);
    const lines = [];
    for (const it of items) {
      const tp = topOf(it);
      const same = lines.find((l) => Math.abs(l.y - tp) <= 10);
      if (same) {
        same.items.push(it);
        same.y = (same.y * (same.items.length - 1) + tp) / same.items.length;
      } else {
        lines.push({ y: tp, items: [it] });
      }
    }
    return lines.sort((a, b) => a.y - b.y);
  };

  const nearestIn = (items, cx) => {
    if (!items.length) return null;
    let best = items[0];
    let bestD = Infinity;
    for (const it of items) {
      const d = Math.abs(centerX(it) - cx);
      if (d < bestD) {
        bestD = d;
        best = it;
      }
    }
    return best;
  };

  const move = (dir) => {
    e.preventDefault();
    if (!activeRow) {
      const first = rows[0];
      const items = itemsIn(first);
      if (items.length) focusEl(items[0]);
      return;
    }

    if (dir === 'left' || dir === 'right') {
      const items = itemsIn(activeRow);
      const i = items.indexOf(activeItem);
      if (i === -1) return;
      // aynı görsel çizgide kal (grid düzeni için)
      const lines = visualLines(activeRow);
      const line = lines.find((l) => l.items.includes(activeItem)) || lines[0];
      const lIdx = line.items.indexOf(activeItem);
      const n = Math.min(line.items.length - 1, Math.max(0, lIdx + (dir === 'right' ? 1 : -1)));
      focusEl(line.items[n]);
    } else {
      const step = dir === 'down' ? 1 : -1;
      const lines = visualLines(activeRow);
      const myLine = lines.find((l) => l.items.includes(activeItem));
      const li = myLine ? lines.indexOf(myLine) : -1;

      // önce aynı [data-row] içindeki diğer görsel çizgilere in/çıktı
      const targetLine = lines[li + step];
      if (targetLine) {
        focusEl(nearestIn(targetLine.items, centerX(activeItem)));
        return;
      }
      // sonra komşu [data-row]'a atla
      for (let r = activeRowIndex + step; r >= 0 && r < rows.length; r += step) {
        const items = itemsIn(rows[r]);
        if (!items.length) continue;
        const tLines = visualLines(rows[r]);
        const target = dir === 'down' ? tLines[0] : tLines[tLines.length - 1];
        focusEl(nearestIn((target && target.items) || items, centerX(activeItem)));
        return;
      }
    }
  };

  switch (e.key) {
    case 'ArrowRight': move('right'); break;
    case 'ArrowLeft': move('left'); break;
    case 'ArrowDown': move('down'); break;
    case 'ArrowUp': move('up'); break;
    case 'Enter':
    case ' ':
      if (activeItem) {
        e.preventDefault();
        if (activeItem.click) activeItem.click();
      }
      break;
    case 'Escape':
      if (activeItem || (!active || active === doc.body)) {
        e.preventDefault();
        if (onEscape) onEscape();
      }
      break;
    default:
      break;
  }
}

/**
 * React hook: TvNav'ı sayfaya bağlar.
 * @param {object} opts
 * @param {boolean} opts.enabled
 * @param {Function} opts.onEscape
 * @param {string} opts.playerExitKey      (varsayılan null) — oynatıcıdan çıkış tuşu
 * @param {string} opts.playerExitFocus    (varsayılan null) — çıkışta odak atılacak seçici
 * @param {string} opts.focusOnMount       (varsayılan null) — açılışta odak atılacak seçici
 */
export function useTvNav({ enabled = true, onEscape, playerExitKey = null, playerExitFocus = null, focusOnMount = null } = {}) {
  const ctxRef = useRef({});
  ctxRef.current = { doc: typeof document !== 'undefined' ? document : null, onEscape, playerExitKey, playerExitFocus };

  useEffect(() => {
    if (!enabled) return undefined;

    const onKey = (e) => tvNavKeyHandler(e, ctxRef.current);
    const syncDim = () => {
      const a = document.activeElement;
      const on = !!(a && a.hasAttribute && a.hasAttribute('data-fn'));
      document.body.classList.toggle('tv-nav-on', on);
    };

    window.addEventListener('keydown', onKey, true);
    document.addEventListener('focusin', syncDim);
    document.addEventListener('focusout', syncDim);

    if (focusOnMount) {
      const t = setTimeout(() => {
        const el = document.querySelector(focusOnMount);
        if (el) {
          el.focus({ preventScroll: true });
          if (el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'center' });
        }
      }, 60);
      return () => {
        clearTimeout(t);
        window.removeEventListener('keydown', onKey, true);
        document.removeEventListener('focusin', syncDim);
        document.removeEventListener('focusout', syncDim);
        document.body.classList.remove('tv-nav-on');
      };
    }

    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusin', syncDim);
      document.removeEventListener('focusout', syncDim);
      document.body.classList.remove('tv-nav-on');
    };
  }, [enabled, focusOnMount]);

  return null;
}
