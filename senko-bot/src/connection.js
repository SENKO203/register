/**
 * Senko Bot - Connection & Socket Management
 * Creates the WhatsApp socket, handles auth, pairing, connection events,
 * and reconnection logic.
 */
'use strict';

const fs = require('fs');
const fse = require('fs-extra');
const path = require('path');
const pino = require('pino');
const readline = require('readline');

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
} = require("@itsliaaa/baileys");

const { OWNERS, FILES, SUPER_OWNERS, BOT_LID, BOT_NUM } = require('./config');
const { colors, log } = require('./logger');
const { validateSession } = require('./auth');
const {
    numOf,
    resolveId,
    metaCache,
    invalidateMeta,
    getMeta,
    sendLog,
    scanDevices,
    isUserProtected,
    isProtectedParticipant,
    isAuth,
    question,
    startDailyPointsReset,
    save,
    checkRateLimit,
} = require('./helpers');
const { getDb } = require('./database');

// ============================================================
//   Member monitoring state
// ============================================================
const newMemberWatch = new Map(); // jid@gid -> { joinTime, memberJid, groupId }
const watchedMembers = new Map(); // groupId -> Set<jid>

/**
 * Check if a member is a bot and remove them if so.
 * @param {object} sock - Baileys socket
 * @param {string} memberJid - The member's JID
 * @param {string} groupId - The group JID
 */
async function checkMemberForBot(sock, memberJid, groupId) {
    if (isUserProtected(memberJid)) return;
    const pNum = numOf(memberJid);
    if (SUPER_OWNERS.includes(pNum)) return;
    if (pNum === numOf(sock.user?.id || '')) return;

    const banDb = getDb('banned');
    if (banDb[`${groupId}:${pNum}`]) return;

    const scan = await scanDevices(sock, memberJid);
    if (!scan || scan.extra < 1) return;

    try {
        banDb[`${groupId}:${pNum}`] = Date.now();
        save(FILES.BANNED, banDb);
        newMemberWatch.delete(`${pNum}@${groupId}`);
        if (watchedMembers.has(groupId)) watchedMembers.get(groupId).delete(memberJid);
        await sock.groupParticipantsUpdate(groupId, [memberJid], 'remove');
        const meta = await getMeta(sock, groupId);
        const now = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
        sendLog(sock,
            `🤖 *كشف بوت — طرد تلقائي*\n` +
            `*━━━━━━━━━━━━━━━━━━*\n` +
            `*│🏘️ الجروب:* ${meta.subject}\n` +
            `*│👤 العضو:* @${pNum}\n` +
            `*│🔗 أجهزة مرتبطة:* ${scan.extra}\n` +
            `*│⚡ الإجراء:* تم طرده تلقائياً\n` +
            `*│⏰ التوقيت:* ${now}\n` +
            `*━━━━━━━━━━━━━━━━━━*`,
            [memberJid]);
    } catch {}
}

/**
 * Start new-member watch interval (every 30 seconds).
 * Checks members within their first hour, then moves them to periodic watch.
 */
function startNewMemberWatch() {
    setInterval(async () => {
        if (!global._botSock) return;
        const now = Date.now();
        for (const [key, info] of newMemberWatch.entries()) {
            const age = now - info.joinTime;
            if (age > 60 * 60 * 1000) {
                newMemberWatch.delete(key);
                if (!watchedMembers.has(info.groupId)) watchedMembers.set(info.groupId, new Set());
                watchedMembers.get(info.groupId).add(info.memberJid);
                continue;
            }
            if (age % (2 * 60 * 1000) < 30000) {
                await checkMemberForBot(global._botSock, info.memberJid, info.groupId).catch(() => {});
                await new Promise(r => setTimeout(r, 300));
            }
        }
    }, 30000);
}

/**
 * Start periodic scan of all protected groups (every 6 hours).
 */
