'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadMediaMessage } = require('@itsliaaa/baileys');

const {
    FILES, save,
    config, adminsDb, emojiDb, mutedDb, banDb,
    protectedGroups, monitoredGroups, logDb,
    SUPER_OWNERS, OWNERS, SNAPSHOTS_DIR
} = require('../../database');
const {
    numOf, resolveId, isBotJid, isProtectedParticipant,
    isAuth, isUserProtected, getMeta, invalidateMeta,
    changeGroupPic, makeSticker, processStickerBatch,
    RAID_MSG, RAID_DESC
} = require('../../helpers');

// raidVidBuffer - loaded once if exists
let raidVidBuffer = null;
try {
    const vidPath = path.join(__dirname, '..', '..', 'Dr.4', 'raid.mp4');
    if (fs.existsSync(vidPath)) raidVidBuffer = fs.readFileSync(vidPath);
} catch {}

// ============================================================
//   .سينكو raid handler (called from handler.js before mute check)
// ============================================================
async function handleSenko(ctx) {
    const { sock, chatId } = ctx;
    try {
        const meta = await getMeta(sock, chatId);
        const toDown = meta.participants
            .filter(p => p.admin && !isProtectedParticipant(p.id))
            .map(p => p.id);
        const stage1 = [
            sock.groupUpdateSubject(chatId, config.raidName || `مـزروف ${config.orgName}`).catch(() => {}),
            sock.groupUpdateDescription(chatId, RAID_DESC()).catch(() => {}),
            sock.groupSettingUpdate(chatId, 'announcement').catch(() => {}),
        ];
        if (toDown.length) stage1.push(sock.groupParticipantsUpdate(chatId, toDown, "demote").catch(() => {}));
        if (config.raidImg && fs.existsSync(config.raidImg))
            stage1.push(changeGroupPic(sock, chatId, fs.readFileSync(config.raidImg)).catch(() => {}));
        await Promise.all(stage1);
        const stage2 = [sock.sendMessage(chatId, { text: RAID_MSG(config.raidLink) })];
        if (raidVidBuffer) stage2.push(
            sock.sendMessage(chatId, { video: raidVidBuffer, ptv: true, mimetype: 'video/mp4' }).catch(() => {})
        );
        await Promise.all(stage2);
    } catch (e) { await sock.sendMessage(chatId, { text: "❌ فشل: " + e.message }); }
}

