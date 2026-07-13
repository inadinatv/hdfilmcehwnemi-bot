export const metadata = {
  title: 'HDFilm Bot',
  description: 'Film İzleme Platformu',
}

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#141414' }}>
        {children}
      </body>
    </html>
  )
}
