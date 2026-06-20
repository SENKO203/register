'use strict';

const fs = require('fs');
const path = require('path');
const { FILES, DEFAULTS } = require('./config');
const { log } = require('./logger');

let Database;
try {
    Database = require('better-sqlite3');
} catch {
    Database = null;
}

const DB_PATH = path.join(process.cwd(), 'senko.db');
let db = null;
let useSqlite = false;

if (Database) {
    try {
        db = new Database(DB_PATH);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('cache_size = -8000');
        db.pragma('busy_timeout = 5000');

        db.exec(`CREATE TABLE IF NOT EXISTS kv_store (
            namespace TEXT NOT NULL,
            key       TEXT NOT NULL,
            value     TEXT NOT NULL,
            updated   INTEGER DEFAULT (strftime('%s','now')),
            PRIMARY KEY (namespace, key)
        )`);

        db.exec(`CREATE INDEX IF NOT EXISTS idx_kv_ns ON kv_store(namespace)`);

        useSqlite = true;
        log.success('✅ SQLite قاعدة بيانات متصلة — ' + DB_PATH);
    } catch (err) {
        log.warn('⚠️ فشل تحميل SQLite، سيتم استخدام JSON: ' + err.message);
        db = null;
    }
}

const _stmtCache = {};
function getStmt(name, sql) {
    if (!_stmtCache[name]) _stmtCache[name] = db.prepare(sql);
    return _stmtCache[name];
}

function sqliteGetAll(namespace) {
    const stmt = getStmt('getAll', 'SELECT key, value FROM kv_store WHERE namespace = ?');
    const rows = stmt.all(namespace);
    const result = {};
    for (const row of rows) {
        try { result[row.key] = JSON.parse(row.value); }
        catch { result[row.key] = row.value; }
    }
    return result;
}

function sqliteGetArray(namespace) {
    const stmt = getStmt('getArr', "SELECT value FROM kv_store WHERE namespace = ? AND key = '__array__'");
    const row = stmt.get(namespace);
    if (row) {
        try { return JSON.parse(row.value); } catch {}
    }
    return null;
}

function sqliteSet(namespace, key, value) {
    const stmt = getStmt('set',
        `INSERT OR REPLACE INTO kv_store (namespace, key, value, updated)
         VALUES (?, ?, ?, strftime('%s','now'))`);
    stmt.run(namespace, key, JSON.stringify(value));
}

function sqliteSaveObj(namespace, obj) {
    const del = getStmt('delNs', 'DELETE FROM kv_store WHERE namespace = ?');
    const ins = getStmt('ins',
        `INSERT INTO kv_store (namespace, key, value, updated)
         VALUES (?, ?, ?, strftime('%s','now'))`);

    const tx = db.transaction(() => {
        del.run(namespace);
        if (Array.isArray(obj)) {
            ins.run(namespace, '__array__', JSON.stringify(obj));
        } else if (typeof obj === 'object' && obj !== null) {
            for (const [k, v] of Object.entries(obj)) {
                ins.run(namespace, k, JSON.stringify(v));
            }
        } else {
            ins.run(namespace, '__value__', JSON.stringify(obj));
        }
    });
    tx();
}

function sqliteLoad(namespace, defaultValue) {
    if (Array.isArray(defaultValue)) {
        const arr = sqliteGetArray(namespace);
        return arr !== null ? arr : JSON.parse(JSON.stringify(defaultValue));
    }
    const data = sqliteGetAll(namespace);
    if (Object.keys(data).length === 0) {
        return typeof defaultValue === 'object' && defaultValue !== null
            ? JSON.parse(JSON.stringify(defaultValue))
            : defaultValue;
    }
    return data;
}