function startPeriodicGroupScan() {
    setInterval(async () => {
        if (!global._botSock) return;
        const sock = global._botSock;
        const protectedGroups = getDb('protected');
        for (const groupId of protectedGroups) {
            try {
                const meta = await getMeta(sock, groupId);
                const members = meta.participants || [];
                for (const m of members) {
                    const mJid = m.id || m;
                    if (isUserProtected(mJid)) continue;
                    if (SUPER_OWNERS.includes(numOf(mJid))) continue;
                    if (numOf(mJid) === numOf(sock.user?.id || '')) continue;
                    await checkMemberForBot(sock, mJid, groupId);
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch {}
            await new Promise(r => setTimeout(r, 2000));
        }
    }, 6 * 60 * 60 * 1000);
}

// ============================================================
//   Main bot startup
// ============================================================

async function startBot() {
    log.senko(colors.bright + "Initializing SENKO BOT..." + colors.reset);

    const sessionDir = path.join(process.cwd(), 'auth_session');
    await fse.ensureDir(sessionDir);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const sessionExists = state?.creds?.registered || false;

    // ============================================================
    //   Session fingerprint validation (from auth.js)
    // ============================================================
    validateSession(sessionDir, sessionExists);

    // ============================================================
    //   Fetch Baileys version
    // ============================================================
    const FIXED_VERSION = [2, 3000, 1023141421];
    let version = FIXED_VERSION;
    try {
        const result = await Promise.race([
            fetchLatestBaileysVersion(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))
        ]);
        if (result?.version) version = result.version;
    } catch {}

    // ============================================================
    //   Pairing: ask for phone number & custom code before socket
    // ============================================================
    let phoneNumber, pairingCode;
    if (!sessionExists) {
        while (true) {
            const input = await question(
                colors.bright + colors.magenta + '\n   📱 رقم الهاتف (مثال: 96171234567): ' + colors.reset
            );
            const clean = input.replace(/[^0-9]/g, '');
            if (clean.length > 6) { phoneNumber = clean; break; }
            log.error('❌ الرقم قصير، أعد المحاولة.');
        }
        console.log('');
        console.log(colors.bright + colors.cyan + '   ════════════════════════════════════' + colors.reset);
        console.log(colors.bright + '   اختر كوداً من 8 أحرف/أرقام إنجليزية' + colors.reset);
        console.log(colors.bright + '   مثال: SENKO123 أو DEATH007 أو ARN12345' + colors.reset);
        console.log(colors.bright + colors.cyan + '   ════════════════════════════════════' + colors.reset);
        while (true) {
            const raw = await question(colors.bright + colors.yellow + '   🔑 كودك المختار: ' + colors.reset);
            const inp = raw.trim().toUpperCase();
            if (inp.length !== 8) { log.error('❌ يجب أن يكون 8 أحرف بالضبط.'); continue; }
            if (!/^[A-Z0-9]+$/.test(inp)) { log.error('❌ أحرف إنجليزية وأرقام فقط.'); continue; }
            pairingCode = inp;
            break;
        }
    }

    // ============================================================
    //   Create the WhatsApp socket
    // ============================================================
    const sock = makeWASocket({
        auth:                         state,
        version,
        printQRInTerminal:            false,
        browser:                      ['MacOS', 'Chrome', '1.0.0'],
        logger:                       pino({ level: 'silent' }),
        markOnlineOnConnect:          true,
        syncFullHistory:              false,
        getMessage:                   async () => ({ conversation: '' }),
        getMessageHistory:            sessionExists ? async () => [] : undefined,
        cachedGroupMetadata:          async (jid) => metaCache[jid]?.d || undefined,
        connectTimeoutMs:             30000,
        keepAliveIntervalMs:          10000,
        retryRequestDelayMs:          250,
        maxMsgRetryCount:             3,
        fireInitQueries:              true,
        emitOwnEvents:                false,
    });

    global._botSock = sock;
    const bootTime = Math.floor(Date.now() / 1000);
    let isReady = true;
    let botNum = sock.user ? numOf(sock.user.id) : '';

    // ============================================================
    //   Pairing code request (for new sessions)
    // ============================================================
    if (!sock.authState.creds.registered) {
        try {
            await new Promise(r => setTimeout(r, 1200));
            const code = await sock.requestPairingCode(phoneNumber, pairingCode);
            console.log('');
            console.log(colors.bright + colors.cyan +
                ' ╔══════════════════════════════════════╗\n' +
                ' ║      ⚡ SENKO — كود الربط            ║\n' +
                ' ╠══════════════════════════════════════╣' + colors.reset);
            console.log(colors.bright + colors.yellow + ` ║  رقم الهاتف : +${phoneNumber}` + colors.reset);
            console.log(colors.bright + colors.green  + ` ║  كودك       : ${pairingCode}` + colors.reset);
            console.log(colors.bright + colors.green  + ` ║  كود واتساب : ${code}` + colors.reset);
            console.log(colors.bright + colors.cyan +
                ' ╠══════════════════════════════════════╣\n' +
                ' ║  واتساب ← الأجهزة المرتبطة          ║\n' +
                ' ║  ← ربط برقم الهاتف ← أدخل الكود    ║\n' +
                ' ╚══════════════════════════════════════╝' + colors.reset);
            console.log('');
        } catch (err) {
            const msg = err.message || '';
            log.error(`❌ فشل طلب الكود: ${msg}`);
            log.info('⏳ إعادة التشغيل خلال 5 ثوانٍ...');
            setTimeout(() => startBot(), 5000);
            return;
        }
    } else {
        log.success('✅ جلسة موجودة — جاري الاتصال تلقائياً...');
    }

    // ============================================================
    //   Connection events
    // ============================================================
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, isNewLogin } = update;
        const statusCode  = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isBanned    = statusCode === DisconnectReason.forbidden;

        if (connection === 'connecting') {
            isReady = false;
            log.info('⏳ جاري الاتصال بواتساب...');
        }

        // Auto-reconnect after first pairing (Baileys v7)
        if (isNewLogin) {
            log.success('✅ تم الربط! جاري إعادة الاتصال...');
            setTimeout(() => startBot(), 2000);
            return;
        }

        if (connection === 'open') {
            botNum = numOf(sock.user.id);
            if (!OWNERS.includes(botNum)) OWNERS.push(botNum);
            isReady = true;
            log.success(colors.bright + colors.green + `
 ╔══════════════════════════════════════╗
 ║     ✅ SENKO — تم الاتصال بنجاح     ║
 ╠══════════════════════════════════════╣
 ║  رقم البوت : +${botNum}
 ║  المنظمة   : ${getDb('config').orgName}
 ║  الحالة    : متصل 🟢
 ╚══════════════════════════════════════╝` + colors.reset);
        }

        if (connection === 'close') {
            // Logged out — ask user what to do
            if (isLoggedOut) {
                log.error('❌ تم تسجيل الخروج من واتساب.');
                log.warn('⚠️ اكتب "2" لحذف الجلسة وإعادة الربط، أو أي شيء للخروج:');
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                rl.question('', async (ans) => {
                    rl.close();
                    if (ans.trim() === '2') {
                        const sessionDir = path.join(process.cwd(), 'auth_session');
                        await fse.remove(sessionDir);
                        log.info('🗑️ تم حذف الجلسة. جاري إعادة التشغيل...');
                        setTimeout(() => startBot(), 1000);
                    } else { process.exit(0); }
                });
                return;
            }

            // Banned account
            if (isBanned) {
                log.error('🚫 الحساب محظور!');
                log.warn('اكتب "3" لحذف الجلسة أو أي شيء للخروج:');
                const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
                rl.question('', async (ans) => {
                    rl.close();
                    if (ans.trim() === '3') {
                        await fse.remove(path.join(process.cwd(), 'auth_session'));
                        setTimeout(() => startBot(), 1000);
                    } else { process.exit(0); }
                });
                return;
            }

            // 515 — restart required after pairing (normal)
            if (statusCode === 515 || statusCode === DisconnectReason.restartRequired) {
                log.success('✅ تم الربط بنجاح! جاري إعادة التشغيل للاتصال النهائي...');
                setTimeout(() => startBot(), 2000);
                return;
            }

            // 408 — timeout from WhatsApp
            if (statusCode === 408) {
                log.warn('⏳ انتهت مهلة الاتصال (408). إعادة الاتصال خلال 8 ثوانٍ...');
                setTimeout(() => startBot(), 8000);
                return;
            }

            // 440 — session conflict
            if (statusCode === 440) {
                log.error('⚠️ تحذير (440): طرف آخر يحاول الدخول على الجلسة!');
                log.warn('إذا لم تكن أنت، أوقف البوت وامسح auth_session فوراً.');
                setTimeout(() => startBot(), 8000);
                return;
            }

            // Generic disconnect — auto-reconnect
            log.warn(`⚠️ انقطع الاتصال (${statusCode || 'unknown'}). إعادة الاتصال خلال 4 ثوانٍ...`);
            setTimeout(() => startBot(), 4000);
        }
    });

    // Message cache for the socket
    const msgCache = {};

    // ============================================================
    //   Group participants update (protection & monitoring)
    // ============================================================
    sock.ev.on("group-participants.update", async ({ id, participants, action, author }) => {
        invalidateMeta(id);
        if (!author || !isReady) return;
        const now = Math.floor(Date.now() / 1000);
        if (now - bootTime < 5) return;

        const botId = numOf(sock.user.id);
        const authorNum = numOf(author);
        const pList = participants.map(p => typeof p === 'string' ? p : (p?.id || String(p)));

        // If the bot is the actor — no punishment
        if (authorNum === botId) return;
        // If the bot is the victim — ignore
        if (pList.some(p => numOf(p) === botId)) return;
        // Self-leave — ignore
        const isSelfLeave = pList.length === 1 && numOf(pList[0]) === authorNum;
        if (isSelfLeave) return;

        const isAuthorProtected = isUserProtected(author);
        const isVictimProtected = pList.some(p => isUserProtected(p));

        const currentBanDb = getDb('banned');
        const currentProtectedGroups = getDb('protected');
        const currentMonitoredGroups = getDb('monitored');

        if (action === 'add') {
            for (const p of pList) {
                if (currentBanDb[`${id}:${resolveId(p)}`] || currentBanDb[`${id}:${numOf(p)}`]) {
                    sock.groupParticipantsUpdate(id, [p], "remove").catch(() => { });
                }
            }
            // Bot scan for new members in protected groups
            if (currentProtectedGroups.includes(id)) {
                // Add new members to intensive watch (1 hour)
                for (const p of pList) {
                    if (!isUserProtected(p) && !SUPER_OWNERS.includes(numOf(p))) {
                        newMemberWatch.set(`${numOf(p)}@${id}`, {
                            joinTime: Date.now(),
                            memberJid: p,
                            groupId: id
                        });
                    }
                }
                (async () => {
                    for (const p of pList) {
                        const pNum = numOf(p);
                        if (isUserProtected(p)) continue;
                        const scan = await scanDevices(sock, p);
                        if (scan && scan.extra >= 1) {
                            try {
                                const meta = await getMeta(sock, id);
                                const nowTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                                sendLog(sock,
                                    `🤖 *اشتباه بوت — عضو جديد*\n` +
                                    `*━━━━━━━━━━━━━━━━━━*\n` +
                                    `*│🏘️ الجروب:* ${meta.subject}\n` +
                                    `*│👤 العضو:* @${pNum}\n` +
                                    `*│🔗 أجهزة مرتبطة:* ${scan.extra}\n` +
                                    `*│⏰ التوقيت:* ${nowTime}\n` +
                                    `*━━━━━━━━━━━━━━━━━━*\n` +
                                    `⚖️ مؤشر احتمالي (قد يكون واتساب ويب/لابتوب).`,
                                    [p]);
                            } catch {}
                        }
                        await new Promise(r => setTimeout(r, 200));
                    }
                })();
            }
            return;
        }

        // Protection: kick attacker when they demote/remove a protected user
        if ((action === 'remove' || action === 'demote') && isVictimProtected) {
            try {
                const meta = await getMeta(sock, id);
                // Kick the attacker
                await sock.groupParticipantsUpdate(id, [author], "remove").catch(() => {});
                // Re-add and re-promote protected victims
                for (const p of pList) {
                    if (isUserProtected(p)) {
                        if (action === 'remove') {
                            await sock.groupParticipantsUpdate(id, [p], "add").catch(() => {});
                        }
                        await sock.groupParticipantsUpdate(id, [p], "promote").catch(() => {});
                    }
                }
                const victimNums = pList.map(p => '@' + numOf(p)).join(', ');
                const actionAr = action === 'demote' ? 'سحب إشراف' : 'طرد';
                sendLog(sock, `⚠️ *محاولة ${actionAr} محمي*\n\n*الجروب:* ${meta.subject}\n*الفاعل:* @${authorNum}\n*المستهدف:* ${victimNums}\n*الإجراء:* تم طرد الفاعل وإرجاع ${action === 'remove' ? 'المطرود' : 'الإشراف'}`, [author, ...pList]);
            } catch (e) {}
            return;
        }

        // Unauthorized promotion in protected groups
        const authorAllowed = isAuthorProtected || SUPER_OWNERS.includes(authorNum) || isAuth(authorNum);
        if (action === 'promote' && currentProtectedGroups.includes(id) && !authorAllowed) {
            try {
                const meta = await getMeta(sock, id);
                // Demote the newly promoted
                for (const p of pList) {
                    await sock.groupParticipantsUpdate(id, [p], "demote").catch(() => {});
                }
                // Demote the unauthorized author
                await sock.groupParticipantsUpdate(id, [author], "demote").catch(() => {});
                const nowTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                const promotedNums = pList.map(p => '@' + numOf(p)).join(', ');
                sendLog(sock,
                    `🚨 *منح إشراف غير مصرّح*\n` +
                    `*━━━━━━━━━━━━━━━━━━*\n` +
                    `*│🏘️ الجروب:* ${meta.subject}\n` +
                    `*│🔨 الفاعل:* @${authorNum}\n` +
                    `*│👤 من رُقّي:* ${promotedNums}\n` +
                    `*│⚡ الإجراء:* سُحب إشراف الفاعل والمُرقّى\n` +
                    `*│⏰ التوقيت:* ${nowTime}\n` +
                    `*━━━━━━━━━━━━━━━━━━*`,
                    [author, ...pList]);
            } catch (e) {}
            return;
        }

        // Authorized promotion — check if promoted user is a bot
        if (action === 'promote' && currentProtectedGroups.includes(id)) {
            (async () => {
                for (const p of pList) {
                    const pNum = numOf(p);
                    if (isUserProtected(p)) continue;
                    if (SUPER_OWNERS.includes(pNum)) continue;
                    if (pNum === numOf(sock.user.id)) continue;
                    const scan = await scanDevices(sock, p);
                    if (scan && scan.extra >= 1) {
                        try {
                            await sock.groupParticipantsUpdate(id, [p], "demote").catch(() => {});
                            const meta = await getMeta(sock, id);
                            const nowTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                            sendLog(sock,
                                `🤖 *سحب إشراف بوت*\n` +
                                `*━━━━━━━━━━━━━━━━━━*\n` +
                                `*│🏘️ الجروب:* ${meta.subject}\n` +
                                `*│👤 المشرف:* @${pNum}\n` +
                                `*│🔗 أجهزة مرتبطة:* ${scan.extra}\n` +
                                `*│⚡ الإجراء:* سُحب الإشراف تلقائياً\n` +
                                `*│⏰ التوقيت:* ${nowTime}\n` +
                                `*━━━━━━━━━━━━━━━━━━*\n` +
                                `⚖️ مؤشر احتمالي (قد يكون ويب/لابتوب).`,
                                [p]);
                        } catch {}
                    }
                    await new Promise(r => setTimeout(r, 200));
                }
            })();
        }

        // Monitoring: log promote/demote/remove in monitored groups (per participant)
        if (currentMonitoredGroups.includes(id) && (action === 'promote' || action === 'demote' || action === 'remove') && authorNum !== botId) {
            try {
                const meta = await getMeta(sock, id);
                const actionAr2 = action === 'promote' ? '🟢 منح إشراف' : action === 'demote' ? '🔴 سحب إشراف' : '🚫 طرد';
                const nowTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                for (const p of pList) {
                    const logTxt = [
                        `*📋 تقرير مراقبة*`,
                        `*━━━━━━━━━━━━━━━━━━*`,
                        `*│🏘️ الجروب:* ${meta.subject}`,
                        `*│⚡ الحدث:* ${actionAr2}`,
                        `*│🔨 الفاعل:* @${authorNum}`,
                        `*│👤 المستهدف:* @${numOf(p)}`,
                        `*│⏰ التوقيت:* ${nowTime}`,
                        `*━━━━━━━━━━━━━━━━━━*`,
                    ].join('\n');
                    sendLog(sock, logTxt, [author, p]);
                }
            } catch (e) {}
        }
    });

    // ============================================================
    //   Credentials update handler
    // ============================================================
    sock.ev.on('creds.update', saveCreds);

    // ============================================================
    //   Message handling (delegated to handler.js)
    // ============================================================
    const { createHandler, msgCache: handlerMsgCache } = require('./handler');
    createHandler(sock, bootTime, () => isReady);

    // Deleted message detection
    sock.ev.on("messages.update", async (updates) => {
        if (!isReady) return;
        for (const update of updates) {
            try {
                const proto = update.update?.message?.protocolMessage;
                if (!proto || proto.type !== 0) continue;
                const chatId = update.key.remoteJid;
                if (!chatId?.endsWith('@g.us')) continue;
                const monGroups = getDb('monitored');
                if (!monGroups.includes(chatId)) continue;
                const deleterJid = update.key.participant || chatId;
                const deleterNum = numOf(deleterJid);
                const deletedId = proto.key?.id;
                const cached = deletedId ? handlerMsgCache[deletedId] : null;
                try {
                    const meta = await getMeta(sock, chatId);
                    const nowStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                    const originalSender = cached?.senderNum || '؟';
                    const isSelfdel = deleterNum === originalSender;
                    const delType = isSelfdel ? '🗑️ حذف ذاتي' : '🚨 حذف من مشرف';
                    const msgText = cached?.text || '[محتوى غير محفوظ]';
                    const logTxt = [
                        `${delType}`,
                        `*━━━━━━━━━━━━━━━━━━*`,
                        `*│🏘️ الجروب:* ${meta.subject}`,
                        `*│✍️ المُرسل الأصلي:* @${originalSender}`,
                        `*│🗑️ الحاذف:* @${deleterNum}`,
                        `*│💬 الرسالة:* ${msgText}`,
                        `*│⏰ التوقيت:* ${nowStr}`,
                        `*━━━━━━━━━━━━━━━━━━*`,
                    ].join('\n');
                    const mentions = [deleterJid];
                    if (cached?.senderJid && cached.senderJid !== deleterJid) mentions.push(cached.senderJid);
                    sendLog(sock, logTxt, mentions);
                } catch {}
                if (deletedId) delete handlerMsgCache[deletedId];
            } catch (e) { }
        }
    });

    // ============================================================
    //   Start monitoring intervals
    // ============================================================
    startDailyPointsReset();
    startNewMemberWatch();
    startPeriodicGroupScan();
}

module.exports = {
    startBot,
    newMemberWatch,
    watchedMembers,
    checkMemberForBot,
};
