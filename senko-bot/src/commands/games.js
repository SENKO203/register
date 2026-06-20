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

const fs = require('fs');
const {
    FILES, ANIME_CHARS, OWNERS, SUPER_OWNER, BOT_LID, BOT_NUM,
} = require('../config');
const {
    save, resolveId, numOf, isBotJid,
    getPoints, addPoints, getMeta, randChar,
} = require('../helpers');
const { sessionsDb, pointsDb, logDb } = require('../database');

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

        if ((type === 'writing_continuous' || type === 'dismantling' || type === 'counting') && hasScores) {
            const sorted = Object.entries(session.scores).sort(([, a], [, b]) => b - a);
            const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
            const top5 = sorted.slice(0, 5);
            const cleanNum = (n) => n.replace(/[^0-9]/g, '');
            const mentions = top5.map(([n]) => cleanNum(n) + '@s.whatsapp.net');
            const [winNum, winScore] = sorted[0];
            addPoints(chatId, winNum, winScore * 2);
            const typeLabel = type === 'dismantling' ? 'التفكيك' : type === 'counting' ? 'التعداد' : 'الكتابة';
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

module.exports = {
    commands,
    handleSpeedSelect,
    handleXOMove,
};
