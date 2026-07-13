import axios from 'axios';
import * as cheerio from 'cheerio';
import { NextResponse } from 'next/server';

const BASE_URL = 'https://www.hdfilmcehennemi.nl';

function dcHello(base64Input) {
    const decodedOnce = Buffer.from(base64Input, 'base64').toString('utf-8');
    const reversedString = decodedOnce.split('').reverse().join('');
    const decodedTwice = Buffer.from(reversedString, 'base64').toString('utf-8');
    
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
    const pageReq = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(pageReq.data);
    const videoId = $('button.alternative-link').first().attr('data-video');

    if(!videoId) return NextResponse.json({ error: 'Video bulunamadı' }, { status: 404 });

    const apiGet = await axios.get(`${BASE_URL}/video/${videoId}/`, {
      headers: { 'X-Requested-With': 'fetch' }
    });
    
    let iframeUrl = apiGet.data.match(/data-src=\\"([^"]+)/)[1].replace(/\\/g, '');
    if (iframeUrl.includes("rapidrame")) {
        iframeUrl = `${BASE_URL}/rplayer/` + iframeUrl.split("?rapidrame_id=")[1];
    }

    const iframeReq = await axios.get(iframeUrl, { headers: { 'Referer': BASE_URL } });
    const base64Match = iframeReq.data.match(/dc_hello\("([^"]+)"\)/);
    
    if (base64Match && base64Match[1]) {
        const m3u8Url = dcHello(base64Match[1]);
        return NextResponse.json({ m3u8Url });
    }

    return NextResponse.json({ error: 'Link şifrelenmiş' }, { status: 500 });
  } catch (error) {
    return NextResponse.json({ error: 'Hata oluştu' }, { status: 500 });
  }
}
