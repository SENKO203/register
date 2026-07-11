'use strict';
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 4040;

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ============================================================
//   حماية بكلمة مرور
// ============================================================
const AUTH_CONFIG_PATH = path.join(__dirname, 'auth.json');
function getAuthConfig() {
    if (!fs.existsSync(AUTH_CONFIG_PATH)) {
        fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify({ passwordHash: null, salt: null }, null, 2));
    }
    return JSON.parse(fs.readFileSync(AUTH_CONFIG_PATH, 'utf-8'));
}
function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}
function setPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify({ passwordHash, salt }, null, 2));
}
const activeSessions = new Map(); // token → { isAdmin }

function requireAuth(req, res, next) {
    const auth = getAuthConfig();
    if (!auth.passwordHash) return next();
    const token = req.cookies?.session;
    if (token && activeSessions.has(token)) {
        req.isAdmin = activeSessions.get(token).isAdmin;
        return next();
    }
    if (req.path === '/login.html' || req.path === '/api/login' || req.path.startsWith('/css') || req.path.startsWith('/js')) return next();
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'يحتاج تسجيل دخول' });
    return res.redirect('/login.html');
}
function requireAdmin(req, res, next) {
    if (!req.isAdmin) return res.status(403).json({ error: 'للمدير فقط' });
    next();
}
app.use(requireAuth);

