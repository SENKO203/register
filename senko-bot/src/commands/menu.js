'use strict';

const {
    config, protectedGroups, monitoredGroups,
    linkProtectDb, badWordsProtectDb
} = require('../database');
const {
    resolveId, numOf, getRank, getMeta,
    OWNERS
} = require('../helpers');
const axios = require('axios');

async function handle(ctx) {
    const { sock, msg, chatId, isGroup, senderJid, senderNum,
            isOwner, isSuperOwner, command, args, target, quoted, msgContent } = ctx;

    // ============================================================
    //          القوائم
    // ============================================================
    if (command === ".الاوامر" || command === ".menu") {
        const menuText = `══ ⟦  𝑫𝑹🧭𝑺𝑻𝑶𝑵𝑬  ⟧═══

┌━━━━━━━━━━━━━━━━━━━
┝ ⚗️ .ᴀᴅᴍɪɴ      🎮 .ɢᴀᴍᴇ
┝ 🧪 .ɢʀᴏᴜᴘ      💎 .ᴘᴏɪɴᴛꜱ
┝ 🔬 .ᴘʀᴏ        👑 .ᴇʟɪᴛᴇ
┝ ⚔️ .ʀᴀɪᴅ       🌍 .ɢᴇɴ
┝ 🖥️ .ꜱᴇʀᴠ       💊 .ᴍᴇᴅ
┝ ⚙️ .ꜱᴇᴛᴛ       🧠 .ᴄʟᴇᴠ
└━━━━━━━━━━━━━━━━━━━

｢ 📊 ꜱᴛᴀᴛᴇꜱ ｣
• 📁 الأوامـر : [ 12 ]
• 🧬 الـحـالـة : Online

━━━━━━━━━━━━━
║⚗️ ❯ 10,000,000% 𝑺𝒖𝒓𝒆.
━━━━━━━━━━━━━━━━━━━`;
        if (config.menuImg) {
            await sock.sendMessage(chatId, { image: { url: config.menuImg }, caption: menuText });
        } else {
            await sock.sendMessage(chatId, { text: menuText });
        }
        return;
    }

    if (command === ".admin") {
        await sock.sendMessage(chatId, { text: `══ ⟦  𝑨𝑫𝑴𝑰𝑵  ⟧═══

┌━━━━━━━━━━━━━━━━━━━
┝ 🔓 .فتح          🔒 .قفل
┝ 🚷 .طرد          🔗 .رابط
┝ 🎖️ .اشراف        📉 .اعفاء
┝ 🔇 .اسكت         🔊 .تكلم
┝ 📋 .عرض          ⚠️ .تحذير
┝ 📋 .تحذيرات      🚫 .حظر
┝ ✅ .رفع_حظر      🗑️ .مسح
┝ 🧹 .كلير         👤 .معلومات
┝ 🚫 .ممنوع        ✅ .فك
┝ 📋 .كلمات        😀 .ايموج
└━━━━━━━━━━━━━━━━━━━

║⚗️ ❯ .مسح [عدد] | .مسح @شخص [عدد]
━━━━━━━━━━━━━━━━━━━` });
        return;
    }

    if (command === ".group") {
        const st = protectedGroups.includes(chatId) ? "🟢" : "🔴";
        const ms = monitoredGroups.includes(chatId) ? "🟢" : "🔴";
        await sock.sendMessage(chatId, { text: `══ ⟦  𝑮𝑹𝑶𝑼𝑷  ⟧═══

｢ ${st} حماية | ${ms} مراقبة ｣

┌━━━━━━━━━━━━━━━━━━━
┝ 🖼️ .ملصق         📷 .صورة
┝ 🔄 .تغير          📢 .منشن
┝ 📝 .ارشيف         🗑️ .زارشيف
┝ 📡 .مراقبة        📡 .ابطال
┝ 🛡️ .حماية         🔓 .الغاء
┝ 📝 .وصف           📊 .احصاء
┝ ✏️ .اسم           📋 .نسخ
┝ 🚪 .اخرج          🔓 .كشف
┝ ✔️ .قبول          ❌ .رفض
└━━━━━━━━━━━━━━━━━━━

║🧪 ❯ .منشن | .اسم [نص] | .رفض [رقم]
━━━━━━━━━━━━━━━━━━━` });
        return;
    }

    if (command === ".raid") {
        await sock.sendMessage(chatId, { text: `══ ⟦  𝑹𝑨𝑰𝑫  ⟧═══

┌━━━━━━━━━━━━━━━━━━━
┝ ⚡ .سينكو         🧹 .عالم
┝ 🔄 .انقلاب        📍 .تحديد
┝ ⚔️ .زرف           🖼️ .صورة_قائمة
┝ 🔗 .تجديد         🔍 .بحث
┝ 🔎 .بحث_صور       📌 .بنترست
┝ 🎵 .تيك           🚪 .ادخل
└━━━━━━━━━━━━━━━━━━━

║⚔️ ❯ .زرف [اسم] | .بنترست [اسم] [عدد]
━━━━━━━━━━━━━━━━━━━` });
        return;
    }

    if (command === ".game") {
        await sock.sendMessage(chatId, { text: `══ ⟦  𝑮𝑨𝑴𝑬  ⟧═══

┌━━━━━━━━━━━━━━━━━━━
┝ ✍️ .كتابة         🔤 .تفكيك
┝ 🔢 .تعداد         ❌⭕ .اكس
┝ 🔢 .تخمين         ⏹️ .توقف
└━━━━━━━━━━━━━━━━━━━

║🎮 ❯ .كتابة (1/3/4) | .اكس @منشن
━━━━━━━━━━━━━━━━━━━` });
        return;
    }

    if (command === ".points") {
        await sock.sendMessage(chatId, { text: `══ ⟦  𝑷𝑶𝑰𝑵𝑻𝑺  ⟧═══

┌━━━━━━━━━━━━━━━━━━━
┝ 👤 .نقاطي         🏆 .ترتيب
┝ 🏪 .متجر          🎁 .استبدال
┝ 💸 .تحويل         ✅ .منح
┝ ❌ .سحب           🎡 .عجلة
┝ ✋ .سجل
└━━━━━━━━━━━━━━━━━━━

║💎 ❯ .تحويل @شخص [عدد] | .منح @شخص [عدد]
━━━━━━━━━━━━━━━━━━━` });
        return;
    }

    // .معلومات
    if (command === ".معلومات" && isGroup) {
        const tJid = target || senderJid;
        const tNum = resolveId(tJid);
        const tRaw = numOf(tJid);
        const tRank = getRank(tNum) || getRank(tRaw) || 'عضو عادي';
        const tIsOwner = OWNERS.includes(tNum) || OWNERS.includes(tRaw);
        const meta = await getMeta(sock, chatId);
        const tMeta = meta.participants.find(p => resolveId(p.id) === tNum || numOf(p.id) === tRaw);
        const isAdmin = tMeta?.admin ? '🎖️ مشرف' : '👤 عضو';
        let ppUrl = null;
        try { ppUrl = await sock.profilePictureUrl(tJid, 'image'); } catch {}
        const infoText = `🧭 *𝑫𝒓. 𝑺𝒕𝒐𝒏𝒆* 🧭
*━━━━━━━━━━━━━━━━━━*
*👤 معلومات العضو*
*━━━━━━━━━━━━━━━━━━*
*│📱 الرقم:* @${tNum}
*│🆔 LID:* ${tRaw}
*│🏅 الرتبة:* ${tIsOwner ? 'مطور مطلق 👑' : tRank}
*│🎖️ الحالة:* ${isAdmin}
*━━━━━━━━━━━━━━━━━━*
🧭 *𝑫𝒓. 𝑺𝒕𝒐𝒏𝒆* 🧭`;
        if (ppUrl) {
            const imgBuf = await axios.get(ppUrl,{responseType:'arraybuffer',timeout:8000}).then(r=>Buffer.from(r.data)).catch(()=>null);
            if (imgBuf) {
                await sock.sendMessage(chatId, { image: imgBuf, caption: infoText, mentions: [tJid] });
                return;
            }
        }
        await sock.sendMessage(chatId, { text: infoText, mentions: [tJid] });
        return;
    }

    // .lid
    if (command === ".lid") {
        const targetJid = msg.message?.extendedTextMessage?.contextInfo?.participant || senderJid;
        const rawId = numOf(targetJid);
        const resolved = resolveId(targetJid);
        await sock.sendMessage(chatId, {
            text: `🔍 *معرف واتساب*
*━━━━━━━━━━━━━━━━━━*
*│📱 JID الخام:* ${rawId}
*│🔗 الرقم المحلول:* ${resolved}
*│📋 JID الكامل:* ${targetJid}
*━━━━━━━━━━━━━━━━━━*
*》𝐃𝐫.𝐒𝐭𝐨𝐧𝐞 《*`,
            mentions: [targetJid]
        });
        return;
    }

    // .gen
    if (command === ".gen") {
        await sock.sendMessage(chatId, { text: `══ ⟦  𝑮𝑬𝑵𝑬𝑹𝑨𝑳  ⟧═══

┌━━━━━━━━━━━━━━━━━━━
┝ 🧭 .سينكو         👑 .مطور
┝ 🫦 .تحرش          ❤️ .احبك
┝ 💔 .اكرهك         💍 .زوجني
┝ 💔 .طلاق          🌹 .غزل
┝ 🏳️‍🌈 .شاذ           🖤 .زنجي
┝ 💘 .حب            📋 .تست
└━━━━━━━━━━━━━━━━━━━

║🌍 ❯ .تحرش @شخص | .حب @شخص
━━━━━━━━━━━━━━━━━━━` });
        return;
    }

    // .serv
    if (command === ".serv") {
        await sock.sendMessage(chatId, { text: `══ ⟦  𝑺𝑬𝑹𝑽𝑰𝑪𝑬𝑺  ⟧═══

┌━━━━━━━━━━━━━━━━━━━
┝ 🧮 .حاسبة         🌤️ .طقس
┝ 🌍 .ترجمة         💱 .عملة
┝ 🔍 .بحث           👤 .بحث_اسم
└━━━━━━━━━━━━━━━━━━━

║🖥️ ❯ .حاسبة [معادلة] | .طقس [مدينة]
━━━━━━━━━━━━━━━━━━━` });
        return;
    }

    // .pro
    if (command === ".pro") {
        const linkStatus = linkProtectDb[chatId] ? "🟢" : "🔴";
        const badStatus  = badWordsProtectDb[chatId] ? "🟢" : "🔴";
        await sock.sendMessage(chatId, { text: `══ ⟦  𝑷𝑹𝑶  ⟧═══

｢ ${linkStatus} روابط | ${badStatus} ألفاظ ｣

┌━━━━━━━━━━━━━━━━━━━
┝ ✅ .روابط on      ❌ .روابط of
┝ ✅ .منع on        ❌ .منع of
┝ ➕ .اضف          🔍 .تحقق
┝ 🔄 .اعادة
└━━━━━━━━━━━━━━━━━━━

║🔬 ❯ .اضف [كلمة] | .اعادة @شخص
━━━━━━━━━━━━━━━━━━━` });
        return;
    }
}

module.exports = { handle };
