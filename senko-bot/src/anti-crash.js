'use strict';

const { log } = require('./logger');

const _errorCounts = {};
const ERROR_THRESHOLD = 5;
const ERROR_WINDOW = 60000;

function getErrorStats() {
    const now = Date.now();
    const stats = {};
    for (const [cmd, entries] of Object.entries(_errorCounts)) {
        const recent = entries.filter(t => now - t < ERROR_WINDOW);
        if (recent.length) stats[cmd] = recent.length;
    }
    return stats;
}

function trackError(command) {
    if (!_errorCounts[command]) _errorCounts[command] = [];
    _errorCounts[command].push(Date.now());
    const now = Date.now();
    _errorCounts[command] = _errorCounts[command].filter(t => now - t < ERROR_WINDOW);
    return _errorCounts[command].length >= ERROR_THRESHOLD;
}

async function safeExecute(fn, ctx, commandLabel) {
    try {
        await fn();
    } catch (err) {
        const isCritical = trackError(commandLabel);
        log.error(`[Anti-Crash] خطأ في ${commandLabel}: ${err.message}`);

        const errorReport = `🛡️ *Anti-Crash Report*
*━━━━━━━━━━━━━━━━━━*
*│⚠️ أمر:* ${commandLabel}
*│📍 جروب:* ${ctx?.chatId || 'غير معروف'}
*│👤 مرسل:* ${ctx?.senderNum || 'غير معروف'}
*│❌ خطأ:* ${err.message?.slice(0, 200)}
*│⏰ وقت:* ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}
*│🔴 حرج:* ${isCritical ? 'نعم — تكرر أكثر من 5 مرات/دقيقة' : 'لا'}
*━━━━━━━━━━━━━━━━━━*`;

        try {
            const { getDb } = require('./database');
            const logDb = getDb('log');
            if (logDb?.groupId && ctx?.sock) {
                await ctx.sock.sendMessage(logDb.groupId, { text: errorReport });
            }
        } catch {}

        if (ctx?.sock && ctx?.chatId) {
            try {
                await ctx.sock.sendMessage(ctx.chatId, {
                    text: `❌ حدث خطأ أثناء تنفيذ الأمر.\n> ${err.message?.slice(0, 100)}`
                });
            } catch {}
        }
    }
}

function wrapHandler(handler, label) {
    return async (ctx) => {
        await safeExecute(() => handler(ctx), ctx, label);
    };
}

function wrapCommandsObj(commandsObj, label) {
    const wrapped = {};
    for (const [cmd, fn] of Object.entries(commandsObj)) {
        if (typeof fn === 'function') {
            wrapped[cmd] = async (...args) => {
                const ctx = args[args.length - 1];
                await safeExecute(() => fn(...args), ctx, `${label}:${cmd}`);
            };
        } else {
            wrapped[cmd] = fn;
        }
    }
    return wrapped;
}

module.exports = {
    safeExecute,
    wrapHandler,
    wrapCommandsObj,
    getErrorStats,
    trackError,
};
