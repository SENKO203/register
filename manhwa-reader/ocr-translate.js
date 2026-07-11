'use strict';
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const sizeOf = require('image-size');
const { createWorker } = require('tesseract.js');
const db = require('./database');

const CONFIG_PATH   = path.join(__dirname, 'config.json');
const GLOSSARY_PATH = path.join(db.DATA_DIR, 'glossary.json');
const MANGA_OCR_URL = 'http://127.0.0.1:5555';

function getConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}
function getGlossary() {
    if (!fs.existsSync(GLOSSARY_PATH)) return {};
    try { return JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf-8')); } catch { return {}; }
}

// ============================================================
//   فحص Manga-OCR — مرة واحدة، محفوظ في الذاكرة
// ============================================================
let _mangaOcrReady = null; // null = لم يُفحص بعد

async function isMangaOcrAvailable() {
    if (_mangaOcrReady !== null) return _mangaOcrReady;
    try {
        await axios.get(`${MANGA_OCR_URL}/health`, { timeout: 2500 });
        _mangaOcrReady = true;
        console.log('[OCR] Manga-OCR server متاح — سيتم استخدامه');
    } catch {
        _mangaOcrReady = false;
        console.log('[OCR] Manga-OCR غير متاح — الرجوع إلى Tesseract');
    }
    return _mangaOcrReady;
}

// ============================================================
//   أدوات نصية
// ============================================================
function cleanOcrText(text) {
    return text.replace(/\r?\n/g, ' ').replace(/\s{2,}/g, ' ').trim();
}
function hasKorean(text) {
    return /[가-힣]/.test(text);
}
function applyGlossary(text, glossary) {
    let result = text;
    for (const [kor, ara] of Object.entries(glossary)) {
        if (kor && ara) result = result.replaceAll(kor, ara);
    }
    return result;
}

// ============================================================
//   استخراج مناطق النص من صورة
//   Tesseract = يكشف المواضع (bbox)
//   Manga-OCR = يقرأ النص بدقة أعلى بكثير
// ============================================================
async function extractTextRegions(imagePath, worker) {
    const { data } = await worker.recognize(imagePath);

    // نستخدم Tesseract فقط للكشف عن المواضع (confidence منخفض مقصود)
    const candidates = (data.blocks || []).filter(b =>
        (b.bbox.x1 - b.bbox.x0) > 15 &&
        (b.bbox.y1 - b.bbox.y0) > 10 &&
        b.confidence > 12
    );

    if (!candidates.length) return [];

    // ---- مسار Manga-OCR ----
    if (await isMangaOcrAvailable()) {
        try {
            const r = await axios.post(
                `${MANGA_OCR_URL}/ocr`,
                { imagePath, bboxes: candidates.map(b => b.bbox) },
                { timeout: 120_000 }
            );

            return candidates
                .map((b, i) => ({
                    text: cleanOcrText(r.data.texts[i] || ''),
                    bbox: b.bbox,
                    confidence: 90,
                }))
                .filter(b => b.text.length > 1 && hasKorean(b.text));

        } catch (e) {
            console.warn('[OCR] Manga-OCR فشل، رجوع لـ Tesseract:', e.message);
            _mangaOcrReady = false; // استخدام Tesseract لبقية الفصل
        }
    }

    // ---- مسار Tesseract (fallback) ----
    return (data.blocks || [])
        .map(block => ({
            text: cleanOcrText(block.text),
            bbox: block.bbox,
            confidence: block.confidence || 0,
        }))
        .filter(b => b.text.length > 1 && b.confidence > 25 && hasKorean(b.text));
}

// ============================================================
//   ترجمة مجموعة فقاعات دفعة واحدة
// ============================================================
async function translateBlocks(blocks, targetLang, glossary) {
    const { groqKey, groqModel } = getConfig();
    if (!groqKey) throw new Error('مفتاح Groq غير مُعد — أضفه في الإعدادات');
    if (!blocks.length) return [];

    const processed = blocks.map(b => ({
        ...b,
        textForTranslation: applyGlossary(b.text, glossary),
    }));

    const numbered = processed.map((b, i) => `[${i}] ${b.textForTranslation}`).join('\n');

    const prompt =
`أنت مترجم محترف متخصص في مانهوا الويب تون الكورية إلى ${targetLang}.

قواعد الترجمة (التزم بها بدقة):
• الترجمة طبيعية عامية تناسب شخصيات المانهوا — ليست حرفية جافة
• الصراخ/الغضب → أحرف كبيرة أو !! في نهاية الجملة
• الهمس/التفكير الداخلي → ... أو () حول النص
• أصوات المؤثرات (بوم، كراش) → اكتب المعادل العربي أو اتركها إذا مألوفة
• أسماء الأعلام الكورية → اكتبها بالنقحرة العربية كما تُنطق
• لا تترجم الكلمات التي في قاموس المصطلحات (هي مترجمة مسبقاً)
• أعد فقط السطور المرقّمة بالتنسيق [رقم] النص، بدون أي شرح

فقاعات الحوار في هذه الصفحة (مرتبة من أعلى لأسفل):
${numbered}`;

    const model = groqModel || 'llama-3.3-70b-versatile';

    const r = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
            model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2048,
            temperature: 0.15,
        },
        {
            headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
            timeout: 40_000,
        }
    );

    const raw = r.data.choices?.[0]?.message?.content || '';
    const translations = new Array(blocks.length).fill('');
    for (const line of raw.split('\n')) {
        const m = line.match(/^\[(\d+)\]\s*(.+)$/);
        if (m) {
            const idx = parseInt(m[1]);
            if (idx >= 0 && idx < translations.length) translations[idx] = m[2].trim();
        }
    }
    return translations;
}

