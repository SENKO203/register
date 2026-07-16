'use strict';

const { FILES, SUPER_OWNERS, OWNERS } = require('../config');
const {
    save,
    config, adminsDb, mutedDb, warnsDb, banDb, bannedWordsDb,
    linkProtectDb, badWordsProtectDb, proBadWords, proWarnsDb,
} = require('../database');
const {
    numOf, resolveId, isBotJid, isProtectedParticipant,
    getMeta, httpsGet
} = require('../helpers');

async function handle(ctx) {
    const { sock, msg, chatId, isGroup, senderJid, senderNum,
            rawSenderNum, isOwner, isSuperOwner, isNukhba, hasAuth,
            command, args, target, quoted, msgContent, msgCache } = ctx;

    // ============================================================
    //   .فتح / .قفل — Open/Close group
    // ============================================================
    if (command === ".فتح" && isGroup) {
        await sock.groupSettingUpdate(chatId, 'not_announcement');
        await sock.sendMessage(chatId, { text: "🔓 تم فتح الشات للجميع." });
        return;
    }

    if (command === ".قفل" && isGroup) {
        await sock.groupSettingUpdate(chatId, 'announcement');
        await sock.sendMessage(chatId, { text: "🔒 تم قفل الشات على الأدمنز." });
        return;
    }

    // ============================================================
    //   .طرد — Kick member
    // ============================================================
    if (command === ".طرد" && isGroup && target) {
        await sock.groupParticipantsUpdate(chatId, [target], "remove");
        await sock.sendMessage(chatId, { text: `✅ تم طرد @${numOf(target)}`, mentions: [target] });
        return;
    }

    // ============================================================
    //   .اشراف / .اعفاء — Promote/Demote admin
    // ============================================================
    if (command === ".اشراف" && isGroup && target) {
        await sock.groupParticipantsUpdate(chatId, [target], "promote");
        await sock.sendMessage(chatId, { text: `✅ تم منح اشراف لـ @${numOf(target)}`, mentions: [target] });
        return;
    }

    if (command === ".اعفاء" && isGroup && target) {
        await sock.groupParticipantsUpdate(chatId, [target], "demote");
        await sock.sendMessage(chatId, { text: `✅ تم سحب اشراف @${numOf(target)}`, mentions: [target] });
        return;
    }

    // ============================================================
    //   .رابط — Group invite link
    // ============================================================
    if (command === ".رابط" && isGroup) {
        const code = await sock.groupRevokeInvite(chatId);
        await sock.sendMessage(chatId, { text: `🔗 رابط جديد:\nhttps://chat.whatsapp.com/${code}` });
        return;
    }

    // ============================================================
    //   .اسكت / .تكلم / .عرض — Mute/Unmute/Show muted
    // ============================================================
    if (command === ".اسكت" && isGroup && target) {
        const mk = `${chatId}:${resolveId(target)}`;
        mutedDb[mk] = true;
        save(FILES.MUTED, mutedDb);
        await sock.sendMessage(chatId, { text: `🔇 تم كتم @${numOf(target)}`, mentions: [target] });
        return;
    }

    if (command === ".تكلم" && isGroup && isOwner && target) {
        const mk = `${chatId}:${resolveId(target)}`;
        delete mutedDb[mk];
        const mk2 = `${chatId}:${numOf(target)}`;
        delete mutedDb[mk2];
        save(FILES.MUTED, mutedDb);
        await sock.sendMessage(chatId, { text: `🔊 تم رفع الكتم عن @${numOf(target)}`, mentions: [target] });
        return;
    }

    if (command === ".عرض" && isGroup) {
        const allMuted = Object.keys(mutedDb).filter(k => k.startsWith(chatId + ':'));
        if (!allMuted.length) return sock.sendMessage(chatId, { text: "لا يوجد مكتومون في هذا الجروب." });
        let metaForMute = null;
        try { metaForMute = await getMeta(sock, chatId); } catch {}
        const mentions = [];
        const listLines = [];
        allMuted.forEach((k, i) => {
            const storedId = k.split(':').slice(1).join(':');
            let fullJid = storedId + '@s.whatsapp.net';
            if (metaForMute) {
                const found = metaForMute.participants.find(p =>
                    numOf(p.id) === storedId || resolveId(p.id) === storedId
                );
                if (found) fullJid = found.id;
            }
            mentions.push(fullJid);
            listLines.push(`${i + 1}. @${storedId}`);
        });
        await sock.sendMessage(chatId, { text: `🔇 *المكتومون في هذا الجروب:*\n${listLines.join('\n')}`, mentions });
        return;
    }

    // ============================================================
    //   .تحذير / .تحذيرات / .كلير — Warnings system
    // ============================================================
    if (command === ".تحذير" && isGroup && target) {
        const wk = `${chatId}:${resolveId(target)}`;
        warnsDb[wk] = (warnsDb[wk] || 0) + 1;
        const cnt = warnsDb[wk];
        save(FILES.WARNS, warnsDb);
        if (cnt >= 3) {
            await sock.groupParticipantsUpdate(chatId, [target], "remove");
            delete warnsDb[wk];
            save(FILES.WARNS, warnsDb);
            await sock.sendMessage(chatId, { text: `✅ تم طرد @${numOf(target)} بعد 3 تحذيرات.`, mentions: [target] });
        } else {
            await sock.sendMessage(chatId, { text: `⚠️ تحذير ${cnt}/3 لـ @${numOf(target)}`, mentions: [target] });
        }
        return;
    }

    if (command === ".تحذيرات" && isGroup) {
        if (!target) {
            const gw = Object.entries(warnsDb).filter(([k]) => k.startsWith(chatId + ':') && !k.startsWith('tr:'));
            if (!gw.length) return sock.sendMessage(chatId, { text: "لا توجد تحذيرات." });
            const mentions = gw.map(([k]) => k.split(':')[1] + '@s.whatsapp.net');
            const list = gw.map(([k, v]) => `@${k.split(':')[1]} — ${v}/3`).join('\n');
            return sock.sendMessage(chatId, { text: `*التحذيرات:*\n${list}`, mentions });
        }
        const wk = `${chatId}:${numOf(target)}`;
        await sock.sendMessage(chatId, { text: `⚠️ تحذيرات @${numOf(target)}: *${warnsDb[wk] || 0}/3*`, mentions: [target] });
        return;
    }

    if (command === ".كلير" && isGroup && target) {
        const wk = `${chatId}:${numOf(target)}`;
        delete warnsDb[wk];
        save(FILES.WARNS, warnsDb);
        await sock.sendMessage(chatId, { text: `✅ تم مسح تحذيرات @${numOf(target)}`, mentions: [target] });
        return;
    }

    // ============================================================
    //   .مسح — Delete messages (3 modes)
    // ============================================================
    if (command === ".مسح" && isGroup) {
        const quotedCtx = msg.message?.extendedTextMessage?.contextInfo;
        const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const numStr = args.trim().replace(/@\S+/g, '').trim();
        const numArg = parseInt(numStr);

        // Mode 1: reply to message without mention/number -> delete that message
        if (quotedCtx?.stanzaId && !mentionedJid && isNaN(numArg)) {
            try {
                await sock.sendMessage(chatId, {
                    delete: {
                        remoteJid: chatId,
                        id: quotedCtx.stanzaId,
                        participant: quotedCtx.participant || undefined,
                        fromMe: false
                    }
                });
            } catch {
                await sock.sendMessage(chatId, { text: "❌ لا يمكن حذف هذه الرسالة." });
            }
            return;
        }

        // Mode 2: .مسح [number] without mention -> delete last N bot messages
        if (!isNaN(numArg) && numArg > 0 && !mentionedJid) {
            const toDelete = numArg > 100 ? 100 : numArg;
            const botMsgs = (global._botMsgIds || {})[chatId] || [];
            if (!botMsgs.length) {
                return sock.sendMessage(chatId, { text: "⚠️ لا توجد رسائل محفوظة للبوت في هذا الجروب." });
            }
            const selected = botMsgs.slice(-toDelete);
            await Promise.all(selected.map(id =>
                sock.sendMessage(chatId, { delete: { remoteJid: chatId, id, fromMe: true } }).catch(() => {})
            ));
            global._botMsgIds[chatId] = botMsgs.filter(id => !selected.includes(id));
            await sock.sendMessage(chatId, { text: `🗑️ تم حذف ${selected.length} رسالة للبوت.` });
            return;
        }

        // Mode 3: .مسح @mention [number] -> delete last N messages of mentioned user
        if (mentionedJid && !isNaN(numArg) && numArg > 0) {
            const targetNum = resolveId(mentionedJid);
            const toDelete = numArg > 50 ? 50 : numArg;
            const userMsgs = Object.entries(msgCache)
                .filter(([, v]) => v.senderNum === targetNum && v.chatId === chatId)
                .slice(-toDelete);
            if (!userMsgs.length) {
                return sock.sendMessage(chatId, { text: `⚠️ لا توجد رسائل محفوظة لـ @${targetNum} في الكاش.`, mentions: [mentionedJid] });
            }
            let deleted = 0;
            for (const [msgId, v] of userMsgs) {
                try {
                    await sock.sendMessage(chatId, {
                        delete: {
                            remoteJid: chatId,
                            id: msgId,
                            participant: v.senderJid || mentionedJid,
                            fromMe: false
                        }
                    });
                    delete msgCache[msgId];
                    deleted++;
                } catch {}
            }
            await sock.sendMessage(chatId, { text: `🗑️ تم حذف ${deleted} رسالة لـ @${targetNum}.`, mentions: [mentionedJid] });
            return;
        }

        // Fallback: usage instructions
        return sock.sendMessage(chatId, { text: "⚠️ *استخدام أمر .مسح:*\n• رد على رسالة + *.مسح* — يحذفها\n• *.مسح 5* — يحذف آخر 5 رسائل للبوت\n• *.مسح @شخص 5* — يحذف آخر 5 رسائل للشخص\n• *.كلير @شخص* — يمسح تحذيرات عضو" });
    }

    // ============================================================
    //   .حظر / .رفع حظر — Ban/Unban
    // ============================================================
    if (command === ".حظر" && isGroup && target) {
        const bk = `${chatId}:${resolveId(target)}`;
        banDb[bk] = true;
        save(FILES.BANNED, banDb);
        await sock.groupParticipantsUpdate(chatId, [target], "remove").catch(() => { });
        await sock.sendMessage(chatId, { text: `🚫 تم حظر @${numOf(target)}`, mentions: [target] });
        return;
    }

    if (command === ".رفع حظر" && isGroup && target) {
        const bk = `${chatId}:${resolveId(target)}`;
        delete banDb[bk];
        save(FILES.BANNED, banDb);
        await sock.sendMessage(chatId, { text: `✅ تم رفع الحظر عن @${numOf(target)}`, mentions: [target] });
        return;
    }

    // ============================================================
    //   .رفع نخبة / .رفع مطور / .خفض — Rank management
    // ============================================================
    if ((command === ".رفع نخبة" || command === ".رفع مطور") && isGroup) {
        if (!isSuperOwner) return sock.sendMessage(chatId, { text: "🚫 هذا الأمر للمطور فقط." });
        if (!target) return sock.sendMessage(chatId, { text: "رد على رسالة الشخص أو اذكره." });
        const tNum = resolveId(target);
        const tRaw = numOf(target);
        const rankGiven = command === ".رفع مطور" ? "مطور" : "نخبة";
        adminsDb[tNum] = rankGiven;
        if (tRaw !== tNum) adminsDb[tRaw] = rankGiven;
        save(FILES.ADMINS, adminsDb);
        await sock.sendMessage(chatId, { text: `✅ تم منح @${tRaw} رتبة *${rankGiven}* ${rankGiven === "مطور" ? "👑" : "⭐"}`, mentions: [target] });
        return;
    }

    if (command === ".خفض" && isGroup) {
        if (!isSuperOwner) return sock.sendMessage(chatId, { text: "🚫 هذا الأمر للمطور فقط." });
        if (!target) return sock.sendMessage(chatId, { text: "رد على رسالة الشخص أو اذكره." });
        const tNum = resolveId(target);
        const tRaw = numOf(target);
        if (!adminsDb[tNum] && !adminsDb[tRaw]) return sock.sendMessage(chatId, { text: `⚠️ لا توجد رتبة لـ @${tRaw}`, mentions: [target] });
        delete adminsDb[tNum];
        delete adminsDb[tRaw];
        save(FILES.ADMINS, adminsDb);
        await sock.sendMessage(chatId, { text: `✅ تم سحب الرتبة من @${tRaw}`, mentions: [target] });
        return;
    }

    // ============================================================
    //   .تغيير — Change org name
    // ============================================================
    if (command === ".تغيير" && isSuperOwner && args) {
        config.orgName = args;
        save(FILES.CONFIG, config);
        await sock.sendMessage(chatId, { text: `✅ تم تغيير اسم المنظمة إلى: *${args}*` });
        return;
    }


}

module.exports = { handle };
