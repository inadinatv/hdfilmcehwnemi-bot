import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.hdfilmcehennemi.nl';
const ZENROWS_API_KEY = '9f12e290f53e489c5b15b92dd18d6136f39d483b';

export async function GET() {
  try {
    const targetUrl = `${BASE_URL}/load/page/1/home/`;
    // ZenRows URL'imizi hazırlıyoruz (Python'daki params mantığı)
    const zenRowsUrl = `https://api.zenrows.com/v1/?apikey=${ZENROWS_API_KEY}&url=${encodeURIComponent(targetUrl)}&mode=auto`;

    const response = await fetch(zenRowsUrl);

    if (!response.ok) {
      return NextResponse.json({ error: `ZenRows Hatası: ${response.status}` }, { status: 500 });
    }

    const htmlContent = await response.text();
    const $ = cheerio.load(htmlContent);
    const movies = [];

    $('a').each((i, el) => {
      const title = $(el).attr('title');
      const href = $(el).attr('href');
      const poster = $(el).find('img').attr('data-src') || $(el).find('img').attr('src');

      if (title && href) {
        movies.push({ title, href, poster });
      }
    });

    if (movies.length === 0) {
      return NextResponse.json({ error: 'ZenRows siteye girdi ama film kartları bulunamadı.' }, { status: 500 });
    }

    return NextResponse.json({ movies });
  } catch (error) {
    return NextResponse.json({ 
      error: 'ZenRows Bağlantı Hatası',
      detay: error.message 
    }, { status: 500 });
  }
}
