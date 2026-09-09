'use client';
import { useEffect, useState, Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import HlsPlayer from '../../../components/HlsPlayer';

export default function WatchPage() {
  return <Suspense fallback={<div style={{ color: '#fff', padding: 30 }}>Yükleniyor…</div>}><Watch /></Suspense>;
}

function Watch() {
  const { id } = useParams();
  const sp = useSearchParams();
  const pageUrl = sp.get('u');
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [active, setActive] = useState(0);
  const [detail, setDetail] = useState(null);
  const [mode, setMode] = useState('player'); // 'player' | 'iframe'

  const resolve = async () => {
    setState({ loading: true, error: null, data: null });
    try {
      const r = await fetch(`/api/video?url=${encodeURIComponent(pageUrl)}`).then((x) => x.json());
      if (r.error) throw new Error(r.detay || r.error);
      setState({ loading: false, error: null, data: r });
      setActive(0);
      try {
        const h = JSON.parse(localStorage.getItem('history') || '[]').filter((x) => x.id !== id);
        h.unshift({ id, title: r.title, poster: r.poster, href: pageUrl, year: r.year, imdb: r.imdb, at: Date.now() });
        localStorage.setItem('history', JSON.stringify(h.slice(0, 60)));
      } catch { /* */ }
    } catch (e) {
      setState({ loading: false, error: e.message, data: null });
    }
  };

  useEffect(() => { if (pageUrl) resolve(); }, [pageUrl]); // eslint-disable-line
  useEffect(() => {
    if (!pageUrl) return;
    fetch(`/api/detail?url=${encodeURIComponent(pageUrl)}`).then((r) => r.json()).then((d) => { if (!d.error) setDetail(d); }).catch(() => {});
  }, [pageUrl]);

  if (!pageUrl) return <div className="pg"><p>Film bağlantısı eksik.</p><Link href="/">← Ana sayfa</Link></div>;

  const src = state.data?.sources?.[active];
  const title = state.data?.title || detail?.title || decodeURIComponent(id);

  return (
    <div className="pg">
      <header>
        <Link href="/" className="back">← Geri</Link>
        <h1>{title}</h1>
        <div className="modes">
          <button className={mode === 'player' ? 'on' : ''} onClick={() => setMode('player')}>HLS Player</button>
          <button className={mode === 'iframe' ? 'on' : ''} onClick={() => setMode('iframe')}>Site oynatıcı</button>
        </div>
      </header>

      <div className="stage">
        {mode === 'iframe' ? (
          <iframe src={pageUrl} allowFullScreen allow="autoplay; fullscreen; encrypted-media; picture-in-picture" />
        ) : state.loading ? (
          <div className="msg"><div className="sp" /><p>Kaynaklar çözülüyor…</p><small>Alternatif linkler → iframe → şifreli m3u8 zinciri takip ediliyor</small></div>
        ) : state.error ? (
          <div className="msg err">
            <p>⚠️ {state.error}</p>
            <div className="row">
              <button onClick={resolve}>Tekrar dene</button>
              <button onClick={() => setMode('iframe')}>Site oynatıcıya geç</button>
              <a href={pageUrl} target="_blank" rel="noreferrer">Sitede aç ↗</a>
            </div>
          </div>
        ) : (
          <HlsPlayer
            key={src?.proxyUrl}
            src={src?.proxyUrl}
            subtitles={src?.subtitles || []}
            poster={state.data.poster}
            title={title}
            storageKey={id}
            sources={state.data.sources}
            activeSource={active}
            onSourceChange={setActive}
          />
        )}
      </div>

      {state.data && (
        <section className="srcs">
          <b>Kaynaklar:</b>
          {state.data.sources.map((s, i) => (
            <button key={i} className={i === active ? 'on' : ''} onClick={() => { setActive(i); setMode('player'); }}>
              {s.lang ? <em>{s.lang}</em> : null}{s.name}{s.subtitles?.length ? ` · ${s.subtitles.length} altyazı` : ''}
            </button>
          ))}
          {src && (
            <span className="links">
              <a href={src.proxyUrl} target="_blank" rel="noreferrer" title="Proxy m3u8">m3u8 (proxy)</a>
              <button onClick={() => { navigator.clipboard.writeText(src.m3u8Url); }} title="Orijinal m3u8 URL'sini kopyala">orijinal linki kopyala</button>
            </span>
          )}
          {!!state.data.errors?.length && <small className="errs">Çözülemeyen: {state.data.errors.join(' · ')}</small>}
        </section>
      )}

      {(detail || state.data) && (
        <section className="info">
          <img src={detail?.poster || state.data?.poster} alt="" />
          <div>
            <div className="chips">
              {(detail?.year || state.data?.year) && <span>{detail?.year || state.data?.year}</span>}
              {(detail?.imdb || state.data?.imdb) && <span className="imdb">★ {(detail?.imdb || state.data?.imdb).toFixed(1)}</span>}
              {detail?.duration && <span>{detail.duration}</span>}
              {detail?.country && <span>{detail.country}</span>}
              {(detail?.genres || state.data?.genres || []).map((g) => <span key={g} className="g">{g}</span>)}
            </div>
            <p>{detail?.description || state.data?.description || 'Açıklama alınamadı.'}</p>
            {detail?.cast?.length ? <p className="cast"><b>Oyuncular:</b> {detail.cast.join(', ')}</p> : null}
            {detail?.trailer && <a className="tr" href={detail.trailer} target="_blank" rel="noreferrer">▶ Fragman</a>}
          </div>
        </section>
      )}

      {detail?.recommendations?.length ? (
        <section className="recs">
          <h3>Benzer filmler</h3>
          <div className="rg">
            {detail.recommendations.slice(0, 12).map((m) => (
              <Link key={m.id} href={`/watch/${encodeURIComponent(m.id)}?u=${encodeURIComponent(m.href)}`}>
                <img src={m.poster} alt={m.title} loading="lazy" /><span>{m.title}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <style jsx>{`
        .pg{min-height:100vh;background:#0f0f0f;color:#fff;font-family:system-ui,sans-serif;padding-bottom:50px}
        header{display:flex;align-items:center;gap:14px;padding:12px 18px;flex-wrap:wrap}
        .back{color:#aaa;text-decoration:none;font-size:14px} .back:hover{color:#fff}
        h1{font-size:17px;margin:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .modes{display:flex;gap:4px;background:#1b1b1b;padding:3px;border-radius:8px}
        .modes button{background:none;border:0;color:#aaa;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px}
        .modes button.on{background:#e50914;color:#fff}
        .stage{background:#000;width:100%;aspect-ratio:16/9;max-height:calc(100vh - 120px);position:relative}
        .stage iframe{width:100%;height:100%;border:0}
        .msg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:20px}
        .msg small{color:#777} .msg.err p{color:#ff8a80;font-size:15px}
        .sp{width:48px;height:48px;border:4px solid #333;border-top-color:#e50914;border-radius:50%;animation:r .8s linear infinite}
        @keyframes r{to{transform:rotate(360deg)}}
        .row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}
        .row button,.row a{background:#e50914;color:#fff;border:0;padding:9px 16px;border-radius:6px;cursor:pointer;text-decoration:none;font-size:14px;font-weight:600}
        .row button:nth-child(2),.row a{background:#333}
        .srcs{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px 18px;font-size:13px}
        .srcs button{background:#1b1b1b;border:1px solid #333;color:#ddd;padding:6px 12px;border-radius:99px;cursor:pointer;font-size:13px}
        .srcs button.on{background:#e50914;border-color:#e50914;color:#fff}
        .srcs em{font-style:normal;background:#0006;padding:1px 5px;border-radius:4px;margin-right:6px;font-size:11px}
        .links{margin-left:auto;display:flex;gap:10px;font-size:12px} .links a,.links button{color:#888;background:none;border:0;padding:0;cursor:pointer;text-decoration:underline;font-size:12px}
        .errs{width:100%;color:#775}
        .info{display:flex;gap:18px;padding:10px 18px;align-items:flex-start}
        .info img{width:140px;border-radius:8px;flex:none}
        .chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
        .chips span{background:#222;padding:3px 9px;border-radius:99px;font-size:12px}
        .chips .imdb{background:#f5c518;color:#000;font-weight:800} .chips .g{background:#2a1a1a;color:#f99}
        .info p{color:#ccc;line-height:1.55;font-size:14px;margin:0 0 8px}
        .cast{color:#999;font-size:13px}
        .tr{display:inline-block;margin-top:6px;color:#fff;background:#333;padding:7px 12px;border-radius:6px;text-decoration:none;font-size:13px}
        .recs{padding:10px 18px} .recs h3{font-size:15px;color:#ccc}
        .rg{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}
        .rg a{color:#ddd;text-decoration:none;font-size:12px} .rg img{width:100%;aspect-ratio:2/3;object-fit:cover;border-radius:8px;display:block;margin-bottom:5px}
        .rg span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        @media(max-width:640px){.info{flex-direction:column}.info img{width:100px}.stage{max-height:none}}
      `}</style>
    </div>
  );
}
