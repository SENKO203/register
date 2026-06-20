/**
 * Senko Bot - AI / Clever Commands
 *
 * Commands:
 *   .clev        - Show AI sub-menu
 *   .clev.gpt    - Groq Llama 3.1-8b
 *   .clev.gemini - Google Gemini
 *   .clev.groq   - Groq Llama 3.3-70b
 *   .clev.tts    - Text-to-speech (VoiceRSS + Google TTS fallback)
 *   .clev.movie  - Movie info (OMDB API)
 *   .clev.ss     - Website screenshot (thum.io)
 *   .clev.trt    - Google Translate
 *   .clev.news   - BBC Arabic RSS news
 */
'use strict';

const axios = require('axios');

// API keys — prefer env vars, fallback to defaults
const GROQ_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const VOICERSS_KEY = process.env.VOICERSS_KEY || '';
const OMDB_KEY = process.env.OMDB_API_KEY || '';

const commands = {};

// .clev — sub-menu
commands['.clev'] = async (sock, msg, args, ctx) => {
    await sock.sendMessage(ctx.chatId, {
        text: `══ ⟦  𝑨𝑰  ⟧═══

┌━━━━━━━━━━━━━━━━━━━
┝ 🤖 .clev.gpt      ✨ .clev.gemini
┝ ⚡ .clev.groq      🗣️ .clev.tts
┝ 🎬 .clev.movie    📸 .clev.ss
┝ 🌐 .clev.trt      📰 .clev.news
└━━━━━━━━━━━━━━━━━━━

║🧠 ❯ .clev.gpt [سؤال] | .clev.trt [لغة] [نص]
━━━━━━━━━━━━━━━━━━━`
    });
};

// .clev.gpt — Groq Llama 3.1-8b
commands['.clev.gpt'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return;
    await sock.sendMessage(chatId, { text: '🤖 جاري التفكير...' });
    try {
        const r = await axios.post('https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: 'You are SENKO, a helpful assistant. Reply concisely.' },
                    { role: 'user', content: args }
                ],
                max_tokens: 1024,
            },
            { headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 });
        await sock.sendMessage(chatId, { text: `🤖 *SENKO AI*\n━━━━━━━━━━━━━━━━\n${r.data?.choices?.[0]?.message?.content || '❌ لا رد'}` });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل: ${e.message}` }); }
};

// .clev.gemini — Google Gemini
commands['.clev.gemini'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return;
    await sock.sendMessage(chatId, { text: '✨ جاري التفكير مع Gemini...' });
    try {
        const r = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
            { contents: [{ parts: [{ text: args }] }] },
            { timeout: 30000, headers: { 'Content-Type': 'application/json' } }
        );
        await sock.sendMessage(chatId, { text: `✨ *Gemini*\n━━━━━━━━━━━━━━━━\n${r.data?.candidates?.[0]?.content?.parts?.[0]?.text || '❌ لا رد'}` });
    } catch (e) { await sock.sendMessage(chatId, { text: '❌ فشل Gemini' }); }
};

// .clev.groq — Groq Llama 3.3-70b
commands['.clev.groq'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return;
    await sock.sendMessage(chatId, { text: '⚡ جاري Groq...' });
    try {
        const r = await axios.post('https://api.groq.com/openai/v1/chat/completions',
            { model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: args }], max_tokens: 2048 },
            { headers: { 'Authorization': `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 });
        await sock.sendMessage(chatId, { text: `⚡ *Groq*\n━━━━━━━━━━━━━━━━\n${r.data?.choices?.[0]?.message?.content || '❌ لا رد'}` });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل: ${e.response?.data?.error?.message || e.message}` }); }
};

// .clev.tts — Text-to-speech
commands['.clev.tts'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return;
    try {
        const ttsText = args.trim();
        const isArabic = /[؀-ۿ]/.test(ttsText);
        const lang = isArabic ? 'ar' : 'en';
        let audioBuffer = null;

        // Attempt 1: VoiceRSS API
        try {
            const vr = await axios.get(
                `https://api.voicerss.org/?key=${VOICERSS_KEY}&hl=${lang}-${lang === 'ar' ? 'sa' : 'us'}&src=${encodeURIComponent(ttsText)}&r=0&c=mp3&f=16khz_16bit_stereo`,
                { responseType: 'arraybuffer', timeout: 15000 }
            );
            const txt = Buffer.from(vr.data).toString('utf8', 0, 20);
            if (!txt.includes('ERROR')) audioBuffer = Buffer.from(vr.data);
        } catch {}

        // Attempt 2: Google Translate TTS
        if (!audioBuffer) {
            try {
                const chunks = [];
                const words = ttsText.split(' ');
                let part = '';
                const parts = [];
                for (const w of words) {
                    if ((part + ' ' + w).length > 190) { if (part) parts.push(part); part = w; }
                    else part = part ? part + ' ' + w : w;
                }
                if (part) parts.push(part);
                for (const p of parts) {
                    const url = `https://translate.googleapis.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(p)}&tl=${lang}&total=1&idx=0&textlen=${p.length}&client=gtx&prev=input&ttsspeed=1`;
                    const r = await axios.get(url, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://translate.google.com/' }, timeout: 10000 });
                    chunks.push(Buffer.from(r.data));
                }
                if (chunks.length) audioBuffer = Buffer.concat(chunks);
            } catch {}
        }

        if (!audioBuffer) return await sock.sendMessage(chatId, { text: '❌ فشل تحويل النص لصوت، جرب لاحقاً' });
        await sock.sendMessage(chatId, { audio: audioBuffer, mimetype: 'audio/mpeg', ptt: true });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل TTS: ${e.message}` }); }
};

// .clev.movie — OMDB movie search
commands['.clev.movie'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return;
    try {
        const r = await axios.get(`http://www.omdbapi.com/?apikey=${OMDB_KEY}&t=${encodeURIComponent(args)}&plot=short`, { timeout: 10000 });
        const m = r.data;
        if (m.Response !== 'True') return sock.sendMessage(chatId, { text: `❌ لم يوجد: *${args}*` });
        const info = `🎬 *${m.Title}* (${m.Year})\n━━━━━━━━━━━━━━━━\n*│📁* ${m.Genre}\n*│🎭* ${m.Director}\n*│⭐* ${m.imdbRating}/10\n*│⏱️* ${m.Runtime}\n*│📝* ${m.Plot}`;
        if (m.Poster && m.Poster !== 'N/A') {
            const ir = await axios.get(m.Poster, { responseType: 'arraybuffer', timeout: 10000 });
            await sock.sendMessage(chatId, { image: Buffer.from(ir.data), caption: info });
        } else await sock.sendMessage(chatId, { text: info });
    } catch (e) { await sock.sendMessage(chatId, { text: '❌ فشل البحث' }); }
};

