/**
 * Senko Bot - Game Commands
 *
 * Commands:
 *   .كتابة   - Writing speed game (continuous rounds)
 *   .تعداد   - Letter counting game
 *   .تفكيك   - Dismantling game (spell out letters)
 *   .توقف    - Stop active game and show results
 *   .اكس     - Start X&O (tic-tac-toe)
 *   .اكس_توقف - Stop X&O game
 *   .تخمين   - Guessing game (1-100)
 *
 * Also exports:
 *   handleGameAnswer   - Non-command handler for writing/counting/dismantling answers
 *   handleXOMove       - Non-command handler for X&O digit moves
 *   handleGuessingMove - Non-command handler for guessing game attempts
 *   handleSpeedSelect  - Non-command handler for speed selection replies
 */
'use strict';

const {
    FILES, OWNERS, SUPER_OWNER,
} = require('../config');
const {
    save, resolveId, numOf, isBotJid,
    getPoints, addPoints, getMeta, randChar,
} = require('../helpers');
const { sessionsDb, pointsDb, logDb } = require('../database');

// ============================================================
//  Country flags data for .اعلام game
// ============================================================
const FLAGS_DATA = [
    { flag: '🇸🇦', names: ['السعودية'] },
    { flag: '🇦🇪', names: ['الامارات'] },
    { flag: '🇪🇬', names: ['مصر'] },
    { flag: '🇯🇴', names: ['الاردن'] },
    { flag: '🇮🇶', names: ['العراق'] },
    { flag: '🇰🇼', names: ['الكويت'] },
    { flag: '🇶🇦', names: ['قطر'] },
    { flag: '🇧🇭', names: ['البحرين'] },
    { flag: '🇴🇲', names: ['عمان', 'سلطنة عمان'] },
    { flag: '🇾🇪', names: ['اليمن'] },
    { flag: '🇸🇾', names: ['سوريا'] },
    { flag: '🇱🇧', names: ['لبنان'] },
    { flag: '🇵🇸', names: ['فلسطين'] },
    { flag: '🇱🇾', names: ['ليبيا'] },
    { flag: '🇹🇳', names: ['تونس'] },
    { flag: '🇩🇿', names: ['الجزائر'] },
    { flag: '🇲🇦', names: ['المغرب'] },
    { flag: '🇸🇩', names: ['السودان'] },
    { flag: '🇯🇵', names: ['اليابان'] },
    { flag: '🇰🇷', names: ['كوريا', 'كوريا الجنوبية'] },
    { flag: '🇨🇳', names: ['الصين'] },
    { flag: '🇺🇸', names: ['امريكا', 'الولايات المتحدة'] },
    { flag: '🇬🇧', names: ['بريطانيا', 'انجلترا', 'المملكة المتحدة'] },
    { flag: '🇫🇷', names: ['فرنسا'] },
    { flag: '🇩🇪', names: ['المانيا'] },
    { flag: '🇮🇹', names: ['ايطاليا'] },
    { flag: '🇪🇸', names: ['اسبانيا'] },
    { flag: '🇧🇷', names: ['البرازيل'] },
    { flag: '🇦🇷', names: ['الارجنتين'] },
    { flag: '🇹🇷', names: ['تركيا'] },
    { flag: '🇮🇳', names: ['الهند'] },
    { flag: '🇷🇺', names: ['روسيا'] },
    { flag: '🇨🇦', names: ['كندا'] },
    { flag: '🇦🇺', names: ['استراليا'] },
    { flag: '🇲🇽', names: ['المكسيك'] },
    { flag: '🇵🇰', names: ['باكستان'] },
    { flag: '🇮🇷', names: ['ايران'] },
    { flag: '🇹🇭', names: ['تايلاند'] },
    { flag: '🇳🇬', names: ['نيجيريا'] },
    { flag: '🇿🇦', names: ['جنوب افريقيا'] },
    { flag: '🇸🇪', names: ['السويد'] },
    { flag: '🇳🇴', names: ['النرويج'] },
    { flag: '🇵🇹', names: ['البرتغال'] },
    { flag: '🇳🇱', names: ['هولندا'] },
    { flag: '🇧🇪', names: ['بلجيكا'] },
    { flag: '🇨🇭', names: ['سويسرا'] },
    { flag: '🇵🇱', names: ['بولندا'] },
    { flag: '🇬🇷', names: ['اليونان'] },
    { flag: '🇮🇩', names: ['اندونيسيا'] },
    { flag: '🇲🇾', names: ['ماليزيا'] },
];

