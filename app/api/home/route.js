import axios from 'axios';
import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

const BASE_URL = 'https://www.hdfilmcehennemi.nl';

export async function GET() {
  try {
    const { data } = await axios.get(`${BASE_URL}/load/page/1/home/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'X-Requested-With': 'fetch',
      }
    });

    const $ = cheerio.parseHTML(data.html);
    const movies = [];

    cheerio.load(data.html)('a').each((i, el) => {
      const title = cheerio(el).attr('title');
      const href = cheerio(el).attr('href');
      const poster = cheerio(el).find('img').attr('data-src') || cheerio(el).find('img').attr('src');

      if (title && href) {
        movies.push({ title, href, poster });
      }
    });

    return NextResponse.json({ movies });
  } catch (error) {
    return NextResponse.json({ error: 'Veri çekilemedi' }, { status: 500 });
  }
}
