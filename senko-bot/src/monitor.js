// ============================================================
//   نظام مراقبة الأعضاء الجدد + الفحص الدوري
// ============================================================

const { numOf, isUserProtected, scanDevices, getMeta, sendLog, save } = require('./helpers');
const { FILES, SUPER_OWNERS } = require('./config');
const { banDb, protectedGroups } = require('./database');

// ============================================================
//   خريطة مراقبة الأعضاء الجدد
// ============================================================
const newMemberWatch = new Map(); // jid@gid → { joinTime, groupId, memberJid }
const watchedMembers = new Map(); // groupId → Set<jid>

async function checkMemberForBot(sock, memberJid, groupId) {
    if (isUserProtected(memberJid)) return;
    const pNum = numOf(memberJid);
    if (SUPER_OWNERS.includes(pNum)) return;
    if (pNum === numOf(sock.user?.id || '')) return;

    // إذا كان مطروداً مسبقاً من هذا الجروب — تجاهل
    if (banDb[`${groupId}:${pNum}`]) return;

    const scan = await scanDevices(sock, memberJid);
    if (!scan || scan.extra < 1) return;

    try {
        // أضفه للحظر حتى لا يعود
        banDb[`${groupId}:${pNum}`] = Date.now();
        save(FILES.BANNED, banDb);
        // أزله من قوائم المراقبة حتى لا يُفحص مجدداً
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

// ============================================================
//   إعداد الفحص الدوري — يُستدعى مرة واحدة عند تشغيل البوت
// ============================================================
/**
 * @param {object} sock - اتصال Baileys
 * @param {object} [opts] - خيارات إضافية
 * @param {Map}    [opts.cmdCooldowns] - خريطة cooldowns الأوامر (للتنظيف الدوري)
 */
function setupMonitoring(sock, opts = {}) {
    // حفظ مرجع السوكت عالمياً ليستخدمه الفحص الدوري
    global._botSock = sock;

    // تنظيف دوري للذاكرة كل 10 دقائق
    setInterval(() => {
        const now = Date.now();
        // تنظيف cooldowns
        if (opts.cmdCooldowns) {
            for (const [k, v] of opts.cmdCooldowns) {
                if (now - v > 120000) opts.cmdCooldowns.delete(k);
            }
        }
        // تنظيف جلسات الملصق المنتهية
        if (global._stickerSession) {
            for (const [k, v] of Object.entries(global._stickerSession)) {
                if (now - (v.ts||0) > 600000) delete global._stickerSession[k];
            }
        }
        // تنظيف جلسات العجلة المنتهية
        if (global._wheelSession) {
            for (const [k, v] of Object.entries(global._wheelSession)) {
                if (now - (v.ts||0) > 3600000) delete global._wheelSession[k];
            }
        }
    }, 600000);

    // فحص الأعضاء الجدد كل 30 ثانية (خلال ساعة من الانضمام)
    setInterval(async () => {
        if (!global._botSock) return;
        const now = Date.now();
        for (const [key, info] of newMemberWatch.entries()) {
            const age = now - info.joinTime;
            // انتهت مدة الساعة — أضفه للمراقبة الدورية
            if (age > 60 * 60 * 1000) {
                newMemberWatch.delete(key);
                if (!watchedMembers.has(info.groupId)) watchedMembers.set(info.groupId, new Set());
                watchedMembers.get(info.groupId).add(info.memberJid);
                continue;
            }
            // فحص كل دقيقتين خلال الساعة الأولى
            if (age % (2 * 60 * 1000) < 30000) {
                await checkMemberForBot(global._botSock, info.memberJid, info.groupId).catch(() => {});
                await new Promise(r => setTimeout(r, 300));
            }
        }
    }, 30000); // كل 30 ثانية يتحقق

    // فحص دوري كل 6 ساعات لكل أعضاء الجروبات المحمية
    setInterval(async () => {
        if (!global._botSock) return;
        const sk = global._botSock;
        for (const groupId of protectedGroups) {
            try {
                const meta = await getMeta(sk, groupId);
                const members = meta.participants || [];
                for (const m of members) {
                    const mJid = m.id || m;
                    if (isUserProtected(mJid)) continue;
                    if (SUPER_OWNERS.includes(numOf(mJid))) continue;
                    if (numOf(mJid) === numOf(sk.user?.id || '')) continue;
                    await checkMemberForBot(sk, mJid, groupId);
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch {}
            await new Promise(r => setTimeout(r, 2000));
        }
    }, 6 * 60 * 60 * 1000); // كل 6 ساعات
}

module.exports = {
    newMemberWatch,
    watchedMembers,
    checkMemberForBot,
    setupMonitoring,
};