const _flagNorm = s => s.trim()
    .replace(/أ|إ|آ/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .replace(/\s+/g, '').toLowerCase();

// ============================================================
//  Command handlers
// ============================================================

const commands = {};

// .كتابة
commands['.كتابة'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup, senderNum } = ctx;
    if (!isGroup) return;
    if (sessionsDb[chatId]?.active) return sock.sendMessage(chatId, { text: "⚠️ يوجد فعالية نشطة." });

    const speedMap = { '.1': 1000, '.3': 3000, '.4': 4000, '.5': 5000, '.6': 6000, '.7': 7000 };
    if (!args.trim()) {
        const selMsg = await sock.sendMessage(chatId, {
            text: "*كتابة ✒️ — اختر السرعة:*\n*.1* — ثانية\n*.3* — 3 ثواني\n*.4* — 4 ثواني\n*.5* — 5 ثواني\n*.6* — 6 ثواني\n*.7* — 7 ثواني\n\n*رد على هذه الرسالة بالرقم المطلوب*"
        });
        sessionsDb[chatId + '_speed_select'] = { type: 'writing_continuous', msgId: selMsg.key.id, ts: Date.now() };
        save(FILES.SESSIONS, sessionsDb);
        return;
    }
    const delayMs = speedMap[args.trim()] || 3000;
    sessionsDb[chatId] = { active: true, type: 'writing_continuous', scores: {}, round: 0, delay: delayMs, answered: false };
    save(FILES.SESSIONS, sessionsDb);

    const activeTimers = global._botTimers = global._botTimers || {};

    const runRound = async () => {
        if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'writing_continuous') return;
        const session = sessionsDb[chatId];
        const char = randChar();
        session.round++;
        session.answer = char;
        session.answered = false;
        save(FILES.SESSIONS, sessionsDb);
        await sock.sendMessage(chatId, { text: `*كتابة ✒️ ⟦${char}⟧*` });
        activeTimers[chatId] = setTimeout(async () => {
            if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'writing_continuous') return;
            await runRound();
        }, session.delay);
    };
    runRound();
};

// .تعداد
commands['.تعداد'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup } = ctx;
    if (!isGroup) return;
    if (sessionsDb[chatId]?.active) return sock.sendMessage(chatId, { text: "⚠️ يوجد فعالية نشطة." });

    const speedMap = { '.1': 1000, '.3': 3000, '.4': 4000, '.5': 5000, '.6': 6000, '.7': 7000 };
    if (!args.trim()) {
        const selMsg = await sock.sendMessage(chatId, {
            text: "*تعداد ✒️ — اختر السرعة:*\n*.1* — ثانية\n*.3* — 3 ثواني\n*.4* — 4 ثواني\n*.5* — 5 ثواني\n*.6* — 6 ثواني\n*.7* — 7 ثواني\n\n*رد على هذه الرسالة بالرقم المطلوب*"
        });
        sessionsDb[chatId + '_speed_select'] = { type: 'counting', msgId: selMsg.key.id, ts: Date.now() };
        save(FILES.SESSIONS, sessionsDb);
        return;
    }
    const delayMs = speedMap[args.trim()] || 5000;
    sessionsDb[chatId] = { active: true, type: 'counting', scores: {}, round: 0, delay: delayMs, answered: false };
    save(FILES.SESSIONS, sessionsDb);

    const activeTimers = global._botTimers = global._botTimers || {};

    const runCounting = async () => {
        if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'counting') return;
        const session = sessionsDb[chatId];
        const char = randChar();
        const count = [...char.replace(/\s/g, '')].length.toString();
        session.round++;
        session.answer = count;
        session.charName = char;
        session.answered = false;
        save(FILES.SESSIONS, sessionsDb);
        await sock.sendMessage(chatId, { text: `*تعداد ✒️ ⟦${char}⟧*\n*كم عدد الحروف؟*` });
        activeTimers[chatId] = setTimeout(async () => {
            if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'counting') return;
            await runCounting();
        }, session.delay);
    };
    runCounting();
};

