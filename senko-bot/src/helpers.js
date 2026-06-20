/**
 * Senko Bot - Utility / Helper Functions
 * Standalone helpers that do not depend on the socket instance,
 * plus socket-dependent helpers that accept sock as a parameter.
 */
'use strict';

const fs = require('fs');
const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const readline = require('readline');

const {
    SUPER_OWNERS,
    OWNERS,
    BOT_LID,
    BOT_NUM,
    LID_MAP,
    FILES,
    ANIME_CHARS,
    COMMAND_CATEGORIES,
    VALID_CATEGORIES,
    checkRateLimit,
    randChar,
    getCommandCategory,
} = require('./config');

const { getDb } = require('./database');
const { log } = require('./logger');

// ============================================================
//   Basic utilities
// ============================================================

/**
 * Write a JSON object to a file (pretty-printed).
 */
const save = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

/**
 * Track bot-sent message IDs per chat (for .مسح command).
 * Keeps the last 50 messages per chat.
 */
const trackBotMsg = (chatId, msgId) => {
    if (!global._botMsgIds) global._botMsgIds = {};
    if (!global._botMsgIds[chatId]) global._botMsgIds[chatId] = [];
    global._botMsgIds[chatId].push(msgId);
    if (global._botMsgIds[chatId].length > 50)
        global._botMsgIds[chatId] = global._botMsgIds[chatId].slice(-50);
};

/**
 * HTTP(S) GET request that returns parsed JSON.
 * Works without node-fetch.
 */
const httpsGet = (url) => new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout: 10000 }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
            try { resolve(JSON.parse(data)); }
            catch { reject(new Error('فشل تحليل الرد من السيرفر')); }
        });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('انتهت مهلة الطلب')); });
});

/**
 * Extract the raw number from a JID (strips @domain and :device).
 */
const numOf = (jid) => jid?.split('@')[0]?.split(':')[0];

/**
 * Resolve a JID to its real number using LID_MAP, falling back to raw.
 */
const resolveId = (jid) => {
    if (!jid) return '';
    const raw = jid.split('@')[0].split(':')[0];
    return LID_MAP[raw] || raw;
};

/**
 * Check if a JID is a LID-type identifier.
 */
const isLidJid = (jid) => jid?.endsWith('@lid');

/**
 * Check if a JID belongs to the bot.
 */
const isBotJid = (jid) => {
    if (!jid) return false;
    const raw = jid.split('@')[0].split(':')[0];
    return raw === BOT_LID || raw === BOT_NUM;
};

/**
 * Check if a participant is protected (cannot be demoted/kicked).
 * Protected = SUPER_OWNER, OWNERS, bot, or adminsDb rank of "نخبة"/"مطور".
 */
const isProtectedParticipant = (jid) => {
    const raw = numOf(jid);
    const resolved = resolveId(jid);
    const adminsDb = getDb('admins');
    // المطور المطلق — حماية مطلقة لا تُكسر
    if (SUPER_OWNERS.includes(raw) || SUPER_OWNERS.includes(resolved)) return true;
    // البوت
    if (isBotJid(jid)) return true;
    // OWNERS (المطورون المسجلون)
    if (OWNERS.includes(raw) || OWNERS.includes(resolved)) return true;
    // نخبة ومطور في adminsDb
    const rankVal = adminsDb[raw] || adminsDb[resolved];
    if (rankVal === "نخبة" || rankVal === "مطور") return true;
    return false;
};

/**
 * Get the rank of a number: "مطور", "نخبة", or null.
 */
const getRank = (num) => {
    const adminsDb = getDb('admins');
    const resolved = LID_MAP[num] || num;
    if (OWNERS.includes(num) || OWNERS.includes(resolved)) return "مطور";
    const r = adminsDb[num] || adminsDb[resolved] || null;
    if (r === "نخبة" || r === "مطور") return r;
    return null;
};

/**
 * Check if a number is authorized (OWNER or نخبة).
 */
const isAuth = (num) => {
    const adminsDb = getDb('admins');
    const resolved = LID_MAP[num] || num;
    return OWNERS.includes(num) || OWNERS.includes(resolved) ||
        adminsDb[num] === "نخبة" || adminsDb[resolved] === "نخبة";
};

/**
 * Check if a user is protected from punishment.
 * Protected = نخبة + مطور + محمي rank.
 */
const isUserProtected = (jidOrNum) => {
    if (!jidOrNum) return false;
    const adminsDb = getDb('admins');
    const n = numOf(jidOrNum);
    const rid = resolveId(jidOrNum);
    const variants = [...new Set([n, rid, jidOrNum?.split('@')[0]])].filter(Boolean);
    for (const v of variants) {
        if (SUPER_OWNERS.includes(v)) return true;
        if (OWNERS.includes(v)) return true;
        const rank = adminsDb[v];
        if (rank === "نخبة" || rank === "مطور" || rank === "محمي") return true;
        // بحث عكسي في LID_MAP
        const mapped = LID_MAP[v];
        if (mapped) {
            const r2 = adminsDb[mapped];
            if (r2 === "نخبة" || r2 === "مطور" || r2 === "محمي") return true;
            if (SUPER_OWNERS.includes(mapped) || OWNERS.includes(mapped)) return true;
        }
    }
    return false;
};

