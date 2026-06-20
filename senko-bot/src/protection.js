// ============================================================
//   حماية الجروبات — group-participants.update handler
// ============================================================

const { numOf, resolveId, isUserProtected, isAuth, scanDevices, getMeta, invalidateMeta, sendLog } = require('./helpers');
const { SUPER_OWNERS } = require('./config');
const { banDb, protectedGroups, monitoredGroups } = require('./database');
const { newMemberWatch } = require('./monitor');

/**
 * تسجيل handler حدث group-participants.update على السوكت.
 * يُستدعى مرة واحدة عند تشغيل البوت.
 *
 * @param {object} sock - اتصال Baileys
 * @param {object} state - { isReady, bootTime } — حالة البوت
 */
function registerProtectionHandler(sock, state) {
    sock.ev.on("group-participants.update", async ({ id, participants, action, author }) => {
        invalidateMeta(id);
        if (!author || !state.isReady) return;
        const now = Math.floor(Date.now() / 1000);
        if (now - state.bootTime < 5) return;

        const botId = numOf(sock.user.id);
        const authorNum = numOf(author);
        const pList = participants.map(p => typeof p === 'string' ? p : (p?.id || String(p)));

        // ❶ إذا البوت هو الفاعل — لا عقوبة على نفسه أبداً
        if (authorNum === botId) return;
        // ❷ إذا البوت هو الضحية — تجاهل تماماً
        if (pList.some(p => numOf(p) === botId)) return;
        // ❸ خروج طبيعي (author = نفسه) — تجاهل
        const isSelfLeave = pList.length === 1 && numOf(pList[0]) === authorNum;
        if (isSelfLeave) return;

        const isAuthorProtected = isUserProtected(author);
        const isVictimProtected = pList.some(p => isUserProtected(p));

        if (action === 'add') {
            for (const p of pList) {
                if (banDb[`${id}:${resolveId(p)}`] || banDb[`${id}:${numOf(p)}`]) {
                    sock.groupParticipantsUpdate(id, [p], "remove").catch(() => { });
                }
            }
            // ===== فحص البوت للأعضاء الجدد (في الجروبات المحمية فقط) =====
            if (protectedGroups.includes(id)) {
                // أضف الأعضاء الجدد لقائمة المراقبة المكثفة (ساعة)
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
                        // تخطّي المحميين (نخبة/مطور/محمي)
                        if (isUserProtected(p)) continue;
                        const scan = await scanDevices(sock, p);
                        if (scan && scan.extra >= 1) {
                            try {
                                const meta = await getMeta(sock, id);
                                const now = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                                sendLog(sock,
                                    `🤖 *اشتباه بوت — عضو جديد*\n` +
                                    `*━━━━━━━━━━━━━━━━━━*\n` +
                                    `*│🏘️ الجروب:* ${meta.subject}\n` +
                                    `*│👤 العضو:* @${pNum}\n` +
                                    `*│🔗 أجهزة مرتبطة:* ${scan.extra}\n` +
                                    `*│⏰ التوقيت:* ${now}\n` +
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

        // حماية المطور والنخبة والمحميين من السحب والطرد
        // إذا البوت نفسه طُرد — تجاهل ولا تعاقب أحداً
        if ((action === 'remove' || action === 'demote') && isVictimProtected) {
            try {
                const meta = await getMeta(sock, id);
                // طرد الفاعل
                await sock.groupParticipantsUpdate(id, [author], "remove").catch(() => {});
                // إرجاع المطرود/المسحوب مع إشراف
                for (const p of pList) {
                    if (isUserProtected(p)) {
                        if (action === 'remove') {
                            // إعادة إضافة المطرود
                            await sock.groupParticipantsUpdate(id, [p], "add").catch(() => {});
                        }
                        // إعادة الإشراف
                        await sock.groupParticipantsUpdate(id, [p], "promote").catch(() => {});
                    }
                }
                // إرسال للأرشيف
                const victimNums = pList.map(p => '@' + numOf(p)).join(', ');
                const actionAr = action === 'demote' ? 'سحب إشراف' : 'طرد';
                sendLog(sock, `⚠️ *محاولة ${actionAr} محمي*\n\n*الجروب:* ${meta.subject}\n*الفاعل:* @${authorNum}\n*المستهدف:* ${victimNums}\n*الإجراء:* تم طرد الفاعل وإرجاع ${action === 'remove' ? 'المطرود' : 'الإشراف'}`, [author, ...pList]);
            } catch (e) {}
            return;
        }

        // ===== حماية منح الإشراف: فقط النخبة/المطورون/المحميون يمنحون إشرافاً =====
        // المحميون والنخبة والمطورون يستطيعون إعطاء إشراف بحرية
        const authorIsAdmin = (await getMeta(sock, id).catch(()=>({participants:[]}))).participants
            .find(p => (numOf(p.id) === authorNum || resolveId(p.id) === authorNum) && p.admin);
        const authorAllowed = isAuthorProtected || SUPER_OWNERS.includes(authorNum) || isAuth(authorNum);
        if (action === 'promote' && protectedGroups.includes(id) && !authorAllowed) {
            try {
                const meta = await getMeta(sock, id);
                // اسحب إشراف من رُقّوا حديثاً
                for (const p of pList) {
                    await sock.groupParticipantsUpdate(id, [p], "demote").catch(() => {});
                }
                // اسحب إشراف الفاعل غير المصرّح
                await sock.groupParticipantsUpdate(id, [author], "demote").catch(() => {});
                const nowStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                const promotedNums = pList.map(p => '@' + numOf(p)).join(', ');
                sendLog(sock,
                    `🚨 *منح إشراف غير مصرّح*\n` +
                    `*━━━━━━━━━━━━━━━━━━*\n` +
                    `*│🏘️ الجروب:* ${meta.subject}\n` +
                    `*│🔨 الفاعل:* @${authorNum}\n` +
                    `*│👤 من رُقّي:* ${promotedNums}\n` +
                    `*│⚡ الإجراء:* سُحب إشراف الفاعل والمُرقّى\n` +
                    `*│⏰ التوقيت:* ${nowStr}\n` +
                    `*━━━━━━━━━━━━━━━━━━*`,
                    [author, ...pList]);
            } catch (e) {}
            return;
        }

        // ===== المُرقّي مصرّح — لكن افحص إن كان المُرقّى بوتاً =====
        if (action === 'promote' && protectedGroups.includes(id) && authorAllowed) {
            (async () => {
                for (const p of pList) {
                    const pNum = numOf(p);
                    // المحميون (نخبة/مطور/محمي) مستثنون + البوت نفسه
                    if (isUserProtected(p)) continue;
                    const pNumClean = numOf(p);
                    if (SUPER_OWNERS.includes(pNumClean)) continue;
                    if (pNumClean === numOf(sock.user.id)) continue;
                    const scan = await scanDevices(sock, p);
                    if (scan && scan.extra >= 1) {
                        try {
                            // سحب الإشراف (أي جهاز مرتبط)
                            await sock.groupParticipantsUpdate(id, [p], "demote").catch(() => {});
                            const meta = await getMeta(sock, id);
                            const nowStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                            sendLog(sock,
                                `🤖 *سحب إشراف بوت*\n` +
                                `*━━━━━━━━━━━━━━━━━━*\n` +
                                `*│🏘️ الجروب:* ${meta.subject}\n` +
                                `*│👤 المشرف:* @${pNum}\n` +
                                `*│🔗 أجهزة مرتبطة:* ${scan.extra}\n` +
                                `*│⚡ الإجراء:* سُحب الإشراف تلقائياً\n` +
                                `*│⏰ التوقيت:* ${nowStr}\n` +
                                `*━━━━━━━━━━━━━━━━━━*\n` +
                                `⚖️ مؤشر احتمالي (قد يكون ويب/لابتوب).`,
                                [p]);
                        } catch {}
                    }
                    await new Promise(r => setTimeout(r, 200));
                }
            })();
        }

        if (monitoredGroups.includes(id) && (action === 'promote' || action === 'demote' || action === 'remove') && authorNum !== botId) {
            try {
                const meta = await getMeta(sock, id);
                const actionAr = action === 'promote' ? '🟢 منح إشراف' : action === 'demote' ? '🔴 سحب إشراف' : '🚫 طرد';
                const nowStr = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
                for (const p of pList) {
                    const logTxt = [
                        `*📋 تقرير مراقبة*`,
                        `*━━━━━━━━━━━━━━━━━━*`,
                        `*│🏘️ الجروب:* ${meta.subject}`,
                        `*│⚡ الحدث:* ${actionAr}`,
                        `*│🔨 الفاعل:* @${authorNum}`,
                        `*│👤 المستهدف:* @${numOf(p)}`,
                        `*│⏰ التوقيت:* ${nowStr}`,
                        `*━━━━━━━━━━━━━━━━━━*`,
                    ].join('\n');
                    sendLog(sock, logTxt, [author, p]);
                }
            } catch (e) {}
        }
    });
}

module.exports = { registerProtectionHandler };