// ============================================================
//   معالجة كل صور الفصل
// ============================================================
async function processChapterImages(manhwaId, chapterNum, imagePaths, onProgress) {
    const config   = getConfig();
    const glossary = getGlossary();
    const lang     = config.sourceLanguage || 'kor';

    await isMangaOcrAvailable(); // فحص مبكر قبل بدء المعالجة

    const chapterDir = path.join(db.DATA_DIR, 'library', manhwaId, `chapter-${chapterNum}`);
    fs.mkdirSync(chapterDir, { recursive: true });

    const worker = await createWorker(lang);
    const pages  = [];

    try {
        for (let i = 0; i < imagePaths.length; i++) {
            const imgPath = imagePaths[i];
            const pageNum = i + 1;

            if (onProgress) onProgress({ page: pageNum, total: imagePaths.length, stage: 'ocr' });

            const dims   = sizeOf(imgPath);
            const blocks = await extractTextRegions(imgPath, worker);

            if (onProgress) onProgress({ page: pageNum, total: imagePaths.length, stage: 'translate' });

            let translations = [];
            if (blocks.length > 0) {
                try {
                    translations = await translateBlocks(blocks, config.targetLanguage || 'العربية', glossary);
                } catch (e) {
                    console.error(`[ص${pageNum}] خطأ في الترجمة:`, e.message);
                    translations = new Array(blocks.length).fill('');
                }
            }

            const pageData = blocks.map((b, idx) => ({
                bbox:       b.bbox,
                original:   b.text,
                translated: translations[idx] || '',
            }));

            const outPath = path.join(chapterDir, `page-${pageNum}.json`);
            fs.writeFileSync(outPath, JSON.stringify(pageData, null, 2));
            pages.push({ page: pageNum, textBlocks: pageData.length, width: dims.width, height: dims.height });
        }
    } finally {
        await worker.terminate();
    }

    return { manhwaId, chapterNum, pagesProcessed: pages.length, pages };
}

module.exports = { extractTextRegions, translateBlocks, processChapterImages, getGlossary };
