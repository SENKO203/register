/**
 * Senko Bot - Entry Point
 * Loads environment variables and starts the bot.
 */
'use strict';

require('dotenv').config();

const { startBot } = require('./connection');
const { log, colors, showBanner } = require('./logger');
const { closeDb } = require('./database');
const { getErrorStats } = require('./anti-crash');

// ============================================================
//      Process error handlers
// ============================================================

process.on('SIGINT', () => {
    log.warn('⛔ تم إيقاف SENKO BOT.');
    closeDb();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log.warn('⛔ SIGTERM — إغلاق البوت.');
    closeDb();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    log.error('❌ خطأ غير متوقع: ' + err.message);
    log.error(err.stack?.slice(0, 500) || '');
    const stats = getErrorStats();
    if (Object.keys(stats).length > 0) {
        log.warn('📊 أخطاء متكررة: ' + JSON.stringify(stats));
    }
});

process.on('unhandledRejection', (reason) => {
    log.error('❌ Promise مرفوض: ' + (reason?.message || reason));
});

// ============================================================
//      Launch
// ============================================================

showBanner();
log.senko(colors.bright + colors.cyan + '⚡ SENKO BOT جاهز' + colors.reset);
startBot();
