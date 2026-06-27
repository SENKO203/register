/**
 * Senko Bot - Media Download Commands
 *
 * Commands:
 *   .med         - Show media sub-menu
 *   .med.ytv     - YouTube video via Cobalt
 *   .med.yta     - YouTube audio via Cobalt
 *   .med.tiktok  - TikTok via tikwm
 *   .med.twitter - Twitter/X via Cobalt
 *   .med.insta   - Instagram via Cobalt
 *   .med.fb      - Facebook via Cobalt
 *   .med.spotify - Spotify via caliphdev
 *   .med.mediafire - MediaFire direct link
 */
'use strict';

const axios = require('axios');

// ============================================================
//  Cobalt API helper
// ============================================================
const COBALT_URL = 'https://api.cobalt.tools/';
const COBALT_HDR = { 'Content-Type': 'application/json', 'Accept': 'application/json' };

async function cobaltDl(url, audioOnly = false) {
    const body = {
        url,
        vCodec: 'h264',
        vQuality: '720',
        aFormat: 'mp3',
        isAudioOnly: audioOnly,
        disableMetadata: true,
    };
    const r = await axios.post(COBALT_URL, body, { headers: COBALT_HDR, timeout: 30000 });
    const d = r.data;
    if (d.status === 'tunnel' || d.status === 'redirect') return d.url;
    if (d.status === 'picker' && d.picker?.length) return d.picker[0].url;
    throw new Error(d.text || 'فشل cobalt');
}

// ============================================================
//  Command handlers
// ============================================================
const commands = {};

// .med — sub-menu
commands['.med'] = async (sock, msg, args, ctx) => {
    await sock.sendMessage(ctx.chatId, {
        text: `══ ⟦  𝑴𝑬𝑫𝑰𝑨  ⟧═══

┌━━━━━━━━━━━━━━━━━━━
┝ 🎬 .med.ytv       🎵 .med.yta
┝ 🎵 .med.tiktok    📘 .med.fb
┝ 🐦 .med.twitter   🎧 .med.spotify
┝ 📸 .med.insta     📁 .med.mediafire
└━━━━━━━━━━━━━━━━━━━

║💊 ❯ .med.ytv [رابط] | .med.yta [رابط]
━━━━━━━━━━━━━━━━━━━`
    });
};

// .med.ytv — YouTube video
commands['.med.ytv'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ أرسل الرابط: `.med.ytv [رابط]`' });
    if (!args.includes('youtube.com') && !args.includes('youtu.be'))
        return sock.sendMessage(chatId, { text: '❌ أرسل رابط YouTube صالح' });
    await sock.sendMessage(chatId, { text: '⏳ جاري التحميل...' });
    try {
        const dlUrl = await cobaltDl(args.trim());
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000 });
        const buf = Buffer.from(res.data);
        if (buf.length > 60 * 1024 * 1024) return sock.sendMessage(chatId, { text: '❌ الفيديو أكبر من 60MB' });
        await sock.sendMessage(chatId, { video: buf, mimetype: 'video/mp4', caption: '🎬 YouTube' });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل: ${e.message}` }); }
};

// .med.yta — YouTube audio
commands['.med.yta'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ أرسل الرابط: `.med.yta [رابط]`' });
    if (!args.includes('youtube.com') && !args.includes('youtu.be'))
        return sock.sendMessage(chatId, { text: '❌ أرسل رابط YouTube صالح' });
    await sock.sendMessage(chatId, { text: '⏳ جاري التحميل...' });
    try {
        const dlUrl = await cobaltDl(args.trim(), true);
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000 });
        await sock.sendMessage(chatId, { audio: Buffer.from(res.data), mimetype: 'audio/mpeg', ptt: false });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل: ${e.message}` }); }
};

