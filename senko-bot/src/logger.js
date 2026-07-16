// ============================================================
//   تلوين التيرمكس + أدوات التسجيل
// ============================================================

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
    bgMagenta: '\x1b[45m',
    bgCyan: '\x1b[46m'
};

const showBanner = () => {
    console.clear();
    console.log(colors.bright + colors.cyan + `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║    ███████╗███████╗███╗   ██╗██╗  ██╗ ██████╗               ║
║    ██╔════╝██╔════╝████╗  ██║██║ ██╔╝██╔═══██╗              ║
║    ███████╗█████╗  ██╔██╗ ██║█████╔╝ ██║   ██║              ║
║    ╚════██║██╔══╝  ██║╚██╗██║██╔═██╗ ██║   ██║              ║
║    ███████║███████╗██║ ╚████║██║  ██╗╚██████╔╝              ║
║    ╚══════╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝               ║
║                                                              ║
║              ██████╗  ██████╗ ████████╗                     ║
║              ██╔══██╗██╔═══██╗╚══██╔══╝                     ║
║              ██████╔╝██║   ██║   ██║                        ║
║              ██╔══██╗██║   ██║   ██║                        ║
║              ██████╔╝╚██████╔╝   ██║                        ║
║              ╚═════╝  ╚═════╝    ╚═╝                        ║
║                                                              ║
║               🤖 WELCOME TO SENKO BOT 🤖                     ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    ` + colors.reset);

    console.log(colors.bright + colors.yellow + `
┌─────────────────────────────────────────────────────────────┐
│                     SYSTEM STATUS                           │
├─────────────────────────────────────────────────────────────┤
│  • Version     : 2.0.0                                      │
│  • Developer   : SENKO TEAM                                 │
│  • Status      : ✅ READY                                   │
│  • Mode        : PAIRING MODE                               │
└─────────────────────────────────────────────────────────────┘
    ` + colors.reset);
};

const log = {
    info: (msg) => console.log(colors.blue + '📘 INFO │ ' + colors.reset + msg),
    success: (msg) => console.log(colors.green + '✅ SUCCESS │ ' + colors.reset + msg),
    warn: (msg) => console.log(colors.yellow + '⚠️ WARN │ ' + colors.reset + msg),
    error: (msg) => console.log(colors.red + '❌ ERROR │ ' + colors.reset + msg),
    input: (msg) => console.log(colors.magenta + '📱 INPUT │ ' + colors.reset + msg),
    pair: (msg) => console.log(colors.cyan + '🔗 PAIR │ ' + colors.reset + msg),
    senko: (msg) => console.log(colors.bright + colors.green + '⚡ SENKO │ ' + colors.reset + msg)
};

module.exports = { colors, showBanner, log };
