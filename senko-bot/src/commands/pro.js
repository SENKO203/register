/**
 * Senko Bot - Pro / Protection Commands
 *
 * Commands:
 *   .pro       - Show pro sub-menu (link/bad-word protection status)
 *   .روابط     - Toggle link protection (on/of)
 *   .منع       - Toggle bad-words protection (on/of)
 *   .اضف       - Add a bad word to global filter list
 *   .ممنوع     - Add a banned word per-group
 *   .فك        - Remove a banned word from a group
 *   .كلمات     - List banned words in a group
 */
'use strict';

const { FILES } = require('../config');
const {
    save,
    linkProtectDb, badWordsProtectDb, proBadWords, bannedWordsDb,
} = require('../database');

const commands = {};

// .pro — sub-menu
commands['.pro'] = async (sock, msg, args, ctx) => {
    const { chatId } = ctx;
    const linkStatus = linkProtectDb[chatId] ? '🟢' : '🔴';
    const badStatus  = badWordsProtectDb[chatId] ? '🟢' : '🔴';
    await sock.sendMessage(chatId, {
        text: `══ ⟦  𝑷𝑹𝑶  ⟧═══

｢ ${linkStatus} روابط | ${badStatus} ألفاظ ｣

┌━━━━━━━━━━━━━━━━━━━
┝ ✅ .روابط on      ❌ .روابط of
┝ ✅ .منع on        ❌ .منع of
┝ ➕ .اضف          🔍 .تحقق
┝ 🔄 .اعادة
└━━━━━━━━━━━━━━━━━━━

║🔬 ❯ .اضف [كلمة] | .اعادة @شخص
━━━━━━━━━━━━━━━━━━━`
    });
};

// .روابط — link protection toggle
commands['.روابط'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup, hasAuth } = ctx;
    if (!isGroup || !hasAuth) return;
    const sub = (args || '').trim().toLowerCase();
    if (sub === 'on') {
        linkProtectDb[chatId] = true;
        save(FILES.LINK_PROTECT, linkProtectDb);
        await sock.sendMessage(chatId, { text: '✅ *تم تفعيل حماية الروابط*\nأي شخص يرسل رابطاً سيُحذف ويُعطى تحذيراً (3 = طرد)\nالمعفيون: المطور المطلق والنخبة' });
    } else if (sub === 'of') {
        delete linkProtectDb[chatId];
        save(FILES.LINK_PROTECT, linkProtectDb);
        await sock.sendMessage(chatId, { text: '❌ *تم إيقاف حماية الروابط*' });
    } else {
        await sock.sendMessage(chatId, { text: '⚠️ `.روابط on` أو `.روابط of`' });
    }
};

// .منع — bad words protection toggle
commands['.منع'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup, hasAuth } = ctx;
    if (!isGroup || !hasAuth) return;
    const sub = (args || '').trim().toLowerCase();
    if (sub === 'on') {
        badWordsProtectDb[chatId] = true;
        save(FILES.BAD_WORDS_PROTECT, badWordsProtectDb);
        await sock.sendMessage(chatId, { text: '✅ *تم تفعيل فلتر الألفاظ البذيئة*\nالكلمات المحفوظة ستُحذف تلقائياً (3 = طرد)\nالمعفيون: المطور المطلق والنخبة' });
    } else if (sub === 'of') {
        delete badWordsProtectDb[chatId];
        save(FILES.BAD_WORDS_PROTECT, badWordsProtectDb);
        await sock.sendMessage(chatId, { text: '❌ *تم إيقاف فلتر الألفاظ البذيئة*' });
    } else {
        await sock.sendMessage(chatId, { text: '⚠️ `.منع on` أو `.منع of`' });
    }
};

// .اضف — add bad word to global list
commands['.اضف'] = async (sock, msg, args, ctx) => {
    const { chatId, hasAuth } = ctx;
    if (!hasAuth) return;
    if (!(args || '').trim()) return sock.sendMessage(chatId, { text: '⚠️ `.اضف [كلمة]`' });
    const newWord = args.trim().toLowerCase();
    if (proBadWords.includes(newWord))
        return sock.sendMessage(chatId, { text: `⚠️ الكلمة *${newWord}* موجودة مسبقاً.` });
    proBadWords.push(newWord);
    save(FILES.PRO_BAD_WORDS, proBadWords);
    await sock.sendMessage(chatId, { text: `✅ تمت إضافة *${newWord}* لقائمة الألفاظ.` });
};

// .ممنوع — add banned word per-group
commands['.ممنوع'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup } = ctx;
    if (!isGroup) return;
    if (!(args || '').trim()) return sock.sendMessage(chatId, { text: '⚠️ اكتب الكلمة: .ممنوع [كلمة]' });
    if (args.trim().length > 100) return sock.sendMessage(chatId, { text: '❌ الكلمة طويلة جداً (100 حرف كحد أقصى)' });
    if (!bannedWordsDb[chatId]) bannedWordsDb[chatId] = [];
    const word = args.trim().toLowerCase();
    if (bannedWordsDb[chatId].includes(word))
        return sock.sendMessage(chatId, { text: `⚠️ الكلمة *${word}* محظورة أصلاً.` });
    bannedWordsDb[chatId].push(word);
    save(FILES.BANNED_WORDS, bannedWordsDb);
    await sock.sendMessage(chatId, { text: `✅ تم حظر كلمة: *${word}*\nأي شخص يكتبها سيُطرد تلقائياً.` });
};

// .فك — remove banned word from group
commands['.فك'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup } = ctx;
    if (!isGroup) return;
    if (!(args || '').trim()) return sock.sendMessage(chatId, { text: '⚠️ اكتب الكلمة: .فك [كلمة]' });
    const word = args.trim().toLowerCase();
    if (!bannedWordsDb[chatId]?.includes(word))
        return sock.sendMessage(chatId, { text: `⚠️ الكلمة *${word}* غير موجودة في القائمة.` });
    bannedWordsDb[chatId] = bannedWordsDb[chatId].filter(w => w !== word);
    save(FILES.BANNED_WORDS, bannedWordsDb);
    await sock.sendMessage(chatId, { text: `✅ تم رفع حظر كلمة: *${word}*` });
};

// .كلمات — list banned words in group
commands['.كلمات'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup } = ctx;
    if (!isGroup) return;
    const words = bannedWordsDb[chatId] || [];
    if (!words.length) return sock.sendMessage(chatId, { text: '📋 لا توجد كلمات محظورة في هذه المجموعة.' });
    await sock.sendMessage(chatId, {
        text: `🚫 *الكلمات المحظورة:*\n*━━━━━━━━━━━━━━━━━━*\n${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}\n*━━━━━━━━━━━━━━━━━━*`
    });
};

module.exports = { commands };
