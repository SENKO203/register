'use strict';
const express = require('express');
const path    = require('path');
const fs      = require('fs');
const multer  = require('multer');
const crypto  = require('crypto');
const cookieParser = require('cookie-parser');
const db = require('./database');

const app  = express();
const PORT = process.env.PORT || 4040;

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ============================================================
//   حماية بكلمة مرور
// ============================================================
const AUTH_CONFIG_PATH = path.join(__dirname, 'auth.json');
function getAuthConfig() {
    if (!fs.existsSync(AUTH_CONFIG_PATH))
        fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify({ passwordHash: null, salt: null }, null, 2));
    return JSON.parse(fs.readFileSync(AUTH_CONFIG_PATH, 'utf-8'));
}
function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}
const activeSessions = new Map();

function requireAuth(req, res, next) {
    const auth = getAuthConfig();
    // Fresh install (no admin password yet) — allow everything
    if (!auth.adminPasswordHash) return next();

    const token = req.cookies?.session;
    if (token && activeSessions.has(token)) {
        req.isAdmin = activeSessions.get(token).isAdmin;
        return next();
    }
    // If a reader password is set, require login to view the site
    if (auth.passwordHash) {
        if (req.path.startsWith('/api/') && req.path !== '/api/login')
            return res.status(401).json({ error: 'يحتاج تسجيل دخول' });
    }
    // No reader password → public read access; write ops still guarded by requireAdmin
    next();
}
function requireAdmin(req, res, next) {
    if (!req.isAdmin) return res.status(403).json({ error: 'للمدير فقط' });
    next();
}
app.use(requireAuth);

app.post('/api/login', (req, res) => {
    const auth = getAuthConfig();
    const { password } = req.body;
    // First setup = no admin password exists yet
    const isFirstSetup = !auth.adminPasswordHash;
    let isAdmin = false;

    if (isFirstSetup) {
        if (!password || password.length < 4)
            return res.status(400).json({ error: 'كلمة المرور لازم 4 أحرف على الأقل' });
        // Create admin password only; site remains open to readers by default
        const adminSalt = crypto.randomBytes(16).toString('hex');
        const adminPasswordHash = hashPassword(password, adminSalt);
        fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify({
            passwordHash: null, salt: null, adminPasswordHash, adminSalt,
        }, null, 2));
        isAdmin = true;
    } else {
        const pwd = password || '';
        // Check admin password first
        if (auth.adminPasswordHash && hashPassword(pwd, auth.adminSalt) === auth.adminPasswordHash) {
            isAdmin = true;
        } else if (auth.passwordHash) {
            // Check reader password
            if (hashPassword(pwd, auth.salt) !== auth.passwordHash)
                return res.status(401).json({ error: 'كلمة مرور خاطئة' });
        } else {
            // No reader password and wrong admin password
            return res.status(401).json({ error: 'كلمة مرور خاطئة' });
        }
    }

    const token = crypto.randomBytes(24).toString('hex');
    activeSessions.set(token, { isAdmin });
    res.cookie('session', token, { httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ ok: true, isFirstSetup, isAdmin });
});

