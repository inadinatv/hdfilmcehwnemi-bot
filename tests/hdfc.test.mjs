import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dcDecodeParts,
  dcHelloLegacy,
  unpack,
  resolveVideoFromScript,
  parseCards,
  parseDetail,
  rewriteM3u8,
  parseTracks,
  encodeProxyUrl,
  search,
  resolveMovie,
} from '../lib/hdfc.js';

// ---- yardımcı: sitenin obfuscation'ını tersine üret ----
const mix = (s) => { let o = ''; for (let i = 0; i < s.length; i++) o += String.fromCharCode((s.charCodeAt(i) + (399756995 % (i + 5))) % 256); return o; };
const rot13 = (s) => s.replace(/[A-Za-z]/g, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); });
const rev = (s) => s.split('').reverse().join('');
const b64e = (s) => Buffer.from(s, 'latin1').toString('base64');
const URL_ = 'https://srv12.cdnimages96.shop/hls/abc123.mp4/txt/master.txt?t=xyz';
const split = (s) => [s.slice(0, 7), s.slice(7, 20), s.slice(20)];

test('variant: base64 → rot13 → reverse → unmix (Aniyomi)', () => {
  const enc = b64e(rot13(rev(mix(URL_))));
  assert.equal(dcDecodeParts(split(enc)), URL_);
});
test('variant: base64 → reverse → rot13 → unmix (Aralık 2025)', () => {
  const enc = b64e(rev(rot13(mix(URL_))));
  assert.equal(dcDecodeParts(split(enc)), URL_);
});
test('variant: rot13 → base64 → reverse → unmix (Close)', () => {
  const enc = rot13(b64e(rev(mix(URL_))));
  assert.equal(dcDecodeParts(split(enc)), URL_);
});
test('variant: reverse → base64 → base64 → unmix (Rapidrame)', () => {
  const enc = rev(b64e(b64e(mix(URL_))));
  assert.equal(dcDecodeParts(split(enc)), URL_);
});
test('legacy dc_hello', () => {
  const inner = b64e('junk|' + URL_);
  const enc = b64e(rev(inner));
  assert.equal(dcHelloLegacy(enc), URL_);
});

test('unpack p,a,c,k,e,d', () => {
  const packed = `eval(function(p,a,c,k,e,d){e=function(c){return c.toString(36)};if(!''.replace(/^/,String)){while(c--){d[c.toString(a)]=k[c]||c.toString(a)}k=[function(e){return d[e]}];e=function(){return'\\\\w+'};c=1};while(c--){if(k[c]){p=p.replace(new RegExp('\\\\b'+e(c)+'\\\\b','g'),k[c])}}return p}('0 1=2("3");',4,4,'var|x|dc_hello|QUJD'.split('|'),0,{}))`;
  assert.match(unpack(packed), /var x=dc_hello\("QUJD"\);/);
});

test('resolveVideoFromScript – packed dc_xxx([...])', () => {
  const enc = b64e(rot13(rev(mix(URL_))));
  const [a, b, c] = split(enc);
  const script = `var file_link = dc_kdsl(["${a}","${b}","${c}"]); jwplayer().setup({sources:[{file:file_link}]});`;
  assert.equal(resolveVideoFromScript(script), URL_);
});

test('parseCards', () => {
  const html = `<div><a class="poster" href="/the-furious-2026-7/" title="Amansız - The Furious"><img data-src="https://www.hdfilmcehennemi.nl/images/list/poster/x.webp"><strong class="poster-title">Amansız</strong><span class="imdb">7,4</span></a></div>`;
  const c = parseCards(html);
  assert.equal(c.length, 1);
  assert.equal(c[0].id, 'the-furious-2026-7');
  assert.equal(c[0].year, 2026);
  assert.equal(c[0].imdb, 7.4);
});

test('parseDetail sources', () => {
  const html = `<h1 class="section-title">Test Film izle</h1>
  <div class="post-info-genres"><a>Aksiyon</a><a>Dram</a></div>
  <div class="post-info-year-country"><a>2024</a><a>ABD</a></div>
  <div class="post-info-imdb-rating"><span>7.1 (100)</span></div>
  <div class="alternative-links" data-lang="tr"><button class="alternative-link" data-video="v1" data-active="1">Close</button><button class="alternative-link" data-video="v2">Rapidrame</button></div>
  <div class="alternative-links" data-lang="en"><button class="alternative-link" data-video="v3">Close (HDrip Xbet)</button></div>`;
  const d = parseDetail(html, 'https://www.hdfilmcehennemi.nl/test-film-1/');
  assert.equal(d.title, 'Test Film');
  assert.equal(d.year, 2024); assert.equal(d.country, 'ABD'); assert.equal(d.imdb, 7.1);
  assert.deepEqual(d.sources.map((s) => [s.videoId, s.name, s.lang]), [['v1', 'Close', 'TR'], ['v2', 'Rapidrame', 'TR'], ['v3', 'Close', 'EN']]);
});

test('rewriteM3u8 handles audio, segments and AES-128 keys', () => {
  const m = `#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="enc.key",IV=0x123\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/tr.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1\nindex-f1.m3u8\n`;
  const out = rewriteM3u8(m, 'https://cdn.example/hls/master.txt', 'https://ref/', { key: 'secret123' });
  assert.match(out, /URI="\/api\/stream\?url=https%3A%2F%2Fcdn.example%2Fhls%2Fenc\.key&ref=https%3A%2F%2Fref%2F&key=secret123"/);
  assert.match(out, /URI="\/api\/stream\?url=https%3A%2F%2Fcdn.example%2Fhls%2Faudio%2Ftr\.m3u8&ref=https%3A%2F%2Fref%2F&key=secret123"/);
  assert.match(out, /\n\/api\/stream\?url=https%3A%2F%2Fcdn.example%2Fhls%2Findex-f1\.m3u8/);
});

test('parseTracks', () => {
  const html = `<video><track kind="captions" src="/subs/tr.vtt" label="Türkçe" srclang="tr"></video><script>tracks: [{"file":"/subs/en.vtt","label":"English","kind":"captions"}], image: "x"</script>`;
  const t = parseTracks(html, 'https://hdfilmcehennemi.mobi');
  assert.equal(t.length, 2);
  assert.equal(t[1].url, 'https://hdfilmcehennemi.mobi/subs/en.vtt');
});

test('encodeProxyUrl attaches query parameters', () => {
  const url = encodeProxyUrl('https://example.com/playlist.m3u8', 'https://ref.com/', { key: 'my-key', token: 'tok123' });
  assert.match(url, /^\/api\/stream\?/);
  assert.match(url, /url=https%3A%2F%2Fexample\.com%2Fplaylist\.m3u8/);
  assert.match(url, /ref=https%3A%2F%2Fref\.com%2F/);
  assert.match(url, /key=my-key/);
  assert.match(url, /token=tok123/);
});

test('search finds movies by title, genre, and cast', async () => {
  const results = await search('Oppenheimer');
  assert.ok(results.length > 0);
  assert.equal(results[0].title, 'Oppenheimer');

  const sciFi = await search('Nolan');
  assert.ok(sciFi.length > 0);
});

test('resolveMovie returns working fallback sources with subtitles when offline', async () => {
  const res = await resolveMovie('https://www.hdfilmcehennemi.nl/dune-part-two-2024/');
  assert.ok(res.title.includes('Dune'));
  assert.ok(res.sources.length >= 1);
  assert.ok(res.sources[0].m3u8.includes('.m3u8'));
});
