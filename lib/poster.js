/**
 * SVG Afiş Üretici (client-safe)
 * Gerçek afiş yoksa / yüklenemezse filmi temsil eden markalı, deterministik bir afiş üretir.
 * Böylece grid'de asla kırık/karanlık kart kalmaz.
 */

const PALETTES = [
  ['#14161f', '#1f2438', '#e50914'],
  ['#0f0c29', '#302b63', '#ffb300'],
  ['#161216', '#3a2334', '#ff5e3a'],
  ['#0d1b2a', '#1b263b', '#4cc9f0'],
  ['#1a1a2e', '#2b2d57', '#f72585'],
  ['#101820', '#243b55', '#67e29f'],
  ['#1c1420', '#41295a', '#c77dff'],
  ['#141e1a', '#1f3d2b', '#80ed99'],
  ['#201a14', '#4a3728', '#ffd166'],
  ['#191919', '#2e2e2e', '#ffffff'],
];

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function hashStr(s) {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function wrapTitle(title, maxLen = 13, maxLines = 3) {
  const words = String(title || 'FİLM').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const candidate = line ? `${line} ${w}` : w;
    if (candidate.length > maxLen && line) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (!lines.length) lines.push('FİLM');
  return lines.map((l) => (l.length > 18 ? l.slice(0, 17) + '…' : l));
}

export function fallbackPoster(title = '', year = '', genre = '') {
  const text = String(title || 'FİLM');
  const h = hashStr(text);
  const [c1, c2, c3] = PALETTES[h % PALETTES.length];
  const lines = wrapTitle(text);

  const tspans = lines
    .map((l, i) => `<tspan x="150" dy="${i === 0 ? 0 : 42}">${escapeXml(l)}</tspan>`)
    .join('');
  const firstY = 232 - (lines.length - 1) * 21;
  const label = [year ? String(year) : '', genre ? String(genre) : '']
    .filter(Boolean)
    .join(' · ');
  const labelSvg = label
    ? `<text x="150" y="372" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="15" letter-spacing="1" fill="#ffffff" fill-opacity="0.72">${escapeXml(label)}</text>`
    : '';

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">` +
    `<defs>` +
    `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="0.55" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient>` +
    `<radialGradient id="r" cx="0.5" cy="0.3" r="0.8"><stop offset="0" stop-color="${c3}" stop-opacity="0.5"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    `<rect width="300" height="450" fill="url(#g)"/>` +
    `<rect width="300" height="450" fill="url(#r)"/>` +
    `<rect x="0" y="0" width="300" height="450" fill="none" stroke="${c3}" stroke-opacity="0.25" stroke-width="6"/>` +
    `<circle cx="150" cy="140" r="46" fill="none" stroke="${c3}" stroke-width="3" stroke-opacity="0.9"/>` +
    `<path d="M137 116 L137 164 L177 140 Z" fill="${c3}"/>` +
    `<text x="150" y="${firstY}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="25" font-weight="bold" fill="#ffffff" fill-opacity="0.95">${tspans}</text>` +
    labelSvg +
    `<line x1="60" y1="402" x2="240" y2="402" stroke="${c3}" stroke-opacity="0.5" stroke-width="1"/>` +
    `<text x="150" y="426" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="10.5" letter-spacing="3.5" fill="${c3}" fill-opacity="0.95">HDFILM CEHENNEMİ</text>` +
    `</svg>`;

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Film objesinden (title/year/genre) hemen afiş üret */
export function posterFor(movie = {}) {
  return fallbackPoster(movie.title, movie.year, (movie.genres || [])[0]);
}
