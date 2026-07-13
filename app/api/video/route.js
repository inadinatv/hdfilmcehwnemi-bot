import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.hdfilmcehennemi.nl';
const ZENROWS_API_KEY = '9f12e290f53e489c5b15b92dd18d6136f39d483b';

function dcHello(base64Input) {
    const decodedOnce = decodeURIComponent(escape(atob(base64Input)));
    const reversedString = decodedOnce.split('').reverse().join('');
    const decodedTwice = decodeURIComponent(escape(atob(reversedString)));
    
    let hdchLink = decodedTwice;
    if (hdchLink.includes("+")) hdchLink = hdchLink.split("+").pop();
    else if (hdchLink.includes(" ")) hdchLink = hdchLink.split(" ").pop();
    else if (hdchLink.includes("|")) hdchLink = hdchLink.split("|").pop();
    
    return "https" + hdchLink.split("https")[1];
}

// Tüm video isteklerini ZenRows üzerinden atacak özel fonksiyon
async function fetchWithZenRows(targetUrl) {
    const zenRowsUrl = `https://api.zenrows.com/v1/?apikey=${ZENROWS_API_KEY}&url=${encodeURIComponent(targetUrl)}&mode=auto`;
    const response = await fetch(zenRowsUrl);
    
    if (!response.ok) {
        throw new Error(`ZenRows İsteği Başarısız: ${response.status}`);
    }
    
    return await response.text();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  
  if (!url) return NextResponse.json({ error: 'URL eksik' }, { status: 400 });

  try {
    const pageHtml = await fetchWithZenRows(url);
    const $ = cheerio.load(pageHtml);
    const videoId = $('button.alternative-link').first().attr('data-video');

    if(!videoId) return NextResponse.json({ error: 'Video ID bulunamadı' }, { status: 404 });

    const apiText = await fetchWithZenRows(`${BASE_URL}/video/${videoId}/`);
    
    let iframeUrl = apiText.match(/data-src=\\"([^"]+)/)[1].replace(/\\/g, '');
    if (iframeUrl.includes("rapidrame")) {
        iframeUrl = `${BASE_URL}/rplayer/` + iframeUrl.split("?rapidrame_id=")[1];
    }

    const iframeText = await fetchWithZenRows(iframeUrl);
    const base64Match = iframeText.match(/dc_hello\("([^"]+)"\)/);
    
    if (base64Match && base64Match[1]) {
        const m3u8Url = dcHello(base64Match[1]);
        return NextResponse.json({ m3u8Url });
    }

    return NextResponse.json({ error: 'Şifre kırılamadı' }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: 'Hata oluştu', detay: error.message }, { status: 500 });
  }
}
