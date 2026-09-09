/**
 * HDFilmCehennemi ortak kütüphanesi
 * - Çok stratejili fetch (direkt → mirror → ZenRows/ScraperAPI → Translate köprüsü → public proxy)
 * - Liste / arama / detay ayrıştırıcıları
 * - Video çözücü: alternatif kaynaklar → /video/{id}/ → iframe → packed JS → dc_hello / dc_xxx → m3u8
 * - HLS M3U8 rewrite, AES-128 key proxying, Range request ve hata kurtarma
 */
import * as cheerio from 'cheerio';
import { RAW_MOVIES, SAMPLE_HLS_STREAMS } from './catalog-data.js';

export const BASE_URL = (process.env.HDFC_BASE || 'https://hdfilmcehennemi.la').replace(/\/$/, '');
export const EMBED_BASE = 'https://hdfilmcehennemi.mobi';
export const MIRRORS = [...new Set([
  BASE_URL,
  'https://hdfilmcehennemi.la',
  'https://www.hdfilmcehennemi.la',
  'https://www.hdfilmcehennemi.com',
  'https://www.hdfilmcehennemi.nl',
  'https://www.hdfilmcehennemi.ws',
  'https://hdfilmcehennemini.org',
  'https://hdfilmcehennemi.top',
  'https://hdfilmcehennemi.life',
  'https://hdfilmcehennemi.cx',
  'https://hdfilmcehennemi.cc',
])];

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export const LISTS = [
  { key: 'home', name: 'Yeni Eklenenler', path: 'home', group: 'liste' },
  { key: 'all', name: 'Tüm Filmler', path: 'categories/film-izle-2', group: 'liste' },
  { key: 'vizyon', name: 'Vizyondaki Filmler', path: 'categories/vizyondaki-filmler', group: 'liste' },
  { key: 'nette-ilk', name: 'Nette İlk', path: 'categories/nette-ilk-filmler', group: 'liste' },
  { key: 'tavsiye', name: 'Tavsiye', path: 'categories/tavsiye-filmler-izle2', group: 'liste' },
  { key: 'imdb7', name: 'IMDb 7+', path: 'imdb7', group: 'liste' },
  { key: 'liked', name: 'En Çok Beğenilen', path: 'mostLiked', group: 'liste' },
  { key: 'commented', name: 'En Çok Yorumlanan', path: 'mostCommented', group: 'liste' },
  { key: 'series', name: 'Diziler', path: 'home-series', group: 'dizi' },
  { key: 'aksiyon', name: 'Aksiyon', path: 'genres/aksiyon-filmleri-izleyin-5', group: 'tür' },
  { key: 'macera', name: 'Macera', path: 'genres/macera-filmleri-izle-1', group: 'tür' },
  { key: 'animasyon', name: 'Animasyon', path: 'genres/animasyon-filmlerini-izleyin-5', group: 'tür' },
  { key: 'bilim-kurgu', name: 'Bilim Kurgu', path: 'genres/bilim-kurgu-filmlerini-izleyin-3', group: 'tür' },
  { key: 'komedi', name: 'Komedi', path: 'genres/komedi-filmlerini-izleyin-1', group: 'tür' },
  { key: 'korku', name: 'Korku', path: 'genres/korku-filmlerini-izle-4', group: 'tür' },
  { key: 'gerilim', name: 'Gerilim', path: 'genres/gerilim-filmleri-izle-1', group: 'tür' },
  { key: 'dram', name: 'Dram', path: 'genres/dram-filmleri-izle-1', group: 'tür' },
  { key: 'fantastik', name: 'Fantastik', path: 'genres/fantastik-filmleri-izle-1', group: 'tür' },
  { key: 'suc', name: 'Suç', path: 'genres/suc-filmleri-izle-3', group: 'tür' },
  { key: 'gizem', name: 'Gizem', path: 'genres/gizem-filmleri-izle-1', group: 'tür' },
  { key: 'aile', name: 'Aile', path: 'genres/aile-filmleri-izleyin-6', group: 'tür' },
  { key: 'romantik', name: 'Romantik', path: 'genres/romantik-filmleri-izle-2', group: 'tür' },
  { key: 'savas', name: 'Savaş', path: 'genres/savas-filmleri-izle-1', group: 'tür' },
  { key: 'belgesel', name: 'Belgesel', path: 'genres/belgesel-filmlerini-izle-1', group: 'tür' },
  { key: 'tarih', name: 'Tarih', path: 'genres/tarih-filmleri-izle-4', group: 'tür' },
];

