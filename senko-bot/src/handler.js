'use strict';

const fs = require('fs');
const { downloadMediaMessage } = require('@itsliaaa/baileys');

// ============================================================
//   Imports from project modules
// ============================================================
const {
    FILES,
    SUPER_OWNERS, SUPER_OWNER, OWNERS, BOT_LID, BOT_NUM,
    SNAPSHOTS_DIR, ANIME_CHARS, VALID_CATEGORIES, COMMAND_CATEGORIES,
    _pinSent, checkRateLimit, getCommandCategory,
} = require('./config');

const {
    save, getDb,
    adminsDb, aliasesDb, mutedDb, emojiDb, sessionsDb,
    pointsDb, banDb, warnsDb, bannedWordsDb, disabledDb,
    linkProtectDb, badWordsProtectDb, proBadWords, proWarnsDb,
    protectedGroups, monitoredGroups, logDb, bankGroups, config,
} = require('./database');

const {
    numOf, resolveId, isLidJid, isBotJid,
    isProtectedParticipant, getRank, isAuth, isUserProtected,
    formatTime, getMeta, invalidateMeta, getPoints, addPoints,
    httpsGet, changeGroupPic,
    sendLog, RAID_MSG, RAID_DESC, randChar, trackBotMsg,
    cropSquare
} = require('./helpers');

const { makeSticker, processStickerBatch } = require('./sticker');
const { safeExecute, wrapHandler, wrapCommandsObj } = require('./anti-crash');
const { wrapSockWithStealth, simulateReadReceipt } = require('./stealth');

// ============================================================
//   Command modules (wrapped with anti-crash)
// ============================================================
const menuCommands = { handle: wrapHandler(require('./commands/menu').handle, 'menu') };
const adminCommands = { handle: wrapHandler(require('./commands/admin').handle, 'admin') };
const groupCommands = { handle: wrapHandler(require('./commands/group').handle, 'group') };
const eliteCommands = { handle: wrapHandler(require('./commands/elite').handle, 'elite') };
const pointsCommands = { handle: wrapHandler(require('./commands/points').handle, 'points') };
const _gamesModule = require('./commands/games');
const gameCommands = wrapCommandsObj(_gamesModule.commands, 'games');
const handleXOMove = _gamesModule.handleXOMove;
const raidCommands = wrapCommandsObj(require('./commands/raid').commands, 'raid');
const mediaCommands = wrapCommandsObj(require('./commands/media').commands, 'media');
const cleverCommands = wrapCommandsObj(require('./commands/clever').commands, 'clever');
const settingsCommands = wrapCommandsObj(require('./commands/settings').commands, 'settings');
const _searchModule = require('./commands/search');
const searchCommands = wrapCommandsObj(_searchModule.commands, 'search');
const handlePenAnimeReply = _searchModule.handlePenAnimeReply;
const handlePenRetry = _searchModule.handlePenRetry;
const proCommands = wrapCommandsObj(require('./commands/pro').commands, 'pro');
const funCommands = { handle: wrapHandler(require('./commands/fun').handle, 'fun') };
const servicesCommands = { handle: wrapHandler(require('./commands/services').handle, 'services') };

// ============================================================
//   Shared state
// ============================================================
const msgCache = {};

const _botStoppedFile = './bot_stopped.json';
let botStopped = (() => {
    try {
        if (fs.existsSync(_botStoppedFile)) {
            const d = JSON.parse(fs.readFileSync(_botStoppedFile, 'utf8'));
            return d.stopped === true;
        }
    } catch {}
    return false;
})();

const getBotStopped = () => botStopped;
const setBotStopped = (val) => {
    botStopped = val;
    try { fs.writeFileSync(_botStoppedFile, JSON.stringify({ stopped: val })); } catch {}
};