app.post('/api/logout', (req, res) => {
    activeSessions.delete(req.cookies?.session);
    res.clearCookie('session');
    res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
    const token = req.cookies?.session;
    const session = token ? activeSessions.get(token) : null;
    res.json({ isAdmin: session?.isAdmin || false });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/library-files', express.static(db.DATA_DIR));

// ============================================================
//   API: المكتبة
// ============================================================
app.get('/api/library', (req, res) => res.json(Object.values(db.getLibrary())));

app.get('/api/manhwa/:id', (req, res) => {
    const m = db.getManhwa(req.params.id);
    if (!m) return res.status(404).json({ error: 'غير موجود' });
    res.json({ ...m, progress: db.getProgress(req.params.id) });
});

app.post('/api/manhwa', requireAdmin, (req, res) => {
    const { id, title, description, tags, coverUrl, chapters, mdxId } = req.body;
    if (!id || !title) return res.status(400).json({ error: 'يحتاج id وtitle' });
    const saved = db.upsertManhwa(id, {
        title, description,
        tags: tags || [],
        coverUrl: coverUrl || '',
        chapters: chapters || [],
        mdxId: mdxId || null,
    });
    res.json(saved);
});

app.delete('/api/manhwa/:id', requireAdmin, (req, res) => {
    db.deleteManhwa(req.params.id);
    res.json({ ok: true });
});

// ============================================================
//   API: التقدّم
// ============================================================
app.post('/api/manhwa/:id/read/:chapter', (req, res) => {
    res.json(db.markChapterRead(req.params.id, req.params.chapter));
});
app.get('/api/progress-all', (req, res) => res.json(db.getAllProgress()));

// ============================================================
//   API: المفضلة / مشاهدة لاحقًا
// ============================================================
app.post('/api/lists/:listName/toggle/:manhwaId', (req, res) => {
    const { listName, manhwaId } = req.params;
    if (!['favorites', 'currentlyReading', 'readLater', 'completed'].includes(listName))
        return res.status(400).json({ error: 'قائمة غير معروفة' });
    res.json({ list: db.toggleList(listName, manhwaId) });
});
app.get('/api/lists', (req, res) => res.json(db.getLists()));

// ============================================================
//   API: الملف الشخصي
// ============================================================
app.get('/api/profile', (req, res) => {
    const lib   = db.getLibrary();
    const lists = db.getLists();
    res.json({
        totalManhwa:           Object.keys(lib).length,
        totalChaptersRead:     db.totalChaptersRead(),
        favoritesCount:        lists.favorites.length,
        currentlyReadingCount: lists.currentlyReading.length,
        readLaterCount:        lists.readLater.length,
        completedCount:        lists.completed.length,
    });
});

// ============================================================
//   API: الإعدادات
// ============================================================
app.post('/api/settings', requireAdmin, (req, res) => {
    const configPath = path.join(__dirname, 'config.json');
    const current = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {};
    const allowed = ['groqKey', 'groqModel', 'sourceLanguage', 'targetLanguage'];
    const updates = {};
    for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = String(req.body[key]).trim();
    }
    fs.writeFileSync(configPath, JSON.stringify({ ...current, ...updates }, null, 2));
    const auth = getAuthConfig();
    let authUpdates = {};
    if (req.body.readerPassword && req.body.readerPassword.length >= 4) {
        const salt = crypto.randomBytes(16).toString('hex');
        authUpdates = { ...authUpdates, passwordHash: hashPassword(req.body.readerPassword, salt), salt };
    }
    if (req.body.adminPassword && req.body.adminPassword.length >= 4) {
        const adminSalt = crypto.randomBytes(16).toString('hex');
        authUpdates = { ...authUpdates, adminPasswordHash: hashPassword(req.body.adminPassword, adminSalt), adminSalt };
    }
    if (Object.keys(authUpdates).length)
        fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify({ ...auth, ...authUpdates }, null, 2));
    res.json({ ok: true });
});

// ============================================================
//   API: قاموس المصطلحات
// ============================================================
const GLOSSARY_PATH = path.join(db.DATA_DIR, 'glossary.json');
function readGlossary() {
    if (!fs.existsSync(GLOSSARY_PATH)) return {};
    try { return JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf-8')); } catch { return {}; }
}
function writeGlossary(data) { fs.writeFileSync(GLOSSARY_PATH, JSON.stringify(data, null, 2)); }

app.get('/api/glossary',  (req, res) => res.json(readGlossary()));
app.post('/api/glossary', requireAdmin, (req, res) => {
    const { korean, arabic } = req.body;
    if (!korean || !arabic) return res.status(400).json({ error: 'يحتاج korean وarabic' });
    const g = readGlossary();
    g[korean.trim()] = arabic.trim();
    writeGlossary(g);
    res.json({ ok: true });
});
app.delete('/api/glossary/:korean', requireAdmin, (req, res) => {
    const g = readGlossary();
    delete g[decodeURIComponent(req.params.korean)];
    writeGlossary(g);
    res.json({ ok: true });
});

// ============================================================
//   API: مهام المعالجة
// ============================================================
const { processChapterImages } = require('./ocr-translate');
const activeJobs = new Map();

app.get('/api/job/:key', (req, res) => {
    const job = activeJobs.get(req.params.key);
    if (!job) return res.status(404).json({ error: 'المهمة غير موجودة' });
    res.json(job);
});

// ============================================================
//   رفع صور فصل يدوياً
// ============================================================
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            const dir = path.join(db.DATA_DIR, 'library', req.params.id, `chapter-${req.params.chapterNum}`);
            fs.mkdirSync(dir, { recursive: true });
            cb(null, dir);
        },
        filename: (req, file, cb) => cb(null, `page-${Date.now()}-${file.originalname}`),
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
});

