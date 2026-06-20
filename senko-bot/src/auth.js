/**
 * Senko Bot - Session Security & Device Fingerprinting
 * AES-256-CBC encryption for device fingerprint validation.
 * Prevents session theft by binding sessions to the host machine.
 */
'use strict';

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

// Derive a fixed 256-bit key from a known passphrase
const SECRET_KEY = crypto.createHash('sha256').update('senko_secure_v1').digest();

/**
 * Encrypt a plaintext string using AES-256-CBC.
 * Returns "iv_base64:ciphertext_base64".
 */
function encryptSec(txt) {
    const iv = crypto.randomBytes(16);
    const c = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
    return iv.toString('base64') + ':' + c.update(txt, 'utf8', 'base64') + c.final('base64');
}

/**
 * Decrypt a string produced by encryptSec.
 * Returns the plaintext or null on failure.
 */
function decryptSec(txt) {
    try {
        const [ivB64, enc] = txt.split(':');
        const d = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, Buffer.from(ivB64, 'base64'));
        return d.update(enc, 'base64', 'utf8') + d.final('utf8');
    } catch {
        return null;
    }
}

/**
 * Generate a device fingerprint based on OS platform, arch, username, and CPU model.
 * Returns an MD5 hex string.
 */
function getFingerprint() {
    try {
        const cpu = os.cpus()[0]?.model || 'cpu';
        return crypto.createHash('md5').update(
            os.platform() + os.arch() + (os.userInfo().username || 'u') + cpu
        ).digest('hex');
    } catch {
        return 'fp_' + os.arch();
    }
}

/**
 * Validate session fingerprint on startup.
 * If the device has changed, updates the stored fingerprint.
 * @param {string} sessionDir - Path to the auth_session directory
 * @param {boolean} sessionExists - Whether a valid session already exists
 */
function validateSession(sessionDir, sessionExists) {
    const PASS_FILE = path.join(sessionDir, 'security.dat');

    if (sessionExists) {
        if (fs.existsSync(PASS_FILE)) {
            try {
                const dec = decryptSec(fs.readFileSync(PASS_FILE, 'utf8'));
                if (dec) {
                    const stored = JSON.parse(dec);
                    const curFP = getFingerprint();
                    if (stored.fingerprint && stored.fingerprint !== curFP) {
                        log.warn('⚠️ تغيّر الجهاز — تحديث البصمة...');
                        const newDat = JSON.stringify({ password: stored.password, fingerprint: curFP });
                        fs.writeFileSync(PASS_FILE, encryptSec(newDat));
                    }
                }
            } catch {}
        }
    }
}

/**
 * Store a new session fingerprint (used after first-time pairing).
 * @param {string} sessionDir - Path to the auth_session directory
 * @param {string} [password] - Optional password to store alongside fingerprint
 */
function storeFingerprint(sessionDir, password) {
    const PASS_FILE = path.join(sessionDir, 'security.dat');
    const dat = JSON.stringify({
        password: password || '',
        fingerprint: getFingerprint()
    });
    fs.writeFileSync(PASS_FILE, encryptSec(dat));
}

module.exports = {
    encryptSec,
    decryptSec,
    getFingerprint,
    validateSession,
    storeFingerprint,
    SECRET_KEY,
};
