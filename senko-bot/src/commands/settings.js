/**
 * Senko Bot - Media Settings Commands
 *
 * Commands:
 *   .sett          - Show settings sub-menu
 *   .sett.mp3      - Convert video/audio to MP3
 *   .sett.compress - Compress video (libx264 crf 28)
 *   .sett.reverse  - Reverse video
 *   .sett.rmbg     - Remove background (remove.bg API)
 *
 * Note: ffmpeg operations use async child_process.spawn instead of spawnSync
 *       for better event-loop behaviour.
 */
'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');
const { downloadMediaMessage } = require('@itsliaaa/baileys');

const { FILES } = require('../config');
const { save, config } = require('../database');

const TERMUX_TMP = process.env.TMPDIR || '/data/data/com.termux/files/usr/tmp';

// ============================================================
//  Async ffmpeg helper
// ============================================================
function runFfmpeg(ffmpegArgs) {
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', ffmpegArgs, { stdio: 'pipe' });
        let stderr = '';
        proc.stderr.on('data', (d) => { stderr += d.toString().slice(-200); });
        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error('ffmpeg فشل: ' + stderr.slice(-80)));
        });
        proc.on('error', reject);
    });
}

// ============================================================
//  Command handlers
// ============================================================
const commands = {};

// .sett — sub-menu
commands['.sett'] = async (sock, msg, args, ctx) => {
    await sock.sendMessage(ctx.chatId, {
        text: `══ ⟦  𝑺𝑬𝑻𝑻  ⟧═══

｢ رد على فيديو أو صورة ｣

┌━━━━━━━━━━━━━━━━━━━
┝ 🎵 .sett.mp3      🗜️ .sett.compress
┝ 🔄 .sett.reverse  🖼️ .sett.rmbg
┝ 🎙️ .sett.aud      🔵 .sett.cir
└━━━━━━━━━━━━━━━━━━━

║⚙️ ❯ رد على ميديا ثم اكتب الأمر
━━━━━━━━━━━━━━━━━━━`
    });
};

// .sett.mp3 — audio extraction
commands['.sett.mp3'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    const qC = msg?.message?.extendedTextMessage?.contextInfo;
    if (!qC?.quotedMessage?.videoMessage && !qC?.quotedMessage?.audioMessage)
        return sock.sendMessage(chatId, { text: '❌ رد على فيديو' });
    await sock.sendMessage(chatId, { text: '🎵 جاري التحويل...' });
    try {
        const dlMsg = { key: { remoteJid: chatId, id: qC.stanzaId, participant: qC.participant }, message: qC.quotedMessage };
        const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const ts = Date.now();
        const tmp = `${TERMUX_TMP}/mp3_${ts}.mp4`;
        const out = `${TERMUX_TMP}/mp3_${ts}.mp3`;
        fs.writeFileSync(tmp, buf);
        await runFfmpeg(['-y', '-i', tmp, '-vn', '-ab', '192k', '-ar', '44100', out]);
        try { fs.unlinkSync(tmp); } catch {}
        if (!fs.existsSync(out)) throw new Error('ffmpeg فشل');
        const ab = fs.readFileSync(out);
        try { fs.unlinkSync(out); } catch {}
        await sock.sendMessage(chatId, { audio: ab, mimetype: 'audio/mpeg', ptt: false, fileName: 'audio.mp3' });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ ${e.message}` }); }
};

// .sett.compress — video compression
commands['.sett.compress'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    const qC2 = msg?.message?.extendedTextMessage?.contextInfo;
    if (!qC2?.quotedMessage?.videoMessage) return sock.sendMessage(chatId, { text: '❌ رد على فيديو' });
    await sock.sendMessage(chatId, { text: '🗜️ جاري الضغط...' });
    try {
        const dlMsg = { key: { remoteJid: chatId, id: qC2.stanzaId, participant: qC2.participant }, message: qC2.quotedMessage };
        const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const ts = Date.now();
        const tmp = `${TERMUX_TMP}/cmp_${ts}.mp4`;
        const out = `${TERMUX_TMP}/cmp_${ts}_out.mp4`;
        fs.writeFileSync(tmp, buf);
        await runFfmpeg(['-y', '-i', tmp, '-vcodec', 'libx264', '-crf', '28', '-preset', 'fast', '-update', '1', out]);
        try { fs.unlinkSync(tmp); } catch {}
        if (!fs.existsSync(out)) throw new Error('ffmpeg فشل');
        const vb = fs.readFileSync(out);
        try { fs.unlinkSync(out); } catch {}
        await sock.sendMessage(chatId, { video: vb, mimetype: 'video/mp4', caption: '✅ تم الضغط' });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ ${e.message}` }); }
};

