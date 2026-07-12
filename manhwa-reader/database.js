'use strict';
// طبقة بيانات بسيطة قائمة على ملفات JSON — بدون أي مكتبة تحتاج تجميع (node-gyp)
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FILES = {
    LIBRARY: path.join(DATA_DIR, 'library.json'),
    PROGRESS: path.join(DATA_DIR, 'progress.json'),
    LISTS: path.join(DATA_DIR, 'lists.json'),
    USERS: path.join(DATA_DIR, 'users.json'),
};

fs.mkdirSync(DATA_DIR, { recursive: true });

function ensure(file, fallback) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
}
ensure(FILES.LIBRARY, {});
ensure(FILES.PROGRESS, {});
ensure(FILES.LISTS, { favorites: [], currentlyReading: [], readLater: [], completed: [] });
ensure(FILES.USERS, {});

function load(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
    catch { return {}; }
}
function save(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ============================================================
//   المكتبة
// ============================================================
function getLibrary() { return load(FILES.LIBRARY); }
function getManhwa(id) { return getLibrary()[id] || null; }
function upsertManhwa(id, meta) {
    const lib = getLibrary();
    const merged = { ...(lib[id] || {}), ...meta, id };
    // Deduplicate chapters by num, keeping the last (most recent) version
    if (Array.isArray(merged.chapters)) {
        const map = new Map();
        for (const ch of merged.chapters) map.set(String(ch.num), ch);
        merged.chapters = [...map.values()].sort((a, b) => Number(a.num) - Number(b.num));
    }
    lib[id] = merged;
    save(FILES.LIBRARY, lib);
    return lib[id];
}
function deleteManhwa(id) {
    const lib = getLibrary();
    delete lib[id];
    save(FILES.LIBRARY, lib);
}

// ============================================================
//   تتبع القراءة
// ============================================================
function getProgress(manhwaId) {
    const p = load(FILES.PROGRESS);
    return p[manhwaId] || { readChapters: [], lastReadChapter: null, lastReadAt: null };
}
function markChapterRead(manhwaId, chapterNum) {
    const p = load(FILES.PROGRESS);
    if (!p[manhwaId]) p[manhwaId] = { readChapters: [], lastReadChapter: null, lastReadAt: null };
    if (!p[manhwaId].readChapters.includes(chapterNum)) p[manhwaId].readChapters.push(chapterNum);
    p[manhwaId].lastReadChapter = chapterNum;
    p[manhwaId].lastReadAt = Date.now();
    save(FILES.PROGRESS, p);
    return p[manhwaId];
}
function getAllProgress() { return load(FILES.PROGRESS); }
function totalChaptersRead() {
    const p = load(FILES.PROGRESS);
    return Object.values(p).reduce((sum, x) => sum + (x.readChapters?.length || 0), 0);
}

// ============================================================
//   المفضلة / مشاهدة لاحقًا
// ============================================================
function getLists() {
    const raw = load(FILES.LISTS);
    return {
        favorites:        [...new Set(raw.favorites        || [])],
        currentlyReading: [...new Set(raw.currentlyReading || [])],
        readLater:        [...new Set(raw.readLater        || [])],
        completed:        [...new Set(raw.completed        || [])],
    };
}
function toggleList(listName, manhwaId) {
    const lists = getLists();
    if (!lists[listName]) lists[listName] = [];
    const idx = lists[listName].indexOf(manhwaId);
    if (idx === -1) lists[listName].push(manhwaId);
    else lists[listName].splice(idx, 1);
    save(FILES.LISTS, lists);
    return lists[listName];
}

// ============================================================
//   المستخدمون
// ============================================================
function getUsers() { return load(FILES.USERS); }
function getUserByUsername(username) {
    return Object.values(getUsers()).find(u => u.username === username) || null;
}
function getUserById(id) { return getUsers()[id] || null; }
function upsertUser(id, data) {
    const users = getUsers();
    users[id] = { ...(users[id] || {}), ...data, id };
    save(FILES.USERS, users);
    return users[id];
}

module.exports = {
    DATA_DIR,
    getLibrary, getManhwa, upsertManhwa, deleteManhwa,
    getProgress, markChapterRead, getAllProgress, totalChaptersRead,
    getLists, toggleList,
    getUsers, getUserByUsername, getUserById, upsertUser,
};
