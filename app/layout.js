export const metadata = {
  title: 'HDFilm Cehennemi – Katalog & HLS Player',
  description: 'HDFilmCehennemi tam katalog botu ve özel HLS oynatıcı',
};

export const viewport = { themeColor: '#0f0f0f', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#0f0f0f', color: '#fff' }}>{children}</body>
    </html>
  );
}