// .تفكيك
commands['.تفكيك'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup } = ctx;
    if (!isGroup) return;
    if (sessionsDb[chatId]?.active) return sock.sendMessage(chatId, { text: "⚠️ يوجد فعالية نشطة." });

    const speedMap = { '.1': 1000, '.3': 3000, '.4': 4000, '.5': 5000, '.6': 6000, '.7': 7000 };
    if (!args.trim()) {
        const selMsg = await sock.sendMessage(chatId, {
            text: "*تفكيك ✒️ — اختر السرعة:*\n*.1* — ثانية\n*.3* — 3 ثواني\n*.4* — 4 ثواني\n*.5* — 5 ثواني\n*.6* — 6 ثواني\n*.7* — 7 ثواني\n\n*رد على هذه الرسالة بالرقم المطلوب*"
        });
        sessionsDb[chatId + '_speed_select'] = { type: 'dismantling', msgId: selMsg.key.id, ts: Date.now() };
        save(FILES.SESSIONS, sessionsDb);
        return;
    }
    const delayMs = speedMap[args.trim()] || 3000;
    sessionsDb[chatId] = { active: true, type: 'dismantling', scores: {}, round: 0, delay: delayMs, answered: false };
    save(FILES.SESSIONS, sessionsDb);

    const activeTimers = global._botTimers = global._botTimers || {};

    const runDismantling = async () => {
        if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'dismantling') return;
        const session = sessionsDb[chatId];
        const char = randChar();
        session.round++;
        session.answer = char;
        session.answered = false;
        save(FILES.SESSIONS, sessionsDb);
        await sock.sendMessage(chatId, { text: `*تفكيك ✒️ ⟦${char}⟧*\n*فككه حرفاً حرفاً بمسافات*` });
        activeTimers[chatId] = setTimeout(async () => {
            if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'dismantling') return;
            await runDismantling();
        }, session.delay);
    };
    runDismantling();
};

// .توقف
commands['.توقف'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup, senderNum } = ctx;
    if (!isGroup) return;

    const activeTimers = global._botTimers = global._botTimers || {};
    if (sessionsDb[chatId]?.active) {
        if (activeTimers[chatId]) { clearTimeout(activeTimers[chatId]); delete activeTimers[chatId]; }
        const session = sessionsDb[chatId];
        const type = session.type;
        const hasScores = session.scores && Object.keys(session.scores).length > 0;

        if (type === 'writing_event') {
            delete sessionsDb[chatId];
            save(FILES.SESSIONS, sessionsDb);
            if (hasScores) {
                const sorted = Object.entries(session.scores).sort(([, a], [, b]) => b - a);
                const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
                const top5 = sorted.slice(0, 5);
                const cleanNum = (n) => n.replace(/[^0-9]/g, '');
                const [winNum, winScore] = sorted[0];
                addPoints(chatId, winNum, winScore * 2);
                const groupName = (await sock.groupMetadata(chatId).catch(() => null))?.subject || chatId;
                let resultText = `📊 *نتائج الحدث الصامت*\n*━━━━━━━━━━━━━━━━━━*\n📍 ${groupName}\n🏆 *النتائج:*\n`;
                top5.forEach(([n, s], i) => {
                    resultText += `${medals[i] || (i + 1) + '.'} ${cleanNum(n)} — *${s}* نقطة\n`;
                });
                resultText += `\n🏆 الفائز: ${cleanNum(winNum)} (+${winScore * 2} نقطة)\n*━━━━━━━━━━━━━━━━━━*`;
                await sock.sendMessage(SUPER_OWNER + '@s.whatsapp.net', { text: resultText }).catch(() => {});
            }
            await sock.sendMessage(chatId, { text: '⏹️ تم إيقاف الحدث.' + (hasScores ? ' النتائج أُرسلت للمطور.' : '') });
            return;
        }

        if ((type === 'writing_continuous' || type === 'dismantling' || type === 'counting' || type === 'flags') && hasScores) {
            const sorted = Object.entries(session.scores).sort(([, a], [, b]) => b - a);
            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
            const top5 = sorted.slice(0, 5);
            const cleanNum = (n) => n.replace(/[^0-9]/g, '');
            const mentions = top5.map(([n]) => cleanNum(n) + '@s.whatsapp.net');
            const [winNum, winScore] = sorted[0];
            addPoints(chatId, winNum, winScore * 2);
            const typeLabel = type === 'dismantling' ? 'التفكيك' : type === 'counting' ? 'التعداد' : type === 'flags' ? 'الأعلام' : 'الكتابة';
            let resultText = `⏹️ *انتهت فعالية ${typeLabel}!*\n*━━━━━━━━━━━━━━━━━━*\n🏆 *النتائج النهائية:*\n`;
            top5.forEach(([n, s], i) => {
                resultText += `${medals[i] || (i + 1) + '.'} @${cleanNum(n)} — *${s}* نقطة\n`;
            });
            resultText += `*━━━━━━━━━━━━━━━━━━*`;
            delete sessionsDb[chatId];
            save(FILES.SESSIONS, sessionsDb);
            await sock.sendMessage(chatId, { text: resultText, mentions });

            const groupName = (await sock.groupMetadata(chatId).catch(() => null))?.subject || chatId;
            let pointsReport = `📊 *نقاط فعالية ${typeLabel}*\n*━━━━━━━━━━━━━━━━━━*\n📍 الجروب: ${groupName}\n\n`;
            top5.forEach(([n, s], i) => {
                pointsReport += `${medals[i] || (i + 1) + '.'} ${cleanNum(n)} — *${s}* نقطة\n`;
            });
            pointsReport += `\n🏆 الفائز: ${cleanNum(winNum)} حصل على *${winScore * 2}* نقطة إضافية\n*━━━━━━━━━━━━━━━━━━*`;
            if (logDb.groupId) {
                await sock.sendMessage(logDb.groupId, { text: pointsReport }).catch(() => {});
            } else {
                await sock.sendMessage(SUPER_OWNER + '@s.whatsapp.net', { text: pointsReport }).catch(() => {});
            }
        } else {
            delete sessionsDb[chatId];
            save(FILES.SESSIONS, sessionsDb);
            await sock.sendMessage(chatId, { text: "⏹️ تم إيقاف الفعالية بدون نتائج." });
        }
        return;
    }
    if (sessionsDb[chatId + '_xo']?.active) {
        delete sessionsDb[chatId + '_xo'];
        save(FILES.SESSIONS, sessionsDb);
        await sock.sendMessage(chatId, { text: "⏹️ تم إيقاف لعبة X&O." });
        return;
    }

    await sock.sendMessage(chatId, { text: "⚠️ لا توجد فعالية أو لعبة نشطة." });
};

