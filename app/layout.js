export const metadata = {
  title: 'HDFilm Cehennemi – TV Sinema Deneyimi',
  description: 'HDFilmCehennemi tam teşkilatlı film botu: kart kataloğu, kategori rafları ve özel HLS oynatıcı (Vestel TV dostu)',
};

export const viewport = { themeColor: '#0a0a0a', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#0a0a0a', color: '#fff' }}>
        {children}
        <style>{`
          :root {
            --brand: #e50914;
            --brand-glow: rgba(255, 59, 48, 0.85);
            --amber: #ffb300;
            --bg: #0a0a0a;
            --panel: #141414;
            --line: rgba(255, 255, 255, 0.08);
          }
          html, body { min-height: 100%; background: var(--bg); }
          * { box-sizing: border-box; }
          a { -webkit-tap-highlight-color: transparent; }

          /* ── TV oda ringi (uzak kumanda parmak izi) ─────────────── */
          [data-fn] { outline: none; }
          [data-fn]:focus,
          [data-fn]:focus-visible {
            outline: 3px solid var(--brand-glow);
            outline-offset: 2px;
            box-shadow: 0 0 22px rgba(255, 59, 48, 0.45);
            border-radius: inherit;
            position: relative;
            z-index: 40;
          }
          /* Kart tipi oda: zoom + glow (Vestel tarzı) */
          a[data-fn].tv-card:focus,
          div[data-fn].tv-card:focus {
            outline: none;
            transform: translateY(-8px) scale(1.08);
            box-shadow: 0 0 0 3px var(--brand-glow), 0 24px 48px rgba(0, 0, 0, 0.85), 0 0 44px rgba(255, 59, 48, 0.5);
            z-index: 50;
          }
          .tv-card {
            transition: transform 0.22s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.22s, opacity 0.25s;
          }
          /* TV nav aktifken oda dışındaki kartlar hafif kararıyor */
          body.tv-nav-on .tv-card:not(:focus):not(:focus-within) { opacity: 0.72; }
          body.tv-nav-on [data-fn]:not(:focus) { opacity: 0.9; }

          /* ── Raflar: kaydırma çubuğu gizle ─────────────────────── */
          .no-scrollbar { scrollbar-width: none; -ms-overflow-style: none; }
          .no-scrollbar::-webkit-scrollbar { display: none; }

          /* Oynatıcı alanı odaklanabilir (TV'den seek için) */
          [data-player] { outline: none; }
          [data-player]:focus {
            outline: 2px solid rgba(255, 255, 255, 0.25);
          }
        `}</style>
      </body>
    </html>
  );
}