// .clev.ss — Website screenshot
commands['.clev.ss'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return;
    if (!args.startsWith('http')) return sock.sendMessage(chatId, { text: '❌ مثال: .clev.ss https://google.com' });
    await sock.sendMessage(chatId, { text: '📸 جاري أخذ لقطة الشاشة...' });
    try {
        const r = await axios.get(`https://image.thum.io/get/width/1280/crop/800/${args.trim()}`, { responseType: 'arraybuffer', timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        await sock.sendMessage(chatId, { image: Buffer.from(r.data), caption: `🌐 ${args.trim()}` });
    } catch (e) { await sock.sendMessage(chatId, { text: '❌ فشل' }); }
};

// .clev.trt — Google Translate (quick)
commands['.clev.trt'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return;
    const qCtxT = msg?.message?.extendedTextMessage?.contextInfo;
    const qTxt = qCtxT?.quotedMessage?.conversation || qCtxT?.quotedMessage?.extendedTextMessage?.text;
    const pT = args.split(' '); const tl = pT[0] || 'ar';
    const txt = qTxt || pT.slice(1).join(' ') || '';
    if (!txt) return sock.sendMessage(chatId, { text: '❌ مثال: .clev.trt en النص' });
    try {
        const r = await axios.get(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(txt)}`, { timeout: 10000 });
        await sock.sendMessage(chatId, { text: `🌐 *ترجمة (${tl})*:\n━━━━━━━━━━━━━━━━\n${r.data[0].map(x => x[0]).join('')}` });
    } catch (e) { await sock.sendMessage(chatId, { text: '❌ فشل الترجمة' }); }
};

// .clev.news — BBC Arabic RSS
commands['.clev.news'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    await sock.sendMessage(chatId, { text: '📰 جاري جلب الأخبار...' });
    try {
        const r = await axios.get('https://feeds.bbci.co.uk/arabic/rss.xml', { timeout: 10000 });
        const items = [...r.data.matchAll(/<title><!\[CDATA\[([^\]]+)\]\]><\/title>/g)].slice(1, 8);
        await sock.sendMessage(chatId, { text: `📰 *BBC عربي*\n━━━━━━━━━━━━━━━━\n${items.map((m, i) => `${i + 1}. ${m[1]}`).join('\n\n')}` });
    } catch (e) { await sock.sendMessage(chatId, { text: '❌ فشل جلب الأخبار' }); }
};

module.exports = { commands };