/**
 * Format a Unix timestamp to Arabic-Egyptian locale string (Cairo timezone).
 */
const formatTime = (ts) => new Date(ts * 1000).toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

// ============================================================
//   Device scanning (bot detection)
// ============================================================

/**
 * Scan linked devices for a given JID/number.
 * Returns { count, extra, devices } or null on failure.
 * @param {object} sock - The Baileys socket instance
 * @param {string} jidOrNum - JID or phone number to scan
 */
async function scanDevices(sock, jidOrNum) {
    const { USyncQuery, USyncUser } = require("@itsliaaa/baileys");
    try {
        let realJid = jidOrNum;
        if (!String(realJid).includes('@')) realJid = numOf(realJid) + "@s.whatsapp.net";
        // حل LID لرقم حقيقي
        if (realJid.includes('@lid')) {
            const wa = await sock.onWhatsApp(numOf(realJid)).catch(() => null);
            if (wa && wa[0]?.jid) realJid = wa[0].jid;
        }
        const query = new USyncQuery().withContext('message').withDeviceProtocol();
        query.withUser(new USyncUser().withId(realJid));
        const result = await sock.executeUSyncQuery(query);
        let devices = [];
        if (result?.list?.length) {
            for (const entry of result.list) {
                const devList = entry?.devices?.deviceList;
                if (Array.isArray(devList)) {
                    for (const d of devList) {
                        const di = (d && typeof d === 'object') ? d.id : d;
                        if (typeof di === 'number') devices.push(di);
                    }
                }
            }
        }
        devices = [...new Set(devices)].sort((a, b) => a - b);
        return { count: devices.length, extra: devices.filter(d => d > 0).length, devices };
    } catch (e) {
        return null;
    }
}

// ============================================================
//   Group metadata cache
// ============================================================

const metaCache = {};

/**
 * Get group metadata with 5-minute caching.
 * @param {object} sock - The Baileys socket instance
 * @param {string} id - Group JID
 */
const getMeta = async (sock, id) => {
    const now = Date.now();
    if (metaCache[id] && now - metaCache[id].t < 300000) return metaCache[id].d;
    try {
        const d = await sock.groupMetadata(id);
        metaCache[id] = { d, t: now };
        return d;
    } catch {
        if (metaCache[id]) return metaCache[id].d;
        throw new Error('فشل تحميل بيانات المجموعة');
    }
};

/**
 * Invalidate cached metadata for a group.
 */
const invalidateMeta = (id) => { delete metaCache[id]; };

// ============================================================
//   Points system
// ============================================================

/**
 * Get points record for a user in a group. Creates default if missing.
 */
const getPoints = (gid, num) => {
    const pointsDb = getDb('points');
    const k = `${gid}:${num}`;
    if (!pointsDb[k]) pointsDb[k] = { total: 0, today: 0, correct: 0, vip: false, vipExpiry: 0 };
    return pointsDb[k];
};

/**
 * Add points to a user, respecting daily limits and VIP bonuses.
 * Returns the actual amount added.
 */
const addPoints = (gid, num, amt) => {
    const pointsDb = getDb('points');
    if (OWNERS.includes(num)) {
        const p = getPoints(gid, num);
        p.total += amt;
        save(FILES.POINTS, pointsDb);
        return amt;
    }
    const p = getPoints(gid, num);
    const vip = p.vip && Date.now() < p.vipExpiry;
    const bonus = vip ? Math.floor(amt * 0.3) : 0;
    const limit = vip ? 80 : 50;
    const can = Math.min(amt + bonus, limit - p.today);
    if (can <= 0) return 0;
    p.total += can;
    p.today += can;
    save(FILES.POINTS, pointsDb);
    return can;
};

/**
 * Start the daily points reset interval.
 * Resets all users' daily counters at midnight.
 */
function startDailyPointsReset() {
    setInterval(() => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            const pointsDb = getDb('points');
            for (const k in pointsDb) pointsDb[k].today = 0;
            save(FILES.POINTS, pointsDb);
        }
    }, 60000);
}

// ============================================================
//   Group picture change
// ============================================================

/**
 * Change a group's profile picture.
 * @param {object} sock - The Baileys socket instance
 * @param {string} gid - Group JID
 * @param {Buffer} buf - Image buffer
 */
const changeGroupPic = async (sock, gid, buf) => {
    const imgBuf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    await sock.updateProfilePicture(gid, imgBuf);
};

// ============================================================
//   Logging to WhatsApp group
// ============================================================