// .med.tiktok — TikTok
commands['.med.tiktok'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ أرسل الرابط: `.med.tiktok [رابط]`' });
    if (!args.includes('tiktok.com') && !args.includes('tiktok'))
        return sock.sendMessage(chatId, { text: '❌ أرسل رابط TikTok صالح' });
    await sock.sendMessage(chatId, { text: '⏳ جاري التحميل...' });
    try {
        let finalUrl = args.trim();
        if (finalUrl.includes('vt.tiktok') || finalUrl.includes('vm.tiktok')) {
            try {
                const redir = await axios.get(finalUrl, { maxRedirects: 5, timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
                finalUrl = redir.request?.res?.responseUrl || redir.config?.url || finalUrl;
            } catch (re) { finalUrl = re.request?._redirectable?._currentUrl || finalUrl; }
        }
        const api = await axios.post('https://www.tikwm.com/api/',
            new URLSearchParams({ url: finalUrl, hd: 1 }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }
        );
        const data = api.data?.data;
        if (!data) throw new Error('لم يوجد بيانات');
        const videoUrl = data.hdplay || data.play;
        if (!videoUrl) throw new Error('لم يوجد رابط');
        const res = await axios.get(videoUrl, { responseType: 'arraybuffer', timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.tiktok.com/' } });
        await sock.sendMessage(chatId, { video: Buffer.from(res.data), mimetype: 'video/mp4', caption: `🎵 ${data.title?.slice(0, 80) || 'TikTok'}` });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل: ${e.message}` }); }
};

// .med.twitter — Twitter/X
commands['.med.twitter'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ أرسل الرابط: `.med.twitter [رابط]`' });
    if (!args.includes('twitter.com') && !args.includes('x.com'))
        return sock.sendMessage(chatId, { text: '❌ أرسل رابط Twitter/X صالح' });
    await sock.sendMessage(chatId, { text: '⏳ جاري التحميل...' });
    try {
        const dlUrl = await cobaltDl(args.trim());
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000 });
        await sock.sendMessage(chatId, { video: Buffer.from(res.data), mimetype: 'video/mp4', caption: '🐦 Twitter/X' });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل: ${e.message}` }); }
};

// .med.insta — Instagram (multiple fallback APIs)
commands['.med.insta'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ أرسل الرابط: `.med.insta [رابط]`' });
    if (!args.includes('instagram.com'))
        return sock.sendMessage(chatId, { text: '❌ أرسل رابط Instagram صالح' });
    await sock.sendMessage(chatId, { text: '⏳ جاري التحميل...' });
    const url = args.trim();
    let dlUrl = null;
    let isVid = true;

    // Method 1: saveig API
    try {
        const r = await axios.get(`https://api.saveig.app/api/v1/get-media?url=${encodeURIComponent(url)}`, {
            timeout: 15000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (r.data?.data?.[0]?.url) dlUrl = r.data.data[0].url;
    } catch {}

    // Method 2: igdownloader
    if (!dlUrl) {
        try {
            const r = await axios.post('https://v3.igdownloader.app/api/ajaxSearch',
                new URLSearchParams({ recaptchaToken: '', q: url, t: 'media', lang: 'en' }),
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
            const match = r.data?.data?.match(/href="(https?:\/\/[^"]+)"/);
            if (match) dlUrl = match[1];
        } catch {}
    }

    // Method 3: cobalt (fallback)
    if (!dlUrl) {
        try { dlUrl = await cobaltDl(url); } catch {}
    }

    if (!dlUrl) return sock.sendMessage(chatId, { text: '❌ فشل تحميل الرابط. تأكد أن الرابط صحيح وأن المنشور عام.' });

    try {
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const contentType = res.headers['content-type'] || '';
        isVid = contentType.includes('video') || dlUrl.includes('.mp4') || dlUrl.includes('video');
        if (isVid) await sock.sendMessage(chatId, { video: Buffer.from(res.data), mimetype: 'video/mp4', caption: '📸 Instagram' });
        else await sock.sendMessage(chatId, { image: Buffer.from(res.data), caption: '📸 Instagram' });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل التحميل: ${e.message}` }); }
};

// .med.fb — Facebook
commands['.med.fb'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ أرسل الرابط: `.med.fb [رابط]`' });
    if (!args.includes('facebook.com') && !args.includes('fb.watch') && !args.includes('fb.com'))
        return sock.sendMessage(chatId, { text: '❌ أرسل رابط Facebook صالح' });
    await sock.sendMessage(chatId, { text: '⏳ جاري التحميل...' });
    try {
        const dlUrl = await cobaltDl(args.trim());
        const res = await axios.get(dlUrl, { responseType: 'arraybuffer', timeout: 120000 });
        await sock.sendMessage(chatId, { video: Buffer.from(res.data), mimetype: 'video/mp4', caption: '📘 Facebook' });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل: ${e.message}` }); }
};

// .med.spotify — Spotify
commands['.med.spotify'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ أرسل رابط Spotify: `.med.spotify [رابط]`' });
    if (!args.includes('spotify.com')) return sock.sendMessage(chatId, { text: '❌ أرسل رابط Spotify' });
    await sock.sendMessage(chatId, { text: '⏳ جاري التحميل...' });
    try {
        const r = await axios.get(`https://spotifyapi.caliphdev.com/api/download?url=${encodeURIComponent(args.trim())}`, { timeout: 20000 });
        if (!r.data?.download_url) throw new Error('لا يوجد رابط');
        const res = await axios.get(r.data.download_url, { responseType: 'arraybuffer', timeout: 120000 });
        await sock.sendMessage(chatId, { audio: Buffer.from(res.data), mimetype: 'audio/mpeg', ptt: false, fileName: `${r.data.title || 'spotify'}.mp3` });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل: ${e.message}` }); }
};

// .med.mediafire — MediaFire
commands['.med.mediafire'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ أرسل الرابط: `.med.mediafire [رابط]`' });
    await sock.sendMessage(chatId, { text: '⏳ جاري جلب الرابط...' });
    try {
        const page = await axios.get(args.trim(), { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
        const m = page.data.match(/href="(https:\/\/download[^"]+mediafire[^"]+)"/);
        if (!m) throw new Error('لم يوجد رابط مباشر');
        await sock.sendMessage(chatId, { text: `✅ رابط التحميل:\n${m[1]}` });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ فشل: ${e.message}` }); }
};

module.exports = { commands };