app.post('/api/manhwa/:id/chapter/:chapterNum/upload', requireAdmin, upload.array('pages', 200), (req, res) => {
    const { id, chapterNum } = req.params;
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'لا توجد ملفات' });

    const imagePaths = req.files.map(f => f.path);
    const jobKey = crypto.randomBytes(12).toString('hex');
    activeJobs.set(jobKey, { status: 'processing', progress: null, result: null, error: null });
    res.json({ jobKey, total: imagePaths.length });

    processChapterImages(id, chapterNum, imagePaths, p => {
        const job = activeJobs.get(jobKey);
        if (job) job.progress = p;
    }).then(result => {
        const m = db.getManhwa(id);
        if (m) {
            const chapters  = m.chapters || [];
            const existing  = chapters.find(c => String(c.num) === String(chapterNum));
            const pagesData = result.pages.map((p, i) => ({
                imageUrl:   `/library-files/library/${id}/chapter-${chapterNum}/${path.basename(req.files[i].path)}`,
                width:      p.width,
                height:     p.height,
                textBlocks: p.textBlocks,
            }));
            if (existing) existing.pages = pagesData;
            else chapters.push({ num: chapterNum, pages: pagesData });
            chapters.sort((a, b) => Number(a.num) - Number(b.num));
            db.upsertManhwa(id, { chapters });
        }
        const job = activeJobs.get(jobKey);
        if (job) { job.status = 'done'; job.result = result; }
    }).catch(e => {
        const job = activeJobs.get(jobKey);
        if (job) { job.status = 'error'; job.error = e.message; }
    }).finally(() => setTimeout(() => activeJobs.delete(jobKey), 10 * 60 * 1000));
});

// ============================================================
//   MangaDex — بحث وجلب تلقائي
// ============================================================
async function mdxFetch(url) {
    const res = await fetch(url, { headers: { 'User-Agent': 'MedosaReader/1.0' } });
    if (!res.ok) throw new Error(`MangaDex: ${res.status}`);
    return res.json();
}

