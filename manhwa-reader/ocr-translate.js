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

    const prompt = `هذه صفحة من مانهوا/مانجا (كوميكس آسيوي).
مهمتك: اكتشف كل فقاعات الكلام والنصوص وترجمها إلى العربية.

لكل فقاعة/نص، أعطني الحقول التالية:
- type: نوع الفقاعة — "speech" (فقاعة كلام بيضاء دائرية/بيضاوية) | "thought" (فقاعة تفكير بخطوط منقطة أو سحابية) | "narration" (صندوق سرد مستطيل) | "sfx" (مؤثر صوتي مرسوم كبير)
- x, y: موضع الزاوية العلوية اليسرى للمنطقة البيضاء/الفارغة للفقاعة كاملة (0-100 نسبة مئوية من الصورة)
- w, h: عرض وارتفاع منطقة الفقاعة كاملة (0-100 نسبة مئوية) — اشمل المنطقة البيضاء كلها ليس فقط الحروف
- original: النص الأصلي كما هو في الصورة
- translated: الترجمة العربية

مثال: فقاعة بيضاء تمتد من Y=8% إلى Y=22% ومن X=12% إلى X=48% → type:"speech", x:12, y:8, w:36, h:14

${glossaryText ? `قاموس مصطلحات ثابت (لا تغير هذه الأسماء والمصطلحات):\n${glossaryText}\n` : ''}
قواعد الترجمة:
• اكتب عربية طبيعية سلسة تناسب أسلوب المانهوا وعمر الشخصية
• صراخ/غضب شديد → أضف ! أو !! في النهاية
• همس/تفكير داخلي → ضع النص بين قوسين ()
• مؤثرات صوتية (أصوات طعام، ضربات، انفجارات) → ترجم المعنى
• أسماء الشخصيات → نقحرة عربية تتوافق مع نطقها الأصلي
• النصوص الإنجليزية → ترجمها للعربية أيضاً
• إذا كان النص اسماً تجارياً أو اسم عمل → أبقه كما هو

أعد JSON فقط بهذا الشكل وبدون أي نص آخر:
{"blocks":[{"type":"speech","x":12,"y":8,"w":36,"h":14,"original":"النص الأصلي","translated":"الترجمة العربية"}]}

إذا لم يوجد أي نص في الصورة أعد: {"blocks":[]}`;

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

        // تحويل النسب المئوية إلى بكسل + حفظ النوع
        const textBlocks = (visionResult.blocks || [])
            .filter(b => b.original && b.original.trim())
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
