'use strict';

const fs = require('fs');
const {
    SUPER_OWNERS, OWNERS, FILES, VALID_CATEGORIES
} = require('../config');
const { getDb } = require('../database');
const {
    save, numOf, resolveId, RAID_MSG
} = require('../helpers');

async function handle(ctx) {
    const { sock, msg, chatId, isGroup, senderJid, senderNum,
            isOwner, isSuperOwner, command, args, target, quoted, msgContent,
            setBotStopped } = ctx;

    const adminsDb = getDb('admins');
    const config = getDb('config');
    const aliasesDb = getDb('aliases');
    const disabledDb = getDb('disabled');

    // .elite — قائمة أوامر النخبة
    if (command === ".elite" && isGroup && isSuperOwner) {
        await sock.sendMessage(chatId, { text: `🧭 *𝑫𝒓. 𝑺𝒕𝒐𝒏𝒆* 🧭
*━━━━━━━━━━━━━━━━━━*
🧭 *| 𝑬𝑳𝑰𝑻𝑬 |* _(مطور مطلق فقط)_
*━━━━━━━━━━━━━━━━━━*
*│🚀 .رفع نخبة @* — منح رتبة نخبة
ـــــــــــــ
*│🚀 .رفع مطور @* — منح رتبة مطور
ـــــــــــــ
*│📉 .خفض @* — سحب الرتبة
ـــــــــــــ
*│👥 .عرض_نخبة* — عرض النخبة والمطورين
ـــــــــــــ
*│✏️ .تعديل* — تعديل اسم أمر
ـــــــــــــ
*│📝 .m* — تغيير رسالة السحب
ـــــــــــــ
*│📋 .C* — تغيير وصف مجموعة السحب
ـــــــــــــ
*│📝 .c [وصف]* — تغيير وصف رسالة السحب
ـــــــــــــ
*│✏️ .c²* — تغيير اسم المجموعة في السحب
ـــــــــــــ
*│📍 .تحديد* — تحديد صورة السحب
ـــــــــــــ
*│💾 .نسخ-save [اسم]* — حفظ بيانات المجموعة
ـــــــــــــ
*│📋 .نسخ-عرض* — عرض النسخ المحفوظة
ـــــــــــــ
*│🗑️ .حذف-نسخة [اسم]* — حذف نسخة محفوظة
ـــــــــــــ
*│🧹 .تنظيف* — تنظيف ملفات الجلسة
ـــــــــــــ
*│🆔 .lid* — معرف واتساب لعضو
ـــــــــــــ
*│🌤️ .weatherkey [مفتاح]* — تعيين مفتاح الطقس
ـــــــــــــ
*│💱 .currencykey [مفتاح]* — تعيين مفتاح العملات
ـــــــــــــ
*│✏️ .تغيير [اسم]* — تغيير اسم المنظمة
ـــــــــــــ
*│🔧 .تست* — اختبار اتصال البوت
ـــــــــــــ
*│⛔ E.* — إيقاف البوت
ـــــــــــــ
*│✅ mc².* — تشغيل البوت
*━━━━━━━━━━━━━━━━━━*
🧭 *𝑫𝒓. 𝑺𝒕𝒐𝒏𝒆* 🧭` });
        return;
    }

    // .c² — تغيير اسم السحب
    if (command === ".c²" && isOwner && args) {
        config.raidName = args.trim();
        save(FILES.CONFIG, config);
        await sock.sendMessage(chatId, { text: `✅ تم تغيير اسم السحب إلى:\n*${config.raidName}*` });
        return;
    }

    // .m — تغيير رسالة السحب
    if (command === ".m" && isOwner && args) {
        config.raidMsg = args.trim();
        save(FILES.CONFIG, config);
        await sock.sendMessage(chatId, { text: `✅ تم تغيير رسالة السحب.\n*المعاينة:*\n${RAID_MSG(config.raidLink)}` });
        return;
    }

    // .c — تغيير وصف السحب
    if (command === ".c" && isOwner && args) {
        config.raidDesc = args.trim();
        save(FILES.CONFIG, config);
        await sock.sendMessage(chatId, { text: `✅ تم تغيير وصف السحب:\n${config.raidDesc}` });
        return;
    }

    // .تعديل — تعديل اسم أمر
    if (command === ".تعديل" && isOwner) {
        const targetCmd = args.trim().toLowerCase();
        if (!targetCmd.startsWith('.')) return sock.sendMessage(chatId, { text: "⚠️ الأمر يجب أن يبدأ بنقطة. مثال: .تعديل .زرف" });
        const sent = await sock.sendMessage(chatId, { text: `📝 *تعديل الأمر:* \`${targetCmd}\`\n\nأرسل الاسم الجديد (يجب أن يبدأ بنقطة)\n*رد على هذه الرسالة*` });
        aliasesDb['__pending__'] = { cmd: targetCmd, msgId: sent.key.id };
        save(FILES.ALIASES, aliasesDb);
        return;
    }

    // .عرض_نخبة
    if (command === ".عرض_نخبة" && isSuperOwner) {
        const nukhbaList = Object.entries(adminsDb).filter(([, v]) => v === "نخبة");
        const mudawwerList = Object.entries(adminsDb).filter(([, v]) => v === "مطور");
        let listText = '';
        if (mudawwerList.length) listText += '*👑 المطورون:*\n' + mudawwerList.map(([num], i) => (i+1) + '. 🆔 ' + num).join('\n') + '\n\n';
        if (nukhbaList.length) listText += '*⭐ النخبة:*\n' + nukhbaList.map(([num], i) => (i+1) + '. 🆔 ' + num).join('\n');
        if (!listText) return sock.sendMessage(chatId, { text: "لا يوجد مطورون أو نخبة حالياً." });
        await sock.sendMessage(chatId, { text: '🧭 *𝑫𝒓. 𝑺𝒕𝒐𝒏𝒆* 🧭\n*━━━━━━━━━━━━━━━━━━*\n🧭 *| قائمة المطورين والنخبة |*\n*━━━━━━━━━━━━━━━━━━*\n' + listText + '\n*━━━━━━━━━━━━━━━━━━*\n🧭 *𝑫𝒓. 𝑺𝒕𝒐𝒏𝒆* 🧭' });
        return;
    }

    // .تحجير_عرض — عرض الأوامر والفئات المحجورة
    if (command === ".تحجير_عرض" && isSuperOwner) {
        const dc = disabledDb.commands || [];
        const dcat = disabledDb.categories || [];
        if (!dc.length && !dcat.length) {
            return sock.sendMessage(chatId, { text: "✅ لا يوجد أوامر أو فئات محجورة حالياً." });
        }
        let txt = `🔒 *قائمة المحجورات*\n*━━━━━━━━━━━━━━━━━━*\n`;
        if (dcat.length) {
            txt += `*📁 فئات محجورة (${dcat.length}):*\n`;
            dcat.forEach((c, i) => { txt += `${i + 1}. ${c}\n`; });
            txt += `\n`;
        }
        if (dc.length) {
            txt += `*⛔ أوامر محجورة (${dc.length}):*\n`;
            dc.forEach((c, i) => { txt += `${i + 1}. ${c}\n`; });
        }
        txt += `*━━━━━━━━━━━━━━━━━━*\nللإحياء: \`.احياء [اسم]\``;
        await sock.sendMessage(chatId, { text: txt });
        return;
    }

    // .تحجير — تعطيل أمر/فئة
    if (command === ".تحجير" && isSuperOwner) {
        if (!args) {
            return sock.sendMessage(chatId, { text:
                "🔒 *تحجير أمر أو فئة*\n" +
                "استخدم: `.تحجير .اسم_الأمر` أو `.تحجير اسم_الفئة`\n\n" +
                "*الفئات:* group, admin, med, clev, sett, game, points, pro, elite\n\n" +
                "المحجور لن يعمل لأي أحد إلا أنت (المطور المطلق)." });
        }
        let t = args.trim().split(/\s+/)[0].toLowerCase();
        if (VALID_CATEGORIES.includes(t)) {
            if (!disabledDb.categories.includes(t)) {
                disabledDb.categories.push(t);
                save(FILES.DISABLED, disabledDb);
            }
            return sock.sendMessage(chatId, { text: `🔒 تم تحجير فئة *${t}* بالكامل.\nلن تعمل أوامرها لأحد. للإحياء: \`.احياء ${t}\`` });
        }
        if (!t.startsWith('.')) t = '.' + t;
        if (!disabledDb.commands.includes(t)) {
            disabledDb.commands.push(t);
            save(FILES.DISABLED, disabledDb);
        }
        return sock.sendMessage(chatId, { text: `🔒 تم تحجير الأمر *${t}*.\nلن يعمل لأحد. للإحياء: \`.احياء ${t}\`` });
    }

    // .احياء — إعادة تفعيل
    if (command === ".احياء" && isSuperOwner) {
        if (!args) {
            const dc = disabledDb.commands.join(', ') || 'لا شيء';
            const dcat = disabledDb.categories.join(', ') || 'لا شيء';
            return sock.sendMessage(chatId, { text:
                `♻️ *إحياء أمر أو فئة*\nاستخدم: \`.احياء .اسم_الأمر\` أو \`.احياء اسم_الفئة\`\n\n` +
                `🔒 *أوامر محجورة:* ${dc}\n🔒 *فئات محجورة:* ${dcat}` });
        }
        let t = args.trim().split(/\s+/)[0].toLowerCase();
        if (VALID_CATEGORIES.includes(t)) {
            disabledDb.categories = disabledDb.categories.filter(c => c !== t);
            save(FILES.DISABLED, disabledDb);
            return sock.sendMessage(chatId, { text: `♻️ تم إحياء فئة *${t}*. أوامرها تعمل الآن.` });
        }
        if (!t.startsWith('.')) t = '.' + t;
        disabledDb.commands = disabledDb.commands.filter(c => c !== t);
        save(FILES.DISABLED, disabledDb);
        return sock.sendMessage(chatId, { text: `♻️ تم إحياء الأمر *${t}*. يعمل الآن.` });
    }

    // .تنظيف — حذف ملفات الجلسة المتكررة
    if (command === ".تنظيف" && isSuperOwner) {
        const sessionDir = './auth_info_baileys';
        try {
            if (!fs.existsSync(sessionDir)) return sock.sendMessage(chatId, { text: "📁 لا يوجد مجلد جلسة." });
            const files = fs.readdirSync(sessionDir);
            let deleted = 0;
            for (const f of files) {
                if (f.startsWith('pre-key-') || f.startsWith('session-')) {
                    fs.unlinkSync(`${sessionDir}/${f}`);
                    deleted++;
                }
            }
            await sock.sendMessage(chatId, { text: `🧹 تم تنظيف *${deleted}* ملف جلسة.` });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `❌ خطأ: ${e.message}` });
        }
        return;
    }

    // E. / .e — إيقاف البوت
    if ((command === "e." || command === ".e") && isSuperOwner) {
        setBotStopped(true);
        await sock.sendMessage(chatId, { text: "⛔ تم إيقاف البوت. لن يستجيب إلا للمطور والنخبة.\nلإعادة التشغيل: *mc².*" });
        return;
    }

    // mc². / .mc² — تشغيل البوت
    if ((command === "mc²." || command === ".mc²") && isSuperOwner) {
        setBotStopped(false);
        await sock.sendMessage(chatId, { text: "✅ تم تشغيل البوت. يستجيب للجميع الآن." });
        return;
    }
}

module.exports = { handle };