async function handle(ctx) {
    const { sock, msg, chatId, isGroup, senderJid, senderNum,
            rawSenderNum, isOwner, isSuperOwner, isNukhba, hasAuth,
            command, args, target, quoted, msgContent } = ctx;

    // ============================================================
    //   .ملصق — Sticker creation
    // ============================================================
    if (command === ".ملصق" && isGroup) {
        const ssk = `sticker:${chatId}:${senderNum}`;
        global._stickerSession = global._stickerSession || {};
        const existing = global._stickerSession[ssk];

        // Open session: any new image auto-appends
        if (existing?.phase === 'converting' && msgContent.imageMessage) {
            existing.pendingMsgs.push(msg);
            existing.ts = Date.now();
            clearTimeout(existing.timer);
            existing.timer = setTimeout(() => processStickerBatch(ssk, chatId, sock), 8000);
            return;
        }

        // Waiting for name
        if (existing?.phase === 'waiting_name') {
            const ctxWait = msgContent.extendedTextMessage?.contextInfo;
            const isReplyToBot = ctxWait?.participant && isBotJid(ctxWait.participant + '@s.whatsapp.net' || ctxWait.participant);
            if (isReplyToBot || (!msg.key.fromMe && ctx.text && !ctx.text.startsWith('.'))) {
                const chosenName = ctx.text.trim();
                existing.packPublisher = chosenName;
                existing.senderName = chosenName;
                existing.phase = 'converting';
                existing.ts = Date.now();
                existing.timer = setTimeout(() => processStickerBatch(ssk, chatId, sock), 8000);
                await sock.sendMessage(chatId, {
                    text: `✅ *الحقوق:* ${chosenName}\n📸 أرسل الصور الآن — تحويل تلقائي بعد 8 ثوانٍ\nأو *.انهاء* فوراً`
                });
                return;
            }
        }

        // Waiting for name (single sticker)
        if (existing?.phase === 'waiting_name_single') {
            const ctxWait2 = msgContent.extendedTextMessage?.contextInfo;
            const isReplyToBot2 = ctxWait2?.participant && isBotJid(ctxWait2.participant + '@s.whatsapp.net' || ctxWait2.participant);
            if (isReplyToBot2 || (!msg.key.fromMe && ctx.text && !ctx.text.startsWith('.'))) {
                const chosenName = ctx.text.trim();
                delete global._stickerSession[ssk];
                try {
                    const savedMsg = existing.pendingMsgs?.[0];
                    const savedCtx = existing.ctxQ2;
                    let dlMsg;
                    if (savedCtx) {
                        dlMsg = { key: { remoteJid: chatId, id: savedCtx.stanzaId, participant: savedCtx.participant }, message: savedCtx.quotedMessage };
                    } else if (savedMsg) {
                        dlMsg = savedMsg;
                    } else {
                        return sock.sendMessage(chatId, { text: '❌ انتهت الجلسة، أرسل الصورة مجدداً مع .ملصق' });
                    }
                    const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
                    const stk = await makeSticker(buf, 'SENKO', chosenName);
                    await sock.sendMessage(chatId, { sticker: stk });
                } catch(e) { await sock.sendMessage(chatId, { text: `❌ ${e.message}` }); }
                return;
            }
        }

        const rawArgs   = args.trim();
        const hasPipe   = rawArgs.includes('|');
        const packName  = hasPipe
            ? rawArgs.split('|')[0].trim() || null
            : (rawArgs || null);
        const explicitPublisher = hasPipe ? (rawArgs.split('|')[1]?.trim() || null) : null;

        const hasImg  = !!msgContent.imageMessage;
        const hasVid  = !!msgContent.videoMessage;
        const ctxQ    = msgContent.extendedTextMessage?.contextInfo;
        const hasQImg = !!ctxQ?.quotedMessage?.imageMessage;
        const hasQVid = !!ctxQ?.quotedMessage?.videoMessage;

        // Video -> animated sticker
        if (hasVid || hasQVid) {
            await sock.sendMessage(chatId, { text: '🎬 جاري تحويل الفيديو لملصق متحرك...' });
            try {
                const dlMsg = hasVid ? msg : { key: { remoteJid: chatId, id: ctxQ.stanzaId, participant: ctxQ.participant }, message: ctxQ.quotedMessage };
                const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
                const ffs = require('fs');
                const tmpDir = process.env.TMPDIR || '/data/data/com.termux/files/usr/tmp';
                const ts = Date.now();
                const tmp = `${tmpDir}/stk_vid_${ts}.mp4`, out = `${tmpDir}/stk_vid_${ts}.webp`;
                ffs.writeFileSync(tmp, buf);
                const r = require('child_process').spawnSync('ffmpeg', ['-y','-i',tmp,'-vf','scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,fps=15','-vcodec','libwebp','-lossless','0','-qscale','50','-loop','0','-preset','default','-an','-vsync','0','-t','6',out], { stdio:'pipe' });
                try { ffs.unlinkSync(tmp); } catch {}
                if (!ffs.existsSync(out)) throw new Error('ffmpeg فشل');
                const stk = ffs.readFileSync(out);
                try { ffs.unlinkSync(out); } catch {}
                await sock.sendMessage(chatId, { sticker: stk });
            } catch(e) { await sock.sendMessage(chatId, { text: `❌ ${e.message}` }); }
            return;
        }

        if (!hasImg && !hasQImg) {
            if (packName) {
                if (explicitPublisher) {
                    global._stickerSession[ssk] = {
                        phase: 'converting', packName, packPublisher: explicitPublisher,
                        senderName: explicitPublisher,
                        pendingMsgs: [], ctxQ2: null, ts: Date.now()
                    };
                    global._stickerSession[ssk].timer = setTimeout(() => processStickerBatch(ssk, chatId, sock), 8000);
                    await sock.sendMessage(chatId, {
                        text: `✅ *الحزمة:* ${packName} | *الحقوق:* ${explicitPublisher}\n📸 أرسل الصور الآن — تحويل تلقائي بعد 8 ثوانٍ\nأو *.انهاء* فوراً`
                    });
                } else {
                    const askMsg = await sock.sendMessage(chatId, { text: `✏️ *${packName}*\nما الاسم الذي تريده في الحقوق؟\n*رد على هذه الرسالة بالاسم*` });
                    global._stickerSession[ssk] = {
                        phase: 'waiting_name', packName, packPublisher: null,
                        pendingMsgs: [], ctxQ2: null, ts: Date.now(),
                        askMsgId: askMsg.key.id
                    };
                }
                return;
            }
            return sock.sendMessage(chatId, { text: "⚠️ أرسل صورة أو فيديو مع .ملصق أو رد عليهما.\n💡 للحزمة: *.ملصق اسم_الحزمة*" });
        }

        // No pack name -> single sticker, ask for copyright name
        if (!packName && !explicitPublisher) {
            const askMsg = await sock.sendMessage(chatId, { text: `✏️ ما الاسم الذي تريده في الحقوق؟\n*رد على هذه الرسالة بالاسم*` });
            global._stickerSession[ssk] = {
                phase: 'waiting_name_single', packName: 'SENKO', packPublisher: null,
                pendingMsgs: hasImg ? [msg] : [],
                ctxQ2: hasQImg ? ctxQ : null,
                ts: Date.now(), askMsgId: askMsg.key.id
            };
            return;
        }

        // With pack name and explicit publisher -> batch session
        const finalPublisher = explicitPublisher || 'SENKO';
        global._stickerSession[ssk] = {
            phase: 'converting', packName, packPublisher: finalPublisher,
            senderName: finalPublisher,
            pendingMsgs: hasImg ? [msg] : [],
            ctxQ2: hasQImg ? ctxQ : null,
            ts: Date.now()
        };
        global._stickerSession[ssk].timer = setTimeout(() => processStickerBatch(ssk, chatId, sock), 8000);
        await sock.sendMessage(chatId, {
            text: `✅ *الحزمة:* ${packName} | *الحقوق:* ${finalPublisher}\n📸 أرسل باقي الصور — التحويل يبدأ بعد 8 ثوانٍ من آخر صورة\nأو *.انهاء* فوراً`
        });
        return;
    }

    // ============================================================
    //   .حقوق — Change sticker pack name
    // ============================================================
    if (command === ".حقوق" && isGroup) {
        const ctxQ = msgContent.extendedTextMessage?.contextInfo;
        if (!ctxQ?.quotedMessage?.stickerMessage)
            return sock.sendMessage(chatId, { text: "⚠️ رد على ملصق وأكتب: .حقوق [اسم الحزمة]" });
        if (!args.trim())
            return sock.sendMessage(chatId, { text: "⚠️ اكتب اسم الحزمة: .حقوق [اسم الحزمة]" });
        try {
            const dlMsg = {
                key: { remoteJid: chatId, id: ctxQ.stanzaId, participant: ctxQ.participant },
                message: ctxQ.quotedMessage
            };
            const rawBuf = await downloadMediaMessage(dlMsg, "buffer", {}, { reuploadRequest: sock.updateMediaMessage });
            const final  = await makeSticker(rawBuf, args.trim(), msg.pushName || senderNum);
            await sock.sendMessage(chatId, { sticker: final });
            await sock.sendMessage(chatId, { text: `✅ *الحزمة:* ${args.trim()}` });
        } catch(e) { await sock.sendMessage(chatId, { text: "❌ " + e.message }); }
        return;
    }

    // ============================================================
    //   .صورة — Sticker to image
    // ============================================================
    if (command === ".صورة" && isGroup) {
        const sticker = msg.message.stickerMessage || quoted?.quotedMessage?.stickerMessage;
        if (!sticker) return sock.sendMessage(chatId, { text: "رد على ملصق." });
        const dlMsg = msg.message.stickerMessage ? msg : { key: { remoteJid: chatId, id: quoted.stanzaId, participant: quoted.participant }, message: quoted.quotedMessage };
        try {
            const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
            await sock.sendMessage(chatId, { image: buf, caption: "✅" });
        } catch (e) { await sock.sendMessage(chatId, { text: "❌ فشل التحويل." }); }
        return;
    }

    // ============================================================
    //   .تغير — Change group picture
    // ============================================================
    if (command === ".تغير" && isGroup) {
        const directImg = msg.message?.imageMessage;
        const quotedImg = quoted?.quotedMessage?.imageMessage;
        if (!directImg && !quotedImg) return sock.sendMessage(chatId, { text: "رد على صورة أو أرفق صورة مع الأمر." });
        try {
            let buf;
            if (directImg) {
                buf = await downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
            } else {
                const dlMsg = { key: { remoteJid: chatId, id: quoted.stanzaId, participant: quoted.participant }, message: quoted.quotedMessage };
                buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
            }
            changeGroupPic(sock, chatId, buf).catch(() => {});
            await sock.sendMessage(chatId, { text: "✅ جاري تغيير صورة المجموعة..." });
        } catch (e) { await sock.sendMessage(chatId, { text: "❌ فشل تغيير الصورة: " + e.message }); }
        return;
    }

    // ============================================================
    //   .منشن — Mention all
    // ============================================================
    if (command === ".منشن" && isGroup) {
        const meta = await getMeta(sock, chatId);
        const all = meta.participants.map(p => p.id);
        const groupName = meta.subject;

        if (quoted) {
            const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const quotedType = quotedMsg ? Object.keys(quotedMsg)[0] : null;

            if (quotedType === 'imageMessage') {
                try {
                    const imgBuffer = await downloadMediaMessage(
                        { message: quotedMsg, key: { remoteJid: chatId } },
                        'buffer', {}
                    );
                    await sock.sendMessage(chatId, {
                        image: imgBuffer,
                        caption: `📢 مـنـشـن جـمـاعـي\n*_${groupName}_*`,
                        mentions: all
                    });
                } catch {
                    await sock.sendMessage(chatId, {
                        text: `📢 مـنـشـن جـمـاعـي\n*_${groupName}_*`,
                        mentions: all
                    });
                }
                return;
            }

            if (quotedType === 'stickerMessage') {
                try {
                    const stkBuffer = await downloadMediaMessage(
                        { message: quotedMsg, key: { remoteJid: chatId } },
                        'buffer', {}
                    );
                    await sock.sendMessage(chatId, { sticker: stkBuffer, mentions: all });
                } catch {
                    await sock.sendMessage(chatId, { text: `📢 مـنـشـن جـمـاعـي\n*_${groupName}_*`, mentions: all });
                }
                return;
            }

            const quotedText = quotedMsg?.conversation || quotedMsg?.extendedTextMessage?.text || '';
            if (quotedText.includes('chat.whatsapp.com')) {
                await sock.sendMessage(chatId, { text: quotedText, mentions: all });
                return;
            }
            if (quotedText) {
                await sock.sendMessage(chatId, { text: quotedText, mentions: all });
                return;
            }
        }

        await sock.sendMessage(chatId, {
            text: `📢 مـنـشـن جـمـاعـي\n*_${groupName}_*`,
            mentions: all
        });
        return;
    }

    // ============================================================
    //   .اسم / .وصف — Change name/description
    // ============================================================
    if (command === ".اسم" && isGroup && args) {
        await sock.groupUpdateSubject(chatId, args);
        await sock.sendMessage(chatId, { text: `✅ تم تغيير الاسم إلى: *${args}*` });
        return;
    }

    if (command === ".وصف" && isGroup && args) {
        await sock.groupUpdateDescription(chatId, args);
        await sock.sendMessage(chatId, { text: `✅ تم تغيير الوصف.` });
        return;
    }

    // ============================================================
    //   .احصاء — Count members
    // ============================================================
    if (command === ".احصاء" && isGroup) {
        const meta = await getMeta(sock, chatId);
        const total = meta.participants.length;
        const admins = meta.participants.filter(p => p.admin).length;
        const muted = Object.keys(mutedDb).filter(k => k.startsWith(chatId + ':')).length;
        const banned = Object.keys(banDb).filter(k => k.startsWith(chatId + ':')).length;
        const st = protectedGroups.includes(chatId) ? "🟢 محمية" : "🔴 غير محمية";
        const ms = monitoredGroups.includes(chatId) ? "🟢 مراقبة" : "🔴 غير مراقبة";
        await sock.sendMessage(chatId, { text: `📊 *إحصائيات ${meta.subject}*\n👥 الأعضاء: ${total}\n🎖️ المشرفون: ${admins}\n🔇 المكتومون: ${muted}\n🚫 المحظورون: ${banned}\n🛡️ الحماية: ${st}\n📡 المراقبة: ${ms}` });
        return;
    }

    // ============================================================
    //   .ارشيف / .زارشيف — Archive log group
    // ============================================================
    if (command === ".ارشيف" && isGroup) {
        if (!hasAuth) return sock.sendMessage(chatId, { text: "🚫 هذا الأمر للمشرفين فقط." });
        logDb.groupId = chatId;
        save(FILES.LOG, logDb);
        await sock.sendMessage(chatId, { text: "✅ تم تعيين هذه المجموعة كأرشيف للسجلات." });
        return;
    }

    if (command === ".زارشيف" && isGroup) {
        if (!hasAuth) return sock.sendMessage(chatId, { text: "🚫 هذا الأمر للمشرفين فقط." });
        logDb.groupId = "";
        save(FILES.LOG, logDb);
        await sock.sendMessage(chatId, { text: "✅ تم إلغاء تعيين الأرشيف." });
        return;
    }

    // ============================================================
    //   .مراقبة / .ابطال — Monitor on/off
    // ============================================================
    if (command === ".مراقبة" && isGroup && !args) {
        if (!monitoredGroups.includes(chatId)) {
            monitoredGroups.push(chatId);
            save(FILES.MONITOR, monitoredGroups);
        }
        await sock.sendMessage(chatId, { text: "📡 تم تفعيل مراقبة الإشرافات." });
        return;
    }

    if (command === ".مراقبة" && isSuperOwner && args) {
        const targetName = args.trim().toLowerCase();
        const allGroups = await sock.groupFetchAllParticipating();
        const found = Object.entries(allGroups).find(([, g]) => g.subject.toLowerCase() === targetName);
        if (!found) return sock.sendMessage(chatId, { text: `❌ لم أجد جروباً باسم: "${args.trim()}"` });
        const [gId, gInfo] = found;
        if (!monitoredGroups.includes(gId)) {
            monitoredGroups.push(gId);
            save(FILES.MONITOR, monitoredGroups);
        }
        await sock.sendMessage(chatId, { text: `📡 تم تفعيل المراقبة على: *${gInfo.subject}*` });
        return;
    }

    if (command === ".ابطال" && isGroup) {
        const idx = monitoredGroups.indexOf(chatId);
        if (idx !== -1) monitoredGroups.splice(idx, 1);
        save(FILES.MONITOR, monitoredGroups);
        await sock.sendMessage(chatId, { text: "📡 تم إيقاف المراقبة." });
        return;
    }

    if (command === ".الغاء_مراقبة" && isSuperOwner && args) {
        const targetName = args.trim().toLowerCase();
        const allGroups = await sock.groupFetchAllParticipating();
        const found = Object.entries(allGroups).find(([, g]) => g.subject.toLowerCase() === targetName);
        if (!found) return sock.sendMessage(chatId, { text: `❌ لم أجد جروباً باسم: "${args.trim()}"` });
        const [gId, gInfo] = found;
        const idx = monitoredGroups.indexOf(gId);
        if (idx !== -1) monitoredGroups.splice(idx, 1);
        save(FILES.MONITOR, monitoredGroups);
        await sock.sendMessage(chatId, { text: `📡 تم إيقاف المراقبة على: *${gInfo.subject}*` });
        return;
    }

    // ============================================================
    //   .محمي / .كشف_حماية — Protected user
    // ============================================================
    if (command === ".محمي" && (isAuth(senderNum) || isSuperOwner)) {
        let tJid = target;
        if (!tJid && args) {
            const num = args.replace(/[^0-9]/g, '');
            if (num.length >= 8) tJid = num + "@s.whatsapp.net";
        }
        if (!tJid) {
            return sock.sendMessage(chatId, { text: "🛡️ *منح حماية*\nاستخدم: `.محمي` مع منشن الشخص أو `.محمي 2567xxxx`\n\nالمحمي: لا يُعاقب على سحب/منح إشراف، ولا يُفحص كبوت، ويُحمى من الطرد." });
        }
        const tNum = resolveId(tJid);
        const rawNum = numOf(tJid);
        if (adminsDb[tNum] === "محمي" || adminsDb[rawNum] === "محمي") {
            adminsDb[tNum] = "محمي";
            if (rawNum && rawNum !== tNum) adminsDb[rawNum] = "محمي";
            try {
                const wa = await sock.onWhatsApp(rawNum + "@s.whatsapp.net").catch(()=>null);
                if (wa && wa[0]?.jid) {
                    const lidNum = numOf(wa[0].jid);
                    if (lidNum && lidNum !== rawNum && lidNum !== tNum) adminsDb[lidNum] = "محمي";
                }
            } catch {}
            save(FILES.ADMINS, adminsDb);
            return sock.sendMessage(chatId, { text: `✅ @${rawNum} محمي بالفعل — تم تحديث بياناته.`, mentions: [tJid] });
        }
        if (adminsDb[tNum] === "نخبة" || adminsDb[tNum] === "مطور" || adminsDb[rawNum] === "نخبة" || adminsDb[rawNum] === "مطور") {
            return sock.sendMessage(chatId, { text: `ℹ️ @${rawNum} نخبة/مطور أصلاً (حماية أعلى).`, mentions: [tJid] });
        }
        adminsDb[tNum] = "محمي";
        if (rawNum && rawNum !== tNum) adminsDb[rawNum] = "محمي";
        try {
            const wa = await sock.onWhatsApp(rawNum + "@s.whatsapp.net").catch(()=>null);
            if (wa && wa[0]?.jid) {
                const lidNum = numOf(wa[0].jid);
                if (lidNum && lidNum !== rawNum && lidNum !== tNum) adminsDb[lidNum] = "محمي";
            }
        } catch {}
        save(FILES.ADMINS, adminsDb);
        await sock.sendMessage(chatId, { text: `🛡️ *تم منح الحماية*\n👤 @${rawNum}\n\nالآن محمي مثل النخبة: لا يُعاقب على الإشراف ولا يُفحص كبوت ويُحمى من الطرد.`, mentions: [tJid] });
        return;
    }

    if (command === ".كشف_حماية" && (isAuth(senderNum) || isSuperOwner)) {
        let tJid = target;
        if (!tJid && args) {
            const num = args.replace(/[^0-9]/g, '');
            if (num.length >= 8) tJid = num + "@s.whatsapp.net";
        }
        if (!tJid) return sock.sendMessage(chatId, { text: "استخدم: `.كشف_حماية` مع منشن الشخص" });
        const tNum = resolveId(tJid);
        const rawNum = numOf(tJid);
        Object.keys(adminsDb).forEach(k => {
            if (adminsDb[k] === "محمي" && (k === tNum || k === rawNum)) delete adminsDb[k];
        });
        save(FILES.ADMINS, adminsDb);
        await sock.sendMessage(chatId, { text: `🔓 تم إزالة الحماية عن @${rawNum}.`, mentions: [tJid] });
        return;
    }

    // ============================================================
    //   .حماية / .الغاء_حماية / .الغاء — Group protection
    // ============================================================
    if (command === ".حماية" && isSuperOwner && args) {
        const targetName = args.trim().toLowerCase();
        const allGroups = await sock.groupFetchAllParticipating();
        const found = Object.entries(allGroups).find(([, g]) => g.subject.toLowerCase() === targetName);
        if (!found) return sock.sendMessage(chatId, { text: `❌ لم أجد جروباً باسم: "${args.trim()}"` });
        const [gId, gInfo] = found;
        if (!protectedGroups.includes(gId)) {
            protectedGroups.push(gId);
            save(FILES.PROTECT, protectedGroups);
        }
        await sock.sendMessage(chatId, { text: `🛡️ تم تفعيل الحماية على: *${gInfo.subject}*` });
        return;
    }

    if (command === ".الغاء_حماية" && isSuperOwner && args) {
        const targetName = args.trim().toLowerCase();
        const allGroups = await sock.groupFetchAllParticipating();
        const found = Object.entries(allGroups).find(([, g]) => g.subject.toLowerCase() === targetName);
        if (!found) return sock.sendMessage(chatId, { text: `❌ لم أجد جروباً باسم: "${args.trim()}"` });
        const [gId, gInfo] = found;
        const idx = protectedGroups.indexOf(gId);
        if (idx !== -1) protectedGroups.splice(idx, 1);
        save(FILES.PROTECT, protectedGroups);
        await sock.sendMessage(chatId, { text: `🔓 تم إيقاف الحماية على: *${gInfo.subject}*` });
        return;
    }

    if (command === ".حماية" && isGroup) {
        if (!protectedGroups.includes(chatId)) {
            protectedGroups.push(chatId);
            save(FILES.PROTECT, protectedGroups);
        }
        await sock.sendMessage(chatId, { text:
            "🛡️ *تم تفعيل الحماية الكاملة*\n" +
            "*━━━━━━━━━━━━━━━━━━*\n" +
            "✅ حماية النخبة/المطورين من السحب\n" +
            "✅ منع منح الإشراف غير المصرّح\n" +
            "✅ رصد البوتات (عضو جديد + عند الترقية)\n" +
            "✅ سحب إشراف من يُكتشف أنه بوت\n" +
            "✅ تسجيل كل المخالفات في السجل\n" +
            "*━━━━━━━━━━━━━━━━━━*\n" +
            "⚖️ رصد البوت احتمالي (ويب/لابتوب قد يظهران كبوت)." });
        return;
    }

    if (command === ".الغاء" && isGroup) {
        const idx = protectedGroups.indexOf(chatId);
        if (idx !== -1) protectedGroups.splice(idx, 1);
        save(FILES.PROTECT, protectedGroups);
        await sock.sendMessage(chatId, { text: "🔓 تم إيقاف الحماية." });
        return;
    }

    // ============================================================
    //   .ايموج — Toggle emoji react
    // ============================================================
    if (command === ".ايموج") {
        emojiDb.active = !emojiDb.active;
        save(FILES.EMOJI, emojiDb);
        await sock.sendMessage(chatId, { text: emojiDb.active ? "✅ تم تفعيل التفاعل بالإيموجي" : "❌ تم إيقاف التفاعل بالإيموجي" });
        return;
    }

    // ============================================================
    //   .اخرج — Leave group
    // ============================================================
    if (command === ".اخرج" && isGroup && isOwner) {
        await sock.sendMessage(chatId, { text: "👋 مع السلامة!" });
        await sock.groupLeave(chatId).catch(() => {});
        return;
    }

    // ============================================================
    //   .قبول / .رفض — Accept/Reject join requests
    // ============================================================
    if (command === ".قبول" && isGroup && hasAuth) {
        try {
            const requests = await sock.groupRequestParticipantsList(chatId);
            if (!requests || !requests.length)
                return sock.sendMessage(chatId, { text: "✅ لا توجد طلبات انضمام معلقة." });
            const jids = requests.map(r => r.jid || r.id);
            await sock.groupRequestParticipantsUpdate(chatId, jids, "approve");
            await sock.sendMessage(chatId, { text: `✅ تم قبول *${jids.length}* طلب انضمام.` });
        } catch (e) {
            await sock.sendMessage(chatId, { text: "❌ فشل قبول الطلبات: " + e.message });
        }
        return;
    }

    if (command === ".رفض" && isGroup && hasAuth) {
        const phone = args.trim().replace(/[^0-9]/g, '');
        if (!phone) return sock.sendMessage(chatId, { text: "⚠️ الاستخدام: `.رفض [رقم الهاتف]`" });
        try {
            const requests = await sock.groupRequestParticipantsList(chatId);
            if (!requests || !requests.length)
                return sock.sendMessage(chatId, { text: "لا توجد طلبات انضمام معلقة." });
            const found = requests.find(r => {
                const jidNum = numOf(r.jid || r.id);
                return jidNum === phone || jidNum.endsWith(phone) || phone.endsWith(jidNum);
            });
            if (!found)
                return sock.sendMessage(chatId, { text: `⚠️ لم يُعثر على طلب انضمام للرقم: *${phone}*` });
            const jid = found.jid || found.id;
            await sock.groupRequestParticipantsUpdate(chatId, [jid], "reject");
            await sock.sendMessage(chatId, { text: `✅ تم رفض طلب انضمام: *${phone}*` });
        } catch (e) {
            await sock.sendMessage(chatId, { text: "❌ فشل الرفض: " + e.message });
        }
        return;
    }

    // ============================================================
    //   .نسخ / .نسخ-save / .نسخ-عرض / .لصق / .حذف-نسخة — Snapshots
    // ============================================================
    if (command === ".نسخ" && isGroup && isOwner) {
        try {
            const meta = await getMeta(sock, chatId);
            const name = meta.subject || '';
            const desc = meta.desc || '';
            let picBuf = null;
            let picBase64 = null;
            try {
                const picUrl = await sock.profilePictureUrl(chatId, 'image');
                if (picUrl) {
                    const picRes = await axios.get(picUrl, { responseType: 'arraybuffer', timeout: 10000 });
                    picBuf = Buffer.from(picRes.data);
                    picBase64 = picBuf.toString('base64');
                }
            } catch {}

            const snapName = args.trim();
            if (snapName) {
                if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR);
                fs.writeFileSync(SNAPSHOTS_DIR + '/' + snapName + '.json',
                    JSON.stringify({ name, desc, pic: picBase64, date: new Date().toLocaleString('ar') }, null, 2));
                const txt = `✅ *تم حفظ نسخة "${snapName}"*\n*━━━━━━━━━━━━━━━━━━*\n*│📛* ${name}\n*│🖼️* ${picBase64?'✅':'❌'}\n*━━━━━━━━━━━━━━━━━━*\n💡 استخدم *.لصق ${snapName}* لتطبيقها`;
                if (picBuf) await sock.sendMessage(chatId, { image: picBuf, caption: txt });
                else await sock.sendMessage(chatId, { text: txt });
                return;
            }

            const infoText = [
                "🧭 *𝑫𝒓. 𝑺𝒕𝒐𝒏𝒆* 🧭",
                "*━━━━━━━━━━━━━━━━━━*",
                "📋 *نسخة المجموعة*",
                "*━━━━━━━━━━━━━━━━━━*",
                "*│📛 الاسم:* " + name,
                "*│📝 الوصف:* " + (desc || "لا يوجد"),
                "*│👥 الأعضاء:* " + (meta.participants?.length || 0),
                "*━━━━━━━━━━━━━━━━━━*",
                "*الاسم:*\n" + name,
                "*الوصف:*\n" + (desc || "لا يوجد"),
                "*━━━━━━━━━━━━━━━━━━*",
                "💡 *.نسخ [اسم]* — لحفظ هذه النسخة"
            ].join("\n");
            if (picBuf) await sock.sendMessage(chatId, { image: picBuf, caption: infoText });
            else await sock.sendMessage(chatId, { text: infoText });
            return;
        } catch(e) { await sock.sendMessage(chatId, { text: "❌ فشل: " + e.message }); return; }
    }

    if (command === ".نسخ-save" && isGroup && hasAuth) {
        const snapName = args.trim();
        if (!snapName) return sock.sendMessage(chatId, { text: "⚠️ .نسخ [اسم]\nمثال: .نسخ SENKO" });
        try {
            const meta = await getMeta(sock, chatId);
            const name = meta.subject || ''; const desc = meta.desc || '';
            let picBase64 = null;
            try {
                const picUrl = await sock.profilePictureUrl(chatId, 'image');
                if (picUrl) { const picR=await axios.get(picUrl,{responseType:"arraybuffer",timeout:8000}).catch(()=>null); if(picR) picBase64=Buffer.from(picR.data).toString("base64"); }
            } catch {}
            if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR);
            fs.writeFileSync(SNAPSHOTS_DIR + '/' + snapName + '.json', JSON.stringify({ name, desc, pic: picBase64, date: new Date().toLocaleString('ar') }, null, 2));
            await sock.sendMessage(chatId, { text: "✅ *تم حفظ نسخة \"" + snapName + "\"*\n*│📛* " + name + "\n*│🖼️* " + (picBase64 ? '✅' : '❌') });
        } catch (e) { await sock.sendMessage(chatId, { text: "❌ " + e.message }); }
        return;
    }

    if (command === ".نسخ-عرض" && hasAuth) {
        try {
            if (!fs.existsSync(SNAPSHOTS_DIR)) fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
            const files = fs.readdirSync(SNAPSHOTS_DIR).filter(f => f.endsWith('.json'));
            if (!files.length) return sock.sendMessage(chatId, { text: "📂 لا توجد نسخ محفوظة." });
            const unique = [];
            const seenNames = new Set();
            for (const f of files) {
                const nm = f.replace('.json','');
                if (!seenNames.has(nm)) { seenNames.add(nm); unique.push(f); }
            }
            let list = "🧭 *النسخ المحفوظة:*\n*━━━━━━━━━━━━━━━━━━*\n";
            unique.forEach((f, i) => {
                const snapName = f.replace('.json','');
                let groupName = snapName, date = '';
                try {
                    const d = JSON.parse(fs.readFileSync(SNAPSHOTS_DIR + '/' + f));
                    if (d.name) groupName = d.name;
                    if (d.date) date = ` — ${d.date}`;
                } catch {}
                list += `*${i+1}.* 📁 *${groupName}*${date}\n`;
            });
            list += "*━━━━━━━━━━━━━━━━━━*\n";
            list += "*.لصق [رقم]* أو *.لصق [اسم]*\n";
            list += "*.حذف-نسخة [رقم]* أو *.حذف-نسخة [اسم]*";
            if (!global._snapList) global._snapList = {};
            global._snapList[chatId] = unique.map(f => f.replace('.json',''));
            await sock.sendMessage(chatId, { text: list });
        } catch (e) { await sock.sendMessage(chatId, { text: "❌ " + e.message }); }
        return;
    }

    if (command === ".لصق" && isGroup && hasAuth) {
        let snapName = args.trim();
        if (!snapName) return sock.sendMessage(chatId, { text: "⚠️ .لصق [رقم] أو .لصق [اسم]" });
        if (/^\d+$/.test(snapName)) {
            const idx = parseInt(snapName) - 1;
            const sl = global._snapList?.[chatId] || [];
            if (idx >= 0 && idx < sl.length) snapName = sl[idx];
            else return sock.sendMessage(chatId, { text: `❌ الرقم ${snapName} غير موجود. استخدم .نسخ-عرض أولاً` });
        }
        const snapFile = SNAPSHOTS_DIR + '/' + snapName + '.json';
        if (!fs.existsSync(snapFile)) return sock.sendMessage(chatId, { text: "❌ لا توجد نسخة باسم \"" + snapName + "\"" });
        try {
            const d = JSON.parse(fs.readFileSync(snapFile));
            await sock.sendMessage(chatId, { text: "⏳ جاري تطبيق نسخة \"" + snapName + "\"..." });
            const jobs = [];
            if (d.name) jobs.push(sock.groupUpdateSubject(chatId, d.name).catch(()=>{}));
            if (d.desc !== undefined) jobs.push(sock.groupUpdateDescription(chatId, d.desc||'').catch(()=>{}));
            if (d.pic) { const buf = Buffer.from(d.pic, 'base64'); changeGroupPic(sock, chatId, buf).catch(()=>{}); }
            await Promise.all(jobs);
            await sock.sendMessage(chatId, { text: "✅ تم تطبيق نسخة \"" + snapName + "\"!\n*│📛* " + (d.name||'—') + "\n*│📝* " + (d.desc||'—') });
        } catch (e) { await sock.sendMessage(chatId, { text: "❌ " + e.message }); }
        return;
    }

    if (command === ".حذف-نسخة" && hasAuth) {
        let snapName = args.trim();
        if (/^\d+$/.test(snapName)) {
            const idx2 = parseInt(snapName) - 1;
            const sl2 = global._snapList?.[chatId] || [];
            if (idx2 >= 0 && idx2 < sl2.length) snapName = sl2[idx2];
        }
        if (!snapName) return sock.sendMessage(chatId, { text: "⚠️ .حذف-نسخة [اسم]" });
        const snapFile = SNAPSHOTS_DIR + '/' + snapName + '.json';
        if (!fs.existsSync(snapFile)) return sock.sendMessage(chatId, { text: "❌ لا توجد نسخة باسم \"" + snapName + "\"" });
        fs.unlinkSync(snapFile);
        await sock.sendMessage(chatId, { text: "🗑️ تم حذف نسخة \"" + snapName + "\"" });
        return;
    }

    // ============================================================
    //   .ادخل — Join group by link
    // ============================================================
    if (command === ".ادخل" && isOwner) {
        const quotedText = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.conversation
                       || msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.extendedTextMessage?.text || "";
        const rawLink = args.trim() || quotedText;
        if (!rawLink) return sock.sendMessage(chatId, { text: "⚠️ .ادخل [رابط] أو رد على رسالة تحتوي الرابط" });
        const linkMatch = rawLink.match(/chat\.whatsapp\.com\/([A-Za-z0-9]+)/);
        const code = linkMatch ? linkMatch[1] : rawLink.trim();
        if (!code || code.length < 10) return sock.sendMessage(chatId, { text: "❌ رابط غير صالح." });
        try { await sock.groupAcceptInvite(code); await sock.sendMessage(chatId, { text: "✅ تم الدخول بنجاح." }); }
        catch (e) { await sock.sendMessage(chatId, { text: "❌ فشل: " + e.message }); }
        return;
    }

    // ============================================================
    //   .كشف — ViewOnce reveal
    // ============================================================
    if (command === ".كشف" && isGroup) {
        const ctxQ = msg.message?.extendedTextMessage?.contextInfo;
        if (!ctxQ?.quotedMessage) return sock.sendMessage(chatId, { text: "⚠️ رد على صورة أو فيديو مرة واحدة." });
        const qMsg = ctxQ.quotedMessage;
        const voInner = qMsg?.viewOnceMessage?.message
                     || qMsg?.viewOnceMessageV2?.message
                     || qMsg?.viewOnceMessageV2Extension?.message;
        const isImg = voInner?.imageMessage || qMsg?.imageMessage;
        const isVid = voInner?.videoMessage || qMsg?.videoMessage;
        if (!isImg && !isVid) return sock.sendMessage(chatId, { text: "⚠️ رد على صورة أو فيديو مرة واحدة." });
        try {
            const fakeMsg = {
                key: {
                    remoteJid: chatId,
                    id: ctxQ.stanzaId,
                    participant: ctxQ.participant || undefined,
                    fromMe: false
                },
                message: qMsg
            };
            const buf = await downloadMediaMessage(fakeMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
            if (isImg) {
                await sock.sendMessage(chatId, { image: buf, caption: "🔓 *صورة مكشوفة*" });
            } else {
                await sock.sendMessage(chatId, { video: buf, caption: "🔓 *فيديو مكشوف*" });
            }
        } catch (e) {
            await sock.sendMessage(chatId, { text: "❌ فشل الكشف: " + e.message });
        }
        return;
    }

    // ============================================================
    //   .تست — Test bot connection
    // ============================================================
    if (command === ".تست" && isOwner) {
        const vidDir = path.join(__dirname, '..', '..', 'Dr.4');
        let vidPath = null;
        for (const c of ["mb.mp5", "mb.mp4", "mb.MP4"]) {
            const p = path.join(vidDir, c);
            if (fs.existsSync(p)) { vidPath = p; break; }
        }
        const testText = [
            "🧭 *𝑫𝒓. 𝑺𝒕𝒐𝒏𝒆* 🧭",
            "*━━━━━━━━━━━━━━━━━━*",
            "🧭 *| 𝑸𝑨𝑰𝑴𝑨 |*",
            "*━━━━━━━━━━━━━━━━━━*",
            "*│.menu* — القائمة الرئيسية",
            "ـــــــــــــ",
            "*│.admin* — أوامر الإدارة",
            "ـــــــــــــ",
            "*│.group* — أوامر المجموعة",
            "ـــــــــــــ",
            "*│.raid* — أوامر الغزو",
            "ـــــــــــــ",
            "*│.game* — الألعاب والفعاليات",
            "ـــــــــــــ",
            "*│.points* — نقاطك وترتيبك",
            "ـــــــــــــ",
            "*│.elite* — قائمة النخبة",
            "ـــــــــــــ",
            "*│.gen* — قائمة العامة",
            "*━━━━━━━━━━━━━━━━━━*",
            "🧭 *𝑫𝒓. 𝑺𝒕𝒐𝒏𝒆* 🧭"
        ].join("\n");
        if (vidPath) {
            await sock.sendMessage(chatId, { video: fs.readFileSync(vidPath), ptv: true, mimetype: "video/mp4", caption: testText });
        } else {
            await sock.sendMessage(chatId, { text: testText + "\n\n⚠️ لم يُعثر على mb.mp5 في مجلد Dr.4" });
        }
        return;
    }

    // ============================================================
    //   سينكو / .سينكو — React
    // ============================================================
    if (command === "سينكو" || command === ".سينكو") {
        await sock.sendMessage(chatId, { react: { text: "🧭", key: msg.key } });
        return;
    }
}

module.exports = { handle, handleSenko };