// .اكس
commands['.اكس'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup, senderJid, senderNum } = ctx;
    if (!isGroup) return;
    if (sessionsDb[chatId + '_xo']?.active) return sock.sendMessage(chatId, { text: "⚠️ يوجد لعبة X&O نشطة." });
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
    if (!mentioned) return sock.sendMessage(chatId, { text: "⚠️ منشن الخصم: .اكس @الخصم" });

    const p1Jid = senderJid;
    const p2Jid = mentioned;
    const p1Display = senderNum;
    const p2Display = resolveId(mentioned);

    if (p1Jid === p2Jid || p1Display === p2Display) return sock.sendMessage(chatId, { text: "⚠️ لا يمكن اللعب مع نفسك." });
    if (isBotJid(mentioned))
        return sock.sendMessage(chatId, { text: "⚠️ لا يمكن اللعب مع البوت." });

    const board = Array(9).fill(null);
    sessionsDb[chatId + '_xo'] = {
        active: true, type: 'xo', board,
        p1Jid, p2Jid,
        p1: p1Display, p2: p2Display,
        turnJid: p1Jid
    };
    save(FILES.SESSIONS, sessionsDb);

    const render = (b) => {
        const s = b.map((c, i) => c === 'X' ? '❌' : c === 'O' ? '⭕' : ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'][i]);
        return s[0] + s[1] + s[2] + '\n' + s[3] + s[4] + s[5] + '\n' + s[6] + s[7] + s[8];
    };
    await sock.sendMessage(chatId, {
        text: `*❆┇فـعـالـيـه اكـس أوو (𝐌)❌⭕↶*\n\n*❀الـمـتـسـابـق❌ @${p1Display}*\n*❀الـمـتـسـابـق⭕ @${p2Display}*\n\n${render(board)}\n\n*دور: @${p1Display} ❌*\n*أرسل رقم الخانة (1-9)*`,
        mentions: [p1Jid, p2Jid]
    });
};

