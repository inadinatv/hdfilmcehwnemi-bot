import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

// Cloudflare Edge Altyapısı
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://www.hdfilmcehennemi.nl';

function dcHello(base64Input) {
    // Edge ortamında Buffer çalışmadığı için standart atob (base64 çözücü) kullanıyoruz
    const decodedOnce = decodeURIComponent(escape(atob(base64Input)));
    const reversedString = decodedOnce.split('').reverse().join('');
    const decodedTwice = decodeURIComponent(escape(atob(reversedString)));
    
    let hdchLink = decodedTwice;
    if (hdchLink.includes("+")) hdchLink = hdchLink.split("+").pop();
    else if (hdchLink.includes(" ")) hdchLink = hdchLink.split(" ").pop();
    else if (hdchLink.includes("|")) hdchLink = hdchLink.split("|").pop();
    
    return "https" + hdchLink.split("https")[1];
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  
  if (!url) return NextResponse.json({ error: 'URL eksik' }, { status: 400 });

  try {
    const pageReq = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const pageHtml = await pageReq.text();
    const $ = cheerio.load(pageHtml);
    const videoId = $('button.alternative-link').first().attr('data-video');

    if(!videoId) return NextResponse.json({ error: 'Video bulunamadı' }, { status: 404 });

    const apiGet = await fetch(`${BASE_URL}/video/${videoId}/`, {
      headers: { 'X-Requested-With': 'fetch' }
    });
    const apiText = await apiGet.text();
    
    let iframeUrl = apiText.match(/data-src=\\"([^"]+)/)[1].replace(/\\/g, '');
    if (iframeUrl.includes("rapidrame")) {
        iframeUrl = `${BASE_URL}/rplayer/` + iframeUrl.split("?rapidrame_id=")[1];
    }

    const iframeReq = await fetch(iframeUrl, { headers: { 'Referer': BASE_URL } });
    const iframeText = await iframeReq.text();
    const base64Match = iframeText.match(/dc_hello\("([^"]+)"\)/);
    
    if (base64Match && base64Match[1]) {
        const m3u8Url = dcHello(base64Match[1]);
        return NextResponse.json({ m3u8Url });
    }

    return NextResponse.json({ error: 'Link şifrelenmiş' }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: 'Hata oluştu', detay: error.message }, { status: 500 });
  }
}
