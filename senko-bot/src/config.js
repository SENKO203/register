// ============================================================
//   التكوين والثوابت وتحميل المتغيرات البيئية
// ============================================================

require('dotenv').config();
const path = require('path');

// ============================================================
//   مفاتيح API — من ملف .env
// ============================================================
const API_KEYS = {
    GROQ: process.env.GROQ_API_KEY || '',
    GEMINI: process.env.GEMINI_API_KEY || '',
    VOICERSS: process.env.VOICERSS_API_KEY || '',
    REMOVEBG: process.env.REMOVEBG_API_KEY || '',
    OMDB: process.env.OMDB_API_KEY || '',
};

// ============================================================
//   مسارات ملفات قواعد البيانات
// ============================================================
const FILES = {
    ADMINS: './admins.json',
    CONFIG: './config.json',
    PROTECT: './protected_groups.json',
    LOG: './log_group.json',
    MONITOR: './monitored_groups.json',
    MUTED: './muted.json',
    WARNS: './warns.json',
    BANNED: './banned.json',
    EMOJI: './emoji_react.json',
    POINTS: './points.json',
    SESSIONS: './game_sessions.json',
    BANNED_WORDS: './banned_words.json',
    BANK_GROUPS: './bank_groups.json',
    DISABLED: './disabled_commands.json',
    ALIASES: './aliases.json',
    LINK_PROTECT: './link_protect.json',
    BAD_WORDS_PROTECT: './bad_words_protect.json',
    PRO_BAD_WORDS: './pro_bad_words.json',
    PRO_WARNS: './pro_warns.json',
};

// ============================================================
//   القيم الافتراضية لقواعد البيانات
// ============================================================
const DEFAULTS = {
    ADMINS: {},
    CONFIG: {
        orgName: "SENKO",
        raidImg: "",
        menuImg: "",
        raidLink: "",
        raidMsg: "",
        raidDesc: "",
        raidName: "",
        weatherKey: process.env.WEATHER_API_KEY || "7d890ad4a7129cd0149b4f3d54052278",
        currencyKey: process.env.CURRENCY_API_KEY || "cf933bf4dca84259ce940635",
    },
    ALIASES: {},
    PROTECT: [],
    LOG: { groupId: "" },
    MONITOR: [],
    MUTED: {},
    WARNS: {},
    BANNED: {},
    EMOJI: { active: false },
    POINTS: {},
    SESSIONS: {},
    BANNED_WORDS: {},
    BANK_GROUPS: {},
    DISABLED: { commands: [], categories: [] },
    LINK_PROTECT: {},
    BAD_WORDS_PROTECT: {},
    PRO_BAD_WORDS: [],
    PRO_WARNS: {},
};

// ============================================================
//   مسار مجلد اللقطات
// ============================================================
const SNAPSHOTS_DIR = path.join(process.cwd(), 'snapshots');

// ============================================================
//   مسار Termux المؤقت
// ============================================================
const TERMUX_TMP = process.env.TMPDIR || '/data/data/com.termux/files/usr/tmp';

// ============================================================
//   المطورون — من ملف .env
// ============================================================
const SUPER_OWNER = process.env.SUPER_OWNER || "256752906052";
const SUPER_OWNER_2 = process.env.SUPER_OWNER_LID || "233620904140952";
const SUPER_OWNER_3 = process.env.BOT_LID || "67354230792226";
const SUPER_OWNERS = [SUPER_OWNER, SUPER_OWNER_2, SUPER_OWNER_3];

const OWNERS = [
    SUPER_OWNER,       // رقمك العادي
    SUPER_OWNER_2,     // LID رقمك
    SUPER_OWNER_3,     // LID البوت
];

const BOT_LID = process.env.BOT_LID || "67354230792226";
const BOT_NUM = process.env.BOT_NUM || "232650543468593";

// خريطة LID ← رقم عادي (لربط LID بصاحبه)
const LID_MAP = {
    [SUPER_OWNER_2]: SUPER_OWNER,      // LID المطور → رقمه العادي الصحيح
    [BOT_LID]: "256761000708",          // LID البوت → رقمه العادي
};

// ============================================================
//   رابط سيرفر البنك
// ============================================================
let BANK_SERVER_URL = process.env.BANK_SERVER_URL || 'https://fog-modify-enclose.ngrok-free.dev';

// دالة لتحديث رابط البنك من الخارج
function setBankServerUrl(url) {
    BANK_SERVER_URL = url;
}

function getBankServerUrl() {
    return BANK_SERVER_URL;
}

