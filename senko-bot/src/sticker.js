// ============================================================
//   صنع الملصقات + معالجة batch — ffmpeg فقط (Termux/Linux)
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { downloadMediaMessage } = require('@itsliaaa/baileys');

// مسار tmp متوافق مع Termux وLinux
const TERMUX_TMP = process.env.TMPDIR || '/data/data/com.termux/files/usr/tmp';

// تحميل الفيديوهات مرة واحدة
const RAID_VID_PATH = path.join(__dirname, '..', 'Dr.4', 'mb.mp4');
const TEST_VID_PATH = path.join(__dirname, '..', 'Dr.4', 'bday.mp4');
let raidVidBuffer = null;
let bdayVidBuffer = null;
try {
    if (fs.existsSync(RAID_VID_PATH)) {
        raidVidBuffer = fs.readFileSync(RAID_VID_PATH);
        console.log('✅ تم تحميل فيديو السحب');
    }
    if (fs.existsSync(TEST_VID_PATH)) {
        bdayVidBuffer = fs.readFileSync(TEST_VID_PATH);
        console.log('✅ تم تحميل فيديو عيد الميلاد');
    }
} catch (e) { console.log('⚠️ خطأ في تحميل الفيديوهات'); }

/**
 * Run ffmpeg as an async process (replaces spawnSync).
 * Resolves with { code, stderr } when the process exits.
 */
function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        proc.on('error', (err) => reject(err));
        proc.on('close', (code) => resolve({ code, stderr }));
    });
}