/* ─────────────────────────── fetch katmanı ─────────────────────────── */

function isBlocked(text, status) {
  if ([403, 429, 451, 503].includes(status)) return true;
  const head = (text || '').slice(0, 4000);
  return /Just a moment|Bir dakika lütfen|cf-browser-verification|Yasal Nedenlerle|Please contact the site owner|Attention Required/i.test(head);
}

function toTranslate(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/-/g, '--').replace(/\./g, '-');
  const sep = u.search ? '&' : '?';
  return `https://${host}.translate.goog${u.pathname}${u.search}${sep}_x_tr_sl=tr&_x_tr_tl=tr&_x_tr_hl=tr&_x_tr_pto=wapp`;
}

function cleanTranslate(text) {
  return text
    .replace(/https?:\/\/www-hdfilmcehennemi-[a-z0-9-]+\.translate\.goog/g, BASE_URL)
    .replace(/[?&]_x_tr_[a-z]+=[^&"'\s]*/g, '');
}

async function tryFetch(url, init, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow', cache: 'no-store' });
    const text = await res.text();
    if (isBlocked(text, res.status)) return null;
    if (res.status === 404) return { text: '', status: 404 };
    if (!res.ok) return null;
    return { text, status: res.status, url: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

let activeBase = BASE_URL;
export function getActiveBase() { return activeBase; }

/**
 * @param {string} pathOrUrl  '/load/page/1/home/' veya tam URL
 * @param {{api?:boolean, referer?:string, method?:string, body?:any, headers?:object, userKey?:string}} opts
 */
export async function smartFetch(pathOrUrl, opts = {}) {
  const { api = true, referer, method = 'GET', body, headers: extra = {}, userKey } = opts;
  const absolute = /^https?:\/\//.test(pathOrUrl);
  const baseHeaders = {
    'User-Agent': UA,
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
    Accept: api ? '*/*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    ...(api ? { 'X-Requested-With': 'fetch' } : {}),
    ...extra,
  };
  const bases = absolute ? [null] : [activeBase, ...MIRRORS.filter((m) => m !== activeBase)];

  // 1) direkt / mirror
  for (const base of bases) {
    const url = absolute ? pathOrUrl : `${base}${pathOrUrl}`;
    const h = { ...baseHeaders, Referer: referer || `${base || activeBase}/` };
    const r = await tryFetch(url, { method, body, headers: h });
    if (r && r.text) {
      if (base && base !== activeBase) activeBase = base;
      return r.text;
    }
  }

  const url = absolute ? pathOrUrl : `${activeBase}${pathOrUrl}`;
  if (method !== 'GET') return null;

  // 2) ZenRows / ScraperAPI (Özel key varsa öncelikli)
  const zKey = userKey || process.env.ZENROWS_API_KEY;
  if (zKey) {
    const zr = `https://api.zenrows.com/v1/?apikey=${zKey}&url=${encodeURIComponent(url)}&custom_headers=true`;
    const r = await tryFetch(zr, { headers: { 'X-Requested-With': 'fetch', Referer: `${activeBase}/` } }, 30000);
    if (r && r.text) return r.text;
  }

  const saKey = userKey || process.env.SCRAPERAPI_KEY;
  if (saKey) {
    const sa = `https://api.scraperapi.com/?api_key=${saKey}&keep_headers=true&url=${encodeURIComponent(url)}`;
    const r = await tryFetch(sa, { headers: baseHeaders }, 30000);
    if (r && r.text) return r.text;
  }

  // 3) Google Translate köprüsü
  try {
    const r = await tryFetch(toTranslate(url), { headers: baseHeaders });
    if (r && r.text) return cleanTranslate(r.text);
  } catch { /* */ }

  // 4) Public proxy'ler
  for (const p of [
    `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    `https://corsproxy.io/?${encodeURIComponent(url)}`,
  ]) {
    const r = await tryFetch(p, { headers: baseHeaders });
    if (r && r.text) return r.text;
  }
  return null;
}

export async function smartJson(path, opts) {
  const text = await smartFetch(path, opts);
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  if (text.includes('<a')) return { html: text };
  return null;
}

/* ─────────────────────────── ayrıştırıcılar ────────────────────────── */

export function fixUrl(u) {
  if (!u) return null;
  u = String(u).replace(/\\\//g, '/').replace(/\\/g, '').trim();
  if (u.startsWith('http')) return u;
  if (u.startsWith('//')) return 'https:' + u;
  return `${BASE_URL}${u.startsWith('/') ? '' : '/'}${u}`;
}

export function slugOf(href) {
  try {
    const p = new URL(href).pathname.replace(/^\/|\/$/g, '');
    return p.split('/').pop() || href;
  } catch { return href; }
}

export function parseCards(html) {
  const $ = cheerio.load(html || '');
  const out = [];
  const seen = new Set();
  let anchors = $('a.poster');
  if (!anchors.length) anchors = $('a');
  anchors.each((_, el) => {
    const a = $(el);
    let href = a.attr('href');
    if (!href) return;
    href = fixUrl(href);
    if (!/hdfilmcehennemi/.test(href) && !href.startsWith('http')) return;
    const img = a.find('img').first();
    if (!img.length) return;
    const title = (a.attr('title') || a.find('strong.poster-title, h4.title, .title').first().text() || img.attr('alt') || '')
      .replace(/\s+/g, ' ').replace(/ izle$/i, '').trim();
    const poster = fixUrl(img.attr('data-src') || img.attr('src'));
    if (!title || !poster || poster.startsWith('data:')) return;
    const id = slugOf(href);
    if (seen.has(id)) return;
    seen.add(id);
    const imdbTxt = a.find('span.imdb, .imdb').first().text();
    const imdb = imdbTxt && /\d/.test(imdbTxt) ? parseFloat(imdbTxt.match(/\d+(?:[.,]\d+)?/)[0].replace(',', '.')) : null;
    const ym = id.match(/(?:19|20)\d{2}/);
    out.push({
      id, title, href, poster, imdb,
      year: ym ? parseInt(ym[0]) : null,
      type: href.includes('/dizi/') ? 'dizi' : 'film',
    });
  });
  return out;
}

export async function fetchList(path, page = 1) {
  const data = await smartJson(`/load/page/${page}/${path.replace(/^\/|\/$/g, '')}/`);
  if (!data || !data.html || /Sayfa Bulunamadı/.test(data.html)) {
    // Fallback filter from raw movies if remote is not responding
    const pLower = path.toLowerCase();
    const local = RAW_MOVIES.filter((m) => {
      if (pLower.includes('dizi')) return m.type === 'dizi';
      if (pLower.includes('imdb7')) return (m.imdb || 0) >= 7.0;
      if (pLower.includes('vizyon')) return m.year >= 2024;
      return m.genres?.some((g) => pLower.includes(g.toLowerCase()));
    });
    return { movies: local.slice((page - 1) * 12, page * 12), hasMore: local.length > page * 12 };
  }
  const movies = parseCards(data.html);
  return { movies, hasMore: movies.length >= 12 };
}

export async function search(q) {
  const needle = (q || '').trim().toLowerCase();
  if (!needle) return [];

  // 1) Siteden canlı arama dene
  try {
    const data = await smartJson(`/search?q=${encodeURIComponent(q)}`);
    if (data && Array.isArray(data.results) && data.results.length) {
      const seen = new Set();
      const res = [];
      for (const frag of data.results) {
        for (const m of parseCards(frag)) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          m.poster = m.poster.replace('/thumb/', '/list/');
          res.push(m);
        }
      }
      if (res.length) return res;
    }
  } catch { /* */ }

  // 2) Yerel katalogdan eşleştir
  return RAW_MOVIES.filter((m) =>
    m.title.toLowerCase().includes(needle) ||
    (m.originalTitle && m.originalTitle.toLowerCase().includes(needle)) ||
    (m.director && m.director.toLowerCase().includes(needle)) ||
    (m.cast && m.cast.some((c) => c.toLowerCase().includes(needle))) ||
    (m.genres && m.genres.some((g) => g.toLowerCase().includes(needle)))
  );
}

export function parseDetail(html, url) {
  const $ = cheerio.load(html);
  const title = ($('h1.section-title, .section-title').first().text() || '').split(/\s+izle\b/)[0].trim();
  const genres = $('div.post-info-genres a').map((_, e) => $(e).text().trim()).get();
  const yc = $('div.post-info-year-country a').map((_, e) => $(e).text().trim()).get();
  const year = parseInt((yc.find((t) => /^\d{4}$/.test(t)) || '')) || null;
  const country = yc.find((t) => !/^\d{4}$/.test(t)) || null;
  const imdbTxt = $('div.post-info-imdb-rating span').first().text();
  const imdb = /\d/.test(imdbTxt) ? parseFloat(imdbTxt.match(/\d+(?:[.,]\d+)?/)[0].replace(',', '.')) : null;
  const description = $('article.post-info-content > p, div.post-info-content > p').first().text().trim() || null;
  const cast = $('div.post-info-cast a').map((_, e) => $(e).find('strong').text().trim()).get().filter(Boolean);
  const duration = $('.post-info-duration').first().text().trim() || null;
  const tr = $('div.post-info-trailer button[data-modal]').attr('data-modal');
  const trailer = tr ? `https://www.youtube.com/watch?v=${tr.split('trailer/').pop()}` : null;
  const posterEl = $('aside.post-info-poster img, .post-info-poster img').last();
  const poster = fixUrl(posterEl.attr('data-src') || posterEl.attr('src'));
  const sources = [];
  $('div.alternative-links').each((_, blk) => {
    const lang = ($(blk).attr('data-lang') || '').toUpperCase();
    $(blk).find('button.alternative-link[data-video]').each((__, b) => {
      sources.push({
        videoId: $(b).attr('data-video'),
        name: $(b).text().replace(/\(HDrip Xbet\)/g, '').trim(),
        lang,
        active: $(b).attr('data-active') === '1',
      });
    });
  });
  if (!sources.length) {
    $('button.alternative-link[data-video]').each((_, b) => {
      sources.push({ videoId: $(b).attr('data-video'), name: $(b).text().trim(), lang: '', active: false });
    });
  }
  const episodes = $('div.seasons-tab-content a').map((_, a) => ({
    title: $(a).find('h3, h4').first().text().trim(),
    href: fixUrl($(a).attr('href')),
  })).get();
  const recommendations = parseCards($('div.section-slider-container').html() || '');
  return {
    id: slugOf(url), href: url, title, genres, year, country, imdb, description,
    cast, duration, trailer, poster, sources, episodes, recommendations,
    type: episodes.length ? 'dizi' : 'film',
  };
}

/* ─────────────────────────── kod çözücüler ─────────────────────────── */

const b64 = (s) => Buffer.from(s, 'base64').toString('latin1');
const rev = (s) => s.split('').reverse().join('');
const rot13 = (s) => s.replace(/[A-Za-z]/g, (c) => {
  const b = c <= 'Z' ? 65 : 97;
  return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b);
});
const unmix = (s) => {
  let o = '';
  for (let i = 0; i < s.length; i++) o += String.fromCharCode((s.charCodeAt(i) - (399756995 % (i + 5)) + 256) % 256);
  return o;
};
const looksUrl = (s) => !!s && s.length > 10 && !/[\x00-\x08\x0E-\x1F]/.test(s) && (/^https?:\/\//i.test(s) || /m3u8|\.mp4|\/hls\//.test(s));

/** Eski format: dc_hello("base64") → base64 → reverse → base64 → son parça */
export function dcHelloLegacy(input) {
  try {
    const once = b64(input);
    const twice = b64(rev(once));
    let link = twice;
    for (const sep of ['+', ' ', '|']) if (link.includes(sep)) { link = link.split(sep).pop(); break; }
    if (link.includes('https')) link = 'https' + link.split('https').pop();
    return looksUrl(link) ? link : null;
  } catch { return null; }
}

/** Yeni format: dc_xxx(["p1","p2",...]) – site algoritma sırasını dönüşümlü değiştiriyor, hepsini dene */
export function dcDecodeParts(parts) {
  const s = parts.join('');
  const strategies = [
    () => unmix(rev(rot13(b64(s)))),          // base64 → rot13 → reverse → unmix  (Aniyomi)
    () => unmix(rot13(rev(b64(s)))),          // base64 → reverse → rot13 → unmix  (Aralık 2025)
    () => unmix(rev(b64(rot13(s)))),          // rot13 → base64 → reverse → unmix  (Close)
    () => unmix(b64(rev(rot13(s)))),          // rot13 → reverse → base64 → unmix
    () => unmix(b64(rot13(rev(s)))),          // reverse → rot13 → base64 → unmix
    () => unmix(rot13(b64(rev(s)))),          // reverse → base64 → rot13 → unmix
    () => unmix(b64(b64(rev(s)))),            // reverse → base64 → base64 → unmix (Rapidrame)
    () => unmix(b64(b64(rev(rot13(s))))),
    () => dcHelloLegacy(s),
  ];
  for (const fn of strategies) {
    try {
      const r = fn();
      if (looksUrl(r)) return r.startsWith('http') ? r : 'https' + r.slice(r.indexOf('://'));
    } catch { /* */ }
  }
  return null;
}

/** Dean Edwards p,a,c,k,e,d unpacker (eval kullanmadan) */
export function unpack(source) {
  const out = [];
  const re = /eval\(function\(p,a,c,k,e,(?:d|r)\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/g;
  let m;
  while ((m = re.exec(source))) {
    const p = m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    const a = parseInt(m[2]);
    const k = m[4].split('|');
    const enc = (c) => (c < a ? '' : enc(Math.floor(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    const dict = {};
    for (let i = 0; i < k.length; i++) dict[enc(i)] = k[i] || enc(i);
    out.push(p.replace(/\b\w+\b/g, (w) => dict[w] ?? w));
  }
  return out.join('\n');
}

function parseQuoted(src) {
  const vals = [];
  const re = /"([^"]*)"|'([^']*)'/g;
  let m;
  while ((m = re.exec(src))) vals.push(m[1] !== undefined ? m[1] : m[2]);
  return vals;
}

export function resolveVideoFromScript(script) {
  const combined = script + '\n' + unpack(script);
  // 0) eski dc_hello("...")
  const legacy = combined.match(/dc_hello\(\s*["']([^"']+)["']\s*\)/i);
  if (legacy) { const u = dcHelloLegacy(legacy[1]); if (u) return u; }
  // 1) file_link = "..." (tırnaklı parça dizisi)
  const fl = combined.match(/file_link\s*=\s*"([^"]+)";/i);
  if (fl) {
    const u = dcDecodeParts(parseQuoted(fl[1]).length ? parseQuoted(fl[1]) : [fl[1]]);
    if (u) return u;
  }
  // 2) dc_xxx([...]) veya var X = fn([...])
  const arrs = [...combined.matchAll(/(?:dc_\w+|[\w$]+)\(\s*\[((?:\s*["'][^"']*["']\s*,?)+)\]\s*\)/g)];
  for (const a of arrs) {
    const u = dcDecodeParts(parseQuoted(a[1]));
    if (u) return u;
  }
  // 3) direkt
  const d = combined.match(/sources\s*:\s*\[\s*\{\s*file\s*:\s*"([^"]+\.m3u8[^"]*)"/i)
    || combined.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i)
    || combined.match(/["'](https?:\/\/[^"']+master\.txt[^"']*)["']/i)
    || combined.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/i);
  return d ? d[1].replace(/\\\//g, '/') : null;
}

export function parseTracks(html, origin) {
  const subs = [];
  const $ = cheerio.load(html);
  $('track[src]').each((_, t) => {
    const kind = $(t).attr('kind') || 'captions';
    if (!/captions|subtitles/.test(kind)) return;
    let src = $(t).attr('src');
    if (!src.startsWith('http')) src = origin + (src.startsWith('/') ? '' : '/') + src;
    subs.push({ url: src, label: $(t).attr('label') || $(t).attr('srclang') || 'TR', lang: $(t).attr('srclang') || '' });
  });
  const m = html.match(/tracks\s*:\s*(\[[\s\S]*?\])\s*[,}]/i);
  if (m) {
    try {
      const arr = JSON.parse(m[1]);
      for (const t of arr) {
        if (!t.file || !/captions|subtitles/.test(t.kind || 'captions')) continue;
        let src = String(t.file).replace(/\\\//g, '/');
        if (!src.startsWith('http')) src = origin + (src.startsWith('/') ? '' : '/') + src;
        if (!subs.some((s) => s.url === src)) subs.push({ url: src, label: t.label || t.language || 'TR', lang: t.language || '' });
      }
    } catch { /* */ }
  }
  return subs;
}

/* ─────────────────────────── video çözümleme ───────────────────────── */

async function getIframeForVideo(videoId, pageUrl, userKey) {
  const raw = await smartFetch(`/video/${videoId}/`, {
    api: true,
    referer: pageUrl,
    headers: { 'Content-Type': 'application/json' },
    userKey,
  });
  if (!raw) return null;
  let html = raw;
  try {
    const j = JSON.parse(raw);
    html = (j.data && j.data.html) || j.html || raw;
  } catch { /* */ }
  const cls = (html.match(/class=\\?["']([^"'\\]+)/i) || [])[1] || '';
  let src = (html.match(/data-src=\\?["']([^"'\\]+)/i) || html.match(/\ssrc=\\?["']([^"'\\]+)/i) || [])[1];
  if (!src) return null;
  src = src.replace(/\\\//g, '/').replace(/\\/g, '').replace('{rapidrame_id}', '');
  return { iframe: src, cls: cls.toLowerCase() };
}

async function resolveEmbed(iframeUrl, pageUrl, sourceName, userKey) {
  const base = getActiveBase();
  let url = iframeUrl;
  const isRapid = /rplayer|rapidrame/i.test(url) || /rapidrame/i.test(sourceName);
  if (url.includes('rapidrame_id=')) {
    const id = url.split('rapidrame_id=')[1].split('&')[0];
    if (id) url = `${base}/rplayer/${id}/`;
  }
  if (url.startsWith('/')) url = base + url;
  if (/\/rplayer\/[^/?]+$/.test(url)) url += '/';

  const candidates = [url];
  if (!isRapid && iframeUrl.includes('rapidrame_id=')) candidates.push(iframeUrl);

  for (const u of candidates) {
    let origin = EMBED_BASE;
    try { origin = new URL(u).origin; } catch { /* */ }
    const html = await smartFetch(u, { api: false, referer: `${base}/`, userKey });
    if (!html) continue;
    const $ = cheerio.load(html);
    let script = '';
    $('script').each((_, s) => {
      const d = $(s).html() || '';
      if (/eval\(function\(p,a,c,k,e|sources\s*:|file_link|dc_hello/.test(d)) script += d + '\n';
    });
    if (!script) script = html;
    let m3u8 = resolveVideoFromScript(script);
    if (!m3u8) {
      const th = html.match(/hdfilmcehennemi\.mobi\/img\/([^"'\s]+)\.(?:jpg|webp)/i);
      if (th) m3u8 = `__CDN__/hls/${th[1]}.mp4/txt/master.txt`;
    }
    if (!m3u8) continue;
    const subtitles = parseTracks(html, origin);
    return { m3u8, referer: u, origin, subtitles };
  }
  return null;
}

const CDN_HOSTS = [
  'srv12.cdnimages96.shop', 'srv12.cdnimages1128.shop', 'srv12.cdnimages1132.shop',
  'srv12.cdnimages1397.shop', 'srv12.cdnimages784.shop', 'srv12.cdnimages965.shop',
  'srv12.cdnimages403.shop', 'srv12.cdnimages391.shop',
];

async function fixCdnPlaceholder(res) {
  if (!res.m3u8.startsWith('__CDN__')) return res;
  const path = res.m3u8.replace('__CDN__', '');
  for (const h of CDN_HOSTS) {
    const u = `https://${h}${path}`;
    const r = await tryFetch(u, { headers: { 'User-Agent': UA, Referer: EMBED_BASE + '/', Origin: EMBED_BASE } }, 8000);
    if (r && r.text && r.text.includes('#EXTM3U')) return { ...res, m3u8: u, referer: EMBED_BASE + '/', origin: EMBED_BASE };
  }
  return null;
}

export function findLocalMovie(idOrUrl) {
  const sid = slugOf(idOrUrl);
  return RAW_MOVIES.find((m) => m.id === sid || m.href === idOrUrl || (m.title && idOrUrl.includes(m.id)));
}

/**
 * Film sayfasından tüm oynatılabilir kaynakları çıkarır.
 * Canlı siteden çözemezse yedek zengin kaynak havuzunu devreye sokar.
 */
export async function resolveMovie(pageUrl, { all = true, userKey = '' } = {}) {
  let liveDetail = null;
  const errors = [];
  const results = [];

  try {
    const html = await smartFetch(pageUrl, { api: false, userKey });
    if (html) {
      liveDetail = parseDetail(html, pageUrl);
      if (!liveDetail.sources.length) {
        const $ = cheerio.load(html);
        const ifr = $('iframe').attr('data-src') || $('iframe').attr('src');
        if (ifr) liveDetail.sources.push({ videoId: null, name: 'Varsayılan', lang: '', iframe: fixUrl(ifr) });
      }

      const order = (s) => (/rapidrame/i.test(s.name) ? 0 : /close/i.test(s.name) ? 1 : 2);
      const sorted = [...liveDetail.sources].sort((a, b) => order(a) - order(b));

      for (const s of sorted) {
        try {
          const iframeInfo = s.iframe ? { iframe: s.iframe, cls: '' } : await getIframeForVideo(s.videoId, pageUrl, userKey);
          if (!iframeInfo) { errors.push(`${s.name}: iframe yok`); continue; }
          let r = await resolveEmbed(iframeInfo.iframe, pageUrl, s.name + ' ' + iframeInfo.cls, userKey);
          if (r) r = await fixCdnPlaceholder(r);
          if (!r) { errors.push(`${s.name}: çözülemedi`); continue; }
          results.push({ name: s.name, lang: s.lang, videoId: s.videoId, ...r });
          if (!all) break;
        } catch (e) {
          errors.push(`${s.name}: ${e.message}`);
        }
      }
    }
  } catch (err) {
    errors.push(`Canlı arama hatası: ${err.message}`);
  }

  // Eğer canlı siteden kaynak elde edildiyse dön
  if (results.length) {
    return {
      title: liveDetail?.title || 'Film',
      poster: liveDetail?.poster,
      year: liveDetail?.year,
      imdb: liveDetail?.imdb,
      genres: liveDetail?.genres || [],
      description: liveDetail?.description,
      sources: results,
      errors,
    };
  }

  // Canlı çözülemediyse yerel zengin katalog eşleşmesine bak
  const fallback = findLocalMovie(pageUrl);
  const fallbackSources = SAMPLE_HLS_STREAMS.map((s, idx) => ({
    name: s.name,
    lang: s.lang,
    videoId: `demo-${idx + 1}`,
    m3u8: s.m3u8Url,
    referer: 'https://hdfilmcehennemi.mobi/',
    origin: 'https://hdfilmcehennemi.mobi',
    subtitles: s.subtitles || [],
  }));

  if (fallback) {
    return {
      title: fallback.title,
      poster: fallback.poster,
      year: fallback.year,
      imdb: fallback.imdb,
      genres: fallback.genres || [],
      description: fallback.description,
      trailer: fallback.trailer,
      duration: fallback.duration,
      cast: fallback.cast,
      sources: fallbackSources,
      errors: errors.length ? errors : ['Canlı kaynak geçici olarak ulaşılamadı; yedek HD HLS stream devreye alındı.'],
    };
  }

  // Bilinmeyen film olsa bile başlığı URL'den türetip oynatılabilir stream sağla
  const id = slugOf(pageUrl);
  const titleFromSlug = id.replace(/-\d+$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title: titleFromSlug,
    poster: `https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg`,
    year: parseInt(id.match(/(?:19|20)\d{2}/)?.[0] || '2024'),
    imdb: 7.5,
    genres: ['Aksiyon', 'Macera'],
    description: 'Film bilgileri canlı siteden aktarılamadı. Doğrudan özel key veya alternatif HLS kaynakları ile izleyebilirsiniz.',
    sources: fallbackSources,
    errors: ['Siteye doğrudan erişim engelli veya anahtar gerektiriyor. Özel Stream veya Demo kaynak devrede.'],
  };
}

/* ─────────────────────────── proxy yardımcıları ────────────────────── */

export function encodeProxyUrl(target, referer, extraParams = {}) {
  const p = new URLSearchParams({ url: target });
  if (referer) p.set('ref', referer);
  if (extraParams.key) p.set('key', extraParams.key);
  if (extraParams.token) p.set('token', extraParams.token);
  return `/api/stream?${p.toString()}`;
}

/** m3u8 içindeki tüm URI'leri (segmentler, AES-128 anahtarları, alt oynatma listeleri) proxy'den geçecek şekilde yeniden yazar */
export function rewriteM3u8(text, baseUrl, referer, extraParams = {}) {
  const abs = (u) => {
    try {
      if (/^https?:\/\//i.test(u)) return u;
      return new URL(u, baseUrl).href;
    } catch {
      return u;
    }
  };

  return text.split('\n').map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) {
      // #EXT-X-KEY, #EXT-X-MEDIA, #EXT-X-MAP içindeki URI="xyz" veya URI=xyz
      return t.replace(/URI=(?:"([^"]+)"|'([^']+)'|([^\s,]+))/g, (match, q1, q2, q3) => {
        const rawUri = q1 || q2 || q3;
        const proxied = encodeProxyUrl(abs(rawUri), referer, extraParams);
        return `URI="${proxied}"`;
      });
    }
    // Alt m3u8 veya TS / MP4 segment satırı
    return encodeProxyUrl(abs(t), referer, extraParams);
  }).join('\n');
}
