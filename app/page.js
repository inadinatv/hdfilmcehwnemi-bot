'use client';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Link from 'next/link';

const PAGE = 48;
const GROUP_LABEL = { liste: 'Listeler', tür: 'Türler', yıl: 'Yıllar', imdb: 'IMDb', dizi: 'Diziler' };
const GROUP_ORDER = ['liste', 'tür', 'yıl', 'imdb', 'dizi'];

export default function Home() {
  const [data, setData] = useState({ movies: [], categories: [], total: 0, updatedAt: null });
  const [loading, setLoading] = useState(true);
  const [cat, setCat] = useState('Tümü');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('default');
  const [minImdb, setMinImdb] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [remote, setRemote] = useState(null); // canlı arama sonuçları
  const [searching, setSearching] = useState(false);
  const [favs, setFavs] = useState([]);
  const [history, setHistory] = useState([]);
  const [live, setLive] = useState({ key: null, page: 1, movies: [], hasMore: false, loading: false });
  const sentinel = useRef(null);

  useEffect(() => {
    fetch('/api/catalog').then((r) => r.json()).then((d) => setData({
      movies: d.movies || [], categories: d.categories || [], total: d.total || (d.movies || []).length, updatedAt: d.updatedAt,
    })).finally(() => setLoading(false));
    try {
      setFavs(JSON.parse(localStorage.getItem('favs') || '[]'));
      setHistory(JSON.parse(localStorage.getItem('history') || '[]'));
    } catch { /* */ }
  }, []);

  /* canlı arama (site) – debounce */
  useEffect(() => {
    if (q.trim().length < 3) { setRemote(null); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then((x) => x.json());
        setRemote(r.results || []);
      } catch { setRemote([]); } finally { setSearching(false); }
    }, 450);
    return () => clearTimeout(t);
  }, [q]);

  const groups = useMemo(() => {
    const g = {};
    for (const c of data.categories) (g[c.group] ||= []).push(c);
    return GROUP_ORDER.filter((k) => g[k]?.length).map((k) => ({ key: k, label: GROUP_LABEL[k], items: g[k] }));
  }, [data.categories]);

  const filtered = useMemo(() => {
    let list = data.movies;
    if (cat === '⭐ Favoriler') list = list.filter((m) => favs.includes(m.id));
    else if (cat === '🕘 Geçmiş') list = history.map((h) => data.movies.find((m) => m.id === h.id) || h).filter(Boolean);
    else if (cat !== 'Tümü') list = list.filter((m) => (m.categories || []).includes(cat));
    if (minImdb) list = list.filter((m) => (m.imdb || 0) >= minImdb);
    const needle = q.trim().toLocaleLowerCase('tr');
    if (needle) {
      const local = list.filter((m) => m.title.toLocaleLowerCase('tr').includes(needle));
      const ids = new Set(local.map((m) => m.id));
      list = [...local, ...(remote || []).filter((m) => !ids.has(m.id))];
    }
    if (sort === 'imdb') list = [...list].sort((a, b) => (b.imdb || 0) - (a.imdb || 0));
    else if (sort === 'year') list = [...list].sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (sort === 'az') list = [...list].sort((a, b) => a.title.localeCompare(b.title, 'tr'));
    return list;
  }, [data.movies, cat, q, sort, minImdb, remote, favs, history]);

  useEffect(() => { setLimit(PAGE); }, [cat, q, sort, minImdb]);

  /* sonsuz kaydırma */
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setLimit((l) => l + PAGE); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  /* canlı liste (siteden anlık çekim) */
  const loadLive = useCallback(async (key, page = 1) => {
    setLive((s) => ({ ...s, key, loading: true }));
    try {
      const r = await fetch(`/api/list?key=${key}&page=${page}`).then((x) => x.json());
      setLive((s) => ({ key, page, loading: false, hasMore: !!r.hasMore, movies: page === 1 ? (r.movies || []) : [...s.movies, ...(r.movies || [])] }));
    } catch { setLive((s) => ({ ...s, loading: false })); }
  }, []);

  const toggleFav = (m, e) => {
    e.preventDefault(); e.stopPropagation();
    const next = favs.includes(m.id) ? favs.filter((x) => x !== m.id) : [...favs, m.id];
    setFavs(next); localStorage.setItem('favs', JSON.stringify(next));
  };

  const shown = filtered.slice(0, limit);
  const catCount = (name) => data.categories.find((c) => c.name === name)?.count;

  return (
    <main className="wrap">
      <header className="hdr">
        <Link href="/" className="logo">HDFILM<span>CEHENNEMİ</span></Link>
        <div className="search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Film ara… (3+ harf ile sitede de arar)" />
          {searching && <span className="dot" />}
          {q && <button onClick={() => setQ('')}>✕</button>}
        </div>
        <div className="meta">
          {data.total ? <>{data.total.toLocaleString('tr')} film · {data.categories.length} kategori</> : 'Katalog boş'}
          {data.updatedAt && <small> · {new Date(data.updatedAt).toLocaleString('tr')}</small>}
        </div>
      </header>

      <nav className="cats">
        <div className="grp">
          {['Tümü', '⭐ Favoriler', '🕘 Geçmiş'].map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => { setCat(c); setLive({ key: null, page: 1, movies: [], hasMore: false, loading: false }); }}>{c}</button>
          ))}
        </div>
        {groups.map((g) => (
          <div key={g.key} className="grp">
            <span className="gl">{g.label}</span>
            {g.items.map((c) => (
              <button key={c.name} className={cat === c.name ? 'on' : ''} onClick={() => { setCat(c.name); setLive({ key: null, page: 1, movies: [], hasMore: false, loading: false }); }}>
                {c.name} <em>{c.count}</em>
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="tools">
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="default">Varsayılan sıra</option>
          <option value="year">Yıla göre (yeni)</option>
          <option value="imdb">IMDb puanı</option>
          <option value="az">A → Z</option>
        </select>
        <select value={minImdb} onChange={(e) => setMinImdb(+e.target.value)}>
          <option value={0}>Tüm puanlar</option>
          <option value={6}>IMDb 6+</option>
          <option value={7}>IMDb 7+</option>
          <option value={8}>IMDb 8+</option>
        </select>
        <span className="cnt">{filtered.length.toLocaleString('tr')} sonuç</span>
        <div className="grow" />
        <details className="live">
          <summary>⚡ Canlı listeler</summary>
          <div className="livebtns">
            {LIVE_KEYS.map(([k, n]) => <button key={k} className={live.key === k ? 'on' : ''} onClick={() => loadLive(k, 1)}>{n}</button>)}
          </div>
        </details>
      </div>

      {live.key && (
        <section className="livesec">
          <h3>⚡ {LIVE_KEYS.find(([k]) => k === live.key)?.[1]} <small>(siteden anlık)</small> <button onClick={() => setLive({ key: null, page: 1, movies: [], hasMore: false, loading: false })}>kapat ✕</button></h3>
          {live.loading && !live.movies.length && <p className="info">Yükleniyor…</p>}
          {!live.loading && !live.movies.length && <p className="info">Siteden veri alınamadı (erişim engeli olabilir). Botun ürettiği katalogu kullanın.</p>}
          <Grid movies={live.movies} favs={favs} toggleFav={toggleFav} />
          {live.hasMore && <button className="more" disabled={live.loading} onClick={() => loadLive(live.key, live.page + 1)}>{live.loading ? '…' : 'Daha fazla yükle'}</button>}
        </section>
      )}

      {loading && <p className="info">Katalog yükleniyor…</p>}
      {!loading && !data.movies.length && (
        <div className="empty">
          <h2>Katalog henüz oluşturulmadı</h2>
          <p>Botu çalıştırın: <code>pip install -r requirements.txt && python scraper.py</code><br />veya GitHub Actions'daki “Film Kataloğunu Güncelle” iş akışını elle tetikleyin.</p>
        </div>
      )}
      {!loading && !!data.movies.length && !filtered.length && <p className="info">Sonuç bulunamadı.</p>}

      <Grid movies={shown} favs={favs} toggleFav={toggleFav} />
      <div ref={sentinel} style={{ height: 1 }} />
      {shown.length < filtered.length && <p className="info">Kaydırdıkça yüklenir… ({shown.length}/{filtered.length})</p>}

      <style jsx>{`
        .wrap{min-height:100vh;background:#0f0f0f;color:#fff;padding:0 20px 60px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
        .hdr{display:flex;gap:16px;align-items:center;padding:16px 0;flex-wrap:wrap;position:sticky;top:0;background:#0f0f0fee;backdrop-filter:blur(8px);z-index:20}
        .logo{color:#e50914;font-weight:900;font-size:24px;letter-spacing:-.5px;text-decoration:none}
        .logo span{color:#fff;font-weight:400;font-size:13px;margin-left:4px;letter-spacing:.1em}
        .search{flex:1;min-width:220px;position:relative;display:flex;align-items:center}
        .search input{width:100%;background:#1f1f1f;border:1px solid #333;color:#fff;padding:10px 40px 10px 14px;border-radius:8px;font-size:14px;outline:none}
        .search input:focus{border-color:#e50914}
        .search button{position:absolute;right:8px;background:none;border:0;color:#aaa;cursor:pointer;font-size:14px}
        .dot{position:absolute;right:34px;width:8px;height:8px;border-radius:50%;background:#e50914;animation:blink 1s infinite}
        @keyframes blink{50%{opacity:.2}}
        .meta{color:#999;font-size:13px} .meta small{color:#666}
        .cats{display:flex;flex-direction:column;gap:6px;padding:6px 0 10px}
        .grp{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px;align-items:center;scrollbar-width:thin}
        .gl{color:#777;font-size:11px;text-transform:uppercase;letter-spacing:.08em;min-width:52px}
        .grp button{flex:none;background:#1b1b1b;border:1px solid #2a2a2a;color:#ddd;padding:6px 12px;border-radius:99px;cursor:pointer;font-size:13px;white-space:nowrap}
        .grp button em{font-style:normal;color:#777;font-size:11px;margin-left:4px}
        .grp button.on{background:#e50914;border-color:#e50914;color:#fff} .grp button.on em{color:#fdd}
        .tools{display:flex;gap:10px;align-items:center;margin:6px 0 16px;flex-wrap:wrap}
        .tools select{background:#1b1b1b;color:#fff;border:1px solid #333;padding:7px 10px;border-radius:6px;font-size:13px}
        .cnt{color:#999;font-size:13px} .grow{flex:1}
        .live summary{cursor:pointer;color:#ffb300;font-size:13px;font-weight:600;list-style:none}
        .livebtns{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;max-width:600px}
        .livebtns button{background:#1b1b1b;border:1px solid #333;color:#ddd;padding:5px 10px;border-radius:99px;cursor:pointer;font-size:12px}
        .livebtns button.on{background:#ffb300;color:#000;border-color:#ffb300}
        .livesec{border:1px solid #ffb30044;border-radius:12px;padding:14px;margin-bottom:22px;background:#151310}
        .livesec h3{margin:0 0 12px;font-size:16px;color:#ffb300;display:flex;gap:10px;align-items:center}
        .livesec h3 small{color:#888;font-weight:400;font-size:12px}
        .livesec h3 button{margin-left:auto;background:none;border:1px solid #444;color:#aaa;padding:3px 8px;border-radius:6px;cursor:pointer;font-size:12px}
        .more{display:block;margin:16px auto 0;background:#ffb300;color:#000;border:0;padding:10px 22px;border-radius:8px;font-weight:700;cursor:pointer}
        .info{color:#888;text-align:center;padding:24px;font-size:14px}
        .empty{text-align:center;padding:60px 20px;color:#bbb} .empty code{background:#222;padding:3px 8px;border-radius:4px;color:#ffb300}
      `}</style>
    </main>
  );
}

const LIVE_KEYS = [['home', 'Yeni Eklenenler'], ['all', 'Tüm Filmler'], ['nette-ilk', 'Nette İlk'], ['tavsiye', 'Tavsiye'], ['imdb7', 'IMDb 7+'], ['liked', 'En Beğenilen'], ['commented', 'En Yorumlanan'],
  ['aksiyon', 'Aksiyon'], ['komedi', 'Komedi'], ['korku', 'Korku'], ['bilim-kurgu', 'Bilim Kurgu'], ['animasyon', 'Animasyon'], ['aile', 'Aile'], ['romantik', 'Romantik'], ['belgesel', 'Belgesel'], ['suc', 'Suç'], ['tarih', 'Tarih'], ['series', 'Diziler']];

function Grid({ movies, favs, toggleFav }) {
  if (!movies.length) return null;
  return (
    <div className="grid">
      {movies.map((m) => (
        <Link key={m.id + m.href} href={`/watch/${encodeURIComponent(m.id)}?u=${encodeURIComponent(m.href)}`} className="card" title={m.title}>
          <div className="pw">
            <img src={m.poster} alt={m.title} loading="lazy" onError={(e) => { e.currentTarget.style.opacity = .15; }} />
            {m.imdb ? <span className="imdb">★ {m.imdb.toFixed(1)}</span> : null}
            {m.year ? <span className="yr">{m.year}</span> : null}
            {m.type === 'dizi' && <span className="tag">DİZİ</span>}
            <button className={`fav ${favs.includes(m.id) ? 'on' : ''}`} onClick={(e) => toggleFav(m, e)} title="Favori">{favs.includes(m.id) ? '★' : '☆'}</button>
            <div className="play">▶</div>
          </div>
          <p>{m.title}</p>
          {m.categories?.length ? <small>{m.categories.filter((c) => !['Tüm Filmler', 'Arşiv'].includes(c)).slice(0, 2).join(' · ')}</small> : null}
        </Link>
      ))}
      <style jsx>{`
        .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px}
        .card{display:block;color:#fff;text-decoration:none;border-radius:10px;overflow:hidden;background:#171717;transition:transform .18s,box-shadow .18s}
        .card:hover{transform:translateY(-4px);box-shadow:0 12px 30px #000a}
        .pw{position:relative;aspect-ratio:2/3;background:#222}
        .pw img{width:100%;height:100%;object-fit:cover;display:block}
        .imdb{position:absolute;left:6px;top:6px;background:#f5c518;color:#000;font-size:11px;font-weight:800;padding:2px 6px;border-radius:4px}
        .yr{position:absolute;right:6px;top:6px;background:#000b;font-size:11px;padding:2px 6px;border-radius:4px}
        .tag{position:absolute;left:6px;bottom:6px;background:#2962ff;font-size:10px;font-weight:800;padding:2px 6px;border-radius:4px}
        .fav{position:absolute;right:4px;bottom:4px;background:#000a;border:0;color:#fff;font-size:16px;width:30px;height:30px;border-radius:50%;cursor:pointer;opacity:0;transition:opacity .15s}
        .card:hover .fav,.fav.on{opacity:1} .fav.on{color:#f5c518}
        .play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:44px;color:#fff;background:#0006;opacity:0;transition:opacity .15s}
        .card:hover .play{opacity:1}
        p{margin:8px 8px 2px;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        small{display:block;margin:0 8px 8px;color:#777;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      `}</style>
    </div>
  );
}
