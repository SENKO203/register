'use strict';
const fs   = require('fs');
const path = require('path');
const https = require('https');
const db   = require('./database');

const CONFIG_PATH   = path.join(__dirname, 'config.json');
const GLOSSARY_PATH = path.join(db.DATA_DIR, 'glossary.json');

function getConfig() {
    if (!fs.existsSync(CONFIG_PATH)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}
function getGlossary() {
    if (!fs.existsSync(GLOSSARY_PATH)) return {};
    try { return JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf-8')); } catch { return {}; }
}

// ============================================================
//   أبعاد الصورة من الـ header — بدون أي مكتبة خارجية
// ============================================================
function getImageDimensions(filePath) {
    const buf = fs.readFileSync(filePath);
    // PNG
    if (buf[0] === 0x89 && buf[1] === 0x50) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // JPEG: ابحث عن SOF marker
    for (let i = 2; i < buf.length - 8; i++) {
        if (buf[i] === 0xFF && [0xC0, 0xC1, 0xC2].includes(buf[i + 1])) {
            return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
    }
    return { width: 800, height: 1200 };
}

// ============================================================
//   Groq Vision — يقرأ الكوري + يترجم + يحدد المواضع في خطوة واحدة
// ============================================================
async function callGroqVision(imagePath, glossary, config) {
    const base64  = fs.readFileSync(imagePath).toString('base64');
    const ext     = path.extname(imagePath).toLowerCase();
    const mime    = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'image/jpeg';
    const model   = (config.groqModel || '').includes('scout') || (config.groqModel || '').includes('maverick')
        ? config.groqModel
        : 'meta-llama/llama-4-scout-17b-16e-instruct';

    const glossaryText = Object.entries(glossary)
        .map(([k, v]) => `${k} → ${v}`).join('\n');

    const prompt = `You are a professional manga/manhwa scanlation translator. Analyze this page and return every text bubble with precise coordinates and a high-quality Arabic translation.

FIELDS per bubble:
- type: "speech" (oval/round white bubble with tail) | "thought" (cloud/dotted bubble) | "narration" (rectangular strip, usually top/bottom of panel) | "sfx" (large decorative sound art)
- x, y: top-left corner of the white bubble area as integer % of image (0-100)
- w, h: width and height of that white bubble only as integer % — NOT the surrounding artwork
- original: exact source text
- translated: high-quality Arabic translation

COORDINATE PRECISION — critical:
• Measure the white/pale bubble shape ONLY, not the panel around it
• Typical speech bubble: w=12–42, h=6–28 (small ovals)
• Typical narration box: w=55–90, h=4–16 (wide & short strip)
• Typical SFX: w=8–35, h=5–22
• REJECT any bubble with w>68 or h>48 — re-examine and correct
• Each bubble is independent; one text = one small bubble, not the whole panel

ARABIC TRANSLATION RULES:
• Write natural flowing Arabic as a native speaker would — NO literal translation
• Match personality & emotion: angry character → strong forceful Arabic; shy → soft gentle
• Shouting/rage → end with ! or !!
• Inner thought/whisper → wrap in parentheses ()
• SFX → translate the feeling/sound (BOOM → فجوووم | CRACK → طقططق | THUD → دووووم | sigh → *تنهيدة*)
• English text → translate fully to Arabic
• Brand/work titles → keep original
• Character names → established Arabic form or phonetic transliteration
${glossaryText ? `\nFIXED TERMS (never change):\n${glossaryText}\n` : ''}
Return ONLY this JSON format, nothing else:
{"blocks":[{"type":"speech","x":15,"y":8,"w":25,"h":12,"original":"source text","translated":"الترجمة"}]}

No text found → {"blocks":[]}`;

    const body = JSON.stringify({
        model,
        messages: [{
            role: 'user',
            content: [
                { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
                { type: 'text', text: prompt },
            ],
        }],
        temperature: 0.05,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.groq.com',
            path: '/openai/v1/chat/completions',
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.groqKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, res => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try {
                    const json = JSON.parse(raw);
                    if (json.error) return reject(new Error(json.error.message || 'Groq Vision error'));
                    const text = json.choices?.[0]?.message?.content || '{}';
                    const match = text.match(/\{[\s\S]*\}/);
                    if (!match) return resolve({ blocks: [] });
                    resolve(JSON.parse(match[0]));
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ============================================================
//   معالجة كل صور الفصل
// ============================================================
async function processChapterImages(manhwaId, chapterNum, imagePaths, onProgress) {
    const config   = getConfig();
    const glossary = getGlossary();

    if (!config.groqKey) throw new Error('مفتاح Groq غير موجود — أضفه من لوحة الإدارة');

    const chapterDir = path.join(db.DATA_DIR, 'library', manhwaId, `chapter-${chapterNum}`);
    fs.mkdirSync(chapterDir, { recursive: true });

    const pages = [];

    for (let i = 0; i < imagePaths.length; i++) {
        const imgPath = imagePaths[i];
        const pageNum = i + 1;

        if (onProgress) onProgress({ page: pageNum, total: imagePaths.length, stage: 'vision' });

        const { width, height } = getImageDimensions(imgPath);

        let visionResult;
        try {
            visionResult = await callGroqVision(imgPath, glossary, config);
        } catch (e) {
            console.error(`[ص${pageNum}] خطأ في Vision:`, e.message);
            visionResult = { blocks: [] };
        }

        // تحويل النسب المئوية إلى بكسل + فلترة الإحداثيات غير المنطقية
        const textBlocks = (visionResult.blocks || [])
            .filter(b => {
                if (!b.original || !b.original.trim()) return false;
                const t = b.type || 'speech';
                // رفض الفقاعات الضخمة جداً — Groq يخطئ أحياناً ويعطي مساحة الصفحة كلها
                if (t === 'narration') {
                    if ((b.h || 0) > 30) return false; // narration مستطيل قصير دائماً
                } else if (t === 'sfx') {
                    if ((b.w || 0) > 50 || (b.h || 0) > 40) return false;
                } else {
                    // speech / thought
                    if ((b.w || 0) > 68 || (b.h || 0) > 55) return false;
                }
                return true;
            })
            .map(b => ({
                bbox: {
                    x0: Math.round(Math.max(0, b.x / 100) * width),
                    y0: Math.round(Math.max(0, b.y / 100) * height),
                    x1: Math.round(Math.min(100, (b.x + b.w) / 100) * width),
                    y1: Math.round(Math.min(100, (b.y + b.h) / 100) * height),
                },
                type:       ['speech','thought','narration','sfx'].includes(b.type) ? b.type : 'speech',
                original:   b.original.trim(),
                translated: (b.translated || '').trim(),
            }));

        // حفظ JSON احتياطي للصفحة
        fs.writeFileSync(
            path.join(chapterDir, `page-${pageNum}.json`),
            JSON.stringify(textBlocks, null, 2)
        );

        pages.push({ page: pageNum, width, height, textBlocks });
    }

    return { manhwaId, chapterNum, pagesProcessed: pages.length, pages };
}

module.exports = { processChapterImages, getGlossary };