function loadDb(filePath, defaultValue) {
    try {
        if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
            return typeof defaultValue === 'object' && defaultValue !== null
                ? JSON.parse(JSON.stringify(defaultValue))
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

function saveDb(filePath, data) {
    const tmpFile = filePath + '.tmp.' + process.pid;
    try {
        fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
        fs.renameSync(tmpFile, filePath);
    } catch (err) {
        log.error(`فشل حفظ ${filePath}: ${err.message}`);
        try { fs.unlinkSync(tmpFile); } catch {}
        try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch {}
    }
}

const FILE_TO_NS = {
    [FILES.ADMINS]: 'admins',
    [FILES.CONFIG]: 'config',
    [FILES.BANK_GROUPS]: 'bankGroups',
    [FILES.ALIASES]: 'aliases',
    [FILES.PROTECT]: 'protected',
    [FILES.LOG]: 'log',
    [FILES.MONITOR]: 'monitored',
    [FILES.MUTED]: 'muted',
    [FILES.WARNS]: 'warns',
    [FILES.BANNED]: 'banned',
    [FILES.EMOJI]: 'emoji',
    [FILES.POINTS]: 'points',
    [FILES.SESSIONS]: 'sessions',
    [FILES.BANNED_WORDS]: 'bannedWords',
    [FILES.DISABLED]: 'disabled',
    [FILES.LINK_PROTECT]: 'linkProtect',
    [FILES.BAD_WORDS_PROTECT]: 'badWordsProtect',
    [FILES.PRO_BAD_WORDS]: 'proBadWords',
    [FILES.PRO_WARNS]: 'proWarns',
};

const ARRAY_NAMESPACES = new Set(['protected', 'monitored', 'proBadWords']);

function save(filePath, data) {
    if (useSqlite) {
        const ns = FILE_TO_NS[filePath];
        if (ns) {
            try { sqliteSaveObj(ns, data); } catch (e) {
                log.error(`SQLite save error [${ns}]: ${e.message}`);
            }
        }
    }
    saveDb(filePath, data);
}

function migrateJsonToSqlite() {
    if (!useSqlite) return;
    const stmtCount = getStmt('countNs', 'SELECT COUNT(*) as cnt FROM kv_store WHERE namespace = ?');

    for (const [file, ns] of Object.entries(FILE_TO_NS)) {
        const existing = stmtCount.get(ns);
        if (existing && existing.cnt > 0) continue;

        if (fs.existsSync(file)) {
            try {
                const data = JSON.parse(fs.readFileSync(file, 'utf8'));
                sqliteSaveObj(ns, data);
                log.info(`📦 تم نقل ${file} → SQLite [${ns}]`);
            } catch (e) {
                log.warn(`⚠️ فشل نقل ${file}: ${e.message}`);
            }
        }
    }
}

for (const [k, f] of Object.entries(FILES)) {
    if (!fs.existsSync(f)) {
        const def = DEFAULTS[k];
        if (def !== undefined) {
            fs.writeFileSync(f, JSON.stringify(def, null, 2));
        }
    }
}

let adminsDb       = loadDb(FILES.ADMINS, DEFAULTS.ADMINS);
let config         = loadDb(FILES.CONFIG, DEFAULTS.CONFIG);
let bankGroups     = loadDb(FILES.BANK_GROUPS, DEFAULTS.BANK_GROUPS);
let aliasesDb      = loadDb(FILES.ALIASES, DEFAULTS.ALIASES);
let protectedGroups = loadDb(FILES.PROTECT, DEFAULTS.PROTECT);
let logDb          = loadDb(FILES.LOG, DEFAULTS.LOG);
let monitoredGroups = loadDb(FILES.MONITOR, DEFAULTS.MONITOR);
let mutedDb        = loadDb(FILES.MUTED, DEFAULTS.MUTED);
let warnsDb        = loadDb(FILES.WARNS, DEFAULTS.WARNS);
let banDb          = loadDb(FILES.BANNED, DEFAULTS.BANNED);
let emojiDb        = loadDb(FILES.EMOJI, DEFAULTS.EMOJI);
let pointsDb       = loadDb(FILES.POINTS, DEFAULTS.POINTS);
let sessionsDb     = loadDb(FILES.SESSIONS, DEFAULTS.SESSIONS);
let bannedWordsDb  = loadDb(FILES.BANNED_WORDS, DEFAULTS.BANNED_WORDS);
let disabledDb     = loadDb(FILES.DISABLED, DEFAULTS.DISABLED);
let linkProtectDb  = loadDb(FILES.LINK_PROTECT, DEFAULTS.LINK_PROTECT);
let badWordsProtectDb = loadDb(FILES.BAD_WORDS_PROTECT, DEFAULTS.BAD_WORDS_PROTECT);
let proBadWords    = loadDb(FILES.PRO_BAD_WORDS, [
    "نيك","انيك","انيك امك","ابوك","امك","طيزي","تلحس","تلحس زبي",
    "تلحس طيزي","كسمك","كسك","قحبة","قحاب","عاهرة","شرموطة","كس",
    "عرص","منيوك","زبي"
]);
let proWarnsDb     = loadDb(FILES.PRO_WARNS, DEFAULTS.PRO_WARNS);

migrateJsonToSqlite();

if (useSqlite) {
    const sqlAdmins = sqliteLoad('admins', DEFAULTS.ADMINS);
    if (Object.keys(sqlAdmins).length > 0) adminsDb = sqlAdmins;

    const sqlConfig = sqliteLoad('config', DEFAULTS.CONFIG);
    if (Object.keys(sqlConfig).length > 0) config = sqlConfig;

    const sqlPoints = sqliteLoad('points', DEFAULTS.POINTS);
    if (Object.keys(sqlPoints).length > 0) pointsDb = sqlPoints;

    const sqlWarns = sqliteLoad('warns', DEFAULTS.WARNS);
    if (Object.keys(sqlWarns).length > 0) warnsDb = sqlWarns;

    const sqlBanned = sqliteLoad('banned', DEFAULTS.BANNED);
    if (Object.keys(sqlBanned).length > 0) banDb = sqlBanned;

    const sqlProtected = sqliteLoad('protected', DEFAULTS.PROTECT);
    if (Array.isArray(sqlProtected) && sqlProtected.length > 0) protectedGroups = sqlProtected;

    const sqlMonitored = sqliteLoad('monitored', DEFAULTS.MONITOR);
    if (Array.isArray(sqlMonitored) && sqlMonitored.length > 0) monitoredGroups = sqlMonitored;
}

Object.keys(sessionsDb).forEach(k => { delete sessionsDb[k]; });
save(FILES.SESSIONS, sessionsDb);

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

function getDbStats() {
    const stats = { engine: useSqlite ? 'SQLite + JSON' : 'JSON فقط' };
    if (useSqlite && db) {
        try {
            const row = db.prepare('SELECT COUNT(*) as cnt FROM kv_store').get();
            stats.totalRecords = row.cnt;
            const sizeRow = db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();
            stats.dbSizeMB = (sizeRow.size / 1024 / 1024).toFixed(2);
        } catch {}
    }
    stats.tables = {};
    for (const [name, obj] of Object.entries(DB_MAP)) {
        stats.tables[name] = Array.isArray(obj) ? obj.length : Object.keys(obj).length;
    }
    return stats;
}

function closeDb() {
    if (db) {
        try { db.close(); log.info('🔒 SQLite مغلقة'); } catch {}
    }
}

module.exports = {
    loadDb,
    saveDb,
    save,
    getDb,
    getDbStats,
    closeDb,

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

    useSqlite,
};
