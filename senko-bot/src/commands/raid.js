/**
 * Senko Bot - Raid Commands
 *
 * Commands:
 *   .سينكو   - React only (raid branding)
 *   .زرف     - Raid groups by name
 *   .عالم    - Mass kick (non-protected members)
 *   .انقلاب  - Demote all non-protected admins
 *   .بحث     - List all bot groups
 *   .بحث_اسم - Search groups by name
 *   .تجديد   - Update raid link
 *   .تحديد   - Set raid image
 *   .صورة_قائمة - Set menu image
 *   .تست     - Test video (mb.mp5/mp4)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadMediaMessage } = require('@itsliaaa/baileys');
const {
    FILES, OWNERS, SUPER_OWNERS, BOT_LID, BOT_NUM,
} = require('../config');
const {
    save, resolveId, numOf, isBotJid,
    isProtectedParticipant, getMeta, changeGroupPic,
    RAID_MSG, RAID_DESC,
} = require('../helpers');
const { config, adminsDb } = require('../database');

// Pre-load raid video buffer once
let raidVidBuffer = null;
const RAID_VID_PATH = path.join(__dirname, '..', '..', 'Dr.4', 'mb.mp4');
try {
    if (fs.existsSync(RAID_VID_PATH)) raidVidBuffer = fs.readFileSync(RAID_VID_PATH);
} catch {}

const botNum = BOT_NUM;

const commands = {};

// .سينكو — react only
commands['.سينكو'] = async (sock, msg, args, ctx) => {
    await sock.sendMessage(ctx.chatId, { react: { text: "🧭", key: msg.key } });
};
// Also handle without dot prefix
commands['سينكو'] = commands['.سينكو'];

// .عالم — mass kick
commands['.عالم'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup, hasAuth } = ctx;
    if (!isGroup || !hasAuth) return;
    const meta = await getMeta(sock, chatId);

    const botIsAdmin = meta.participants.some(p => {
        const n = numOf(p.id), rid = resolveId(p.id);
        return (n === botNum || n === BOT_NUM || rid === BOT_LID || isBotJid(p.id)) && !!p.admin;
    });
    if (!botIsAdmin) {
        return sock.sendMessage(chatId, { text: "❌ لا يمكن التصفية: البوت ليس مشرفاً في هذا الجروب.\nرقِّ البوت لمشرف أولاً ثم أعد المحاولة." });
    }

    const targets = meta.participants
        .filter(p => !isProtectedParticipant(p.id))
        .map(p => p.id);

    if (!targets.length) {
        return sock.sendMessage(chatId, { text: "لا يوجد أعضاء لطردهم (الجميع محميّون)." });
    }

    await sock.sendMessage(chatId, { text: `⚔️ جاري طرد ${targets.length} عضو دفعة واحدة...` });

    let removed = 0, failed = 0;
    try {
        const res = await sock.groupParticipantsUpdate(chatId, targets, "remove");
        if (Array.isArray(res)) {
            for (const r of res) {
                if (r.status === "200" || r.status === 200) removed++;
                else failed++;
            }
        } else {
            removed = targets.length;
        }
    } catch (e) {
        failed = targets.length;
    }

    let report = `✅ *انتهت التصفية*\n━━━━━━━━━━━━━━━━\n👢 تم الطرد: *${removed}*`;
    if (failed > 0) report += `\n⚠️ فشل: *${failed}* (قد يكونوا مشرفين أو خطأ مؤقت)`;
    await sock.sendMessage(chatId, { text: report });
};

// .انقلاب — demote all admins
commands['.انقلاب'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup, hasAuth } = ctx;
    if (!isGroup || !hasAuth) return;
    const meta = await getMeta(sock, chatId);
    const toDown = meta.participants.filter(p => {
        const n = numOf(p.id);
        const rid = resolveId(p.id);
        const isProtected = OWNERS.includes(n) || OWNERS.includes(rid) ||
            adminsDb[n] === "نخبة" || adminsDb[rid] === "نخبة" ||
            adminsDb[n] === "مطور" || adminsDb[rid] === "مطور" ||
            n === botNum || n === BOT_LID;
        return p.admin && !isProtected;
    }).map(p => p.id);
    if (!toDown.length) return sock.sendMessage(chatId, { text: "لا يوجد أدمنز لسحب إشرافهم." });
    await sock.groupParticipantsUpdate(chatId, toDown, "demote");
    await sock.sendMessage(chatId, { text: `✅ تم سحب اشراف ${toDown.length} مشرف.` });
};

// .بحث — list groups
commands['.بحث'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    await sock.sendMessage(chatId, { text: `🔍 جاري جلب قائمة المجموعات...` });
    const all = await sock.groupFetchAllParticipating();
    const groups = Object.values(all);
    if (!groups.length) return sock.sendMessage(chatId, { text: `البوت ليس في أي مجموعة.` });
    const lines = groups.map((g, i) => {
        const isAdmin = g.participants?.find(p => numOf(p.id) === botNum || resolveId(p.id) === BOT_LID)?.admin;
        const count = g.participants?.length || 0;
        const adm = isAdmin ? '✅ مشرف' : '❌ عضو';
        return (i + 1) + '. *' + g.subject + '*' + '\n   👥 ' + count + ' عضو | ' + adm;
    }).join('\n\n');
    await sock.sendMessage(chatId, { text: '🧭 *قائمة المجموعات (' + groups.length + ')*\n*━━━━━━━━━━━━━━━━━━*\n' + lines + '\n*━━━━━━━━━━━━━━━━━━*' });
};

// .بحث_اسم — search groups by name
commands['.بحث_اسم'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return sock.sendMessage(chatId, { text: '⚠️ اكتب اسم المجموعة: `.بحث_اسم [اسم]`' });
    await sock.sendMessage(chatId, { text: `🔍 جاري البحث عن: *${args}*...` });
    const all = await sock.groupFetchAllParticipating();
    const found = Object.values(all).filter(g => g.subject.toLowerCase().includes(args.toLowerCase()));
    if (!found.length) return sock.sendMessage(chatId, { text: `لم يعثر على مجموعات.` });
    let r = `🔍 *نتائج البحث:*\n`;
    found.forEach((g, i) => {
        r += `${i + 1}. ${g.subject}\n👥 ${g.participants.length}\n`;
    });
    await sock.sendMessage(chatId, { text: r });
};

// .زرف — raid by group name
commands['.زرف'] = async (sock, msg, args, ctx) => {
    const { chatId, hasAuth } = ctx;
    if (!hasAuth || !args) return;
    await sock.sendMessage(chatId, { text: `⚔️ جاري البحث عن: *${args}*...` });
    const all = await sock.groupFetchAllParticipating();
    const found = Object.values(all).filter(g => g.subject.toLowerCase().includes(args.toLowerCase()));
    if (!found.length) return sock.sendMessage(chatId, { text: `لم يعثر على مجموعات.` });
    await sock.sendMessage(chatId, { text: `⚔️ وجد ${found.length} مجموعة. جاري الزرف...` });
    for (const g of found) {
        try {
            const gMeta = await sock.groupMetadata(g.id);
            const toDown = gMeta.participants.filter(p => p.admin && !isProtectedParticipant(p.id)).map(p => p.id);
            const botInGroup = gMeta.participants.find(p => numOf(p.id) === botNum || resolveId(p.id) === BOT_LID);
            const ownerInGroup = gMeta.participants.find(p => OWNERS.includes(numOf(p.id)) || OWNERS.includes(resolveId(p.id)));
            const toPromote = [];
            if (botInGroup && !botInGroup.admin) toPromote.push(botInGroup.id);
            if (ownerInGroup && !ownerInGroup.admin) toPromote.push(ownerInGroup.id);
            const s1 = [
                sock.groupUpdateSubject(g.id, config.raidName || `مـزروف ${config.orgName}`).catch(() => {}),
                sock.groupUpdateDescription(g.id, RAID_DESC()).catch(() => {}),
                sock.groupSettingUpdate(g.id, 'announcement').catch(() => {}),
            ];
            if (toDown.length) s1.push(sock.groupParticipantsUpdate(g.id, toDown, "demote").catch(() => {}));
            if (toPromote.length) s1.push(sock.groupParticipantsUpdate(g.id, toPromote, "promote").catch(() => {}));
            if (config.raidImg && fs.existsSync(config.raidImg))
                s1.push(changeGroupPic(sock, g.id, fs.readFileSync(config.raidImg)).catch(() => {}));
            await Promise.all(s1);
            const s2 = [sock.sendMessage(g.id, { text: RAID_MSG(config.raidLink) })];
            if (raidVidBuffer) s2.push(sock.sendMessage(g.id, { video: raidVidBuffer, ptv: true, mimetype: 'video/mp4' }).catch(() => {}));
            await Promise.all(s2);
        } catch (e) { console.log(e.message); }
    }
    await sock.sendMessage(chatId, { text: `✅ تم زرف ${found.length} مجموعة.` });
};

// .تجديد — update raid link
commands['.تجديد'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    if (!args) return;
    config.raidLink = args.trim();
    save(FILES.CONFIG, config);
    await sock.sendMessage(chatId, { text: `✅ تم تحديث رابط السحب:\n*${config.raidLink}*` });
};

// .تحديد — set raid image
commands['.تحديد'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup, quoted } = ctx;
    if (!isGroup) return;
    const msgContent = msg.message;
    const img = msgContent?.imageMessage || quoted?.quotedMessage?.imageMessage;
    if (!img) return sock.sendMessage(chatId, { text: "رد على صورة." });
    const dlMsg = msgContent?.imageMessage ? msg : { key: { remoteJid: chatId, id: quoted.stanzaId, participant: quoted.participant }, message: quoted.quotedMessage };
    try {
        const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const imgPath = `./raid_img_${Date.now()}.jpg`;
        fs.writeFileSync(imgPath, buf);
        if (config.raidImg && fs.existsSync(config.raidImg)) fs.unlinkSync(config.raidImg);
        config.raidImg = imgPath;
        save(FILES.CONFIG, config);
        await sock.sendMessage(chatId, { text: "✅ تم تحديد صورة السحب." });
    } catch (e) { await sock.sendMessage(chatId, { text: "❌ فشل تحديد الصورة." }); }
};

// .صورة_قائمة — set menu image
commands['.صورة_قائمة'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup, quoted } = ctx;
    if (!isGroup) return;
    const msgContent = msg.message;
    const img = msgContent?.imageMessage || quoted?.quotedMessage?.imageMessage;
    if (!img) return sock.sendMessage(chatId, { text: "رد على صورة." });
    const dlMsg = msgContent?.imageMessage ? msg : { key: { remoteJid: chatId, id: quoted.stanzaId, participant: quoted.participant }, message: quoted.quotedMessage };
    try {
        const buf = await downloadMediaMessage(dlMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
        const imgPath = `./menu_img_${Date.now()}.jpg`;
        fs.writeFileSync(imgPath, buf);
        if (config.menuImg && fs.existsSync(config.menuImg)) fs.unlinkSync(config.menuImg);
        config.menuImg = imgPath;
        save(FILES.CONFIG, config);
        await sock.sendMessage(chatId, { text: "✅ تم تحديد صورة القائمة." });
    } catch (e) { await sock.sendMessage(chatId, { text: "❌ فشل." }); }
};

// .تست — test video
commands['.تست'] = async (sock, msg, args, ctx) => {
    const { chatId, isOwner } = ctx;
    if (!isOwner) return;
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
};

module.exports = { commands };
