/**
 * Senko Bot - Search / Image Commands
 *
 * Commands:
 *   .صور       - Pinterest image search (HTML scrape)
 *   .صورة      - Safebooru anime image search
 *   .بنترست    - Direct Pinterest search
 *   .pen       - Anime character search (prompt for anime name, then Danbooru/Safebooru)
 *   .بحث_صور   - Search platform menu
 *
 * Also exports:
 *   handlePenAnimeReply - Non-command handler for .pen anime name flow
 *   handlePenRetry      - Non-command handler for .pen retry after failure
 */
'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');

const TERMUX_TMP = process.env.TMPDIR || '/data/data/com.termux/files/usr/tmp';

// Deduplication cache: query -> Set<url>
const _pinSent = new Map();

// Search state for .بحث_صور
const _searchState = new Map();

// ============================================================
//  Async cropSquare helper (converted from spawnSync)
// ============================================================
function cropSquare(imgBuf) {
    if (!imgBuf || imgBuf.length < 15000) return Promise.resolve(null);
    return new Promise((resolve) => {
        const ts = Date.now() + Math.random().toString(36).slice(2, 6);
        const tmp = `${TERMUX_TMP}/sq_in_${ts}.jpg`;
        const out = `${TERMUX_TMP}/sq_out_${ts}.jpg`;
        try {
            fs.writeFileSync(tmp, imgBuf);
            const proc = spawn('ffmpeg', [
                '-y', '-i', tmp,
                '-vf', 'scale=800:800:force_original_aspect_ratio=increase,crop=800:800',
                '-update', '1', '-q:v', '3', out
            ], { stdio: 'pipe' });
            proc.on('close', (code) => {
                try { fs.unlinkSync(tmp); } catch {}
                if (code === 0 && fs.existsSync(out)) {
                    const result = fs.readFileSync(out);
                    try { fs.unlinkSync(out); } catch {}
                    if (result.length < 15000) return resolve(null);
                    return resolve(result);
                }
                resolve(imgBuf); // fallback
            });
            proc.on('error', () => {
                try { fs.unlinkSync(tmp); } catch {}
                resolve(imgBuf);
            });
        } catch {
            try { fs.unlinkSync(tmp); } catch {}
            resolve(imgBuf);
        }
    });
}

// ============================================================
//  Translation & Safebooru helpers
// ============================================================
async function translateToEnglish(text) {
    if (/^[a-zA-Z0-9\s]+$/.test(text)) return text;
    try {
        const res = await axios.get(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=en&dt=t&q=${encodeURIComponent(text)}`,
            { timeout: 5000 }
        );
        return res.data[0][0][0];
    } catch { return text; }
}

function formatTag(name) {
    return name.trim().toLowerCase().replace(/\s+/g, '_');
}

async function searchSafebooru(query, count) {
    const tag = formatTag(query);
    try {
        const r = await axios.get(
            `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags=${tag}+solo&limit=${count * 2}`,
            { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }
        );
        const posts = r.data || [];
        if (posts.length > 0) {
            const shuffled = posts.sort(() => Math.random() - 0.5);
            return shuffled.slice(0, count).map(p => p.file_url).filter(u => u && (u.endsWith('.jpg') || u.endsWith('.png') || u.endsWith('.jpeg')));
        }
    } catch {}
    return [];
}

// ============================================================
//  Pinterest helpers
// ============================================================
async function searchPinterest(query, count) {
    try {
        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

        const cookiePage = await axios.get(
            `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}&rs=typed`,
            { headers: { 'User-Agent': UA }, timeout: 12000, maxRedirects: 3 }
        );
        let cookies = [];
        const rawCookies = cookiePage.headers['set-cookie'];
        if (rawCookies) rawCookies.forEach(c => cookies.push(c.split(';')[0].trim()));
        const cookieStr = cookies.join('; ');

        const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}&rs=typed`;
        const dataObj = { options: { query }, context: {} };

        const res = await axios.get(
            'https://www.pinterest.com/resource/BaseSearchResource/get/',
            {
                params: { source_url: sourceUrl, data: JSON.stringify(dataObj), _: Date.now() },
                headers: {
                    'User-Agent': UA,
                    'Accept': 'application/json, text/javascript, */*, q=0.01',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'cache-control': 'no-cache',
                    'pragma': 'no-cache',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                    'x-pinterest-appstate': 'active',
                    'x-pinterest-pws-handler': 'www/search/pins.js',
                    'x-pinterest-source-url': sourceUrl,
                    'x-requested-with': 'XMLHttpRequest',
                    'Cookie': cookieStr,
                    'Referer': `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`
                },
                timeout: 12000
            }
        );

        const results = res.data?.resource_response?.data?.results || [];
        const urls = [];
        for (const pin of results) {
            const images = pin?.images;
            if (images) {
                const url = images['orig']?.url || images['736x']?.url || images['474x']?.url;
                if (url && url.includes('pinimg.com') && !urls.includes(url)) urls.push(url);
            }
            if (urls.length >= count * 2) break;
        }
        return urls;
    } catch (e) {
        console.log('Pinterest رئيسي فشل:', e.message);
        return [];
    }
}

