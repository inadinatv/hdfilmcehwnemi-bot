'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTvNav } from '../components/TvNav';
import { fallbackPoster } from '../lib/poster';

/* ─────────────────────────── sabitler ─────────────────────────── */

const LIVE_KEYS = [
  ['home', 'Yeni Eklenenler'],
  ['all', 'Tüm Filmler'],
  ['vizyon', 'Vizyondaki Filmler'],
  ['nette-ilk', 'Nette İlk'],
  ['tavsiye', 'Tavsiye'],
  ['imdb7', 'IMDb 7+'],
  ['liked', 'En Çok Beğenilenler'],
  ['commented', 'En Çok Yorumlananlar'],
  ['series', 'Popüler Diziler'],
  ['aksiyon', 'Aksiyon'],
  ['bilim-kurgu', 'Bilim Kurgu'],
  ['komedi', 'Komedi'],
  ['korku', 'Korku'],
  ['dram', 'Dram'],
  ['gerilim', 'Gerilim'],
  ['romantik', 'Romantik'],
];

const GENRE_SHELVES = ['Aksiyon', 'Macera', 'Bilim Kurgu', 'Komedi', 'Dram', 'Korku', 'Gerilim', 'Suç', 'Romantik', 'Animasyon', 'Tarih', 'Aile'];

const GRID_CHUNK = 48;

const watchHref = (m) => `/watch/${encodeURIComponent(m.id)}?u=${encodeURIComponent(m.href || '')}`;

/* ─────────────────────────── görsel yardımcı ─────────────────────────── */

function SmartImg({ src, alt, style, className }) {
  const [err, setErr] = useState(false);
  const show = src && !err ? src : fallbackPoster(alt);
  return (
    <img
      src={show}
      alt={alt || ''}
      style={style}
      className={className}
      loading="lazy"
      onError={() => setErr(true)}
      draggable={false}
    />
  );
}

/* ─────────────────────────── film kartı ─────────────────────────── */

function MovieCard({ m, favs, onFav, onDetail }) {
  const router = useRouter();
  const isFav = favs.includes(m.id);
  return (
    <div
      data-fn
      role="button"
      tabIndex={0}
      className="tv-card card"
      onClick={() => router.push(watchHref(m))}
    >
      <div className="card-media">
        <SmartImg src={m.poster} alt={m.title} className="card-img" />
        {m.imdb ? <span className="badge b-imdb">★ {m.imdb.toFixed(1)}</span> : null}
        {m.year ? <span className="badge b-year">{m.year}</span> : null}
        {m.type === 'dizi' ? <span className="badge b-dizi">DİZİ</span> : null}
        {m.quality ? <span className="badge b-quality">{m.quality}</span> : null}
        <div className="card-overlay">
          <span className="ov-play">▶</span>
          <div className="ov-actions">
            <button
              data-fn-sub
              className="ov-btn"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDetail(m); }}
            >
              ℹ Detay
            </button>
            <button
              data-fn-sub
              className={`ov-btn ${isFav ? 'fav-on' : ''}`}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFav(m); }}
            >
              {isFav ? '★ Favoride' : '☆ Favori'}
            </button>
          </div>
        </div>
      </div>
      <div className="card-cap">
        <div className="card-title" title={m.title}>{m.title}</div>
        <div className="card-sub">
          {m.year || ''}
          {m.year && (m.type === 'dizi' || (m.genres || [])[0]) ? ' · ' : ''}
          {m.type === 'dizi' ? 'Dizi' : (m.genres || [])[0] || ''}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── film ızgarası ─────────────────────────── */

function MovieGrid({ movies, favs, onFav, onDetail }) {
  if (!movies.length) return null;
  return (
    <div className="grid" data-row>
      {movies.map((m, i) => (
        <MovieCard key={`${m.id}-${i}`} m={m} favs={favs} onFav={onFav} onDetail={onDetail} />
      ))}
    </div>
  );
}

/* ─────────────────────────── ana sayfa ─────────────────────────── */

