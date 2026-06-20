// ============================================================
//   تحميل وحفظ قواعد البيانات مع كتابة ذرّية (atomic writes)
// ============================================================

const fs = require('fs');
const path = require('path');
const { FILES, DEFAULTS } = require('./config');
const { log } = require('./logger');

// ============================================================
//   دوال التحميل والحفظ
// ============================================================

/**
 * تحميل ملف JSON — يُنشئه بالقيمة الافتراضية إذا لم يكن موجوداً
 * @param {string} filePath مسار الملف
 * @param {*} defaultValue القيمة الافتراضية
 * @returns {*} البيانات المحملة
 */
function loadDb(filePath, defaultValue) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
            return typeof defaultValue === 'object' && defaultValue !== null
                ? JSON.parse(JSON.stringify(defaultValue)) // deep clone
                : defaultValue;
        }
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        log.error(`فشل تحميل ${filePath}: ${err.message}`);
        return typeof defaultValue === 'object' && defaultValue !== null
            ? JSON.parse(JSON.stringify(defaultValue))
            : defaultValue;
    }
}

/**
 * حفظ بيانات إلى ملف JSON بكتابة ذرّية
 * يكتب أولاً إلى ملف مؤقت ثم ينقله إلى الملف الأصلي
 * @param {string} filePath مسار الملف
 * @param {*} data البيانات المراد حفظها
 */
function saveDb(filePath, data) {
    const tmpFile = filePath + '.tmp.' + process.pid;
    try {
        fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
        fs.renameSync(tmpFile, filePath);
    } catch (err) {
        log.error(`فشل حفظ ${filePath}: ${err.message}`);
        // تنظيف الملف المؤقت إن وجد
        try { fs.unlinkSync(tmpFile); } catch {}
        // محاولة احتياطية: كتابة مباشرة
        try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch {}
    }
}

// ============================================================
//   إنشاء الملفات غير الموجودة بالقيم الافتراضية
// ============================================================
for (const [k, f] of Object.entries(FILES)) {
    if (!fs.existsSync(f)) {
        fs.writeFileSync(f, JSON.stringify(DEFAULTS[k]));
    }
}

// ============================================================
//   تحميل جميع قواعد البيانات
// ============================================================

let adminsDb = loadDb(FILES.ADMINS, DEFAULTS.ADMINS);
let config = loadDb(FILES.CONFIG, DEFAULTS.CONFIG);
let bankGroups = loadDb(FILES.BANK_GROUPS, DEFAULTS.BANK_GROUPS);
let aliasesDb = loadDb(FILES.ALIASES, DEFAULTS.ALIASES);
let protectedGroups = loadDb(FILES.PROTECT, DEFAULTS.PROTECT);
let logDb = loadDb(FILES.LOG, DEFAULTS.LOG);
let monitoredGroups = loadDb(FILES.MONITOR, DEFAULTS.MONITOR);
let mutedDb = loadDb(FILES.MUTED, DEFAULTS.MUTED);
let warnsDb = loadDb(FILES.WARNS, DEFAULTS.WARNS);
let banDb = loadDb(FILES.BANNED, DEFAULTS.BANNED);
let emojiDb = loadDb(FILES.EMOJI, DEFAULTS.EMOJI);
let pointsDb = loadDb(FILES.POINTS, DEFAULTS.POINTS);
let sessionsDb = loadDb(FILES.SESSIONS, DEFAULTS.SESSIONS);
let bannedWordsDb = loadDb(FILES.BANNED_WORDS, DEFAULTS.BANNED_WORDS);
let disabledDb = loadDb(FILES.DISABLED, DEFAULTS.DISABLED);

// ============================================================
//   نظام pro — حماية الروابط + فلتر الألفاظ
// ============================================================

let linkProtectDb = loadDb(FILES.LINK_PROTECT, DEFAULTS.LINK_PROTECT);
let badWordsProtectDb = loadDb(FILES.BAD_WORDS_PROTECT, DEFAULTS.BAD_WORDS_PROTECT);
let proBadWords = loadDb(FILES.PRO_BAD_WORDS, [
    "نيك","انيك","انيك امك","ابوك","امك","طيزي","تلحس","تلحس زبي",
    "تلحس طيزي","كسمك","كسك","قحبة","قحاب","عاهرة","شرموطة","كس",
    "عرص","منيوك","زبي"
]);
let proWarnsDb = loadDb(FILES.PRO_WARNS, DEFAULTS.PRO_WARNS);

// ============================================================
//   تنظيف جلسات اللعب عند البدء
// ============================================================
Object.keys(sessionsDb).forEach(k => { delete sessionsDb[k]; });
saveDb(FILES.SESSIONS, sessionsDb);

// ============================================================
//   دالة حفظ سريعة (توافقية مع الكود الأصلي)
// ============================================================
const save = (file, data) => saveDb(file, data);

const DB_MAP = {
    admins: adminsDb,
    config: config,
    bankGroups: bankGroups,
    aliases: aliasesDb,
    protected: protectedGroups,
    log: logDb,
    monitored: monitoredGroups,
    muted: mutedDb,
    warns: warnsDb,
    banned: banDb,
    emoji: emojiDb,
    points: pointsDb,
    sessions: sessionsDb,
    bannedWords: bannedWordsDb,
    disabled: disabledDb,
    linkProtect: linkProtectDb,
    badWordsProtect: badWordsProtectDb,
    proBadWords: proBadWords,
    proWarns: proWarnsDb,
};

function getDb(name) {
    return DB_MAP[name];
}

module.exports = {
    loadDb,
    saveDb,
    save,
    getDb,

    adminsDb,
    config,
    bankGroups,
    aliasesDb,
    protectedGroups,
    logDb,
    monitoredGroups,
    mutedDb,
    warnsDb,
    banDb,
    emojiDb,
    pointsDb,
    sessionsDb,
    bannedWordsDb,
    disabledDb,
    linkProtectDb,
    badWordsProtectDb,
    proBadWords,
    proWarnsDb,
};