async function searchPinterestFallback(query, count) {
    try {
        const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
        const res = await axios.get(
            `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`,
            {
                headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
                timeout: 12000
            }
        );
        const html = res.data;
        const urls = [];
        const seen = new Set();
        const regex = /"url"\s*:\s*"(https:\/\/i\.pinimg\.com\/[^"]+\.(?:jpg|jpeg|png|webp))"/g;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const url = match[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
            if (!seen.has(url) && url.includes('pinimg.com')) { seen.add(url); urls.push(url); }
            if (urls.length >= count * 3) break;
        }
        const preferred = urls.filter(u => u.includes('originals') || u.includes('736x'));
        return (preferred.length >= count ? preferred : urls).slice(0, count);
    } catch (e) {
        console.log('Pinterest fallback فشل:', e.message);
        return [];
    }
}

// ============================================================
//  Command handlers
// ============================================================
const commands = {};

// .صور — Pinterest HTML image search
commands['.صور'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ اكتب ما تبحث عنه: `.صور [اسم]`' });
    try {
        await sock.sendMessage(chatId, { text: `🔍 جاري جلب صور: *${args}*...` });
        const query = encodeURIComponent(args + ' anime');
        const url = `https://www.pinterest.com/search/pins/?q=${query}&rs=typed`;
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            timeout: 10000,
        });
        const html = res.data;
        const imgRegex = /https:\/\/i\.pinimg\.com\/[^"'\s]+\.jpg/g;
        const matches = [...new Set(html.match(imgRegex) || [])];
        const bigImages = matches.filter(u => u.includes('/736x/') || u.includes('/originals/'));
        const images = (bigImages.length > 0 ? bigImages : matches).slice(0, 4);
        if (!images.length) return await sock.sendMessage(chatId, { text: `❌ لم أجد صور لـ *${args}*` });
        let sent = 0;
        for (const imgUrl of images) {
            try {
                const cleanUrl = imgUrl.replace('/236x/', '/736x/');
                const imgRes = await axios.get(cleanUrl, { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                await sock.sendMessage(chatId, {
                    image: Buffer.from(imgRes.data),
                    caption: sent === 0 ? `🖼️ *${args}* - صورة ${sent + 1}/${images.length}` : `صورة ${sent + 1}/${images.length}`
                });
                sent++;
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) { console.error('فشل رسل صورة:', e.message); }
        }
        if (sent === 0) await sock.sendMessage(chatId, { text: '❌ فشل إرسال الصور' });
    } catch (e) {
        console.error('خطأ:', e.message);
        await sock.sendMessage(chatId, { text: '❌ فشل جلب الصور' });
    }
};

// .صورة — Safebooru anime image search
commands['.صورة'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ اكتب ما تبحث عنه: `.صورة [اسم] [عدد]`' });
    const parts = args.trim().split(/\s+/);
    let count = 1;
    let queryParts = parts;
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart)) {
        count = Math.min(parseInt(lastPart), 16);
        queryParts = parts.slice(0, -1);
    }
    const queryAr = queryParts.join(' ');
    try {
        await sock.sendMessage(chatId, { text: `🔍 جاري البحث عن: *${queryAr}* (${count} صورة)...` });
        let queryEn = queryAr;
        if (/[؀-ۿ]/.test(queryAr)) queryEn = await translateToEnglish(queryAr);
        const images = await searchSafebooru(queryEn, count);
        if (!images || images.length === 0) {
            return await sock.sendMessage(chatId, { text: `❌ لم أجد صور لـ *${queryAr}*\nجرب كتابة الاسم بالإنجليزي` });
        }
        let sent = 0;
        for (let i = 0; i < images.length; i++) {
            try {
                const imgRes = await axios.get(images[i], { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                await sock.sendMessage(chatId, {
                    image: Buffer.from(imgRes.data),
                    caption: images.length > 1 ? `🖼️ *${queryAr}* — ${i + 1}/${images.length}` : `🖼️ *${queryAr}*`
                });
                sent++;
                if (images.length > 1) await new Promise(r => setTimeout(r, 800));
            } catch {}
        }
        if (sent === 0) await sock.sendMessage(chatId, { text: '❌ فشل إرسال الصور، جرب مرة أخرى' });
    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ حدث خطأ: ${e.message}` });
    }
};

// .pen — anime character search with anime name prompt
commands['.pen'] = async (sock, msg, args, ctx) => {
    const { chatId, senderNum } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ اكتب اسم الشخصية: `.pen [اسم] [عدد]`' });
    const parts = args.trim().split(/\s+/);
    let count = 1;
    let queryParts = parts;
    const lastPart = parts[parts.length - 1];
    if (/^\d+$/.test(lastPart)) {
        count = Math.min(parseInt(lastPart), 16);
        queryParts = parts.slice(0, -1);
    }
    const queryAr = queryParts.join(' ');
    if (!global._penAnime) global._penAnime = {};
    const penKey = `${chatId}:${senderNum}`;
    global._penAnime[penKey] = { query: queryAr, count, ts: Date.now() };
    await sock.sendMessage(chatId, {
        text: `🎌 من أي أنيمي *${queryAr}*؟\nاكتب اسم الأنيمي الآن لضمان دقة البحث.\n\n_(أو اكتب *.تخطي* للبحث مباشرة)_`
    });
};

// .بحث_صور — search platform menu
commands['.بحث_صور'] = async (sock, msg, args, ctx) => {
    const { chatId, senderNum } = ctx;
    const stateKey = `${chatId}:${senderNum}`;
    _searchState.set(stateKey, { step: 'choose_platform' });
    await sock.sendMessage(chatId, {
        text: `🔍 *اختر منصة البحث:*
━━━━━━━━━━━━━━━━
📌 *.بنترست* — صور من Pinterest
🎵 *.تيك* — تحميل فيديو TikTok
━━━━━━━━━━━━━━━━
مثال بعد الاختيار:
• *.بنترست لوفي 4* ← يجلب 4 صور
• *.تيك [رابط التيك]* ← يحمّل الفيديو`
    });
};

// .بنترست — direct Pinterest search
commands['.بنترست'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ اكتب ما تبحث عنه: `.بنترست [اسم] [عدد]`' });
    const parts = args.trim().split(/\s+/);
    let count = 3;
    let queryParts = parts;
    const last = parts[parts.length - 1];
    if (/^\d+$/.test(last)) {
        count = Math.min(parseInt(last), 16);
        queryParts = parts.slice(0, -1);
    }
    const queryAr = queryParts.join(' ');
    if (!queryAr) return sock.sendMessage(chatId, { text: '❌ اكتب اسم الشخصية، مثال: *.بنترست لوفي 4*' });
    try {
        await sock.sendMessage(chatId, { text: `📌 جاري البحث في Pinterest عن: *${queryAr}* (${count} صورة)...` });
        let queryEn = queryAr;
        if (/[؀-ۿ]/.test(queryAr)) queryEn = await translateToEnglish(queryAr);
        queryEn = queryEn + ' anime';

        async function fetchPinterestImages(q, n) {
            try {
                const res = await axios.get(
                    `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}&rs=typed`,
                    {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
                            'Accept': 'text/html,application/xhtml+xml',
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                        timeout: 12000
                    }
                );
                const html = res.data;
                const seen = new Set();
                const urls = [];
                const regex = /https:\/\/i\.pinimg\.com\/(?:736x|originals)\/[^"'\s\\]+\.(?:jpg|jpeg|png)/g;
                let m;
                while ((m = regex.exec(html)) !== null && urls.length < n * 2) {
                    const u = m[0];
                    if (!seen.has(u)) { seen.add(u); urls.push(u); }
                }
                if (urls.length === 0) {
                    const r2 = /https:\/\/i\.pinimg\.com\/[^"'\s\\]+\.(?:jpg|jpeg|png)/g;
                    while ((m = r2.exec(html)) !== null && urls.length < n * 2) {
                        const u = m[0];
                        if (!seen.has(u)) { seen.add(u); urls.push(u); }
                    }
                }
                return urls.slice(0, n);
            } catch (e) {
                console.log('Pinterest fetch error:', e.message);
                return [];
            }
        }

        let images = await fetchPinterestImages(queryEn, count);
        if (!images || images.length === 0) {
            return await sock.sendMessage(chatId, { text: `❌ لم أجد صور في Pinterest لـ *${queryAr}*\nتأكد من الاسم أو جرب لاحقاً` });
        }
        let sent = 0;
        for (let i = 0; i < images.length; i++) {
            try {
                const imgRes = await axios.get(images[i], {
                    responseType: 'arraybuffer', timeout: 15000,
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.pinterest.com/' }
                });
                await sock.sendMessage(chatId, {
                    image: Buffer.from(imgRes.data),
                    caption: images.length > 1 ? `📌 *${queryAr}* — ${i + 1}/${images.length}` : `📌 *${queryAr}*`
                });
                sent++;
                if (images.length > 1) await new Promise(r => setTimeout(r, 800));
            } catch {}
        }
        if (sent === 0) await sock.sendMessage(chatId, { text: '❌ فشل تحميل الصور، جرب مرة أخرى' });
    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ خطأ: ${e.message}` });
    }
};