app.post('/api/login', (req, res) => {
    const auth = getAuthConfig();
    const { password } = req.body;
    const isFirstSetup = !auth.passwordHash;
    let isAdmin = false;

    if (isFirstSetup) {
        if (!password || password.length < 4) return res.status(400).json({ error: 'كلمة المرور لازم 4 أحرف على الأقل' });
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(password, salt);
        fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify({
            passwordHash, salt, adminPasswordHash: passwordHash, adminSalt: salt,
        }, null, 2));
        isAdmin = true;
    } else {
        const pwd = password || '';
        // فحص كلمة سر المدير
        const adminSalt = auth.adminSalt || auth.salt;
        const adminExpected = auth.adminPasswordHash || auth.passwordHash;
        if (hashPassword(pwd, adminSalt) === adminExpected) {
            isAdmin = true;
            // ترقية: حفظ adminPasswordHash لو ما كان موجوداً
            if (!auth.adminPasswordHash) {
                fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify({
                    ...auth, adminPasswordHash: auth.passwordHash, adminSalt: auth.salt,
                }, null, 2));
            }
        } else {
            // فحص كلمة سر القراء
            if (hashPassword(pwd, auth.salt) !== auth.passwordHash)
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
app.get('/api/library', (req, res) => {
    res.json(Object.values(db.getLibrary()));
});

app.get('/api/manhwa/:id', (req, res) => {
    const m = db.getManhwa(req.params.id);
    if (!m) return res.status(404).json({ error: 'غير موجود' });
    res.json({ ...m, progress: db.getProgress(req.params.id) });
});

app.post('/api/manhwa', requireAdmin, (req, res) => {
    const { id, title, description, tags, coverUrl, chapters } = req.body;
    if (!id || !title) return res.status(400).json({ error: 'يحتاج id وtitle على الأقل' });
    const saved = db.upsertManhwa(id, { title, description, tags: tags || [], coverUrl, chapters: chapters || [] });
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
    const progress = db.markChapterRead(req.params.id, req.params.chapter);
    res.json(progress);
});

// جميع التقدمات دفعة واحدة — بدلًا من استدعاء منفصل لكل عمل
app.get('/api/progress-all', (req, res) => {
    res.json(db.getAllProgress());
});

// ============================================================
//   API: المفضلة / مشاهدة لاحقًا
// ============================================================
app.post('/api/lists/:listName/toggle/:manhwaId', (req, res) => {
    const { listName, manhwaId } = req.params;
    if (!['favorites', 'readLater'].includes(listName)) return res.status(400).json({ error: 'قائمة غير معروفة' });
    const list = db.toggleList(listName, manhwaId);
    res.json({ list });
});

app.get('/api/lists', (req, res) => res.json(db.getLists()));

// ============================================================
//   API: الملف الشخصي / الإحصائيات
// ============================================================
app.get('/api/profile', (req, res) => {
    const lib = db.getLibrary();
    const lists = db.getLists();
    res.json({
        totalManhwa: Object.keys(lib).length,
        totalChaptersRead: db.totalChaptersRead(),
        favoritesCount: lists.favorites.length,
        readLaterCount: lists.readLater.length,
    });
});

// ============================================================
//   API: الإعدادات (فقط الحقول المسموح بها)
// ============================================================
app.post('/api/settings', requireAdmin, (req, res) => {
    const configPath = path.join(__dirname, 'config.json');
    const current = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const allowed = ['groqKey', 'groqModel', 'sourceLanguage', 'targetLanguage'];
    const updates = {};
    for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = String(req.body[key]).trim();
    }
    fs.writeFileSync(configPath, JSON.stringify({ ...current, ...updates }, null, 2));
    // تحديث كلمة سر القراء (اختياري)
    if (req.body.readerPassword && req.body.readerPassword.length >= 4) {
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(req.body.readerPassword, salt);
        const auth = getAuthConfig();
        fs.writeFileSync(AUTH_CONFIG_PATH, JSON.stringify({ ...auth, passwordHash, salt }, null, 2));
    }
    res.json({ ok: true });
});

// ============================================================
//   API: قاموس المصطلحات (Korean → Arabic)
// ============================================================
const GLOSSARY_PATH = path.join(db.DATA_DIR, 'glossary.json');
function readGlossary() {
    if (!fs.existsSync(GLOSSARY_PATH)) return {};
    try { return JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf-8')); } catch { return {}; }
}
function writeGlossary(data) { fs.writeFileSync(GLOSSARY_PATH, JSON.stringify(data, null, 2)); }

app.get('/api/glossary', (req, res) => res.json(readGlossary()));

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
//   API: تتبع مهام المعالجة الجارية (OCR + ترجمة)
// ============================================================
const { processChapterImages } = require('./ocr-translate');
const activeJobs = new Map(); // jobKey → { status, progress, result, error }

app.get('/api/job/:key', (req, res) => {
    const job = activeJobs.get(req.params.key);
    if (!job) return res.status(404).json({ error: 'المهمة غير موجودة أو انتهت' });
    res.json(job);
});

// استدعاء مزامن للمعالجة (بمسارات موجودة مسبقًا)
app.post('/api/manhwa/:id/process-chapter', async (req, res) => {
    try {
        const { chapterNum, imagePaths } = req.body;
        if (!imagePaths || !imagePaths.length) return res.status(400).json({ error: 'يحتاج قائمة مسارات صور' });
        const result = await processChapterImages(req.params.id, chapterNum, imagePaths);
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
//   رفع صور فصل جديد + معالجته في الخلفية
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
    limits: { fileSize: 15 * 1024 * 1024 },
});

app.post('/api/manhwa/:id/chapter/:chapterNum/upload', requireAdmin, upload.array('pages', 100), (req, res) => {
    const { id, chapterNum } = req.params;
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'لا توجد ملفات' });

    const savedFiles = req.files; // نحفظ المرجع للمعالجة اللاحقة
    const imagePaths = savedFiles.map(f => f.path);
    const jobKey = crypto.randomBytes(12).toString('hex');
    activeJobs.set(jobKey, { status: 'processing', progress: null, result: null, error: null });

    // رد فوري للعميل بمفتاح المهمة
    res.json({ jobKey, total: imagePaths.length });

    // معالجة في الخلفية (لا نستخدم await هنا)
    processChapterImages(id, chapterNum, imagePaths, (p) => {
        const job = activeJobs.get(jobKey);
        if (job) job.progress = p;
    }).then(result => {
        const m = db.getManhwa(id);
        if (m) {
            const chapters = m.chapters || [];
            const existing = chapters.find(c => String(c.num) === String(chapterNum));
            const pagesData = result.pages.map((p, i) => ({
                imageUrl: `/library-files/library/${id}/chapter-${chapterNum}/${path.basename(savedFiles[i].path)}`,
                width: p.width, height: p.height,
                textBlocks: JSON.parse(fs.readFileSync(
                    path.join(db.DATA_DIR, 'library', id, `chapter-${chapterNum}`, `page-${i + 1}.json`), 'utf-8'
                )),
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
    }).finally(() => {
        // تنظيف المهمة من الذاكرة بعد 10 دقائق
        setTimeout(() => activeJobs.delete(jobKey), 10 * 60 * 1000);
    });
});

app.listen(PORT, () => {
    console.log(`📖 قارئ المانهوا المترجم شغّال على: http://localhost:${PORT}`);
});