// .اكس_توقف
commands['.اكس_توقف'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup } = ctx;
    if (!isGroup) return;
    if (!sessionsDb[chatId + '_xo']?.active) return sock.sendMessage(chatId, { text: "⚠️ لا توجد لعبة X&O." });
    delete sessionsDb[chatId + '_xo'];
    save(FILES.SESSIONS, sessionsDb);
    await sock.sendMessage(chatId, { text: "⏹️ تم إيقاف لعبة X&O." });
};

// .تخمين
commands['.تخمين'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup } = ctx;
    if (!isGroup) return;
    if (sessionsDb[chatId]?.active)
        return sock.sendMessage(chatId, { text: "⚠️ يوجد فعالية نشطة بالفعل، أوقفها أولاً بـ .توقف" });
    const secret = Math.floor(Math.random() * 100) + 1;
    sessionsDb[chatId] = {
        active: true, type: 'guess', secret,
        scores: {}, attempts: {}, round: 1
    };
    save(FILES.SESSIONS, sessionsDb);
    await sock.sendMessage(chatId, {
        text: `🔢 *فعالية التخمين!*\n*━━━━━━━━━━━━━━━━━━*\nأنا أفكر في رقم بين *1* و *100*\nمن يخمّن الرقم الصحيح يفوز! 🏆\n*أرسل تخمينك الآن...*\n*━━━━━━━━━━━━━━━━━━*`
    });
};

// .اعلام — flag guessing game (10 rounds)
commands['.اعلام'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup } = ctx;
    if (!isGroup) return;
    if (sessionsDb[chatId]?.active) return sock.sendMessage(chatId, { text: "⚠️ يوجد فعالية نشطة." });

    const shuffled = [...FLAGS_DATA].sort(() => Math.random() - 0.5).slice(0, 10);
    sessionsDb[chatId] = {
        active: true, type: 'flags', scores: {}, round: 0,
        flags: shuffled, maxRounds: 10, answered: false
    };
    save(FILES.SESSIONS, sessionsDb);

    await sock.sendMessage(chatId, {
        text: `*🏳️ فعالية الأعلام!*\n*━━━━━━━━━━━━━━━━━━*\n10 أعلام — أول شخص يكتب اسم الدولة يفوز بنقطة!\n⏰ 15 ثانية لكل سؤال\n*━━━━━━━━━━━━━━━━━━*`
    });
    runFlagRound(sock, chatId);
};

// .حدث — silent writing event (no confirmation messages, results to developer)
commands['.حدث'] = async (sock, msg, args, ctx) => {
    const { chatId, isGroup } = ctx;
    if (!isGroup) return;
    if (sessionsDb[chatId]?.active) return sock.sendMessage(chatId, { text: "⚠️ يوجد فعالية نشطة." });

    sessionsDb[chatId] = {
        active: true, type: 'writing_event', scores: {}, round: 0, answered: false
    };
    save(FILES.SESSIONS, sessionsDb);

    await sock.sendMessage(chatId, {
        text: `*✒️ حدث الكتابة الصامت!*\n*━━━━━━━━━━━━━━━━━━*\nاكتب اسم الشخصية بشكل صحيح\n🔇 صامتة — بدون رسائل تأكيد\n📊 النتائج ترسل للمطور عند التوقف\n*━━━━━━━━━━━━━━━━━━*`
    });
    runWritingEventRound(sock, chatId);
};

// ============================================================
//  Non-command handlers (called from handler.js for mid-game text)
// ============================================================

/**
 * Handle speed selection replies (.1 .3 .4 .5 .6 .7)
 * Returns true if handled, false otherwise.
 */