// بحث بالاسم
app.get('/api/mangadex/search', requireAdmin, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.status(400).json({ error: 'يحتاج q' });
        const params = new URLSearchParams({
            title: q, limit: '15', 'order[relevance]': 'desc',
            'includes[]': 'cover_art',
            'contentRating[]': ['safe', 'suggestive', 'erotica'],
        });
        const data = await mdxFetch(`https://api.mangadex.org/manga?${params}`);
        const results = (data.data || []).map(m => {
            const coverRel = m.relationships?.find(r => r.type === 'cover_art');
            const cover = coverRel?.attributes?.fileName
                ? `https://uploads.mangadex.org/covers/${m.id}/${coverRel.attributes.fileName}.256.jpg`
                : null;
            const title = m.attributes.title.en || m.attributes.title['ja-ro']
                || m.attributes.title.ko || Object.values(m.attributes.title)[0] || '';
            const hasAr = (m.attributes.availableTranslatedLanguages || []).includes('ar');
            return {
                id:          m.id,
                title,
                description: (m.attributes.description?.en || m.attributes.description?.ar || '').slice(0, 300),
                tags:        (m.attributes.tags || []).slice(0, 5)
                    .map(t => t.attributes?.localizedName?.en || '').filter(Boolean),
                cover,
                status:      m.attributes.status,
                hasAr,
            };
        });
        res.json(results);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// قائمة فصول مانجا — عربية أولاً ثم إنجليزية
app.get('/api/mangadex/:mdxId/chapters', requireAdmin, async (req, res) => {
    try {
        const base = `https://api.mangadex.org/manga/${req.params.mdxId}/feed`;
        let data = await mdxFetch(`${base}?translatedLanguage[]=ar&order[chapter]=asc&limit=500`);
        let lang = 'ar';
        if (!(data.data?.length)) {
            data = await mdxFetch(`${base}?translatedLanguage[]=en&order[chapter]=asc&limit=500`);
            lang = 'en';
        }
        const seen = new Set();
        const chapters = (data.data || [])
            .filter(c => c.attributes.chapter)
            .map(c => ({
                id: c.id, num: parseFloat(c.attributes.chapter),
                title: c.attributes.title || '', pages: c.attributes.pages, lang,
            }))
            .filter(c => seen.has(c.num) ? false : seen.add(c.num));
        res.json(chapters);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// تحميل فصل — عربي (بدون ترجمة) أو إنجليزي (مع OCR+ترجمة)
app.post('/api/mangadex/download-chapter', requireAdmin, async (req, res) => {
    const { manhwaId, chapterId, chapterNum, lang } = req.body;
    if (!manhwaId || !chapterId || chapterNum == null)
        return res.status(400).json({ error: 'يحتاج manhwaId وchapterId وchapterNum' });

    const jobKey = crypto.randomBytes(12).toString('hex');
    activeJobs.set(jobKey, { status: 'downloading', progress: null, result: null, error: null });
    res.json({ jobKey });

    (async () => {
        const job = activeJobs.get(jobKey);
        try {
            // 1. روابط الصور
            const serverData = await mdxFetch(`https://api.mangadex.org/at-home/server/${chapterId}`);
            const { baseUrl, chapter: { hash, data: pageFiles } } = serverData;

            // 2. تحميل الصور
            const dir = path.join(db.DATA_DIR, 'library', manhwaId, `chapter-${chapterNum}`);
            fs.mkdirSync(dir, { recursive: true });
            const imagePaths = [];

            for (let i = 0; i < pageFiles.length; i++) {
                if (job) job.progress = { page: i + 1, total: pageFiles.length, stage: 'download' };
                const imgRes  = await fetch(`${baseUrl}/data/${hash}/${pageFiles[i]}`);
                if (!imgRes.ok) throw new Error(`فشل تحميل صفحة ${i + 1}`);
                const buf     = Buffer.from(await imgRes.arrayBuffer());
                const ext     = path.extname(pageFiles[i]) || '.jpg';
                const imgPath = path.join(dir, `page-${String(i + 1).padStart(3, '0')}${ext}`);
                fs.writeFileSync(imgPath, buf);
                imagePaths.push(imgPath);
            }

            let pagesData;
            if (lang === 'ar') {
                // فصل عربي جاهز — لا حاجة للترجمة، الصور مترجمة بالفعل
                if (job) job.progress = { page: imagePaths.length, total: imagePaths.length, stage: 'done' };
                pagesData = imagePaths.map((imgPath, i) => ({
                    imageUrl:   `/library-files/library/${manhwaId}/chapter-${chapterNum}/${path.basename(imgPath)}`,
                    width:      0,
                    height:     0,
                    textBlocks: [],
                }));
            } else {
                // فصل إنجليزي — تشغيل OCR + ترجمة
                const result = await processChapterImages(manhwaId, chapterNum, imagePaths, p => {
                    if (job) job.progress = p;
                });
                pagesData = result.pages.map((p, i) => ({
                    imageUrl:   `/library-files/library/${manhwaId}/chapter-${chapterNum}/${path.basename(imagePaths[i])}`,
                    width:      p.width,
                    height:     p.height,
                    textBlocks: p.textBlocks,
                }));
            }

            // 3. حفظ
            const m = db.getManhwa(manhwaId);
            if (m) {
                const chapters = m.chapters || [];
                const existing = chapters.find(c => String(c.num) === String(chapterNum));
                if (existing) existing.pages = pagesData;
                else chapters.push({ num: chapterNum, pages: pagesData });
                chapters.sort((a, b) => Number(a.num) - Number(b.num));
                db.upsertManhwa(manhwaId, { chapters });
            }
            if (job) { job.status = 'done'; }
        } catch (e) {
            if (job) { job.status = 'error'; job.error = e.message; }
        } finally {
            setTimeout(() => activeJobs.delete(jobKey), 10 * 60 * 1000);
        }
    })();
});

app.listen(PORT, () => console.log(`📖 MEDOSA Reader شغّال على: http://localhost:${PORT}`));
