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

function getImageDimensions(filePath) {
    const buf = fs.readFileSync(filePath);
    if (buf[0] === 0x89 && buf[1] === 0x50) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    for (let i = 2; i < buf.length - 8; i++) {
        if (buf[i] === 0xFF && [0xC0, 0xC1, 0xC2].includes(buf[i + 1])) {
            return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
    }
    return { width: 800, height: 1200 };
}

// ============================================================
//   خطوة 1: Google Cloud Vision — OCR دقيق بإحداثيات بيكسل حقيقية
// ============================================================
function callGoogleVision(imagePath, config) {
    const base64 = fs.readFileSync(imagePath).toString('base64');
    const body   = JSON.stringify({
        requests: [{
            image: { content: base64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        }],
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'vision.googleapis.com',
            path:     `/v1/images:annotate?key=${config.googleVisionKey}`,
            method:   'POST',
            headers:  {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, res => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try {
                    const json = JSON.parse(raw);
                    if (json.error) return reject(new Error(json.error.message || 'Google Vision error'));

                    const annotation = json.responses?.[0]?.fullTextAnnotation;
                    if (!annotation) return resolve([]);

                    const blocks = [];
                    for (const page of annotation.pages || []) {
                        for (const block of page.blocks || []) {
                            const verts = block.boundingBox?.vertices || [];
                            if (verts.length < 2) continue;

                            const xs = verts.map(v => v.x || 0);
                            const ys = verts.map(v => v.y || 0);
                            const x0 = Math.min(...xs), y0 = Math.min(...ys);
                            const x1 = Math.max(...xs), y1 = Math.max(...ys);
                            if (x1 - x0 < 4 || y1 - y0 < 4) continue;

                            // إعادة بناء النص من الكلمات مع الحفاظ على السطور
                            const lines = [];
                            for (const para of block.paragraphs || []) {
                                let line = '';
                                for (const word of para.words || []) {
                                    const wText = (word.symbols || []).map(s => s.text).join('');
                                    const breakType = word.symbols?.at(-1)?.property?.detectedBreak?.type;
                                    line += wText + (breakType === 'SPACE' || breakType === 'SURE_SPACE' ? ' ' : '');
                                }
                                if (line.trim()) lines.push(line.trim());
                            }
                            const text = lines.join(' ').trim();
                            if (!text) continue;

                            blocks.push({ original: text, bbox: { x0, y0, x1, y1 } });
                        }
                    }
                    resolve(blocks);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ============================================================
//   خطوة 2: Groq Text API — ترجمة دُفعية بجودة عالية
//   (نص فقط بدون صورة = أسرع + أدق في الترجمة)
// ============================================================
function translateBatch(originals, glossary, config) {
    if (!originals.length) return Promise.resolve([]);

    const glossaryText = Object.entries(glossary).map(([k, v]) => `${k} → ${v}`).join('\n');
    const model = config.groqModel || 'llama-3.3-70b-versatile';

    const prompt = `You are an expert Arabic manga/manhwa translator working at a professional scanlation group.
Translate each numbered text segment into natural, high-quality Arabic.

${glossaryText ? `FIXED TERMS — never change these:\n${glossaryText}\n\n` : ''}TRANSLATION RULES:
• Write natural flowing Arabic as a native speaker — NEVER literal word-for-word
• Match the character's personality and emotional state:
  - Angry/shouting → forceful Arabic, end with ! or !!
  - Shy/gentle → soft Arabic
  - Confident/cool → formal Arabic
  - Child → simple vocabulary
• Inner thoughts/whispers → wrap in parentheses ()
• Sound effects (SFX) → translate the feeling, not the spelling:
  BOOM → فجوووم | CRASH → طرررق | THUD → دووووم | sigh → *تنهيدة* | gasp → *أنين*
• English text → translate fully to Arabic
• Names: use established Arabic transliteration if known; otherwise phonetic
• Titles/brands → keep original

TEXTS (each number = one separate speech bubble or text box):
${originals.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Return ONLY valid JSON with exactly ${originals.length} translations in order:
{"t":["الترجمة 1","الترجمة 2",...]}`;

    const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.15,
        max_tokens:  3000,
        response_format: { type: 'json_object' },
    });

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.groq.com',
            path:     '/openai/v1/chat/completions',
            method:   'POST',
            headers:  {
                Authorization:  `Bearer ${config.groqKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        }, res => {
            let raw = '';
            res.on('data', d => raw += d);
            res.on('end', () => {
                try {
                    const json = JSON.parse(raw);
                    if (json.error) return reject(new Error(json.error.message));
                    const text  = json.choices?.[0]?.message?.content || '{}';
                    const match = text.match(/\{[\s\S]*\}/);
                    if (!match) return resolve(originals.map(() => ''));
                    const result       = JSON.parse(match[0]);
                    const translations = result.t || result.translations || [];
                    resolve(translations);
                } catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ============================================================
//   Groq Vision — احتياطي إذا لم يكن مفتاح Google Vision
// ============================================================
function callGroqVisionFallback(imagePath, glossary, config) {
    const base64 = fs.readFileSync(imagePath).toString('base64');
    const ext    = path.extname(imagePath).toLowerCase();
    const mime   = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[ext] || 'image/jpeg';
    const model  = (config.groqModel || '').includes('scout') || (config.groqModel || '').includes('maverick')
        ? config.groqModel : 'meta-llama/llama-4-scout-17b-16e-instruct';

    const glossaryText = Object.entries(glossary).map(([k, v]) => `${k} → ${v}`).join('\n');

    const prompt = `Manga/manhwa page. Find every text bubble. For each return:
- type: "speech"|"thought"|"narration"|"sfx"
- x,y: top-left of bubble as % (0-100)
- w,h: bubble size as % — speech: w≤50,h≤40 | narration: h≤20 | sfx: w≤40,h≤25
- original: exact text
- translated: natural Arabic translation
${glossaryText ? `\nFixed terms: ${glossaryText}\n` : ''}
Rules: natural Arabic, shouting→!! , thought→(), SFX→translate feeling.
JSON only: {"blocks":[{"type":"speech","x":10,"y":8,"w":25,"h":14,"original":"...","translated":"..."}]}
No text → {"blocks":[]}`;

    const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: [
            { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
            { type: 'text', text: prompt },
        ]}],
        temperature: 0.05, max_tokens: 3000,
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
                    if (json.error) return reject(new Error(json.error.message));
                    const text  = json.choices?.[0]?.message?.content || '{}';
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
//   خطوة 3: Tesseract.js — OCR محلي مجاني بإحداثيات بيكسل دقيقة
// ============================================================
async function callTesseract(imagePath, language) {
    const Tesseract = require('tesseract.js');
    const langMap   = { kor: 'kor', chi_sim: 'chi_sim', chi_tra: 'chi_tra', jpn: 'jpn', eng: 'eng' };
    const lang      = langMap[language] || 'kor';

    const { data } = await Tesseract.recognize(imagePath, lang, { logger: () => {} });

    const blocks = [];
    const seen   = new Set();

    for (const para of data.paragraphs || []) {
        const text = (para.text || '').replace(/[\n\r]+/g, ' ').trim();
        if (!text || text.length < 2) continue;
        if ((para.confidence || 0) < 45) continue;

        const { x0, y0, x1, y1 } = para.bbox;
        if ((x1 - x0) < 15 || (y1 - y0) < 15) continue;

        const key = `${x0}-${y0}`;
        if (seen.has(key)) continue;
        seen.add(key);

        blocks.push({ original: text, bbox: { x0, y0, x1, y1 }, confidence: para.confidence });
    }

    return blocks;
}

// ============================================================
//   دالة مشتركة: ترجمة + بناء textBlocks من rawBlocks
// ============================================================
async function translateAndBuild(rawBlocks, glossary, config, pageNum) {
    if (!rawBlocks.length) return [];
    let translations = [];
    try {
        translations = await translateBatch(rawBlocks.map(b => b.original), glossary, config);
    } catch (e) {
        console.error(`[ص${pageNum}] خطأ في الترجمة:`, e.message);
    }
    return rawBlocks.map((block, idx) => ({
        bbox:       block.bbox,
        type:       'speech',
        original:   block.original,
        translated: (translations[idx] || '').trim(),
    })).filter(b => b.translated);
}

// ============================================================
//   معالجة الفصل — Pipeline ثلاثي الطبقات تلقائي
//
//   طبقة 1 (الأفضل)  : Google Vision  + Groq Text  ← إذا googleVisionKey موجود
//   طبقة 2 (مجاني)   : Tesseract.js   + Groq Text  ← الافتراضي
//   طبقة 3 (احتياطي) : Groq Vision    (كل شيء)     ← إذا فشل Tesseract
// ============================================================
async function processChapterImages(manhwaId, chapterNum, imagePaths, onProgress) {
    const config   = getConfig();
    const glossary = getGlossary();

    if (!config.groqKey) throw new Error('مفتاح Groq غير موجود — أضفه من لوحة الإدارة');

    const useGoogleVision = !!config.googleVisionKey;
    const srcLang         = config.sourceLanguage || 'kor';

    console.log(`[Pipeline] ${useGoogleVision ? '① Google Vision + Groq Text' : '② Tesseract + Groq Text (+ ③ Groq Vision احتياطي)'}`);

    const chapterDir = path.join(db.DATA_DIR, 'library', manhwaId, `chapter-${chapterNum}`);
    fs.mkdirSync(chapterDir, { recursive: true });

    const pages = [];

    for (let i = 0; i < imagePaths.length; i++) {
        const imgPath = imagePaths[i];
        const pageNum = i + 1;
        const { width, height } = getImageDimensions(imgPath);

        if (onProgress) onProgress({ page: pageNum, total: imagePaths.length, stage: 'ocr' });

        let textBlocks = [];

        // ══════════ طبقة 1: Google Vision ══════════
        if (useGoogleVision) {
            try {
                const rawBlocks = await callGoogleVision(imgPath, config);
                if (rawBlocks.length) {
                    if (onProgress) onProgress({ page: pageNum, total: imagePaths.length, stage: 'translate' });
                    textBlocks = await translateAndBuild(rawBlocks, glossary, config, pageNum);
                }
            } catch (e) {
                console.error(`[ص${pageNum}] Google Vision خطأ:`, e.message);
            }

        // ══════════ طبقة 2: Tesseract + Groq Text ══════════
        } else {
            let usedTesseract = false;
            try {
                const rawBlocks = await callTesseract(imgPath, srcLang);
                console.log(`[ص${pageNum}] Tesseract → ${rawBlocks.length} كتلة (متوسط confidence: ${rawBlocks.length ? Math.round(rawBlocks.reduce((s, b) => s + b.confidence, 0) / rawBlocks.length) : 0}%)`);

                if (rawBlocks.length > 0) {
                    usedTesseract = true;
                    if (onProgress) onProgress({ page: pageNum, total: imagePaths.length, stage: 'translate' });
                    textBlocks = await translateAndBuild(rawBlocks, glossary, config, pageNum);
                }
            } catch (e) {
                console.error(`[ص${pageNum}] Tesseract خطأ:`, e.message);
            }

            // ══════════ طبقة 3: Groq Vision احتياطي ══════════
            if (!usedTesseract || textBlocks.length === 0) {
                console.log(`[ص${pageNum}] → Groq Vision احتياطي`);
                try {
                    if (onProgress) onProgress({ page: pageNum, total: imagePaths.length, stage: 'vision' });
                    const result = await callGroqVisionFallback(imgPath, glossary, config);
                    textBlocks = (result.blocks || [])
                        .filter(b => {
                            if (!b.original?.trim()) return false;
                            const t = b.type || 'speech';
                            if (t === 'narration' && (b.h || 0) > 30) return false;
                            if (t === 'sfx'        && ((b.w || 0) > 50 || (b.h || 0) > 40)) return false;
                            if ((t === 'speech' || t === 'thought') && ((b.w || 0) > 68 || (b.h || 0) > 55)) return false;
                            return true;
                        })
                        .map(b => ({
                            bbox: {
                                x0: Math.round(Math.max(0,   b.x / 100)           * width),
                                y0: Math.round(Math.max(0,   b.y / 100)           * height),
                                x1: Math.round(Math.min(100, (b.x + b.w) / 100)  * width),
                                y1: Math.round(Math.min(100, (b.y + b.h) / 100)  * height),
                            },
                            type:       ['speech','thought','narration','sfx'].includes(b.type) ? b.type : 'speech',
                            original:   b.original.trim(),
                            translated: (b.translated || '').trim(),
                        }));
                } catch (e) {
                    console.error(`[ص${pageNum}] Groq Vision خطأ:`, e.message);
                }
            }
        }

        fs.writeFileSync(
            path.join(chapterDir, `page-${pageNum}.json`),
            JSON.stringify(textBlocks, null, 2)
        );
        pages.push({ page: pageNum, width, height, textBlocks });
    }

    return { manhwaId, chapterNum, pagesProcessed: pages.length, pages };
}

module.exports = { processChapterImages, getGlossary };