// ============================================================
//  Non-command handlers (exported for handler.js)
// ============================================================

/**
 * Handle .pen anime name reply flow.
 * Called from handler when global._penAnime has a pending entry.
 * @returns {boolean} true if handled (caller should return early)
 */
async function handlePenAnimeReply(sock, msg, ctx) {
    if (!global._penAnime) return false;
    const { chatId, senderNum, text } = ctx;
    const penKey = `${chatId}:${senderNum}`;
    const penData = global._penAnime[penKey];
    if (!penData) return false;
    if ((Date.now() - penData.ts) >= 90000) { delete global._penAnime[penKey]; return false; }
    if (!text) return false;
    if (text.startsWith('.') && text.trim() !== '.تخطي' && !text.includes(' ') && !/^[A-Za-z]/.test(text)) return false;

    delete global._penAnime[penKey];

    // .تخطي — search directly without anime name
    if (text.trim() === '.تخطي') {
        const ckSkip = penData.query.trim().toLowerCase();
        try {
            await sock.sendMessage(chatId, { text: `📌 جاري البحث عن: *${penData.query}* (${penData.count} صورة)...` });
            let qEn = penData.query;
            if (/[؀-ۿ]/.test(qEn)) qEn = await translateToEnglish(qEn);
            let iUrls = await searchSafebooru(qEn + ' rating:safe -nude -topless -explicit', penData.count * 4);
            if (!iUrls.length) { try { iUrls = await searchPinterest(`${qEn} anime`, penData.count * 3); } catch {} }
            if (!iUrls.length) return (await sock.sendMessage(chatId, { text: `❌ لم أجد صور لـ *${penData.query}*` }), true);
            if (!_pinSent.has(ckSkip)) _pinSent.set(ckSkip, new Set());
            const sk = _pinSent.get(ckSkip);
            let fr = iUrls.filter(u => !sk.has(u));
            if (fr.length < penData.count) { sk.clear(); fr = iUrls; }
            fr.sort(() => Math.random() - 0.5);
            const vi = [], uu = [];
            for (let i = 0; i < fr.length && vi.length < penData.count; i++) {
                try {
                    const r = await axios.get(fr[i], { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                    const sq = await cropSquare(Buffer.from(r.data));
                    if (sq) { vi.push(sq); uu.push(fr[i]); }
                } catch {}
            }
            uu.forEach(u => sk.add(u));
            if (!vi.length) return (await sock.sendMessage(chatId, { text: '❌ فشل تحميل الصور' }), true);
            await sock.sendMessage(chatId, { image: vi[0], caption: `📌 *${penData.query}*` });
            for (let i = 1; i < vi.length; i++) { await sock.sendMessage(chatId, { image: vi[i] }); await new Promise(r => setTimeout(r, 250)); }
        } catch (e) { await sock.sendMessage(chatId, { text: `❌ خطأ: ${e.message}` }); }
        return true;
    }

    // Anime name provided — search with character + anime
    const animeName = text.trim();
    const finalQuery = `${penData.query} ${animeName}`;
    const cacheKey = finalQuery.trim().toLowerCase();

    try {
        await sock.sendMessage(chatId, { text: `📌 جاري البحث عن صور: *${penData.query}* من *${animeName}* (${penData.count} صورة)...` });
        let queryEn = finalQuery;
        if (/[؀-ۿ]/.test(finalQuery)) queryEn = await translateToEnglish(finalQuery);

        let imageUrls = [];
        const sbResults = await searchSafebooru(queryEn + ' rating:safe -nude -topless -explicit', penData.count * 4);
        imageUrls = sbResults;
        if (imageUrls.length < penData.count) {
            try {
                const tag = queryEn.toLowerCase().replace(/\s+/g, '_');
                const db = await axios.get(
                    `https://danbooru.donmai.us/posts.json?tags=${encodeURIComponent(tag)}+rating:g&limit=50&random=true`,
                    { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } }
                );
                for (const p of (db.data || [])) {
                    const u = p.file_url || p.large_file_url;
                    if (u && /\.(jpg|jpeg|png)$/i.test(u)) imageUrls.push(u);
                }
            } catch {}
        }
        if (imageUrls.length < penData.count) {
            try { const pUrls = await searchPinterest(`${queryEn} anime`, penData.count * 3); imageUrls = [...imageUrls, ...pUrls]; } catch {}
        }
        if (!imageUrls.length) return (await sock.sendMessage(chatId, { text: `❌ لم أجد صور لـ *${finalQuery}*` }), true);

        if (!_pinSent.has(cacheKey)) _pinSent.set(cacheKey, new Set());
        const sent_set = _pinSent.get(cacheKey);
        let freshUrls = imageUrls.filter(u => !sent_set.has(u));
        if (freshUrls.length < penData.count) { sent_set.clear(); freshUrls = imageUrls; }
        freshUrls.sort(() => Math.random() - 0.5);

        const validImages = [], usedUrls = [];
        for (let i = 0; i < freshUrls.length && validImages.length < penData.count; i++) {
            try {
                const r = await axios.get(freshUrls[i], { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://safebooru.org/' } });
                const sq = await cropSquare(Buffer.from(r.data));
                if (sq) { validImages.push(sq); usedUrls.push(freshUrls[i]); }
            } catch {}
        }
        usedUrls.forEach(u => sent_set.add(u));
        if (sent_set.size > 400) { const arr = [...sent_set]; arr.slice(0, arr.length - 400).forEach(u => sent_set.delete(u)); }

        if (!validImages.length) return (await sock.sendMessage(chatId, { text: '❌ فشل تحميل الصور، جرب مرة أخرى' }), true);

        await sock.sendMessage(chatId, {
            image: validImages[0],
            caption: validImages.length > 1
                ? `📌 *${penData.query}* — *${animeName}* (${validImages.length} صور)`
                : `📌 *${penData.query}* — *${animeName}*`
        });
        for (let i = 1; i < validImages.length; i++) { await sock.sendMessage(chatId, { image: validImages[i] }); await new Promise(r => setTimeout(r, 250)); }
    } catch (e) {
        await sock.sendMessage(chatId, { text: `❌ خطأ: ${e.message}` });
    }
    return true;
}

/**
 * Handle .pen retry flow after initial search failure.
 * Called from handler when global._penRetry has a pending entry.
 * @returns {boolean} true if handled
 */
async function handlePenRetry(sock, msg, ctx) {
    if (!global._penRetry) return false;
    const { chatId, senderNum, text, command } = ctx;
    if (command) return false; // only non-command text
    const retryKey = `${chatId}:${senderNum}`;
    const retryData = global._penRetry[retryKey];
    if (!retryData) return false;
    if ((Date.now() - retryData.ts) >= 60000) { delete global._penRetry[retryKey]; return false; }
    if (!text || text.startsWith('.')) return false;

    delete global._penRetry[retryKey];
    const animeQuery = retryData.query + ' ' + text.trim();
    let animeQueryEn = animeQuery;
    if (/[؀-ۿ]/.test(animeQuery)) animeQueryEn = await translateToEnglish(animeQuery);
    await sock.sendMessage(chatId, { text: `🔍 جاري البحث عن: *${animeQuery}*...` });
    let retryUrls = [];
    try { retryUrls = await searchSafebooru(animeQueryEn + ' rating:safe -nude -topless', retryData.count * 4); } catch {}
    if (!retryUrls.length) { try { const pU = await searchPinterest(`${animeQueryEn} anime`, retryData.count * 3); retryUrls = pU; } catch {} }
    if (!retryUrls.length) return (await sock.sendMessage(chatId, { text: '❌ لم أجد نتائج حتى مع اسم الأنيمي، جرب بالإنجليزي' }), true);

    const cacheKey2 = animeQuery.trim().toLowerCase();
    if (!_pinSent.has(cacheKey2)) _pinSent.set(cacheKey2, new Set());
    const sent2 = _pinSent.get(cacheKey2);
    let fresh2 = retryUrls.filter(u => !sent2.has(u));
    if (fresh2.length < retryData.count) { sent2.clear(); fresh2 = retryUrls; }
    fresh2.sort(() => Math.random() - 0.5);
    const valid2 = [];
    for (let i = 0; i < fresh2.length && valid2.length < retryData.count; i++) {
        try {
            const r = await axios.get(fresh2[i], { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
            const sq = await cropSquare(Buffer.from(r.data));
            if (sq) { valid2.push(sq); sent2.add(fresh2[i]); }
        } catch {}
    }
    if (!valid2.length) return (await sock.sendMessage(chatId, { text: '❌ فشل تحميل الصور' }), true);
    await sock.sendMessage(chatId, { image: valid2[0], caption: `📌 *${animeQuery}*` });
    for (let i = 1; i < valid2.length; i++) { await sock.sendMessage(chatId, { image: valid2[i] }); await new Promise(r => setTimeout(r, 250)); }
    return true;
}

module.exports = { commands, handlePenAnimeReply, handlePenRetry };