// .sett.reverse — reverse video
commands['.sett.reverse'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    const qC3 = msg?.message?.extendedTextMessage?.contextInfo;
    if (!qC3?.quotedMessage?.videoMessage) return sock.sendMessage(chatId, { text: '❌ رد على فيديو' });
    await sock.sendMessage(chatId, { text: '🔄 جاري العكس...' });
    try {
        const dlMsg = { key: { remoteJid: chatId, id: qC3.stanzaId, participant: qC3.participant }, message: qC3.quotedMessage };
        const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const ts = Date.now();
        const tmp = `${TERMUX_TMP}/rev_${ts}.mp4`;
        const out = `${TERMUX_TMP}/rev_${ts}_out.mp4`;
        fs.writeFileSync(tmp, buf);
        await runFfmpeg(['-y', '-i', tmp, '-vf', 'reverse', '-af', 'areverse', '-update', '1', out]);
        try { fs.unlinkSync(tmp); } catch {}
        if (!fs.existsSync(out)) throw new Error('ffmpeg فشل');
        const vb = fs.readFileSync(out);
        try { fs.unlinkSync(out); } catch {}
        await sock.sendMessage(chatId, { video: vb, mimetype: 'video/mp4', caption: '🔄 تم العكس' });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ ${e.message}` }); }
};

// .sett.rmbg — remove background
commands['.sett.rmbg'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    const rmbgKey = config.removebgKey || process.env.REMOVEBG_KEY || '';
    if (!rmbgKey) return sock.sendMessage(chatId, { text: '❌ لم يتم تعيين مفتاح remove.bg\nاستخدم: `.rmbg [المفتاح]`\nاحصل على مفتاح مجاني من remove.bg' });
    const qCI = msg?.message?.extendedTextMessage?.contextInfo;
    const hasImg2 = qCI?.quotedMessage?.imageMessage || msg?.message?.imageMessage;
    if (!hasImg2) return sock.sendMessage(chatId, { text: '❌ رد على صورة' });
    await sock.sendMessage(chatId, { text: '🖼️ جاري إزالة الخلفية...' });
    try {
        const dlMsg = qCI?.stanzaId
            ? { key: { remoteJid: chatId, id: qCI.stanzaId, participant: qCI.participant }, message: qCI.quotedMessage }
            : msg;
        const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const FormData = require('form-data');
        const form = new FormData();
        form.append('image_file', buf, { filename: 'img.jpg', contentType: 'image/jpeg' });
        form.append('size', 'auto');
        const r = await axios.post('https://api.remove.bg/v1.0/removebg', form, {
            headers: { ...form.getHeaders(), 'X-Api-Key': rmbgKey },
            responseType: 'arraybuffer',
            timeout: 30000,
        });
        await sock.sendMessage(chatId, { image: Buffer.from(r.data), mimetype: 'image/png', caption: '✅ تمت إزالة الخلفية' });
    } catch (e) { await sock.sendMessage(chatId, { text: '❌ فشل إزالة الخلفية: ' + (e.response?.status === 402 ? 'انتهت حصة المفتاح المجاني' : e.message) }); }
};

// .rmbg — تعيين مفتاح remove.bg
commands['.rmbg'] = async (sock, msg, args, ctx) => {
    const { chatId, isSuperOwner } = ctx;
    if (!isSuperOwner) return;
    const key = (args || '').trim();
    if (!key) return sock.sendMessage(chatId, { text: '⚠️ .rmbg [المفتاح]\nاحصل على مفتاح مجاني من remove.bg' });
    config.removebgKey = key;
    save(FILES.CONFIG, config);
    await sock.sendMessage(chatId, { text: '✅ تم حفظ مفتاح remove.bg' });
};

// .sett.aud — استخراج الصوت من الفيديو
commands['.sett.aud'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    const qC = msg?.message?.extendedTextMessage?.contextInfo;
    if (!qC?.quotedMessage?.videoMessage)
        return sock.sendMessage(chatId, { text: '❌ رد على فيديو لاستخراج الصوت' });
    await sock.sendMessage(chatId, { text: '🎙️ جاري استخراج الصوت...' });
    try {
        const dlMsg = { key: { remoteJid: chatId, id: qC.stanzaId, participant: qC.participant }, message: qC.quotedMessage };
        const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const ts = Date.now();
        const tmp = `${TERMUX_TMP}/aud_${ts}.mp4`;
        const out = `${TERMUX_TMP}/aud_${ts}.mp3`;
        fs.writeFileSync(tmp, buf);
        await runFfmpeg(['-y', '-i', tmp, '-vn', '-ab', '192k', '-ar', '44100', out]);
        try { fs.unlinkSync(tmp); } catch {}
        if (!fs.existsSync(out)) throw new Error('فشل استخراج الصوت');
        const ab = fs.readFileSync(out);
        try { fs.unlinkSync(out); } catch {}
        await sock.sendMessage(chatId, { audio: ab, mimetype: 'audio/mpeg', ptt: false, fileName: 'audio.mp3' });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ ${e.message}` }); }
};

// .sett.cir — تحويل فيديو إلى فيديو دائري
commands['.sett.cir'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    const qC = msg?.message?.extendedTextMessage?.contextInfo;
    if (!qC?.quotedMessage?.videoMessage)
        return sock.sendMessage(chatId, { text: '❌ رد على فيديو لتحويله إلى دائري' });
    await sock.sendMessage(chatId, { text: '🔵 جاري التحويل إلى فيديو دائري...' });
    try {
        const dlMsg = { key: { remoteJid: chatId, id: qC.stanzaId, participant: qC.participant }, message: qC.quotedMessage };
        const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        await sock.sendMessage(chatId, { video: buf, ptv: true, mimetype: 'video/mp4' });
    } catch (e) { await sock.sendMessage(chatId, { text: `❌ ${e.message}` }); }
};

module.exports = { commands };