async function handleSpeedSelect(sock, msg, command, chatId, isGroup) {
    if (!isGroup || !sessionsDb[chatId + '_speed_select']) return false;
    const sel = sessionsDb[chatId + '_speed_select'];
    const speedMapCmd = { '.1': 1000, '.3': 3000, '.4': 4000, '.5': 5000, '.6': 6000, '.7': 7000 };
    const isStillFresh = Date.now() - (sel.ts || 0) < 60000;
    if (speedMapCmd[command] === undefined || !isStillFresh) return false;

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
                await sock.sendMessage(chatId, { text: `*كتابة ✒️ ⟦${c}⟧*` });
                aT[chatId] = setTimeout(async () => { if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'writing_continuous') return; await run(); }, delayMs);
            }; run();
        } else if (type === 'counting') {
            const runC = async () => {
                if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'counting') return;
                const s = sessionsDb[chatId]; const c = randChar(); const cnt = [...c.replace(/\s/g, '')].length.toString();
                s.round++; s.answer = cnt; s.charName = c; s.answered = false; save(FILES.SESSIONS, sessionsDb);
                await sock.sendMessage(chatId, { text: `*تعداد ✒️ ⟦${c}⟧*\n*كم عدد الحروف؟*` });
                aT[chatId] = setTimeout(async () => { if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'counting') return; await runC(); }, delayMs);
            }; runC();
        } else if (type === 'dismantling') {
            const runD = async () => {
                if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'dismantling') return;
                const s = sessionsDb[chatId]; const c = randChar(); s.round++; s.answer = c; s.answered = false; save(FILES.SESSIONS, sessionsDb);
                await sock.sendMessage(chatId, { text: `*تفكيك ✒️ ⟦${c}⟧*\n*فككه حرفاً حرفاً بمسافات*` });
                aT[chatId] = setTimeout(async () => { if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'dismantling') return; await runD(); }, delayMs);
            }; runD();
        }
    };
    await startActivity(sel.type);
    return true;
}

/**
 * Handle X&O digit moves (1-9).
 * Returns true if handled, false otherwise.
 */