export default function Home() {
  const router = useRouter();

  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('home'); // home | film | dizi | favs | history
  const [q, setQ] = useState('');
  const [remote, setRemote] = useState(null);
  const [searching, setSearching] = useState(false);
  const [favs, setFavs] = useState([]);
  const [history, setHistory] = useState([]);
  const [userKey, setUserKey] = useState('');
  const [showKeys, setShowKeys] = useState(false);
  const [showLive, setShowLive] = useState(false);
  const [liveState, setLiveState] = useState({ key: null, name: '', movies: [], hasMore: false, page: 1, loading: false });
  const [detail, setDetail] = useState(null);
  const [trailer, setTrailer] = useState(null);
  const [heroIdx, setHeroIdx] = useState(0);
  const [limit, setLimit] = useState(GRID_CHUNK);
  const heroPause = useRef(false);

  /* veriler */
  useEffect(() => {
    fetch('/api/catalog')
      .then((r) => r.json())
      .then((d) => setCatalog({ movies: d.movies || [], categories: d.categories || [], total: d.total || (d.movies || []).length }))
      .catch(() => setCatalog({ movies: [], categories: [], total: 0 }))
      .finally(() => setLoading(false));
    try {
      setFavs(JSON.parse(localStorage.getItem('favs') || '[]'));
      setHistory(JSON.parse(localStorage.getItem('history') || '[]'));
      setUserKey(localStorage.getItem('hdfc_user_key') || '');
    } catch { /* */ }
  }, []);

  /* canlı arama (debounce) */
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setRemote(null);
      setSearching(false);
      return undefined;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(term)}`).then((x) => x.json());
        setRemote(r.results || []);
      } catch {
        setRemote([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const movies = catalog?.movies || [];
  const heroMovies = useMemo(
    () => [...movies].filter((m) => m.imdb).sort((a, b) => b.imdb - a.imdb).slice(0, 5),
    [movies]
  );
  useEffect(() => {
    if (!heroMovies.length) return undefined;
    const t = setInterval(() => {
      if (!heroPause.current) setHeroIdx((i) => (i + 1) % heroMovies.length);
    }, 8000);
    return () => clearInterval(t);
  }, [heroMovies.length]);

  /* raflar */
  const shelves = useMemo(() => {
    if (!movies.length) return [];
    const byCat = (c) => movies.filter((m) => (m.categories || []).includes(c));
    const byGenre = (g) => movies.filter((m) => (m.genres || []).includes(g));
    const base = [
      { id: 'new', label: '🆕 Yeni Eklenenler', movies: byCat('Yeni Eklenenler').length ? byCat('Yeni Eklenenler') : [...movies].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 18) },
      { id: 'series', label: '📺 Popüler Diziler', movies: movies.filter((m) => m.type === 'dizi') },
      { id: 'imdb8', label: '⭐ IMDb 8+ Başyapıtlar', movies: movies.filter((m) => (m.imdb || 0) >= 8).sort((a, b) => b.imdb - a.imdb) },
      { id: 'tavsiye', label: '🏆 Tavsiye Filmler', movies: byCat('Tavsiye Filmler') },
      { id: 'liked', label: '❤️ En Çok Beğenilenler', movies: byCat('En Çok Beğenilenler') },
      { id: 'talk', label: '💬 En Çok Yorumlananlar', movies: byCat('En Çok Yorumlananlar') },
      { id: 'yerli', label: '🇹🇷 Yerli Filmler & Diziler', movies: movies.filter((m) => (m.categories || []).includes('Yerli Filmler') || (m.categories || []).includes('Yerli Diziler')) },
      { id: '4k', label: '🎞️ 4K Ultra HD', movies: byCat('4K Ultra HD Filmler') },
    ].filter((s) => s.movies.length >= 4);
    const genres = GENRE_SHELVES.map((g) => ({ id: `g-${g}`, label: g, movies: byGenre(g) })).filter((s) => s.movies.length >= 4);
    return [...base, ...genres];
  }, [movies]);

  /* grid için liste */
  const gridMovies = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr');
    if (needle) {
      const local = movies.filter((m) =>
        m.title.toLocaleLowerCase('tr').includes(needle) ||
        (m.originalTitle && m.originalTitle.toLocaleLowerCase('tr').includes(needle)) ||
        (m.cast && m.cast.some((c) => c.toLocaleLowerCase('tr').includes(needle))) ||
        (m.genres && m.genres.some((g) => g.toLocaleLowerCase('tr').includes(needle)))
      );
      const ids = new Set(local.map((m) => m.id));
      return [...local, ...(remote || []).filter((m) => !ids.has(m.id))];
    }
    if (tab === 'favs') return movies.filter((m) => favs.includes(m.id));
    if (tab === 'history') return history.map((h) => movies.find((m) => m.id === h.id) || h).filter(Boolean);
    if (tab === 'film') return movies.filter((m) => m.type !== 'dizi');
    if (tab === 'dizi') return movies.filter((m) => m.type === 'dizi');
    return [];
  }, [movies, q, remote, tab, favs, history]);

  useEffect(() => {
    setLimit(GRID_CHUNK);
  }, [q, tab]);

  /* sonsuz kaydırma */
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setLimit((l) => l + GRID_CHUNK);
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [gridMovies.length, tab, q]);

  /* favori */
  const toggleFav = useCallback((m) => {
    setFavs((prev) => {
      const next = prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id];
      try { localStorage.setItem('favs', JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  }, []);

  /* canlı liste */
  const loadLive = useCallback(async (key, page = 1) => {
    setLiveState((s) => ({ ...s, key, name: LIVE_KEYS.find(([k]) => k === key)?.[1] || key, loading: true }));
    try {
      const r = await fetch(`/api/list?key=${key}&page=${page}`).then((x) => x.json());
      setLiveState((s) => ({
        key,
        name: LIVE_KEYS.find(([k]) => k === key)?.[1] || key,
        page,
        loading: false,
        hasMore: !!r.hasMore,
        movies: page === 1 ? (r.movies || []) : [...s.movies, ...(r.movies || [])],
      }));
    } catch {
      setLiveState((s) => ({ ...s, loading: false, movies: s.movies }));
    }
  }, []);

  /* Escape davranışı */
  const handleEscape = useCallback(() => {
    if (trailer) { setTrailer(null); return; }
    if (detail) { setDetail(null); return; }
    if (showLive) { setShowLive(false); return; }
    if (showKeys) { setShowKeys(false); return; }
    if (q) { setQ(''); return; }
    if (tab !== 'home') { setTab('home'); return; }
    if (window.history.length > 1) router.back();
  }, [trailer, detail, showLive, showKeys, q, tab, router]);

  useTvNav({ enabled: !loading, onEscape: handleEscape });

  const hero = heroMovies[heroIdx] || null;
  const shown = gridMovies.slice(0, limit);
  const inHome = tab === 'home' && !q;

  return (
    <main className="wrap">
      {/* ── ANA SAHNE (üst bar + içerik birlikte; TV nav en son stajeyi kullanır) ── */}
      <div data-stage>
      {/* ── ÜST BAR ─────────────────────────────────────────── */}
      <header className="topbar" data-row>
        <button
          data-fn
          className="logo"
          onClick={() => { setTab('home'); setQ(''); }}
        >
          HDFILM<span>CEHENNEMİ</span>
          <em className="badge-ver">V3.0 TV</em>
        </button>

        <nav className="tabs">
          {[
            ['home', '🏠 Ana Sayfa'],
            ['film', '🎬 Filmler'],
            ['dizi', '📺 Diziler'],
            ['favs', `⭐ Favorilerim${favs.length ? ` (${favs.length})` : ''}`],
            ['history', `🕘 Geçmiş${history.length ? ` (${history.length})` : ''}`],
          ].map(([k, label]) => (
            <button
              key={k}
              data-fn
              className={`tab ${tab === k && !q ? 'on' : ''}`}
              onClick={() => { setTab(k); setQ(''); }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="search">
          <span className="search-ico">🔍</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Film, dizi, oyuncu ara…"
            aria-label="Ara"
          />
          {searching && <span className="search-spin" />}
          {q && (
            <button className="clear-btn" onClick={() => setQ('')} title="Temizle">✕</button>
          )}
        </div>

        <button data-fn className="btn-live" onClick={() => setShowLive(true)}>⚡ Canlı</button>
        <button data-fn className="btn-key" onClick={() => setShowKeys(true)}>🔑 Key</button>
      </header>

        {inHome && hero && (
          <section
            className="hero"
            data-row
            style={
              hero.backdrop || hero.poster
                ? { backgroundImage: `linear-gradient(90deg, #0a0a0a 18%, rgba(10,10,10,0.72) 55%, rgba(10,10,10,0.15) 100%), url(${hero.backdrop || hero.poster})` }
                : undefined
            }
            onMouseEnter={() => { heroPause.current = true; }}
            onMouseLeave={() => { heroPause.current = false; }}
          >
            <div className="hero-body">
              <span className="hero-tag">🔥 HAFTANIN VİTRİNİ · {heroIdx + 1}/{heroMovies.length}</span>
              <h1 className="hero-title">{hero.title}</h1>
              <div className="hero-meta">
                {hero.imdb ? <span className="pill p-imdb">★ {hero.imdb.toFixed(1)} IMDb</span> : null}
                {hero.year ? <span className="pill">{hero.year}</span> : null}
                {hero.duration ? <span className="pill">{hero.duration}</span> : null}
                {(hero.genres || []).slice(0, 3).map((g) => (
                  <span key={g} className="pill p-genre">{g}</span>
                ))}
              </div>
              <p className="hero-desc">{hero.description}</p>
              <div className="hero-acts">
                <button data-fn className="btn-play" onClick={() => router.push(watchHref(hero))}>
                  ▶ Hemen İzle
                </button>
                <button data-fn className="btn-ghost" onClick={() => setDetail(hero)}>
                  ℹ Detay
                </button>
                <button data-fn className="btn-ghost" onClick={() => toggleFav(hero)}>
                  {favs.includes(hero.id) ? '★ Favoride' : '☆ Favori'}
                </button>
              </div>
            </div>
            <div className="hero-dots">
              {heroMovies.map((h, i) => (
                <button
                  key={h.id}
                  data-fn-sub
                  className={`dot ${i === heroIdx ? 'on' : ''}`}
                  onClick={() => setHeroIdx(i)}
                  aria-label={h.title}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Raflar ── */}
        {inHome &&
          shelves.map((s) => (
            <section className="shelf" data-row key={s.id}>
              <h3 className="shelf-title">{s.label}</h3>
              <div className="shelf-row no-scrollbar">
                {s.movies.map((m, i) => (
                  <MovieCard key={`${m.id}-${i}`} m={m} favs={favs} onFav={toggleFav} onDetail={setDetail} />
                ))}
              </div>
            </section>
          ))}

        {/* ── Grid görünümleri (arama / sekmeler) ── */}
        {!inHome && (
          <section className="grid-sec">
            <div className="grid-hdr">
              <h2>
                {q
                  ? `🔍 "${q.trim()}" için sonuçlar`
                  : tab === 'film' ? '🎬 Tüm Filmler'
                  : tab === 'dizi' ? '📺 Tüm Diziler'
                  : tab === 'favs' ? '⭐ Favorilerim'
                  : '🕘 İzleme Geçmişi'}
              </h2>
              <span className="grid-count">{gridMovies.length} içerik</span>
            </div>

            {loading ? (
              <div className="loading-box">
                <div className="spinner" />
                <p>Film kataloğu hazırlanıyor…</p>
              </div>
            ) : gridMovies.length === 0 ? (
              <div className="empty-box">
                <h3>Sonuç Bulunamadı</h3>
                <p>
                  {tab === 'favs'
                    ? 'Henüz favori eklemedin. Kart üzerindeki ☆ butonuyla ekleyebilirsin.'
                    : tab === 'history'
                      ? 'Henüz hiçbir şey izlemedin. Bir karta basıp izle!'
                      : 'Aramanı değiştirmeyi veya filtreleri gevşetmeyi dene.'}
                </p>
                {q && (
                  <button className="btn-play" onClick={() => setQ('')}>Aramayı Temizle</button>
                )}
              </div>
            ) : (
              <>
                <MovieGrid movies={shown} favs={favs} onFav={toggleFav} onDetail={setDetail} />
                <div ref={sentinelRef} style={{ height: 2 }} />
                {shown.length < gridMovies.length && (
                  <p className="scroll-hint">Kaydırınca daha fazlası yüklenir · {shown.length} / {gridMovies.length}</p>
                )}
              </>
            )}
          </section>
        )}

        <footer className="footer">
          <span>HDFilmCehennemi Film Botu V3.0 TV · CloudStream çekirdeği · Vestel TV dostu arayüz</span>
          <span>Uzaktan kumanda: ← → ↑ ↓ gezin · OK (Enter) seç · ESC geri</span>
        </footer>
      </div>

      {/* ── DETAY MODALI ───────────────────────────────────── */}
      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="dm" data-stage onClick={(e) => e.stopPropagation()}>
            <div className="dm-acts" data-row>
              <button data-fn className="btn-ghost dm-close" onClick={() => setDetail(null)}>✕ Kapat (ESC)</button>
              <button data-fn className="btn-play" onClick={() => { setDetail(null); router.push(watchHref(detail)); }}>
                ▶ Hemen İzle
              </button>
              <button data-fn className="btn-ghost" onClick={() => toggleFav(detail)}>
                {favs.includes(detail.id) ? '★ Favoride' : '☆ Favoriye Ekle'}
              </button>
              {detail.trailer && (
                <button data-fn className="btn-ghost" onClick={() => setTrailer(detail.trailer)}>
                  ▶ Fragman
                </button>
              )}
            </div>
            <div className="dm-body" data-row>
              <div className="dm-poster-wrap">
                <SmartImg src={detail.poster} alt={detail.title} className="dm-poster" />
              </div>
              <div className="dm-info">
                <h2>{detail.title}</h2>
                {detail.originalTitle && detail.originalTitle !== detail.title && (
                  <p className="dm-orig">{detail.originalTitle}</p>
                )}
                <div className="dm-badges">
                  {detail.imdb ? <span className="pill p-imdb">★ {detail.imdb.toFixed(1)} IMDb</span> : null}
                  {detail.year ? <span className="pill">{detail.year}</span> : null}
                  {detail.duration ? <span className="pill">{detail.duration}</span> : null}
                  {detail.quality ? <span className="pill">{detail.quality}</span> : null}
                  {(detail.genres || []).map((g) => (
                    <span key={g} className="pill p-genre">{g}</span>
                  ))}
                </div>
                <p className="dm-desc">{detail.description || 'Açıklama bulunamadı.'}</p>
                {detail.director && <p className="dm-line"><b>Yönetmen:</b> {detail.director}</p>}
                {detail.cast?.length > 0 && <p className="dm-line"><b>Oyuncular:</b> {detail.cast.join(', ')}</p>}
                {detail.country && <p className="dm-line"><b>Ülke:</b> {detail.country}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── FRAGMAN MODALI ─────────────────────────────────── */}
      {trailer && (
        <div className="overlay" onClick={() => setTrailer(null)}>
          <div data-stage className="tm" onClick={(e) => e.stopPropagation()}>
            <div className="tm-hdr" data-row>
              <h4>▶ Fragman</h4>
              <button data-fn className="btn-ghost" onClick={() => setTrailer(null)}>✕ Kapat (ESC)</button>
            </div>
            <div className="tm-body">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailer.split('v=')[1]?.split('&')[0] || ''}?autoplay=1`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title="Fragman"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── CANLI LİSTE MODALI ─────────────────────────────── */}
      {showLive && (
        <div className="overlay" onClick={() => setShowLive(false)}>
          <div className="lv" data-stage onClick={(e) => e.stopPropagation()}>
            <div className="lv-top" data-row>
              <h3>⚡ Siteden Canlı Akış <small>(anlık web taraması)</small></h3>
              <button data-fn className="btn-ghost" onClick={() => setShowLive(false)}>✕ Kapat (ESC)</button>
            </div>
            <div className="lv-keys" data-row>
              {LIVE_KEYS.map(([k, name]) => (
                <button
                  key={k}
                  data-fn
                  className={`lv-key ${liveState.key === k ? 'on' : ''}`}
                  onClick={() => loadLive(k, 1)}
                >
                  {name}
                </button>
              ))}
            </div>
            {liveState.loading && !liveState.movies.length && (
              <p className="lv-msg">Siteden canlı liste alınıyor…</p>
            )}
            {liveState.movies.length > 0 && (
              <div data-row className="lv-grid">
                {liveState.movies.map((m, i) => (
                  <MovieCard key={`${m.id}-${i}`} m={m} favs={favs} onFav={toggleFav} onDetail={setDetail} />
                ))}
              </div>
            )}
            {liveState.hasMore && (
              <div data-row className="lv-more">
                <button data-fn className="btn-amber" disabled={liveState.loading} onClick={() => loadLive(liveState.key, liveState.page + 1)}>
                  {liveState.loading ? 'Yükleniyor…' : 'Daha Fazla Yükle'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── KEY AYARLARI MODALI ────────────────────────────── */}
      {showKeys && (
        <div className="overlay" onClick={() => setShowKeys(false)}>
          <div className="km" data-stage onClick={(e) => e.stopPropagation()}>
            <div className="km-hdr" data-row>
              <h3>🔑 API Key & Özel Akış</h3>
              <button data-fn className="btn-ghost" onClick={() => setShowKeys(false)}>✕ Kapat (ESC)</button>
            </div>
            <div className="km-body" data-row>
              <p>
                Site Cloudflare koruması veya bölgesel kısıtlama altındaysa <b>ZenRows</b> / <b>ScraperAPI</b> anahtarını kaydet;
                tarayıcı belleğinde saklanır, hiçbir sunucuya gönderilmez.
              </p>
              <input
                type="text"
                value={userKey}
                onChange={(e) => setUserKey(e.target.value)}
                placeholder="Örn: zr_xxxx veya api_key..."
                aria-label="API key"
              />
              <div className="km-btns">
                <button
                  data-fn
                  className="btn-play"
                  onClick={() => {
                    try {
                      if (userKey.trim()) localStorage.setItem('hdfc_user_key', userKey.trim());
                      else localStorage.removeItem('hdfc_user_key');
                    } catch { /* */ }
                    setShowKeys(false);
                  }}
                >
                  Kaydet
                </button>
                <button
                  data-fn
                  className="btn-ghost"
                  onClick={() => {
                    setUserKey('');
                    try { localStorage.removeItem('hdfc_user_key'); } catch { /* */ }
                  }}
                >
                  Temizle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .wrap { min-height: 100vh; background: var(--bg); color: #fff; font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }

        /* üst bar */
        .topbar {
          position: sticky; top: 0; z-index: 60;
          display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
          padding: 12px 24px;
          background: rgba(10, 10, 10, 0.92);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--line);
        }
        .logo {
          display: flex; align-items: center; gap: 8px;
          background: none; border: 0; cursor: pointer;
          color: var(--brand); font-weight: 900; font-size: 21px; letter-spacing: -0.5px;
        }
        .logo span { color: #fff; font-weight: 300; font-size: 13px; letter-spacing: 0.12em; }
        .badge-ver {
          font-style: normal; font-size: 9px; font-weight: 800;
          background: #222; color: var(--brand); border: 1px solid #333;
          padding: 2px 6px; border-radius: 4px; margin-left: 4px;
        }
        .tabs { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; }
        .tabs::-webkit-scrollbar { display: none; }
        .tab {
          background: #181818; border: 1px solid #2a2a2a; color: #bbb;
          padding: 8px 16px; border-radius: 99px; cursor: pointer;
          font-size: 13.5px; font-weight: 700; white-space: nowrap;
          transition: all 0.15s;
        }
        .tab:hover { color: #fff; background: #222; }
        .tab.on { background: var(--brand); border-color: var(--brand); color: #fff; }
        .search {
          position: relative; flex: 1; min-width: 220px; max-width: 480px;
          display: flex; align-items: center;
        }
        .search-ico { position: absolute; left: 12px; font-size: 13px; opacity: 0.5; pointer-events: none; }
        .search input {
          width: 100%; background: #161616; border: 1px solid #2e2e2e; color: #fff;
          padding: 9px 38px 9px 34px; border-radius: 99px; font-size: 13.5px; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(229, 9, 20, 0.25); }
        .clear-btn {
          position: absolute; right: 10px; background: none; border: 0; color: #999;
          cursor: pointer; font-size: 13px; padding: 4px;
        }
        .search-spin {
          position: absolute; right: 34px; width: 13px; height: 13px;
          border: 2px solid rgba(255,255,255,0.2); border-top-color: var(--brand);
          border-radius: 50%; animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .btn-live {
          background: rgba(255, 179, 0, 0.12); border: 1px solid rgba(255, 179, 0, 0.5);
          color: var(--amber); padding: 8px 14px; border-radius: 8px;
          font-size: 12.5px; font-weight: 800; cursor: pointer; white-space: nowrap;
        }
        .btn-live:hover { background: rgba(255, 179, 0, 0.22); }
        .btn-key {
          background: #1c1c1c; border: 1px solid #333; color: var(--amber);
          padding: 8px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 800; cursor: pointer; white-space: nowrap;
        }
        .btn-key:hover { background: #262626; }

        /* hero */
        .hero {
          position: relative; min-height: 440px;
          display: flex; align-items: center;
          background-size: cover; background-position: center 25%;
          background-color: #101018;
          padding: 44px 40px 56px;
        }
        .hero-body { max-width: 680px; z-index: 2; }
        .hero-tag {
          display: inline-block; background: var(--brand);
          font-size: 11px; font-weight: 800; letter-spacing: 0.06em;
          padding: 4px 10px; border-radius: 4px;
        }
        .hero-title {
          font-size: 44px; font-weight: 900; line-height: 1.12;
          margin: 14px 0 12px; text-shadow: 0 6px 18px rgba(0,0,0,0.9);
        }
        .hero-meta { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .pill {
          background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
          padding: 4px 10px; border-radius: 5px; font-size: 12.5px; color: #ddd;
        }
        .p-imdb { background: #f5c518; color: #000; font-weight: 900; }
        .p-genre { background: rgba(229, 9, 20, 0.28); color: #ff9d94; }
        .hero-desc {
          font-size: 14.5px; color: #cfcfcf; line-height: 1.65; margin: 0 0 22px;
          display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
          max-width: 620px;
        }
        .hero-acts { display: flex; gap: 10px; flex-wrap: wrap; }
        .btn-play {
          background: var(--brand); color: #fff; border: 0; cursor: pointer;
          font-weight: 800; font-size: 15px; padding: 12px 26px; border-radius: 8px;
          transition: transform 0.15s, background 0.15s;
        }
        .btn-play:hover { background: #f40612; transform: scale(1.03); }
        .btn-ghost {
          background: rgba(255,255,255,0.14); backdrop-filter: blur(8px);
          border: 1px solid rgba(255,255,255,0.18); color: #fff;
          font-weight: 700; font-size: 13.5px; padding: 12px 18px; border-radius: 8px; cursor: pointer;
        }
        .btn-ghost:hover { background: rgba(255,255,255,0.26); }
        .btn-amber {
          background: var(--amber); color: #000; border: 0; cursor: pointer;
          font-weight: 800; font-size: 14px; padding: 11px 24px; border-radius: 8px;
        }
        .hero-dots {
          position: absolute; right: 36px; bottom: 26px;
          display: flex; gap: 7px; z-index: 3;
        }
        .dot {
          width: 10px; height: 10px; border-radius: 99px; border: 0; cursor: pointer;
          background: rgba(255,255,255,0.3); transition: all 0.2s; padding: 0;
        }
        .dot.on { background: var(--brand); width: 26px; }

        /* raflar */
        .shelf { margin: 26px 0 6px; }
        .shelf-title {
          font-size: 16.5px; font-weight: 800; color: #eee;
          margin: 0 0 10px; padding: 0 28px; letter-spacing: 0.01em;
        }
        .shelf-row {
          display: flex; gap: 14px; overflow-x: auto;
          padding: 6px 28px 18px;
          scroll-snap-type: x proximity;
        }
        .shelf-row > * { scroll-snap-align: start; flex: 0 0 172px; }

        /* kart */
        .card {
          background: var(--panel); border-radius: 10px; overflow: hidden;
          cursor: pointer; border: 1px solid rgba(255,255,255,0.05);
          display: block;
        }
        .card:hover { transform: translateY(-6px) scale(1.03); border-color: rgba(255,255,255,0.18); }
        .card-media { position: relative; aspect-ratio: 2/3; background: #1b1b1b; overflow: hidden; }
        .card-img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.3s; }
        .card:hover .card-img { transform: scale(1.05); }
        .badge {
          position: absolute; font-size: 10.5px; font-weight: 900;
          padding: 2px 6px; border-radius: 4px; z-index: 2;
        }
        .b-imdb { left: 6px; top: 6px; background: #f5c518; color: #000; }
        .b-year { right: 6px; top: 6px; background: rgba(0,0,0,0.75); color: #eee; }
        .b-dizi { left: 6px; bottom: 6px; background: #2962ff; color: #fff; }
        .b-quality { right: 6px; bottom: 6px; background: rgba(229,9,20,0.9); color: #fff; font-size: 9.5px; }
        .card-overlay {
          position: absolute; inset: 0; z-index: 3;
          background: linear-gradient(180deg, rgba(0,0,0,0.15) 30%, rgba(0,0,0,0.82) 100%);
          display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
          padding: 12px; opacity: 0; transition: opacity 0.2s;
        }
        .card:hover .card-overlay, .card:focus .card-overlay { opacity: 1; }
        .ov-play {
          width: 46px; height: 46px; border-radius: 50%;
          background: var(--brand); color: #fff; font-size: 18px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 6px 20px rgba(229,9,20,0.65);
          margin-bottom: 10px; transform: scale(0.9); transition: transform 0.2s;
        }
        .card:hover .ov-play, .card:focus .ov-play { transform: scale(1); }
        .ov-actions { display: flex; gap: 6px; width: 100%; }
        .ov-btn {
          flex: 1; background: rgba(255,255,255,0.16); backdrop-filter: blur(6px);
          border: 0; color: #fff; font-size: 11.5px; font-weight: 700;
          padding: 7px 4px; border-radius: 6px; cursor: pointer;
        }
        .ov-btn:hover { background: rgba(255,255,255,0.3); }
        .ov-btn.fav-on { background: rgba(245, 197, 24, 0.9); color: #000; }
        .card-cap { padding: 8px 10px 10px; }
        .card-title {
          font-size: 13.5px; font-weight: 700; color: #fff;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .card-sub { font-size: 11px; color: #8a8a8a; margin-top: 3px; }

        /* grid */
        .grid-sec { padding: 18px 0 30px; }
        .grid-hdr {
          display: flex; align-items: baseline; gap: 14px;
          padding: 0 28px; margin-bottom: 16px;
        }
        .grid-hdr h2 { margin: 0; font-size: 21px; font-weight: 800; }
        .grid-count { color: #888; font-size: 13px; }
        .grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 16px; padding: 0 28px;
        }
        .grid .card { flex: none; }

        /* durumlar */
        .loading-box, .empty-box { text-align: center; padding: 90px 24px; color: #aaa; }
        .spinner {
          width: 46px; height: 46px; margin: 0 auto 16px;
          border: 4px solid #262626; border-top-color: var(--brand);
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        .empty-box h3 { color: #eee; font-size: 19px; margin: 0 0 8px; }
        .empty-box p { font-size: 14px; margin: 0 0 10px; }
        .scroll-hint { text-align: center; color: #666; font-size: 12.5px; padding: 22px; }

        .footer {
          display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap;
          padding: 26px 28px 34px; color: #555; font-size: 12px;
          border-top: 1px solid var(--line); margin-top: 20px;
        }

        /* overlay / modallar */
        .overlay {
          position: fixed; inset: 0; z-index: 100;
          background: rgba(0,0,0,0.86); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 20px; overflow-y: auto;
        }
        .dm, .lv, .km, .tm {
          background: #131313; border: 1px solid #2c2c2c; border-radius: 14px;
          width: min(860px, 96vw); max-height: 92vh; overflow-y: auto;
          box-shadow: 0 30px 80px rgba(0,0,0,0.9);
        }
        .dm-acts {
          position: sticky; top: 0; z-index: 5;
          display: flex; gap: 8px; flex-wrap: wrap;
          padding: 14px 18px; background: #191919;
          border-bottom: 1px solid #2a2a2a; border-radius: 14px 14px 0 0;
        }
        .dm-close { margin-right: auto; }
        .dm-body { display: flex; gap: 22px; padding: 20px 18px 24px; }
        .dm-poster-wrap { flex: 0 0 168px; }
        .dm-poster { width: 100%; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,0.7); display: block; }
        .dm-info { flex: 1; min-width: 0; }
        .dm-info h2 { margin: 0 0 4px; font-size: 23px; }
        .dm-orig { color: #888; font-size: 13px; margin: 0 0 10px; }
        .dm-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
        .dm-desc { color: #c9c9c9; font-size: 14px; line-height: 1.65; margin: 0 0 14px; }
        .dm-line { color: #909090; font-size: 13px; margin: 5px 0; }
        .dm-line b { color: #cfcfcf; }

        .tm { width: min(980px, 96vw); }
        .tm-hdr {
          display: flex; justify-content: space-between; align-items: center;
          padding: 13px 18px; border-bottom: 1px solid #2a2a2a;
        }
        .tm-hdr h4 { margin: 0; font-size: 15px; color: #eee; }
        .tm-body { aspect-ratio: 16/9; background: #000; border-radius: 0 0 14px 14px; overflow: hidden; }
        .tm-body iframe { width: 100%; height: 100%; border: 0; }

        .lv { width: min(1040px, 96vw); }
        .lv-top {
          display: flex; justify-content: space-between; align-items: center; gap: 10px;
          padding: 14px 18px; border-bottom: 1px solid #2a2a2a;
        }
        .lv-top h3 { margin: 0; font-size: 16px; color: var(--amber); }
        .lv-top small { color: #888; font-weight: 400; font-size: 12px; margin-left: 6px; }
        .lv-keys {
          display: flex; gap: 7px; flex-wrap: wrap;
          padding: 14px 18px; border-bottom: 1px solid #222;
        }
        .lv-key {
          background: #1d1d1d; border: 1px solid #333; color: #ccc;
          padding: 7px 14px; border-radius: 99px; font-size: 12.5px; cursor: pointer;
        }
        .lv-key:hover { background: #272727; color: #fff; }
        .lv-key.on { background: var(--amber); border-color: var(--amber); color: #000; font-weight: 800; }
        .lv-msg { padding: 22px; color: #999; font-size: 13.5px; }
        .lv-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 14px; padding: 16px 18px;
        }
        .lv-more { text-align: center; padding: 4px 0 20px; }

        .km { width: min(520px, 96vw); }
        .km-hdr {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 18px; border-bottom: 1px solid #2a2a2a;
        }
        .km-hdr h3 { margin: 0; font-size: 16px; color: var(--amber); }
        .km-body { padding: 18px; }
        .km-body p { font-size: 13px; color: #aaa; line-height: 1.55; margin: 0 0 14px; }
        .km-body input {
          width: 100%; background: #101010; border: 1px solid #3a3a3a; color: #fff;
          padding: 11px 13px; border-radius: 8px; font-size: 14px; outline: none;
          margin-bottom: 16px;
        }
        .km-body input:focus { border-color: var(--amber); }
        .km-btns { display: flex; gap: 10px; }

        @media (max-width: 860px) {
          .hero { min-height: 360px; padding: 30px 20px 44px; }
          .hero-title { font-size: 30px; }
          .topbar { padding: 10px 14px; gap: 10px; }
          .shelf-row { padding: 4px 16px 14px; }
          .shelf-row > * { flex: 0 0 140px; }
          .shelf-title, .grid-hdr { padding-left: 16px; padding-right: 16px; }
          .grid { padding: 0 16px; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
          .dm-body { flex-direction: column; }
          .dm-poster-wrap { flex: none; width: 130px; margin: 0 auto; }
        }
      `}</style>
    </main>
  );
}
