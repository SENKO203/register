/**
 * Senko Bot - Entry Point
 * Loads environment variables and starts the bot.
 */
'use strict';

require('dotenv').config();

const { startBot } = require('./connection');
const { log, colors, showBanner } = require('./logger');

// ============================================================
//      Process error handlers
// ============================================================

process.on('SIGINT', () => {
    log.warn('⛔ تم إيقاف SENKO BOT.');
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    log.error('❌ خطأ: ' + err.message);
});

process.on('unhandledRejection', (reason) => {
    log.error('❌ ' + (reason?.message || reason));
});

// ============================================================
//      Launch
// ============================================================

showBanner();
log.senko(colors.bright + colors.cyan + '⚡ SENKO BOT جاهز' + colors.reset);
startBot();