// ============================================================
//   دالة makeSticker — ffmpeg فقط (متوافق مع Termux ARM64)
// ============================================================
async function makeSticker(imgBuf, packName, packAuthor, packId) {
    const id = packId || crypto.randomBytes(8).toString('hex');

    const tmpDir = process.env.TMPDIR || '/data/data/com.termux/files/usr/tmp';
    // إنشاء المجلد إن لم يكن موجوداً
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const name   = `stk_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const tmpIn  = path.join(tmpDir, name + '.in');
    const tmpOut = path.join(tmpDir, name + '.webp');

    fs.writeFileSync(tmpIn, imgBuf);

    const result = await runFfmpeg([
        '-y', '-i', tmpIn,
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
        '-vcodec', 'libwebp', '-lossless', '0',
        '-qscale', '50', '-loop', '0',
        '-preset', 'default', '-an', '-vsync', '0',
        tmpOut
    ]);

    let webp;
    try {
        if (!fs.existsSync(tmpOut)) throw new Error('ffmpeg: ' + (result.stderr?.slice(-150) || 'فشل'));
        webp = fs.readFileSync(tmpOut);
    } finally {
        try { fs.unlinkSync(tmpIn); } catch {}
        try { fs.unlinkSync(tmpOut); } catch {}
    }

    // بناء Exif
    const json = JSON.stringify({
        'sticker-pack-id':        id,
        'sticker-pack-name':      packName || 'SENKO Pack',
        'sticker-pack-publisher': packAuthor || 'Dr.Stone 🧭',
    });
    const jsonBuf = Buffer.from(json, 'utf8');
    let exif = Buffer.from([
        0x49,0x49,0x2A,0x00,0x08,0x00,0x00,0x00,
        0x01,0x00,0x41,0x57,0x07,0x00,
        0x00,0x00,0x00,0x00,0x16,0x00,0x00,0x00
    ]);
    exif = Buffer.concat([exif, jsonBuf]);
    exif.writeUIntLE(jsonBuf.length, 14, 4);

    const exifChunk = Buffer.concat([
        Buffer.from('EXIF'),
        (() => { const b = Buffer.alloc(4); b.writeUInt32LE(exif.length, 0); return b; })(),
        exif,
        exif.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)
    ]);

    // دمج Exif مع VP8X
    const firstChunk = webp.slice(12, 16).toString('ascii');
    if (firstChunk === 'VP8X') {
        webp.writeUInt8(webp.readUInt8(20) | 0x08, 20);
        const payload = Buffer.concat([webp, exifChunk]);
        const sz = Buffer.alloc(4); sz.writeUInt32LE(payload.length - 8, 0); sz.copy(payload, 4);
        return payload;
    } else {
        const vp8x = Buffer.alloc(18);
        Buffer.from('VP8X').copy(vp8x, 0);
        vp8x.writeUInt32LE(10, 4);
        vp8x.writeUInt8(0x08, 8);
        vp8x.writeUIntLE(511, 12, 3);
        vp8x.writeUIntLE(511, 15, 3);
        const payload = Buffer.concat([Buffer.from('WEBP'), vp8x, webp.slice(12), exifChunk]);
        const sz = Buffer.alloc(4); sz.writeUInt32LE(payload.length, 0);
        return Buffer.concat([Buffer.from('RIFF'), sz, payload]);
    }
}

// ============================================================
//   دالة معالجة batch الملصقات — ترسل كحزمة واحدة
// ============================================================
async function processStickerBatch(ssk, chatId, sock) {
    const ss = global._stickerSession?.[ssk];
    if (!ss) return;
    delete global._stickerSession[ssk];

    const msgs   = [...(ss.pendingMsgs || [])];
    if (ss.ctxQ2) msgs.unshift({ _isCtx: true, ctxQ2: ss.ctxQ2 });
    if (!msgs.length) return;

    const packName   = ss.packName     || 'SENKO Pack';
    const packAuthor = ss.packPublisher || ss.senderName || 'SENKO';
    const packId     = crypto.randomBytes(8).toString('hex');

    await sock.sendMessage(chatId, {
        text: `⏳ جاري تحويل *${msgs.length}* صورة...
*الحزمة:* ${packName}`
    });

    // تحويل كل الصور لـ WebP أولاً
    const stickerBuffers = [];
    let fail = 0;
    for (const m of msgs) {
        try {
            let rawBuf;
            if (m._isCtx) {
                const dlMsg = {
                    key: { remoteJid: chatId, id: m.ctxQ2.stanzaId, participant: m.ctxQ2.participant },
                    message: m.ctxQ2.quotedMessage
                };
                rawBuf = await downloadMediaMessage(dlMsg, "buffer", {}, { reuploadRequest: sock.updateMediaMessage });
            } else {
                rawBuf = await downloadMediaMessage(m, "buffer", {}, { reuploadRequest: sock.updateMediaMessage });
            }
            const webpBuf = await makeSticker(rawBuf, packName, packAuthor, packId);
            stickerBuffers.push(webpBuf);
        } catch(e) {
            console.log('sticker convert error:', e.message);
            fail++;
        }
    }

    if (!stickerBuffers.length) {
        return sock.sendMessage(chatId, { text: `❌ فشل تحويل الصور (${fail} فشل)` });
    }

    // إرسال كحزمة واحدة باستخدام @itsliaaa/baileys
    // المكتبة تقبل Buffer مباشرة في cover وstickers
    try {
        await sock.sendMessage(chatId, {
            cover: stickerBuffers[0],                          // Buffer مباشر للغلاف
            stickers: stickerBuffers.map(buf => ({ data: buf })), // كل ملصق كـ { data: Buffer }
            name: packName,
            publisher: packAuthor,
            description: 'Dr.Stone 🧭'
        });
        await sock.sendMessage(chatId, {
            text: `✅ تم إرسال حزمة *${packName}* — *${stickerBuffers.length}* ملصق${fail ? `\n❌ فشل: ${fail}` : ''}`
        });
    } catch(e) {
        console.log('pack send error:', e.message);
        // fallback: إرسال ملصقات منفردة (نفس الحزمة packId — ستتجمع تلقائياً)
        await sock.sendMessage(chatId, { text: `⏳ إرسال الملصقات منفردة...` });
        for (const buf of stickerBuffers) {
            await sock.sendMessage(chatId, { sticker: buf });
            await new Promise(r => setTimeout(r, 200));
        }
        await sock.sendMessage(chatId, {
            text: `✅ تم إرسال *${stickerBuffers.length}* ملصق في حزمة *${packName}*\n💡 اضغط على أي ملصق لعرض الحزمة كاملة${fail ? `\n❌ فشل: ${fail}` : ''}`
        });
    }
}

// دالة قص الصورة 1x1 عبر ffmpeg (async)
async function cropSquare(imgBuf) {
    if (!imgBuf || imgBuf.length < 15000) return null; // أقل من 15KB = placeholder
    const tmpDir = process.env.TMPDIR || '/data/data/com.termux/files/usr/tmp';
    const ts = Date.now() + Math.random().toString(36).slice(2,6);
    const tmp = `${tmpDir}/sq_in_${ts}.jpg`;
    const out = `${tmpDir}/sq_out_${ts}.jpg`;
    try {
        fs.writeFileSync(tmp, imgBuf);
        const result = await runFfmpeg([
            '-y', '-i', tmp,
            '-vf', 'scale=800:800:force_original_aspect_ratio=increase,crop=800:800',
            '-update', '1', '-q:v', '3', out
        ]);
        try { fs.unlinkSync(tmp); } catch {}
        if (fs.existsSync(out)) {
            const outBuf = fs.readFileSync(out);
            try { fs.unlinkSync(out); } catch {}
            // أقل من 15KB بعد المعالجة = لون/gradient → تخطي
            if (outBuf.length < 15000) return null;
            return outBuf;
        }
    } catch { try { fs.unlinkSync(tmp); } catch {} }
    return imgBuf; // fallback
}

module.exports = {
    makeSticker,
    processStickerBatch,
    cropSquare,
    runFfmpeg,
    TERMUX_TMP,
    raidVidBuffer,
    bdayVidBuffer,
};