// ============================================================
//   Main handler
// ============================================================
function createHandler(sock, bootTime, isReady) {
    // Periodic cleanup to prevent memory leaks
    setInterval(() => {
        const now = Date.now();
        // Clean sticker sessions older than 5 minutes
        if (global._stickerSession) {
            for (const [k, v] of Object.entries(global._stickerSession)) {
                if (now - (v.ts || 0) > 300000) delete global._stickerSession[k];
            }
        }
        // Clean currency sessions older than 2 minutes
        if (global._currencySession) {
            for (const [k, v] of Object.entries(global._currencySession)) {
                if (now - (v.ts || 0) > 120000) delete global._currencySession[k];
            }
        }
        // Clean wheel sessions older than 2 minutes
        if (global._wheelSession) {
            for (const [k, v] of Object.entries(global._wheelSession)) {
                if (now - (v.ts || 0) > 120000) delete global._wheelSession[k];
            }
        }
        // Clean msgCache if over 1000 entries
        const cacheKeys = Object.keys(msgCache);
        if (cacheKeys.length > 1000) {
            cacheKeys.slice(0, cacheKeys.length - 500).forEach(k => delete msgCache[k]);
        }
    }, 120000);

    // Anti-ban stealth: wrap sendMessage with human-like delays
    wrapSockWithStealth(sock);

    // Track bot messages for .مسح
    const _stealthSend = sock.sendMessage.bind(sock);
    sock.sendMessage = async (...args) => {
        const result = await _stealthSend(...args);
        if (result?.key?.id && args[0]) {
            trackBotMsg(args[0], result.key.id);
        }
        return result;
    };

    sock.ev.on("messages.upsert", async ({ messages }) => {
        for (const msg of messages) {
        try {
            if (!msg?.message) continue;
            if (msg.messageTimestamp < bootTime) continue;
            if (!isReady()) continue;

            // fحص إيقاف البوت (أمر E.)
            const _rawTextCheck = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
            const _senderCheck = resolveId(msg.key.participant || msg.key.remoteJid);
            if (botStopped) {
                const _rawCheck = numOf(msg.key.participant || msg.key.remoteJid);
                const _isSuperCheck = SUPER_OWNERS.includes(_senderCheck) ||
                    SUPER_OWNERS.includes((msg.key.participant || '').split('@')[0].split(':')[0]) ||
                    SUPER_OWNERS.includes(_rawCheck);
                const _isNukhbaCheck = adminsDb[_senderCheck] === 'نخبة' || adminsDb[_rawCheck] === 'نخبة' ||
                    adminsDb[_senderCheck] === 'مطور' || adminsDb[_rawCheck] === 'مطور';
                if (!_isSuperCheck && !_isNukhbaCheck) continue;
            }
            if (logDb.groupId && msg.key.remoteJid === logDb.groupId) continue;

            const chatId = msg.key.remoteJid;
            const isGroup = chatId.endsWith('@g.us');
            const senderJid = isGroup
                ? (msg.key.participant || '')
                : msg.key.remoteJid;
            if (isGroup && !senderJid) continue;
            const senderNum = resolveId(senderJid);
            // دالة حذف الرسالة بشكل صحيح
            const deleteMsg = () => sock.sendMessage(chatId, {
                delete: {
                    remoteJid: chatId,
                    id: msg.key.id,
                    participant: senderJid,
                    fromMe: false
                }
            }).catch(() => {});

            if (isGroup) {
                const mc = msg.message;
                const msgTxt = mc?.conversation || mc?.extendedTextMessage?.text ||
                    (mc?.imageMessage ? "[صورة]" : mc?.stickerMessage ? "[ملصق]" : "[وسائط]");
                msgCache[msg.key.id] = { text: msgTxt, senderNum, senderJid, chatId };
                const keys = Object.keys(msgCache);
                if (keys.length > 500) delete msgCache[keys[0]];
            }

            // فحص المالك بكل الأشكال الممكنة
            const rawSenderNum = numOf(senderJid);
            const isOwner = OWNERS.includes(senderNum) || OWNERS.includes(rawSenderNum) ||
                            OWNERS.includes(senderJid.split('@')[0]) ||
                            adminsDb[senderNum] === "مطور" || adminsDb[rawSenderNum] === "مطور";
            const isSuperOwner = SUPER_OWNERS.includes(rawSenderNum) || SUPER_OWNERS.includes(senderNum) ||
                                  SUPER_OWNERS.includes(rawSenderNum) || SUPER_OWNERS.includes(senderNum);
            const rank = getRank(senderNum);
            const isNukhba = rank === "نخبة";
            const hasAuth = isOwner || !!adminsDb[senderNum] || !!adminsDb[rawSenderNum];
            const botId = numOf(sock.user.id);
            const ts = Math.floor(Date.now() / 1000);

            const msgContent = msg.message;

            // ===== حذف رسائل جهات الاتصال وطرد المرسل =====
            const isContactMsg = !!(msgContent.contactMessage || msgContent.contactsArrayMessage);
            if (isContactMsg && !msg.key.fromMe && chatId.endsWith('@g.us')) {
                try {
                    await sock.sendMessage(chatId, { delete: msg.key });
                } catch {}
                if (!isUserProtected(senderJid) && !isAuth(numOf(senderJid))) {
                    try {
                        await sock.groupParticipantsUpdate(chatId, [senderJid], 'remove');
                    } catch {}
                    const senderName = msg.pushName || numOf(senderJid);
                    const logTxt = `⚠️ *حذف جهة اتصال وطرد*

👤 المرسل: @${numOf(senderJid)}
📛 الاسم: ${senderName}
🚫 السبب: إرسال جهات اتصال
🕐 الوقت: ${new Date().toLocaleTimeString('ar')}`;
                    await sendLog(sock, logTxt, [senderJid]);
                }
                return;
            }

            const text = (
                msgContent.conversation ||
                msgContent.extendedTextMessage?.text ||
                msgContent.imageMessage?.caption ||
                msgContent.videoMessage?.caption || ""
            ).trim();

            const quoted = msgContent.extendedTextMessage?.contextInfo;
            let target = quoted?.participant ? quoted.participant : null;
            if (!target && msgContent.extendedTextMessage?.contextInfo?.mentionedJid?.[0])
                target = msgContent.extendedTextMessage.contextInfo.mentionedJid[0];

            const parts = text.split(' ');
            let command = parts[0].toLowerCase();

            // فلتر الصلاحيات: في الجروب فقط النخبة والمطورون يستخدمون الأوامر
            const _senderRaw = numOf(senderJid);
            const _isAllowed = isSuperOwner || isOwner || isNukhba ||
                               SUPER_OWNERS.includes(_senderRaw) ||
                               adminsDb[_senderRaw] === 'نخبة' || adminsDb[_senderRaw] === 'مطور' || adminsDb[_senderRaw] === 'محمي';
            if (isGroup && command.startsWith('.') && !_isAllowed) return;

            // Rate Limiting
            if (!isSuperOwner && text.startsWith('.')) {
                if (!checkRateLimit(senderNum)) return;
            }
            const rawCmd = parts[0];
            // دعم أوامر من كلمتين
            const twoWordCmds = ['.رفع نخبة', '.رفع مطور', '.رفع حظر', '.رفع اشراف'];
            let args = parts.slice(1).join(' ').trim();
            if (args.length > 500) args = args.slice(0, 500);
            for (const tc of twoWordCmds) {
                if (text.toLowerCase().startsWith(tc)) {
                    command = tc;
                    args = text.slice(tc.length).trim();
                    break;
                }
            }

            // نظام aliases
            for (const [oldCmd, newCmd] of Object.entries(aliasesDb)) {
                if (aliasesDb['__pending__'] && oldCmd === '__pending__') continue;
                if (command === newCmd) { command = oldCmd; break; }
                if (command === oldCmd) { command = '__disabled__'; break; }
            }
            if (command === '__disabled__') return;

            // نظام التحجير
            if (command.startsWith('.') && !isSuperOwner) {
                const cmdCategory = getCommandCategory(command);
                const isCmdDisabled = disabledDb.commands.includes(command);
                const isCatDisabled = cmdCategory && disabledDb.categories.includes(cmdCategory);
                if (isCmdDisabled || isCatDisabled) return;
            }

            // Build shared context object for command handlers
            const ctx = {
                sock, msg, chatId, isGroup, senderJid, senderNum,
                rawSenderNum, isOwner, isSuperOwner, isNukhba, hasAuth,
                rank, botId, ts, text, quoted, target, command, args,
                rawCmd, msgContent, deleteMsg, msgCache,
                botStopped, setBotStopped, getBotStopped,
                downloadMediaMessage
            };

            // ===== .سينكو raid command =====
            if (command === '.سينكو' && isGroup && isOwner) {
                if (raidCommands['.سينكو']) {
                    await raidCommands['.سينكو'](sock, msg, args, ctx);
                }
                return;
            }

            // ===== Mute check =====
            const muteKey = `${chatId}:${senderNum}`;
            const muteKeyRaw = `${chatId}:${numOf(senderJid)}`;
            if (mutedDb[muteKey] || mutedDb[muteKeyRaw]) {
                sock.sendMessage(chatId, {
                    delete: { remoteJid: chatId, id: msg.key.id, participant: msg.key.participant, fromMe: false }
                }).catch(() => {
                    sock.sendMessage(chatId, { delete: msg.key }).catch(() => {});
                });
                return;
            }

            // ====== Sticker session handler ======
            if (isGroup && global._stickerSession) {
                const ssk = `sticker:${chatId}:${senderNum}`;
                const ss  = global._stickerSession[ssk];
                if (ss && Date.now() - ss.ts < 300000) {
                    if (ss.phase === 'waiting_meta') {
                        if (text.trim() === '.إلغاء') {
                            delete global._stickerSession[ssk];
                            return sock.sendMessage(chatId, { text: "❌ إلغاء." });
                        }
                        const _wParts  = text.trim() === ".تخطي" ? [] : text.split('|').map(s => s.trim()).filter(Boolean);
                        const packName      = _wParts[0] || 'SENKO Pack';
                        const packPublisher = _wParts[1] || ss.senderName || 'SENKO';
                        ss.phase         = 'converting';
                        ss.packPublisher = packPublisher;
                        ss.packName      = packName;
                        ss.ts            = Date.now();
                        ss.timer = setTimeout(() => processStickerBatch(ssk, chatId, sock), 10000);
                        await sock.sendMessage(chatId, {
                            text: `✅ *الحزمة:* ${packName}\n📸 أرسل باقي الصور — يبدأ التحويل بعد 4 ثوان\nأو *.انهاء* فوراً`
                        });
                        return;
                    }
                    if (ss.phase === 'converting') {
                        if (text.trim() === '.انهاء') {
                            clearTimeout(ss.timer);
                            await processStickerBatch(ssk, chatId, sock);
                            return;
                        }
                        if (msgContent.imageMessage) {
                            ss.pendingMsgs = ss.pendingMsgs || [];
                            ss.pendingMsgs.push(msg);
                            ss.ts = Date.now();
                            clearTimeout(ss.timer);
                            ss.timer = setTimeout(() => processStickerBatch(ssk, chatId, sock), 10000);
                            if (ss.pendingMsgs.length % 5 === 0)
                                await sock.sendMessage(chatId, { text: `📸 ${ss.pendingMsgs.length} صورة في الانتظار...` });
                            return;
                        }
                    }
                }
            }

            // ============================================================
            //   Non-command processing
            // ============================================================
            if (!text.startsWith(".")) {
                // Link protection (3-strike)
                if (isGroup && linkProtectDb[chatId] && !isOwner && !isNukhba && !isBotJid(senderJid)) {
                    const fullText = (text
                        + ' ' + (msgContent.imageMessage?.caption || '')
                        + ' ' + (msgContent.videoMessage?.caption || '')).trim();
                    const urlRegex = /(https?:\/\/|chat\.whatsapp\.com|wa\.me|bit\.ly|t\.me|www\.|youtu\.be)[^\s]*/i;
                    if (urlRegex.test(fullText)) {
                        await deleteMsg();
                        const pwk = `link:${chatId}:${senderNum}`;
                        proWarnsDb[pwk] = (proWarnsDb[pwk] || 0) + 1;
                        const pwCnt = proWarnsDb[pwk];
                        save(FILES.PRO_WARNS, proWarnsDb);
                        if (pwCnt >= 3) {
                            await sock.groupParticipantsUpdate(chatId, [senderJid], 'remove').catch(() => {});
                            delete proWarnsDb[pwk];
                            save(FILES.PRO_WARNS, proWarnsDb);
                            await sock.sendMessage(chatId, { text: `🚫 تم طرد @${senderNum} بسبب إرسال روابط (3 تحذيرات).`, mentions: [senderJid] });
                        } else {
                            await sock.sendMessage(chatId, { text: `⚠️ @${senderNum} *تحذير ${pwCnt}/3*\nممنوع إرسال الروابط في هذه المجموعة!`, mentions: [senderJid] });
                        }
                        return;
                    }
                }

                // Bad words filter (3-strike)
                if (isGroup && badWordsProtectDb[chatId] && !isOwner && !isNukhba && !isBotJid(senderJid)) {
                    const fullTxt = (text
                        + ' ' + (msgContent.imageMessage?.caption || '')
                        + ' ' + (msgContent.videoMessage?.caption || '')).toLowerCase();
                    const foundBad = proBadWords.find(w => fullTxt.includes(w.toLowerCase()));
                    if (foundBad) {
                        await deleteMsg();
                        const bwk = `bad:${chatId}:${senderNum}`;
                        proWarnsDb[bwk] = (proWarnsDb[bwk] || 0) + 1;
                        const bwCnt = proWarnsDb[bwk];
                        save(FILES.PRO_WARNS, proWarnsDb);
                        if (bwCnt >= 3) {
                            await sock.groupParticipantsUpdate(chatId, [senderJid], 'remove').catch(() => {});
                            delete proWarnsDb[bwk];
                            save(FILES.PRO_WARNS, proWarnsDb);
                            await sock.sendMessage(chatId, { text: `🚫 تم طرد @${senderNum} بسبب ألفاظ بذيئة (3 تحذيرات).`, mentions: [senderJid] });
                        } else {
                            await sock.sendMessage(chatId, { text: `⚠️ @${senderNum} *تحذير ${bwCnt}/3*\nالألفاظ البذيئة غير مسموح بها!`, mentions: [senderJid] });
                        }
                        return;
                    }
                }

                // Banned words per group — instant kick
                if (isGroup && !isBotJid(senderJid) && !isOwner && !isSuperOwner && !isUserProtected(senderJid) && text) {
                    const groupWords = bannedWordsDb[chatId] || [];
                    const lowerText = text.toLowerCase();
                    const found = groupWords.find(w => lowerText.includes(w.toLowerCase()));
                    if (found) {
                        await deleteMsg();
                        await sock.groupParticipantsUpdate(chatId, [senderJid], 'remove').catch(() => {});
                        await sock.sendMessage(chatId, { text: `🚫 تم طرد @${senderNum} بسبب كلمة محظورة.`, mentions: [senderJid] });
                        return;
                    }
                }

                // Emoji react
                if (emojiDb.active && isGroup && !msg.key.fromMe) {
                    const emojiOnly = [...text].every(c => {
                        const cp = c.codePointAt(0);
                        return (cp >= 0x1F300 && cp <= 0x1FAFF) || (cp >= 0x2600 && cp <= 0x27BF) ||
                            (cp >= 0x1F1E0 && cp <= 0x1F1FF) || (cp >= 0xFE00 && cp <= 0xFE0F) ||
                            c === '‍' || c === '️';
                    });
                    if (text.length > 0 && emojiOnly) {
                        setTimeout(() => {
                            sock.sendMessage(chatId, { react: { text: [...text][0], key: msg.key } }).catch(() => { });
                        }, 1000 + Math.floor(Math.random() * 1000));
                    }
                }

                // Game answer handling
                if (sessionsDb[chatId]?.active) {
                    const session = sessionsDb[chatId];
                    const normalize = s => s.trim()
                        .replace(/أ|إ|آ/g,'ا')
                        .replace(/ة/g,'ه')
                        .replace(/ى/g,'ي')
                        .replace(/\s+/g,'')
                        .toLowerCase();

                    const scoreKey = senderNum;
                    const isBot = isBotJid(senderJid);

                    // كتابة مستمرة
                    if (session.type === 'writing_continuous' && !msg.key.fromMe && !isBot && !session.answered) {
                        if (normalize(text) === normalize(session.answer || '')) {
                            session.answered = true;
                            if (!session.scores[scoreKey]) session.scores[scoreKey] = 0;
                            session.scores[scoreKey]++;
                            save(FILES.SESSIONS, sessionsDb);
                            await sock.sendMessage(chatId, { text: `✅ @${scoreKey} +1`, mentions: [senderJid] });
                            const _gName = (await sock.groupMetadata(chatId).catch(() => null))?.subject || chatId;
                            const _logTxt = `✏️ *كتابة* | ${_gName}\n@${scoreKey} أجاب صح ← *+1* نقطة\n(الجولة ${session.round})`;
                            if (logDb.groupId) { await sock.sendMessage(logDb.groupId, { text: _logTxt, mentions: [senderJid] }).catch(() => {}); }
                            else { await sock.sendMessage(SUPER_OWNER + '@s.whatsapp.net', { text: _logTxt }).catch(() => {}); }
                        }
                    }

                    // تفكيك مستمر
                    if (session.type === 'dismantling' && !msg.key.fromMe && !isBot && !session.answered) {
                        const dismantledAnswer = [...(session.answer || '')].join(' ');
                        const normDis = s => s.trim().replace(/\s+/g, ' ')
                            .replace(/أ|إ|آ/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').toLowerCase();
                        if (normDis(text) === normDis(dismantledAnswer)) {
                            session.answered = true;
                            if (!session.scores[scoreKey]) session.scores[scoreKey] = 0;
                            session.scores[scoreKey]++;
                            save(FILES.SESSIONS, sessionsDb);
                            await sock.sendMessage(chatId, { text: `✅ @${scoreKey} +1`, mentions: [senderJid] });
                            const _gName2 = (await sock.groupMetadata(chatId).catch(() => null))?.subject || chatId;
                            const _logTxt2 = `🔤 *تفكيك* | ${_gName2}\n@${scoreKey} أجاب صح ← *+1* نقطة\n(الجولة ${session.round})`;
                            if (logDb.groupId) { await sock.sendMessage(logDb.groupId, { text: _logTxt2, mentions: [senderJid] }).catch(() => {}); }
                            else { await sock.sendMessage(SUPER_OWNER + '@s.whatsapp.net', { text: _logTxt2 }).catch(() => {}); }
                        }
                    }

                    // تعداد مستمر
                    if (session.type === 'counting' && !msg.key.fromMe && !isBot && !session.answered) {
                        if (text.trim() === String(session.answer) || parseInt(text.trim()) === parseInt(session.answer)) {
                            session.answered = true;
                            if (!session.scores[scoreKey]) session.scores[scoreKey] = 0;
                            session.scores[scoreKey]++;
                            save(FILES.SESSIONS, sessionsDb);
                            await sock.sendMessage(chatId, { text: `✅ @${scoreKey} +1 (${session.answer})`, mentions: [senderJid] });
                            const _gName3 = (await sock.groupMetadata(chatId).catch(() => null))?.subject || chatId;
                            const _logTxt3 = `🔢 *تعداد* | ${_gName3}\n@${scoreKey} أجاب صح ← *+1* نقطة\n(الجولة ${session.round})`;
                            if (logDb.groupId) { await sock.sendMessage(logDb.groupId, { text: _logTxt3, mentions: [senderJid] }).catch(() => {}); }
                            else { await sock.sendMessage(SUPER_OWNER + '@s.whatsapp.net', { text: _logTxt3 }).catch(() => {}); }
                        }
                    }
                }

                // Guess game
                if (isGroup && sessionsDb[chatId]?.type === 'guess' && !msg.key.fromMe && !isBotJid(senderJid)) {
                    const gs = sessionsDb[chatId];
                    const guess = parseInt(text.trim());
                    if (!isNaN(guess) && guess >= 1 && guess <= 100) {
                        gs.attempts[senderNum] = (gs.attempts[senderNum] || 0) + 1;
                        if (guess === gs.secret) {
                            const attempts = gs.attempts[senderNum];
                            addPoints(chatId, senderNum, 20);
                            delete sessionsDb[chatId];
                            save(FILES.SESSIONS, sessionsDb);
                            await sock.sendMessage(chatId, {
                                text: `🎉 *@${senderNum} خمّن الرقم الصحيح!*\n*━━━━━━━━━━━━━━━━━━*\n🔢 الرقم كان: *${gs.secret}*\n📊 عدد المحاولات: *${attempts}*\n🏆 الجائزة: *20 نقطة*\n*━━━━━━━━━━━━━━━━━━*`,
                                mentions: [senderJid]
                            });
                        } else if (guess < gs.secret) {
                            save(FILES.SESSIONS, sessionsDb);
                            await sock.sendMessage(chatId, { text: `📈 @${senderNum} الرقم أكبر من *${guess}*`, mentions: [senderJid] });
                        } else {
                            save(FILES.SESSIONS, sessionsDb);
                            await sock.sendMessage(chatId, { text: `📉 @${senderNum} الرقم أصغر من *${guess}*`, mentions: [senderJid] });
                        }
                        return;
                    }
                }

                // Currency session
                if (isGroup && global._currencySession) {
                    const currKey = `${chatId}_currency_${senderNum}`;
                    const cs = global._currencySession[currKey];
                    if (cs && Date.now() - cs.ts < 60000) {
                        const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
                        const isReplyToMenu = quotedId === cs.msgId;
                        const choiceNum = parseInt(text.trim());
                        if (choiceNum >= 1 && choiceNum <= 8 && (isReplyToMenu || !quotedId)) {
                            const toMap = { 1:'USD',2:'EUR',3:'SAR',4:'AED',5:'EGP',6:'KWD',7:'TRY',8:'GBP' };
                            const toName = { 'USD':'دولار','EUR':'يورو','SAR':'ريال سعودي','AED':'درهم إماراتي','EGP':'جنيه مصري','KWD':'دينار كويتي','TRY':'ليرة تركية','GBP':'جنيه إسترليني' };
                            const toCurr = toMap[choiceNum];
                            delete global._currencySession[currKey];
                            try {
                                const url = `https://v6.exchangerate-api.com/v6/${config.currencyKey}/pair/${cs.fromCurr}/${toCurr}/${cs.amount}`;
                                const data = await httpsGet(url);
                                if (data.result !== 'success') throw new Error(data['error-type'] || 'فشل التحويل');
                                const converted = data.conversion_result.toFixed(4);
                                const rate      = data.conversion_rate.toFixed(6);
                                const rateRev   = (1 / data.conversion_rate).toFixed(6);
                                await sock.sendMessage(chatId, {
                                    text: `💱 *تحويل العملات*\n*━━━━━━━━━━━━━━━━━━*\n*│💰 المبلغ:* ${cs.amount} ${cs.fromCurr}\n*│🔄 يساوي:* *${converted} ${toCurr}*\n*━━━━━━━━━━━━━━━━━━*\n*│📊 1 ${cs.fromCurr} = ${rate} ${toCurr}*\n*│📊 1 ${toCurr} = ${rateRev} ${cs.fromCurr}*\n*━━━━━━━━━━━━━━━━━━*\n_${toName[toCurr]} | ExchangeRate-API_`
                                });
                            } catch (e) {
                                await sock.sendMessage(chatId, { text: `❌ فشل التحويل: ${e.message}` });
                            }
                            return;
                        }
                    }
                }

                // Remote copy reply handler
                if (global._remoteCopy) {
                    const rcKey = `${chatId}:${senderNum}`;
                    const rc = global._remoteCopy[rcKey];
                    if (rc && Date.now() - rc.ts < 120000) {
                        const quotedId2 = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
                        if (quotedId2 === rc.msgId || !quotedId2) {
                            const snapN = text.trim();
                            if (snapN) {
                                const snapDir = require('path').join(process.cwd(), 'snapshots');
                                if (!require('fs').existsSync(snapDir)) require('fs').mkdirSync(snapDir);
                                require('fs').writeFileSync(snapDir + '/' + snapN + '.json',
                                    JSON.stringify({ name: rc.name, desc: rc.desc, pic: rc.pic, date: new Date().toLocaleString('ar') }, null, 2));
                                delete global._remoteCopy[rcKey];
                                await sock.sendMessage(chatId, { text: `✅ *تم حفظ نسخة "${snapN}"*\n*│📛* ${rc.name}\n*│🖼️* ${rc.pic ? '✅' : '❌'}\n\n💡 استخدم *.لصق ${snapN}* لتطبيقها` });
                                return;
                            }
                        }
                    }
                }

                // Speed select for games
                if (isGroup && sessionsDb[chatId + '_speed_select']) {
                    const sel = sessionsDb[chatId + '_speed_select'];
                    const quotedId = msg.message?.extendedTextMessage?.contextInfo?.stanzaId;
                    const speedMap = { '.1': 1000, '.3': 3000, '.4': 4000, '.5': 5000, '.6': 6000, '.7': 7000 };
                    const isStillFresh = Date.now() - (sel.ts || 0) < 60000;
                    const isValidSpeed = speedMap[text.trim()] !== undefined;
                    const isReplyToBot = quotedId === sel.msgId;
                    if (isValidSpeed && isStillFresh && (isReplyToBot || !quotedId)) {
                        delete sessionsDb[chatId + '_speed_select'];
                        save(FILES.SESSIONS, sessionsDb);
                        const delayMs = speedMap[text.trim()];
                        if (sel.type === 'writing_continuous') {
                            sessionsDb[chatId] = { active: true, type: 'writing_continuous', scores: {}, round: 0, delay: delayMs, answered: false };
                            save(FILES.SESSIONS, sessionsDb);
                            const aT = global._botTimers = global._botTimers || {};
                            const runRound = async () => {
                                if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'writing_continuous') return;
                                const s = sessionsDb[chatId]; const c = randChar(); s.round++; s.answer = c; s.answered = false; save(FILES.SESSIONS, sessionsDb);
                                await sock.sendMessage(chatId, { text: `*كتابة ✏️ ⟦${c}⟧*` });
                                aT[chatId] = setTimeout(async () => { if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'writing_continuous') return; await runRound(); }, s.delay);
                            }; runRound(); return;
                        }
                        if (sel.type === 'counting') {
                            sessionsDb[chatId] = { active: true, type: 'counting', scores: {}, round: 0, delay: delayMs, answered: false };
                            save(FILES.SESSIONS, sessionsDb);
                            const aT = global._botTimers = global._botTimers || {};
                            const runC = async () => {
                                if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'counting') return;
                                const s = sessionsDb[chatId]; const c = randChar(); const cnt = [...c.replace(/\s/g,'')].length.toString();
                                s.round++; s.answer = cnt; s.charName = c; s.answered = false; save(FILES.SESSIONS, sessionsDb);
                                await sock.sendMessage(chatId, { text: `*تعداد ✏️ ⟦${c}⟧*\n*كم عدد الحروف؟*` });
                                aT[chatId] = setTimeout(async () => { if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'counting') return; await runC(); }, s.delay);
                            }; runC(); return;
                        }
                        if (sel.type === 'dismantling') {
                            sessionsDb[chatId] = { active: true, type: 'dismantling', scores: {}, round: 0, delay: delayMs, answered: false };
                            save(FILES.SESSIONS, sessionsDb);
                            const aT = global._botTimers = global._botTimers || {};
                            const runD = async () => {
                                if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'dismantling') return;
                                const s = sessionsDb[chatId]; const c = randChar(); s.round++; s.answer = c; s.answered = false; save(FILES.SESSIONS, sessionsDb);
                                await sock.sendMessage(chatId, { text: `*تفكيك ✏️ ⟦${c}⟧*\n*فككه حرفاً حرفاً بمسافات*` });
                                aT[chatId] = setTimeout(async () => { if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'dismantling') return; await runD(); }, s.delay);
                            }; runD(); return;
                        }
                    }
                }

                // X&O moves (non-command)
                if (sessionsDb[chatId + '_xo']?.active && /^[1-9]$/.test(text.trim())) {
                    const xog = sessionsDb[chatId + '_xo'];
                    const sr = resolveId(senderJid);
                    const p1r = resolveId(xog.p1Jid);
                    const p2r = resolveId(xog.p2Jid);
                    const isP1 = sr === p1r;
                    const isP2 = sr === p2r;
                    if (isP1 || isP2) {
                        if (sr !== resolveId(xog.turnJid)) return;
                        const move = parseInt(text.trim()) - 1;
                        if (xog.board[move] !== null) { await sock.sendMessage(chatId, { text: "⚠️ هذه الخانة محجوزة." }); return; }
                        xog.board[move] = isP1 ? 'X' : 'O';
                        const render = (b) => { const s = b.map((c,i) => c==='X'?'❌':c==='O'?'⭕':['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'][i]); return s[0]+s[1]+s[2]+'\n'+s[3]+s[4]+s[5]+'\n'+s[6]+s[7]+s[8]; };
                        const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
                        const winner = wins.find(([a,b,c]) => xog.board[a] && xog.board[a]===xog.board[b] && xog.board[a]===xog.board[c]);
                        const isDraw = !winner && xog.board.every(c => c !== null);
                        if (winner || isDraw) {
                            delete sessionsDb[chatId + '_xo']; save(FILES.SESSIONS, sessionsDb);
                            if (winner) {
                                const wd = isP1 ? xog.p1 : xog.p2, ld = isP1 ? xog.p2 : xog.p1;
                                const wj = isP1 ? xog.p1Jid : xog.p2Jid, lj = isP1 ? xog.p2Jid : xog.p1Jid;
                                addPoints(chatId, wd, 30);
                                await sock.sendMessage(chatId, { text: `${render(xog.board)}\n\n*❆┃جـوائـز فـعـالـيـه اكـس أوو(𝐌)❌⭕↶*\n\n*❀الـفـائـز ﹝@${wd}﹞*\n*الـجـائـزه﹝30 نقطة﹞*\n\n*❀الـخـاسـر ﹝@${ld}﹞*`, mentions: [wj, lj] });
                            } else { await sock.sendMessage(chatId, { text: render(xog.board) + '\n\n🤝 *تعادل!*' }); }
                            return;
                        }
                        xog.turnJid = isP1 ? xog.p2Jid : xog.p1Jid;
                        const nd = isP1 ? xog.p2 : xog.p1, nj = xog.turnJid, ns = isP1 ? '⭕' : '❌';
                        save(FILES.SESSIONS, sessionsDb);
                        await sock.sendMessage(chatId, { text: `${render(xog.board)}\n\n*دور: @${nd} ${ns}*\n*أرسل رقم الخانة (1-9)*`, mentions: [nj] });
                        return;
                    }
                }

                // .pen anime reply flow
                if (global._penAnime) {
                    const penCtx = { chatId, senderNum, text, command: null };
                    const handled = await handlePenAnimeReply(sock, msg, penCtx);
                    if (handled) return;
                }

                // .pen retry flow
                if (global._penRetry) {
                    const retryCtx = { chatId, senderNum, text, command: null };
                    const handled = await handlePenRetry(sock, msg, retryCtx);
                    if (handled) return;
                }

                return;
            }

            // ============================================================
            //   Command routing
            // ============================================================

            // Simulate reading the message before replying
            simulateReadReceipt(sock, msg);

            // Points commands
            if (['.نقاطي', '.ترتيب', '.متجر', '.استبدال', '.تحويل'].includes(command)) {
                await pointsCommands.handle(ctx);
                return;
            }

            // Game commands (writing, counting, dismantling, stop, guess, xo)
            if (['.كتابة', '.تعداد', '.تفكيك', '.توقف', '.تخمين', '.اكس', '.اكس_توقف'].includes(command)) {
                if (gameCommands[command]) {
                    await gameCommands[command](sock, msg, args, ctx);
                }
                return;
            }

            // Menu commands
            if (['.الاوامر', '.menu', '.admin', '.group', '.raid', '.game', '.points',
                 '.معلومات', '.lid', '.gen', '.serv', '.pro'].includes(command)) {
                await menuCommands.handle(ctx);
                return;
            }

            // Elite commands (including .elite menu)
            if (['.elite', '.c²', '.m', '.c', '.تعديل', 'e.', '.e', 'mc².', '.mc²',
                 '.عرض_نخبة', '.تحجير', '.تحجير_عرض', '.احياء', '.تنظيف'].includes(command)) {
                await eliteCommands.handle(ctx);
                return;
            }
            // Handle pending alias reply
            if (aliasesDb['__pending__'] && quoted?.stanzaId === aliasesDb['__pending__'].msgId && isOwner) {
                const newName = text.trim().toLowerCase();
                if (!newName.startsWith('.')) {
                    await sock.sendMessage(chatId, { text: "❌ الاسم الجديد يجب أن يبدأ بنقطة." });
                    return;
                }
                const oldCmd = aliasesDb['__pending__'].cmd;
                delete aliasesDb['__pending__'];
                aliasesDb[oldCmd] = newName;
                save(FILES.ALIASES, aliasesDb);
                await sock.sendMessage(chatId, { text: `✅ تم تعديل الأمر:\n*${oldCmd}* ← *${newName}*\n\nالأمر القديم لم يعد يعمل.` });
                return;
            }

            // Public commands filter
            const publicCmds = [
                ".menu", ".الاوامر", ".admin", ".group", ".pro", ".raid", ".game", ".points", ".elite", ".gen", ".serv",
                ".نقاطي", ".ترتيب", ".متجر", ".استبدال", ".تحويل",
                ".كتابة", ".تفكيك", ".تعداد", ".توقف", ".اكس", ".اكس_توقف", ".تخمين", ".سجل",
                ".معلومات", ".ارشيف", ".زارشيف",
                ".مطور", ".تحرش", "سينكو", ".غزل", ".شاذ", ".زنجي", ".حب", ".كشف", ".ملصق",
                ".حاسبة", ".طقس", ".ترجمة", ".عملة"
            ];
            if (!hasAuth && !publicCmds.includes(command)) return;

            // Speed select handler (as command)
            if (isGroup && sessionsDb[chatId + '_speed_select']) {
                const sel = sessionsDb[chatId + '_speed_select'];
                const speedMapCmd = { '.1': 1000, '.3': 3000, '.4': 4000, '.5': 5000, '.6': 6000, '.7': 7000 };
                const isStillFresh = Date.now() - (sel.ts || 0) < 60000;
                if (speedMapCmd[command] !== undefined && isStillFresh) {
                    const delayMs = speedMapCmd[command];
                    delete sessionsDb[chatId + '_speed_select'];
                    save(FILES.SESSIONS, sessionsDb);
                    const aT = global._botTimers = global._botTimers || {};
                    const startActivity = async (type) => {
                        sessionsDb[chatId] = { active: true, type, scores: {}, round: 0, delay: delayMs, answered: false };
                        save(FILES.SESSIONS, sessionsDb);
                        if (type === 'writing_continuous') {
                            const run = async () => {
                                if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'writing_continuous') return;
                                const s = sessionsDb[chatId]; const c = randChar(); s.round++; s.answer = c; s.answered = false; save(FILES.SESSIONS, sessionsDb);
                                await sock.sendMessage(chatId, { text: `*كتابة ✏️ ⟦${c}⟧*` });
                                aT[chatId] = setTimeout(async () => { if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'writing_continuous') return; await run(); }, delayMs);
                            }; run();
                        } else if (type === 'counting') {
                            const runC = async () => {
                                if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'counting') return;
                                const s = sessionsDb[chatId]; const c = randChar(); const cnt = [...c.replace(/\s/g,'')].length.toString();
                                s.round++; s.answer = cnt; s.charName = c; s.answered = false; save(FILES.SESSIONS, sessionsDb);
                                await sock.sendMessage(chatId, { text: `*تعداد ✏️ ⟦${c}⟧*\n*كم عدد الحروف؟*` });
                                aT[chatId] = setTimeout(async () => { if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'counting') return; await runC(); }, delayMs);
                            }; runC();
                        } else if (type === 'dismantling') {
                            const runD = async () => {
                                if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'dismantling') return;
                                const s = sessionsDb[chatId]; const c = randChar(); s.round++; s.answer = c; s.answered = false; save(FILES.SESSIONS, sessionsDb);
                                await sock.sendMessage(chatId, { text: `*تفكيك ✏️ ⟦${c}⟧*\n*فككه حرفاً حرفاً بمسافات*` });
                                aT[chatId] = setTimeout(async () => { if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'dismantling') return; await runD(); }, delayMs);
                            }; runD();
                        }
                    };
                    await startActivity(sel.type);
                    return;
                }
            }

            // X&O command moves
            if (sessionsDb[chatId + '_xo']?.active && /^[1-9]$/.test(text.trim())) {
                await handleXOMove(sock, msg, text, chatId, senderJid);
                return;
            }

            // Authority barrier for admin commands
            const ownerOnlyBlocked = [".تحديد"];
            const nukhbaBlocked = [".تغيير", ".صورة_قائمة", ".حظر", ".رفع حظر", ".رفع نخبة", ".رفع مطور", ".خفض"];

            if (!isOwner && ownerOnlyBlocked.includes(command))
                return sock.sendMessage(chatId, { text: "🚫 هذا الأمر للمطور المطلق فقط." });
            if (isNukhba && nukhbaBlocked.includes(command))
                return sock.sendMessage(chatId, { text: "🚫 هذا الأمر غير متاح لرتبة نخبة." });

            // Protect owners from harmful commands
            const ownerHarmful = [".طرد", ".اعفاء", ".خفض", ".اسكت", ".تحذير", ".حظر"];
            if (target && ownerHarmful.includes(command)) {
                const tNum = resolveId(target);
                if (OWNERS.includes(tNum) || OWNERS.includes(numOf(target)))
                    return sock.sendMessage(chatId, { text: `🚫 لا يمكن تنفيذ *${command}* على المطور المطلق.` });
            }

            // Advanced points commands
            if (['.منح', '.سحب', '.عجلة', '.سجل', '.اعادة', '.تحقق'].includes(command)) {
                await pointsCommands.handle(ctx);
                return;
            }

            // Admin commands
            if (['.فتح', '.قفل', '.طرد', '.اشراف', '.اعفاء', '.رابط',
                 '.اسكت', '.تكلم', '.عرض', '.تحذير', '.تحذيرات', '.كلير',
                 '.مسح', '.حظر', '.رفع حظر', '.رفع نخبة', '.رفع مطور', '.رفع اشراف',
                 '.خفض', '.تغيير'].includes(command)) {
                await adminCommands.handle(ctx);
                return;
            }

            // Services commands
            if (['.حاسبة', '.طقس', '.weatherkey', '.currencykey',
                 '.ترجمة', '.عملة', '.صوت', '.سيرش'].includes(command)) {
                await servicesCommands.handle(ctx);
                return;
            }

            // Fun commands
            if (['.مطور', '.تحرش', '.احبك', '.اكرهك', '.زوجني', '.طلاق',
                 '.غزل', '.شاذ', '.زنجي', '.حب', '.كشف',
                 'سينكو', '.سينكو'].includes(command)) {
                await funCommands.handle(ctx);
                return;
            }

            // Raid commands (commands object pattern)
            if (raidCommands[command]) {
                await raidCommands[command](sock, msg, args, ctx);
                return;
            }

            // Group commands
            if (['.ملصق', '.حقوق', '.صورة', '.تغير', '.منشن',
                 '.اسم', '.وصف', '.احصاء', '.ارشيف', '.زارشيف',
                 '.مراقبة', '.ابطال', '.محمي', '.محمين', '.كشف_حماية', '.كاشف',
                 '.حماية', '.الغاء_حماية', '.الغاء_مراقبة', '.الغاء',
                 '.ايموج', '.اخرج', '.قبول', '.رفض',
                 '.نسخ', '.نسخ-save', '.نسخ-عرض', '.لصق', '.حذف-نسخة',
                 '.جهات', '.تست', '.ربط', '.خانة', '.عدل', '.تعدل'].includes(command)) {
                await groupCommands.handle(ctx);
                return;
            }

            // Search commands (commands object pattern)
            if (searchCommands[command]) {
                await searchCommands[command](sock, msg, args, ctx);
                return;
            }

            // Pro commands (commands object pattern)
            if (proCommands[command]) {
                await proCommands[command](sock, msg, args, ctx);
                return;
            }

            // Media commands (commands object pattern)
            if (mediaCommands[command]) {
                await mediaCommands[command](sock, msg, args, ctx);
                return;
            }

            // Clever commands (commands object pattern)
            if (cleverCommands[command]) {
                await cleverCommands[command](sock, msg, args, ctx);
                return;
            }

            // Settings commands (commands object pattern)
            if (settingsCommands[command]) {
                await settingsCommands[command](sock, msg, args, ctx);
                return;
            }

        } catch (e) {
            const { log } = require('./logger');
            log.error(`[Handler] ${e.message}`);
            if (msg?.key?.remoteJid && sock) {
                try {
                    await sock.sendMessage(msg.key.remoteJid, {
                        text: `❌ حدث خطأ أثناء تنفيذ الأمر.\n> ${e.message?.slice(0, 100)}`
                    });
                } catch {}
            }
        }
        }
    });
}

module.exports = { createHandler, getBotStopped, setBotStopped, msgCache };