// ============================================================
//   شخصيات الأنمي — للألعاب والتفاعل
// ============================================================
const ANIME_CHARS = [
    // ون بيس
    "لوفي","زورو","نامي","أوسوب","سانجي","تشوبر","رودريغا","فرانكي","بروك","جينبي",
    "شانكس","وايتبيرد","كايدو","بيغ مام","ميهوك","هانكوك","إيس","سابو","كوبي","دراغون",
    "سيزار","ويبر","كاربو","بيغ زيتو","كروكودايل","موريا","دوفلامينغو","برودا",
    // ناروتو
    "ناروتو","ساسكي","ساكورا","إيتاشي","روك لي","نيجي","غارا","جيرايا","تسونادي","أوروتشيمارو",
    "ميناتو","كوشينا","توبي","ماداره","أوبيتو","كاكاشي","شيكامارو","هيناتا","تيماري","كيبا",
    "نيجي","شينو","إينو","تشوجي","ساي","ياماتو","كورينا","أسوما","ساركيا",
    // بليتش
    "إيتشيغو","ريوجي","أوريهيمي","أوراهارا","بيركا","أيزن","يوروتشي","كيلا","توشيرو",
    "بيركا","يوروتشي","ياماموتو","كيسكي","نيومو","أولكيورا","غريمجو","هاليبيل",
    // دراغون بول
    "غوكو","فيغيتا","غوهان","برولي","فريزر","بيجيتو","غوغيتا","بيكولو","ترانكس",
    "غوتين","كريلين","تيان","يامشا","بولما","أندرويد18","سيل","بوو","زينو",
    // ديمون سلاير
    "تانجيرو","نيزوكو","زينيتسو","إينوسوكي","رينغوكو","أوبا","دوما","أكازا","غيو",
    "مويشيبورو","سانيمي","إيغورو","مياميوريا","يوريتشي",
    // جوجوتسو كايزن
    "غوجو","سوكونا","يوجي","مييا","نوبارا","ميغومي","نانامي","يوتا","توغا","ماهيتو",
    "جيتو","هانامي","تشوسو","أورومي","ريوميين",
    // هانتر
    "غون","كيلوا","كورابيكا","ليوريو","هيسوكا","ميروم","ليوريو","نيتيرو","بيسكي",
    // فيري تيل
    "ناتسو","لوسي","غراي","إيرزا","ويندي","جوفيال","ميرا","إيلفمان","ليفي",
    // أتاك أون تيتان
    "إيرين","ميكاسا","أرمين","ليفاي","هانجي","إيروين","ريينر","برتولت","آني","زيكي",
    // دي غراي مان
    "آلن","كاندا","ليناله","كروس","ميلينيوم","رود",
    // ذا بوميرانغ
    "كيلوا","غون","غينتوكي","شينباتشي","كاغورا","هيجيكاتا",
    // ناتسوميستاك
    "أكاتسوكي","كيريتو","أسونا","كلاين","أغيل","ليفا","سينون",
    // بلو إكسورسيست
    "رين","يوكيو","شيميي","إيزومو","رينزو","شورا","ميفيستو",
    // قرصان الفضاء
    "كامينا","سيمون","يوكو","نيا","فير",
    // ناروتو شيبودن
    "ساسوري","دييدارا","كوجو","كيساميه","زيتسو","بين","كوناع"
];

const randChar = () => ANIME_CHARS[Math.floor(Math.random() * ANIME_CHARS.length)];

// ============================================================
//   خريطة الأوامر للفئات (لنظام التحجير)
// ============================================================
const COMMAND_CATEGORIES = {
    group: ['.قفل','.فتح','.حظر','.رفع حظر','.طرد','.كتم','.الغاء_كتم','.تحذير','.مسح_تحذير','.منشن','.الكل','.رابط','.وصف','.اسم','.صورة_الجروب','.حماية','.محمي','.كشف_حماية','.عالم','.جهات','.مراقبة'],
    admin: ['.رفع نخبة','.رفع مطور','.رفع اشراف','.تنزيل','.المشرفين','.النخبة','.سجل','.بث'],
    med: [], clev: [], sett: [], // تُكتشف بالبادئة
    game: ['.لعبة','.نرد','.رشف','.تحدي','.سؤال'],
    points: ['.نقاطي','.ترتيب','.متجر','.استبدال','.تحويل'],
    pro: ['.pen','.بنترست','.ai','.تلخيص'],
    elite: ['.تحجير','.احياء','.elite'],
};

function getCommandCategory(cmd) {
    if (cmd.startsWith('.med.') || cmd === '.med') return 'med';
    if (cmd.startsWith('.clev.') || cmd === '.clev') return 'clev';
    if (cmd.startsWith('.sett.') || cmd === '.sett') return 'sett';
    for (const [cat, cmds] of Object.entries(COMMAND_CATEGORIES)) {
        if (cmds.includes(cmd)) return cat;
    }
    return null;
}

const VALID_CATEGORIES = ['group','admin','med','clev','sett','game','points','pro','elite'];

// ============================================================
//   نظام Rate Limiting — منع إغراق البوت بالأوامر
// ============================================================
const _cmdCooldowns = new Map();
const _COOLDOWN_MS  = 1500; // 1.5 ثانية بين كل أمر لنفس الشخص

function checkRateLimit(userId) {
    const now  = Date.now();
    const last = _cmdCooldowns.get(userId) || 0;
    if (now - last < _COOLDOWN_MS) return false; // محظور
    _cmdCooldowns.set(userId, now);
    // تنظيف تلقائي كل 5 دقائق
    if (_cmdCooldowns.size > 500) {
        for (const [k, v] of _cmdCooldowns) {
            if (now - v > 60000) _cmdCooldowns.delete(k);
        }
    }
    return true; // مسموح
}

// ============================================================
//   حالة نظام البحث متعدد الخطوات (.بحث_صور)
// ============================================================
const _searchState = new Map(); // chatId+sender => { step, platform }

// ============================================================
//   كاش Pinterest: يمنع تكرار نفس الصور
// ============================================================
const _pinSent = new Map(); // query → Set<url>

module.exports = {
    // API Keys
    API_KEYS,

    // File paths & defaults
    FILES,
    DEFAULTS,
    SNAPSHOTS_DIR,
    TERMUX_TMP,

    // Owner & bot identity
    SUPER_OWNER,
    SUPER_OWNER_2,
    SUPER_OWNER_3,
    SUPER_OWNERS,
    OWNERS,
    BOT_LID,
    BOT_NUM,
    LID_MAP,

    // Bank server
    BANK_SERVER_URL,
    getBankServerUrl,
    setBankServerUrl,

    // Anime characters
    ANIME_CHARS,
    randChar,

    // Command categories
    COMMAND_CATEGORIES,
    getCommandCategory,
    VALID_CATEGORIES,

    // Rate limiting
    _cmdCooldowns,
    _COOLDOWN_MS,
    checkRateLimit,

    // Search state
    _searchState,

    // Pinterest cache
    _pinSent,
};