async function handleXOMove(sock, msg, text, chatId, senderJid) {
    if (!sessionsDb[chatId + '_xo']?.active || !/^[1-9]$/.test(text.trim())) return false;
    const xog = sessionsDb[chatId + '_xo'];
    const senderResolved = resolveId(senderJid);
    const p1Resolved = resolveId(xog.p1Jid);
    const p2Resolved = resolveId(xog.p2Jid);
    const turnResolved = resolveId(xog.turnJid);
    const isP1 = senderResolved === p1Resolved;
    const isP2 = senderResolved === p2Resolved;
    if (!isP1 && !isP2) return false;
    if (senderResolved !== turnResolved) return false;

    const move = parseInt(text.trim()) - 1;
    if (xog.board[move] !== null) {
        await sock.sendMessage(chatId, { text: "⚠️ هذه الخانة محجوزة." });
        return true;
    }
    xog.board[move] = isP1 ? 'X' : 'O';

    const render = (b) => {
        const s = b.map((c, i) => c === 'X' ? '❌' : c === 'O' ? '⭕' : ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'][i]);
        return s[0] + s[1] + s[2] + '\n' + s[3] + s[4] + s[5] + '\n' + s[6] + s[7] + s[8];
    };
    const wins = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    const winner = wins.find(([a, b, c]) => xog.board[a] && xog.board[a] === xog.board[b] && xog.board[a] === xog.board[c]);
    const isDraw = !winner && xog.board.every(c => c !== null);

    if (winner || isDraw) {
        delete sessionsDb[chatId + '_xo'];
        save(FILES.SESSIONS, sessionsDb);
        if (winner) {
            const winDisplay = isP1 ? xog.p1 : xog.p2;
            const loseDisplay = isP1 ? xog.p2 : xog.p1;
            const winJid = isP1 ? xog.p1Jid : xog.p2Jid;
            const loseJid = isP1 ? xog.p2Jid : xog.p1Jid;
            addPoints(chatId, winDisplay, 30);
            await sock.sendMessage(chatId, {
                text: `${render(xog.board)}\n\n*❆┇جـوائـز فـعـالـيـه اكـس أوو(𝐌)❌⭕↶*\n\n*❀الـفـائـز ﹝@${winDisplay}﹞*\n*الـجـائـزه﹝30 نقطة﹞*\n\n*❀الـخـاسـر ﹝@${loseDisplay}﹞*`,
                mentions: [winJid, loseJid]
            });
        } else {
            await sock.sendMessage(chatId, { text: render(xog.board) + '\n\n🤝 *تعادل!*' });
        }
        return true;
    }

    xog.turnJid = isP1 ? xog.p2Jid : xog.p1Jid;
    const nextDisplay = isP1 ? xog.p2 : xog.p1;
    const nextJid = xog.turnJid;
    const nextSym = isP1 ? '⭕' : '❌';
    save(FILES.SESSIONS, sessionsDb);
    await sock.sendMessage(chatId, {
        text: `${render(xog.board)}\n\n*دور: @${nextDisplay} ${nextSym}*\n*أرسل رقم الخانة (1-9)*`,
        mentions: [nextJid]
    });
    return true;
}

// ============================================================
//  Flag game helpers
// ============================================================
async function runFlagRound(sock, chatId) {
    const session = sessionsDb[chatId];
    if (!session || session.type !== 'flags') return;

    if (session.round >= session.maxRounds) {
        await endFlagGame(sock, chatId);
        return;
    }

    const activeTimers = global._botTimers = global._botTimers || {};
    const current = session.flags[session.round];
    session.answer = current.names[0];
    session.answered = false;
    save(FILES.SESSIONS, sessionsDb);

    await sock.sendMessage(chatId, {
        text: `*🏳️ أعلام ⟦${session.round + 1}/${session.maxRounds}⟧*\n\n${current.flag}\n\n*ما هي هذه الدولة؟*`
    });

    activeTimers[chatId] = setTimeout(async () => {
        if (!sessionsDb[chatId] || sessionsDb[chatId].type !== 'flags') return;
        if (!sessionsDb[chatId].answered) {
            await sock.sendMessage(chatId, { text: `⏰ انتهى الوقت! الإجابة: *${current.names[0]}*` });
            sessionsDb[chatId].round++;
            save(FILES.SESSIONS, sessionsDb);
            await runFlagRound(sock, chatId);
        }
    }, 15000);
}

async function endFlagGame(sock, chatId) {
    const session = sessionsDb[chatId];
    if (!session) return;
    const activeTimers = global._botTimers || {};
    if (activeTimers[chatId]) { clearTimeout(activeTimers[chatId]); delete activeTimers[chatId]; }

    const hasScores = session.scores && Object.keys(session.scores).length > 0;
    if (hasScores) {
        const sorted = Object.entries(session.scores).sort(([, a], [, b]) => b - a);
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
        const top5 = sorted.slice(0, 5);
        const cleanNum = (n) => n.replace(/[^0-9]/g, '');
        const mentions = top5.map(([n]) => cleanNum(n) + '@s.whatsapp.net');
        const [winNum, winScore] = sorted[0];
        addPoints(chatId, winNum, winScore * 2);
        let resultText = `🏁 *انتهت فعالية الأعلام!*\n*━━━━━━━━━━━━━━━━━━*\n🏆 *النتائج النهائية:*\n`;
        top5.forEach(([n, s], i) => {
            resultText += `${medals[i] || (i + 1) + '.'} @${cleanNum(n)} — *${s}* نقطة\n`;
        });
        resultText += `*━━━━━━━━━━━━━━━━━━*`;
        delete sessionsDb[chatId];
        save(FILES.SESSIONS, sessionsDb);
        await sock.sendMessage(chatId, { text: resultText, mentions });

        const groupName = (await sock.groupMetadata(chatId).catch(() => null))?.subject || chatId;
        let report = `📊 *نقاط فعالية الأعلام*\n*━━━━━━━━━━━━━━━━━━*\n📍 الجروب: ${groupName}\n\n`;
        top5.forEach(([n, s], i) => {
            report += `${medals[i] || (i + 1) + '.'} ${cleanNum(n)} — *${s}* نقطة\n`;
        });
        report += `\n🏆 الفائز: ${cleanNum(winNum)} حصل على *${winScore * 2}* نقطة إضافية\n*━━━━━━━━━━━━━━━━━━*`;
        if (logDb.groupId) {
            await sock.sendMessage(logDb.groupId, { text: report }).catch(() => {});
        } else {
            await sock.sendMessage(SUPER_OWNER + '@s.whatsapp.net', { text: report }).catch(() => {});
        }
    } else {
        delete sessionsDb[chatId];
        save(FILES.SESSIONS, sessionsDb);
        await sock.sendMessage(chatId, { text: '🏁 انتهت فعالية الأعلام بدون نتائج.' });
    }
}

// ============================================================
//  Writing event helper
// ============================================================
async function runWritingEventRound(sock, chatId) {
    const session = sessionsDb[chatId];
    if (!session || session.type !== 'writing_event') return;

    const char = randChar();
    session.round++;
    session.answer = char;
    session.answered = false;
    save(FILES.SESSIONS, sessionsDb);
    await sock.sendMessage(chatId, { text: `*⟦${char}⟧*` });
}

module.exports = {
    commands,
    handleSpeedSelect,
    handleXOMove,
    runFlagRound,
    runWritingEventRound,
    FLAGS_DATA,
};
