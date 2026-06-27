'use strict';

const { FILES, OWNERS } = require('../config');
const { getDb } = require('../database');
const {
    save, numOf, resolveId, getPoints, addPoints,
    isBotJid, getMeta, changeGroupPic
} = require('../helpers');

async function handle(ctx) {
    const { sock, msg, chatId, isGroup, senderJid, senderNum,
            isOwner, isSuperOwner, command, args, target, quoted, hasAuth } = ctx;

    const pointsDb = getDb('points');
    const logDb = getDb('log');
    const proWarnsDb = getDb('proWarns');

    // .نقاطي
    if (command === ".نقاطي") {
        const p = getPoints(chatId, senderNum);
        const allUsers = Object.entries(pointsDb).filter(([k]) => k.startsWith(chatId + ':')).sort(([, a], [, b]) => b.total - a.total);
        const rank = allUsers.findIndex(([k]) => k === chatId + ':' + senderNum) + 1;
        const isVip = p.vip && Date.now() < p.vipExpiry;
        await sock.sendMessage(chatId, { text: `*👤 نـقـاطـك*
*━━━━━━━━━━━━━━━━━━*
*📊 الـنـقـاط الـكـلـيـة: ${p.total}*
*📅 نـقـاط الـيـوم: ${p.today} / 50*
*🏆 مـركـزك: ${rank || 1}*
*🎯 إجـابـات صـحـيـحـة: ${p.correct || 0}*
*👑 VIP: ${isVip ? '🟢 نشط' : '🔴 غير نشط'}*
*━━━━━━━━━━━━━━━━━━*
*》𝐃𝐫.𝐒𝐭𝐨𝐧𝐞 《*` });
        return;
    }

    // .ترتيب
    if (command === ".ترتيب") {
        const all = Object.entries(pointsDb).filter(([k]) => k.startsWith(chatId + ':')).sort(([, a], [, b]) => b.total - a.total).slice(0, 5);
        if (!all.length) return sock.sendMessage(chatId, { text: "لا توجد نقاط بعد." });
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const mentions = all.map(([k]) => k.split(':')[1] + '@s.whatsapp.net');
        let t = `*🏆 لـوحـة الـمـتـصـدريـن*\n`;
        all.forEach(([k, v], i) => {
            const n = k.split(':')[1];
            t += `${medals[i]} @${n} — ${v.total} نقطة\n`;
        });
        await sock.sendMessage(chatId, { text: t, mentions });
        return;
    }

    // .متجر
    if (command === ".متجر") {
        await sock.sendMessage(chatId, { text: `*🏪 مـتـجـر الـنـقـاط*\n🖼️ تغيير صورة الجروب — 200 نقطة\n🎉 ترحيب بشخص — 80 نقطة\n👑 VIP أسبوع — 300 نقطة\n\n.استبدال [الجائزة]` });
        return;
    }

    // .استبدال
    if (command === ".استبدال" && isGroup) {
        const p = getPoints(chatId, senderNum);
        const item = args.trim().toLowerCase();
        if (item === "صورة") {
            const img = quoted?.quotedMessage?.imageMessage;
            if (!img) return sock.sendMessage(chatId, { text: "⚠️ رد على صورة مع الأمر." });
            try {
                const { downloadMediaMessage } = require('@itsliaaa/baileys');
                const dlMsg = { key: { remoteJid: chatId, id: quoted.stanzaId, participant: quoted.participant }, message: quoted.quotedMessage };
                const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
                await sock.sendMessage(chatId, { text: `✅ جاري تغيير الصورة...` });
                changeGroupPic(sock, chatId, buf).catch(() => {});
            } catch (e) { await sock.sendMessage(chatId, { text: "❌ فشل تغيير الصورة." }); }
        } else if (item === "ترحيب") {
            if (!target) return sock.sendMessage(chatId, { text: "⚠️ رد على رسالة الشخص." });
            await sock.sendMessage(chatId, { text: `🎉 *أهـلاً وسـهـلاً* @${numOf(target)}`, mentions: [target] });
        } else if (item === "vip") {
            if (p.vip && Date.now() < p.vipExpiry) return sock.sendMessage(chatId, { text: "⚠️ أنت بالفعل VIP!" });
            p.vip = true;
            p.vipExpiry = Date.now() + 7 * 24 * 60 * 60 * 1000;
            save(FILES.POINTS, pointsDb);
            await sock.sendMessage(chatId, { text: `👑 *مبروك! أصبحت VIP لمدة أسبوع*` });
        }
        return;
    }

    // .تحويل
    if (command === ".تحويل" && isGroup && target) {
        const amt = parseInt(args);
        if (isNaN(amt) || amt <= 0) return sock.sendMessage(chatId, { text: "⚠️ حدد عدد النقاط." });
        const sp = getPoints(chatId, senderNum);
        if (sp.total < amt) return sock.sendMessage(chatId, { text: `⚠️ نقاطك غير كافية.` });
        const tp = getPoints(chatId, numOf(target));
        sp.total -= amt;
        tp.total += amt;
        save(FILES.POINTS, pointsDb);
        await sock.sendMessage(chatId, { text: `💸 تم تحويل ${amt} نقطة إلى @${numOf(target)}`, mentions: [target] });
        return;
    }

    // .منح
    if (command === ".منح" && isGroup && isOwner) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const numMatch = args.match(/\d+/);
        if (!mentioned || !numMatch)
            return sock.sendMessage(chatId, { text: "⚠️ الاستخدام: .منح @شخص [عدد النقاط]" });
        const pts = parseInt(numMatch[0]);
        const tNum = resolveId(mentioned);
        addPoints(chatId, tNum, pts);
        await sock.sendMessage(chatId, {
            text: `✅ تم منح @${tNum} *${pts}* نقطة.\n💰 رصيده الآن: *${getPoints(chatId, tNum).total}* نقطة`,
            mentions: [mentioned]
        });
        return;
    }

    // .سحب
    if (command === ".سحب" && isGroup && isOwner) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const numMatch = args.match(/\d+/);
        if (!mentioned || !numMatch)
            return sock.sendMessage(chatId, { text: "⚠️ الاستخدام: .سحب @شخص [عدد النقاط]" });
        const pts = parseInt(numMatch[0]);
        const tNum = resolveId(mentioned);
        const p = getPoints(chatId, tNum);
        p.total = Math.max(0, p.total - pts);
        save(FILES.POINTS, pointsDb);
        await sock.sendMessage(chatId, {
            text: `✅ تم سحب *${pts}* نقطة من @${tNum}.\n💰 رصيده الآن: *${p.total}* نقطة`,
            mentions: [mentioned]
        });
        return;
    }

    // .عجلة
    if (command === ".عجلة" && isGroup && hasAuth) {
        global._wheelSession = global._wheelSession || {};
        const ws = global._wheelSession[chatId];
        if (!ws) {
            global._wheelSession[chatId] = { participants: [], ts: Date.now(), open: true };
            await sock.sendMessage(chatId, {
                text: `🎡 *فُتح التسجيل في العجلة!*\n*━━━━━━━━━━━━━━━━━━*\nاكتب *.سجل* للمشاركة\nالأدمن يكتب *.عجلة* مجدداً لإغلاق التسجيل والسحب\n*━━━━━━━━━━━━━━━━━━*`
            });
        } else if (ws.open) {
            ws.open = false;
            const pool = ws.participants;
            if (pool.length < 2) {
                delete global._wheelSession[chatId];
                return sock.sendMessage(chatId, { text: "⚠️ لا يكفي المشاركون (يلزم شخصان على الأقل)." });
            }
            await sock.sendMessage(chatId, {
                text: `🔒 *أُغلق التسجيل — ${pool.length} مشارك*\n⏳ جاري الدوران...`
            });
            await new Promise(r => setTimeout(r, 2000));
            const winner = pool[Math.floor(Math.random() * pool.length)];
            const winJid = winner + '@s.whatsapp.net';
            delete global._wheelSession[chatId];
            await sock.sendMessage(chatId, {
                text: `🎡 *نتيجة العجلة!*\n*━━━━━━━━━━━━━━━━━━*\n🏆 *الفائز: @${winner}*\n*━━━━━━━━━━━━━━━━━━*`,
                mentions: [winJid]
            });
        } else {
            delete global._wheelSession[chatId];
            await sock.sendMessage(chatId, { text: "🗑️ تم مسح جلسة العجلة السابقة. أرسل .عجلة مجدداً لبدء جلسة جديدة." });
        }
        return;
    }

    // .سجل
    if (command === ".سجل" && isGroup) {
        global._wheelSession = global._wheelSession || {};
        const ws = global._wheelSession[chatId];
        if (!ws || !ws.open)
            return sock.sendMessage(chatId, { text: "⚠️ لا توجد جلسة عجلة مفتوحة حالياً." });
        if (ws.participants.includes(senderNum))
            return sock.sendMessage(chatId, { text: `⚠️ @${senderNum} سجّلت مسبقاً! 🎡`, mentions: [senderJid] });
        ws.participants.push(senderNum);
        await sock.sendMessage(chatId, {
            text: `✅ @${senderNum} تم تسجيلك! (${ws.participants.length} مشارك)`,
            mentions: [senderJid]
        });
        return;
    }

    // .اعادة — إعادة تحذيرات pro
    if (command === ".اعادة" && isGroup && hasAuth) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (mentioned) {
            const tNum = resolveId(mentioned);
            const lk = `link:${chatId}:${tNum}`;
            const bk = `bad:${chatId}:${tNum}`;
            delete proWarnsDb[lk];
            delete proWarnsDb[bk];
            save(FILES.PRO_WARNS, proWarnsDb);
            await sock.sendMessage(chatId, {
                text: `✅ تم إعادة تعيين تحذيرات @${tNum} في نظام الحماية.`,
                mentions: [mentioned]
            });
        } else {
            const keys = Object.keys(proWarnsDb).filter(k =>
                k.startsWith(`link:${chatId}:`) || k.startsWith(`bad:${chatId}:`)
            );
            keys.forEach(k => delete proWarnsDb[k]);
            save(FILES.PRO_WARNS, proWarnsDb);
            await sock.sendMessage(chatId, { text: `✅ تم إعادة تعيين *${keys.length}* تحذير في هذا الجروب.` });
        }
        return;
    }

    // .تحقق — عرض تحذيرات pro
    if (command === ".تحقق" && isGroup && hasAuth) {
        const linkKeys = Object.entries(proWarnsDb).filter(([k]) => k.startsWith(`link:${chatId}:`));
        const badKeys  = Object.entries(proWarnsDb).filter(([k]) => k.startsWith(`bad:${chatId}:`));
        if (!linkKeys.length && !badKeys.length)
            return sock.sendMessage(chatId, { text: "✅ لا يوجد أحد لديه تحذيرات في نظام الحماية." });
        let txt = `⚠️ *تحذيرات نظام الحماية*\n*━━━━━━━━━━━━━━━━━━*\n`;
        const mentions = [];
        if (linkKeys.length) {
            txt += `*🔗 روابط:*\n`;
            linkKeys.forEach(([k, v]) => {
                const num = k.replace(`link:${chatId}:`, '');
                txt += `@${num} — ${v}/3\n`;
                mentions.push(num + '@s.whatsapp.net');
            });
        }
        if (badKeys.length) {
            txt += `*🤬 ألفاظ:*\n`;
            badKeys.forEach(([k, v]) => {
                const num = k.replace(`bad:${chatId}:`, '');
                txt += `@${num} — ${v}/3\n`;
                mentions.push(num + '@s.whatsapp.net');
            });
        }
        txt += `*━━━━━━━━━━━━━━━━━━*`;
        await sock.sendMessage(chatId, { text: txt, mentions });
        return;
    }
}

module.exports = { handle };
