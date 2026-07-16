'use strict';

// ============================================================
//   نظام التمويه — يجعل البوت يتصرف كإنسان طبيعي
//   Anti-ban stealth system
// ============================================================

const _msgQueue = new Map();
const _lastSendTime = new Map();
const MIN_DELAY_MS = 800;
const MAX_DELAY_MS = 2500;
const TYPING_SPEED_MS_PER_CHAR = 35;
const MAX_TYPING_MS = 4000;

function calcTypingDelay(text) {
    if (!text || typeof text !== 'string') return MIN_DELAY_MS;
    const len = text.length;
    const typing = Math.min(len * TYPING_SPEED_MS_PER_CHAR, MAX_TYPING_MS);
    const jitter = Math.random() * 600;
    return Math.max(MIN_DELAY_MS, typing + jitter);
}

function calcMediaDelay() {
    return 1500 + Math.random() * 1500;
}

function getMessageText(content) {
    if (!content || typeof content !== 'object') return null;
    return content.text || content.caption || null;
}

function isMediaMessage(content) {
    if (!content || typeof content !== 'object') return false;
    return !!(content.image || content.video || content.audio || content.sticker || content.document);
}

function wrapSockWithStealth(sock) {
    const origSend = sock.sendMessage.bind(sock);

    sock.sendMessage = async (jid, content, options) => {
        if (!jid) return origSend(jid, content, options);

        const now = Date.now();
        const lastSend = _lastSendTime.get(jid) || 0;
        const elapsed = now - lastSend;

        let delay;
        const text = getMessageText(content);
        if (isMediaMessage(content)) {
            delay = calcMediaDelay();
        } else {
            delay = calcTypingDelay(text);
        }

        const remaining = delay - elapsed;
        if (remaining > 0) {
            try {
                await sock.sendPresenceUpdate('composing', jid);
            } catch {}
            await new Promise(r => setTimeout(r, remaining));
        }

        try {
            await sock.sendPresenceUpdate('paused', jid);
        } catch {}

        _lastSendTime.set(jid, Date.now());

        // cleanup old entries
        if (_lastSendTime.size > 200) {
            const cutoff = Date.now() - 60000;
            for (const [k, v] of _lastSendTime) {
                if (v < cutoff) _lastSendTime.delete(k);
            }
        }

        return origSend(jid, content, options);
    };

    return sock;
}

async function simulateReadReceipt(sock, msg) {
    try {
        if (!msg?.key?.id || !msg?.key?.remoteJid) return;
        const jid = msg.key.remoteJid;
        await sock.readMessages([msg.key]);
    } catch {}
}

module.exports = {
    wrapSockWithStealth,
    simulateReadReceipt,
    calcTypingDelay,
};
