// ============================================================
//   نظام البنك + قارئ الاستمارات
// ============================================================

const axios = require('axios');
const { log } = require('./logger');

// رابط سيرفر البنك — يُحدَّث تلقائياً من السيرفر
let BANK_SERVER_URL = process.env.BANK_SERVER_URL || 'https://fog-modify-enclose.ngrok-free.dev';

// جلب الرابط الحالي من السيرفر وتحديثه تلقائياً
async function syncBankServerUrl() {
    try {
        const res = await axios.get(`${BANK_SERVER_URL}/api/public-url`, {
            headers: { 'ngrok-skip-browser-warning': 'true' },
            timeout: 5000
        });
        const newUrl = res.data?.url;
        if (newUrl && newUrl !== BANK_SERVER_URL && newUrl.startsWith('http')) {
            BANK_SERVER_URL = newUrl;
            log.info(`🔗 رابط البنك محدّث: ${BANK_SERVER_URL}`);
        }
    } catch {}
}

// تحديث كل دقيقة
setInterval(syncBankServerUrl, 60000);
// تحديث فوري عند البدء
setTimeout(syncBankServerUrl, 5000);

function parseBankAmount(str) {
    if (!str) return 0;
    const s = String(str).trim().toLowerCase();
    if (s.includes('m')) return Math.floor(parseFloat(s) * 1000000);
    if (s.includes('k')) return Math.floor(parseFloat(s) * 1000);
    return parseInt(s.replace(/[^0-9]/g, '')) || 0;
}

function cleanBankName(name) {
    return name.replace(/[\u{1F000}-\u{1FFFF}]/gu,'').replace(/[☀-➿]/g,'')
        .replace(/[←-⇿⬀-⯿⌀-⏿■-◿✀-➿]/g,'')
        .replace(/[︀-️‍⃣]/g,'')
        .replace(/[『』【】《》「」〘〙﴾﴿]/g,'').replace(/[┆┇│║╏╎❍↵✦❂⊰⊱❪❫•]/g,'')
        .replace(/ـ/g,'').replace(/@[^\s]+/g,'')
        .replace(/[+]?\d[\d\s\-]{5,}\d/g,'')
        .replace(/\s+/g,' ').trim();
}

function isEventForm(text) {
    if (!text || text.length < 40) return false;
    // فعالية مسابقة (المقدم/المركز/الفائز)
    if ((/المقدم|مقدم|🤹|🎤/.test(text)) &&
        (/المركز|مركز|الأول|الثاني|🥇|🥈|🥉|الفائز/.test(text)) &&
        (/\d+k/i.test(text))) return true;
    // فعالية إضافة رصيد بسيطة (『اسم』『مبلغ』)
    if ((/فعالية|إضافة رصيد|اضافة رصيد/.test(text)) &&
        (/『[^』]+』/.test(text)) &&
        (/\d+k/i.test(text))) return true;
    return false;
}

// استخراج اللقب من محتوى 『』 — يثق باللقب كما كتبه المستخدم، ويتجاهل المنشن فقط
// إذا كان منشن فقط بلا لقب → يُرجع '' (تُتجاهل الفعالية)
function extractEventName(ins) {
    if (!ins) return '';
    // أزل المنشن بالكامل (@ وكل ما يليه حتى المسافة) ثم نظّف الرموز
    let label = cleanBankName(ins.replace(/@[^\s]+/g, ' '));
    if (label.length >= 2 && !/^\d+$/.test(label)) return label;
    return '';
}

function parseEventForm(text) {
    const results = []; const lines = text.split('\n'); let sharedAmt = 0;
    for (const raw of lines) {
        const line = raw.trim(); if (!line) continue;
        const amtM = line.match(/(\d+[km])/i);
        const lineAmt = amtM ? parseBankAmount(amtM[1]) : 0;
        if (/بق[يى]|باقي/.test(line) && lineAmt > 0) sharedAmt = lineAmt;
        const gMatches = [...line.matchAll(/『([^』\n]+?)』/g)];
        if (gMatches.length) {
            let gAmt = lineAmt; const names = [];
            for (const g of gMatches) {
                const ins = g[1].trim();
                if (/^\d/.test(ins) && /[km\d]$/i.test(ins)) gAmt = parseBankAmount(ins);
                else { const n = extractEventName(ins); if (n.length >= 2) names.push(n); }
            }
            const fa = gAmt > 0 ? gAmt : sharedAmt;
            if (fa > 0) for (const n of names) results.push({ name: n, amount: fa });
            continue;
        }
        const fa = lineAmt > 0 ? lineAmt : sharedAmt;
        if (fa > 0) {
            let stripped = line
                .replace(/المقدم|المركز[^:：]*|الفائز|بق[يى][^:：]*|باقي[^:：]*/g,'')
                .replace(/[🥇🥈🥉🏅🎤🤹🎻🏆①②③:：|]/g,'')
                .replace(/\d+[km]/gi,'').trim();
            const n = extractEventName(stripped) || cleanBankName(stripped.replace(/@[^\s]+/g,''));
            if (n.length >= 2) results.push({ name: n, amount: fa });
        }
    }
    const seen = new Set();
    return results.filter(r => { const k = r.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return r.amount > 0; });
}

// هيدرات موحّدة لكل طلبات البوت للبنك (مفتاح + تخطي تحذير ngrok)
function getBankHeaders() {
    return { 'ngrok-skip-browser-warning': 'true' };
}

function getBankServerUrl() {
    return BANK_SERVER_URL;
}

module.exports = {
    parseBankAmount,
    cleanBankName,
    isEventForm,
    extractEventName,
    parseEventForm,
    syncBankServerUrl,
    getBankHeaders,
    getBankServerUrl,
};