/**
 * Send a log message to the configured log group.
 * @param {object} sock - The Baileys socket instance
 * @param {string} text - Message text
 * @param {string[]} [mentions] - JIDs to mention
 */
const sendLog = async (sock, text, mentions = []) => {
    const logDb = getDb('log');
    if (!logDb.groupId) return;
    try { await sock.sendMessage(logDb.groupId, { text, mentions }); }
    catch (e) { }
};

// ============================================================
//   RAID constants & templates
// ============================================================

const DEFAULT_RAID_MSG = `*┆ 𝐒𝐄𝐍𝐊𝐎*\n\n*𝑅𝑒𝑎𝑠𝑜𝑛 𝑜𝑣𝑒𝑟 𝑛𝑜𝑖𝑠𝑒.*\n*𝑆𝑐𝑖𝑒𝑛𝑐𝑒 𝑜𝑣𝑒𝑟 𝑑𝑜𝑢𝑏𝑡.*\n\n*ــــــــــــــــــــ*\n*》𝐒𝐄𝐍𝐊𝐎 《*`;
const DEFAULT_RAID_DESC = `┆𝐒𝐄𝐍𝐊𝐎 𝐖𝐀𝐒 𝐇𝐄𝐑𝐄 ⚡\n\n》𝐒𝐄𝐍𝐊𝐎 《`;

const RAID_MSG = (link) => {
    const config = getDb('config');
    const msg = config.raidMsg || DEFAULT_RAID_MSG;
    const raidLink = link || config.raidLink || '';
    return msg
        .replace(/\[رابط\]/g, `[ ${raidLink} ]`)
        .replace(/\[  \]/g, `[ ${raidLink} ]`)
        .replace(/\[ \]/g, `[ ${raidLink} ]`);
};

const RAID_DESC = () => {
    const config = getDb('config');
    return config.raidDesc || DEFAULT_RAID_DESC;
};

// ============================================================
//   Readline question helper
// ============================================================

/**
 * Prompt the user for input on stdin (synchronous-style with promise).
 */
const question = (text) =>
    new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(text, (answer) => { rl.close(); resolve(answer); });
    });

// ============================================================
//   Image cropping (async version using child_process.spawn)
// ============================================================

/**
 * Crop an image buffer to a 800x800 square using ffmpeg.
 * Converted from spawnSync to async spawn with Promise wrapper.
 * @param {Buffer} imgBuf - Input image buffer
 * @returns {Promise<Buffer|null>} Cropped image buffer, or null on failure
 */
async function cropSquare(imgBuf) {
    if (!imgBuf || imgBuf.length < 15000) return null; // less than 15KB = placeholder
    const tmpDir = process.env.TMPDIR || '/data/data/com.termux/files/usr/tmp';
    const ts = Date.now() + Math.random().toString(36).slice(2, 6);
    const tmp = `${tmpDir}/sq_in_${ts}.jpg`;
    const out = `${tmpDir}/sq_out_${ts}.jpg`;

    try {
        fs.writeFileSync(tmp, imgBuf);

        await new Promise((resolve, reject) => {
            const proc = spawn('ffmpeg', [
                '-y', '-i', tmp,
                '-vf', 'scale=800:800:force_original_aspect_ratio=increase,crop=800:800',
                '-update', '1', '-q:v', '3', out
            ], { stdio: 'pipe', timeout: 20000 });

            proc.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg exited with code ${code}`));
            });
            proc.on('error', reject);

            // Safety timeout
            const timer = setTimeout(() => {
                proc.kill('SIGKILL');
                reject(new Error('ffmpeg timeout'));
            }, 20000);

            proc.on('close', () => clearTimeout(timer));
        });

        try { fs.unlinkSync(tmp); } catch {}
        if (fs.existsSync(out)) {
            const result = fs.readFileSync(out);
            try { fs.unlinkSync(out); } catch {}
            // less than 15KB after processing = solid color/gradient, skip
            if (result.length < 15000) return null;
            return result;
        }
    } catch {
        try { fs.unlinkSync(tmp); } catch {}
    }
    return imgBuf; // fallback
}

// ============================================================
//   Exports
// ============================================================

module.exports = {
    save,
    trackBotMsg,
    httpsGet,
    numOf,
    resolveId,
    isLidJid,
    isBotJid,
    isProtectedParticipant,
    getRank,
    isAuth,
    isUserProtected,
    formatTime,
    randChar,
    getCommandCategory,
    COMMAND_CATEGORIES,
    VALID_CATEGORIES,
    scanDevices,
    metaCache,
    getMeta,
    invalidateMeta,
    getPoints,
    addPoints,
    startDailyPointsReset,
    changeGroupPic,
    sendLog,
    DEFAULT_RAID_MSG,
    DEFAULT_RAID_DESC,
    RAID_MSG,
    RAID_DESC,
    question,
    checkRateLimit,
    cropSquare,
};
