'use strict';

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { OWNERS } = require('../config');
const { getDb } = require('../database');
const {
    numOf, resolveId, isBotJid, getMeta
} = require('../helpers');

async function handle(ctx) {
    const { sock, msg, chatId, isGroup, senderJid, senderNum,
            isOwner, isSuperOwner, command, args, target, quoted, rawSenderNum } = ctx;

    // .مطور — بطاقة المطور
    if (command === ".مطور") {
        await sock.sendMessage(chatId, { react: { text: "🧭", key: msg.key } }).catch(() => {});
        const devJid = "233620904140952@lid";
        let ppUrl = null;
        try { ppUrl = await sock.profilePictureUrl(devJid, 'image'); } catch {}
        const devText = [
            "_▰▰▰¦ قـسـم الـمـطـور ¦▰▰▰_",
            "",
            "╗══════════════╔",
            "",
            "`【 الاسـم ↡↡ 】`",
            "_SENKO_🧭",
            "",
            "`【 اللـقـب ↡↡ 】`",
            "_𝑺𝑬𝑵𝑲𝑶 𝑫𝒓.𝑺𝒕𝒐𝒏𝒆_🧭",
            "",
            "`【 البـلـد ↡↡ 】`",
            "_Uganda | 🇺🇬 | Kampala_",
            "",
            "`【 تـواصـل الـمـطـور ↡↡ 】`",
            "_wa.me/256752906052_",
            "",
            "╣══════════════╠",
            "",
            "~🛡 هـذه مـعـلـومـات المـطـور المـتـحـكـم فـي البـوت 🛡~",
            "",
            "*🚨 هـام قـبـل مُـراسـلـة الـمُـطـور ↡↡*",
            "> البوت: Dr.Stone | التواصل للضرورة فقط",
            "",
            "╝══════════════╚"
        ].join("\n");
        if (ppUrl) {
            const imgBuf = await axios.get(ppUrl, { responseType: 'arraybuffer', timeout: 8000 }).then(r => Buffer.from(r.data)).catch(() => null);
            if (imgBuf) await sock.sendMessage(chatId, { image: imgBuf, caption: devText });
            else await sock.sendMessage(chatId, { text: devText });
        } else {
            await sock.sendMessage(chatId, { text: devText });
        }
        const vcard = "BEGIN:VCARD\nVERSION:3.0\nFN:🧭 SENKO Dr.Stone\nN:🧭 SENKO Dr.Stone;;;;\nTEL;TYPE=CELL;waid=256752906052:+256752906052\nNOTE: مطور Dr.Stone Bot\nEND:VCARD";
        await sock.sendMessage(chatId, { contacts: { displayName: "🧭 SENKO Dr.Stone", contacts: [{ vcard }] } });
        return;
    }

    // سينكو — رياكت
    if (command === "سينكو" || command === ".سينكو") {
        await sock.sendMessage(chatId, { react: { text: "🧭", key: msg.key } });
        return;
    }

    // .تحرش
    if (command === ".تحرش" && isGroup) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mentioned) return sock.sendMessage(chatId, { text: "⚠️ منشن الشخص: .تحرش @شخص" });
        await sock.sendMessage(chatId, { react: { text: "🫦", key: msg.key } }).catch(() => {});
        const tNum = resolveId(mentioned);
        const allQuotes = [
            "🫦 هل أنتِ قمر؟ لأنكِ تنيرين طريقي في كل لحظة.",
            "🫦 هل أنتِ بحر؟ لأني أغرق في تأملكِ كل يوم.",
            "🫦 هل أنتِ وردة؟ لأنكِ تملئين عالمي بعطركِ.",
            "🫦 هل أنتِ حورية بحر؟ لأنني أرغب في الغرق فيكِ.",
            "🫦 هل أنتِ فاكهة؟ لأنني لا أستطيع مقاومة لذاذتكِ.",
            "🫦 هل أنتِ قهوة؟ لأنني أحتاجكِ لتستفزيني.",
            "🫦 هل أنتِ نار؟ لأنكِ تشعلينني بوجودكِ.",
            "🫦 هل أنتِ حلم؟ لأنني لا أريد أن أستيقظ منكِ.",
            "🫦 هل أنتِ عاصفة؟ لأنكِ تهبّين في قلبي دون توقف.",
            "🫦 هل أنتِ سكر؟ لأنكِ تجعلينني أذوب فيكِ.",
            "🫦 هل أنتِ موسيقى؟ لأنكِ تجعلينني أرقص معكِ في كل لحظة.",
            "🫦 هل أنتِ لؤلؤة؟ لأنكِ الثمين الذي أبحث عنه.",
            "🫦 هل أنتِ سماء؟ لأنني أرغب في السقوط فيكِ.",
            "🫦 هل أنتِ كأس؟ لأنني أرغب في أن أحتسيكِ.",
            "🫦 عيونك أخطر من السلاح.. تقتلني كل مرة أنظر فيها.",
            "🫦 ابتسامتك تكفي تخربط يومي كله.",
            "🫦 كيف تكونين جميلة بهذا الشكل وكأنه أمر طبيعي؟",
            "🫦 لو كان الجمال جريمة لكنتِ محكوم عليكِ بالمؤبد.",
            "🫦 أنتِ السبب الوحيد اللي يخليني أتمنى أطول في الجروب.",
            "🫦 صوتك أحلى موسيقى سمعتها في حياتي.",
            "🫦 لما تكتبين حتى نصوصك تفوح بعطركِ.",
            "🫦 أنتِ مش إنسانة عادية.. أنتِ ظاهرة.",
            "🫦 كل ما تغيبين يصبح الجروب أقل إضاءة.",
            "🫦 لو الجمال له ضريبة أنتِ مفلسة بسببه.",
            "🫦 ردك الواحد يساوي ألف رسالة من غيركِ.",
            "🫦 أنتِ من النوع اللي يخلي الإنسان ينسى كل حاجة.",
            "🫦 حتى صمتكِ له وزن.. وثقل.",
            "🫦 والله ما أدري كيف تكونين هكذا وما تعرفين.",
            "🫦 ناديني متى تبيين.. حاضر قبل ما تكملين الكلمة.",
            "🫦 عيونك ما تحتاج كلام.. تقول كل شيء لوحدها.",
        ];
        if (!global._usedTaharr) global._usedTaharr = {};
        const tk = chatId + "_taharr";
        if (!global._usedTaharr[tk] || global._usedTaharr[tk].length >= allQuotes.length) global._usedTaharr[tk] = [];
        const tRem = allQuotes.map((_, i) => i).filter(i => !global._usedTaharr[tk].includes(i));
        const tIdx = tRem[Math.floor(Math.random() * tRem.length)];
        global._usedTaharr[tk].push(tIdx);
        const quote = allQuotes[tIdx];
        const taharrMsg = "💍 @" + tNum + "\n" + quote;
        const _taharrDir = path.join(__dirname, '..', '..', 'Dr.4');
        let imgPath = null;
        try {
            const _taharrFiles = fs.readdirSync(_taharrDir).filter(f => f.startsWith('taharr') && /\.(jpg|jpeg|png)$/i.test(f));
            if (_taharrFiles.length) {
                if (!global._usedTaharrImgs) global._usedTaharrImgs = {};
                const _tik = chatId + "_taharrimg";
                if (!global._usedTaharrImgs[_tik] || global._usedTaharrImgs[_tik].length >= _taharrFiles.length) global._usedTaharrImgs[_tik] = [];
                const _tImgRem = _taharrFiles.filter(f => !global._usedTaharrImgs[_tik].includes(f));
                const _tPicked = _tImgRem[Math.floor(Math.random() * _tImgRem.length)];
                global._usedTaharrImgs[_tik].push(_tPicked);
                imgPath = _tPicked ? path.join(_taharrDir, _tPicked) : null;
            }
        } catch {}
        if (imgPath && fs.existsSync(imgPath)) {
            await sock.sendMessage(chatId, { image: fs.readFileSync(imgPath), caption: taharrMsg, mentions: [senderJid, mentioned] });
        } else {
            await sock.sendMessage(chatId, { text: taharrMsg, mentions: [senderJid, mentioned] });
        }
        return;
    }

    // .احبك
    if (command === ".احبك" && isGroup) {
        await sock.sendMessage(chatId, { react: { text: "❤️", key: msg.key } }).catch(() => {});
        const mJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const targetJid = mJid || senderJid;
        const targetNum = resolveId(targetJid);
        const loveMsgs = [
            "@" + targetNum + " ما أحلاكِ ❤️",
            "@" + targetNum + " وجودك فرق 💙",
            "@" + targetNum + " من الناس اللي تفرق 💙",
            "@" + targetNum + " ما دايم أقول هذا لكن.. شكراً ❤️",
            "@" + targetNum + " كون في خير ❤️",
            "@" + targetNum + " ابتسم، أنت تستاهل ❤️",
            "@" + targetNum + " عسى ما تشوف إلا خير 💙",
            "@" + targetNum + " الدنيا أحسن بوجودك ❤️",
            "@" + targetNum + " الله يحفظك 💙",
            "@" + targetNum + " ما مثلك كثير ❤️",
        ];
        if (!global._usedLove) global._usedLove = {};
        const lk = chatId + "_love";
        if (!global._usedLove[lk] || global._usedLove[lk].length >= loveMsgs.length) global._usedLove[lk] = [];
        const lRem = loveMsgs.map((_, i) => i).filter(i => !global._usedLove[lk].includes(i));
        const lIdx = lRem[Math.floor(Math.random() * lRem.length)];
        global._usedLove[lk].push(lIdx);
        const caption = loveMsgs[lIdx];
        const _loveDir = path.join(__dirname, '..', '..', 'Dr.4');
        let loveImgPath = null;
        try {
            const _loveFiles = fs.readdirSync(_loveDir).filter(f => f.startsWith('love') && /\.(jpg|jpeg|png)$/i.test(f));
            if (_loveFiles.length) {
                if (!global._usedLoveImgs) global._usedLoveImgs = {};
                const _lk2 = chatId + "_loveimg";
                if (!global._usedLoveImgs[_lk2] || global._usedLoveImgs[_lk2].length >= _loveFiles.length) global._usedLoveImgs[_lk2] = [];
                const _lImgRem = _loveFiles.filter(f => !global._usedLoveImgs[_lk2].includes(f));
                const _lPicked = _lImgRem[Math.floor(Math.random() * _lImgRem.length)];
                global._usedLoveImgs[_lk2].push(_lPicked);
                loveImgPath = _lPicked ? path.join(_loveDir, _lPicked) : null;
            }
        } catch {}
        if (loveImgPath && fs.existsSync(loveImgPath)) await sock.sendMessage(chatId, { image: fs.readFileSync(loveImgPath), caption, mentions: [targetJid] });
        else await sock.sendMessage(chatId, { text: caption, mentions: [targetJid] });
        return;
    }

    // .اكرهك
    if (command === ".اكرهك" && isGroup) {
        await sock.sendMessage(chatId, { react: { text: "😤", key: msg.key } }).catch(() => {});
        const hateMsgs = [
            "😤 @" + senderNum + " ما تعبت من نفسك؟",
            "@" + senderNum + " اليوم مزاجك ثقيل 💢",
            "💢 @" + senderNum + " روح نام",
            "@" + senderNum + " تعال بكرة 😤",
            "@" + senderNum + " قل الله وكمّل 💢",
            "😤 @" + senderNum + " اشرب ماي وهدى",
            "@" + senderNum + " خليني أتجاهلك بهدوء 😒",
            "💢 @" + senderNum + " أنت الشخص اللي يصبّر دمي",
            "@" + senderNum + " ما شفت أزعج منك 😤",
            "@" + senderNum + " ابتعد قبل ما أنفجر 😠",
        ];
        if (!global._usedHate) global._usedHate = {};
        const hk = chatId + "_hate";
        if (!global._usedHate[hk] || global._usedHate[hk].length >= hateMsgs.length) global._usedHate[hk] = [];
        const hRem = hateMsgs.map((_, i) => i).filter(i => !global._usedHate[hk].includes(i));
        const hIdx = hRem[Math.floor(Math.random() * hRem.length)];
        global._usedHate[hk].push(hIdx);
        const captionH = hateMsgs[hIdx];
        const _hateDir = path.join(__dirname, '..', '..', 'Dr.4');
        let hateImgPath = null;
        try {
            const _hateFiles = fs.readdirSync(_hateDir).filter(f => f.startsWith('hate') && /\.(jpg|jpeg|png)$/i.test(f));
            if (_hateFiles.length) {
                if (!global._usedHateImgs) global._usedHateImgs = {};
                const _hk2 = chatId + "_hateimg";
                if (!global._usedHateImgs[_hk2] || global._usedHateImgs[_hk2].length >= _hateFiles.length) global._usedHateImgs[_hk2] = [];
                const _hImgRem = _hateFiles.filter(f => !global._usedHateImgs[_hk2].includes(f));
                const _hPicked = _hImgRem[Math.floor(Math.random() * _hImgRem.length)];
                global._usedHateImgs[_hk2].push(_hPicked);
                hateImgPath = _hPicked ? path.join(_hateDir, _hPicked) : null;
            }
        } catch {}
        if (hateImgPath && fs.existsSync(hateImgPath)) await sock.sendMessage(chatId, { image: fs.readFileSync(hateImgPath), caption: captionH, mentions: [senderJid] });
        else await sock.sendMessage(chatId, { text: captionH, mentions: [senderJid] });
        return;
    }

    // .زوجني
    if (command === ".زوجني" && isGroup) {
        try {
            const meta = await getMeta(sock, chatId);
            const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            let chosen;
            if (mentioned) { chosen = { id: mentioned }; }
            else {
                const others = meta.participants.filter(p => !isBotJid(p.id) && numOf(p.id) !== senderNum && numOf(p.id) !== (rawSenderNum || senderNum));
                if (!others.length) return sock.sendMessage(chatId, { text: "⚠️ لا يوجد أعضاء كافيون." });
                chosen = others[Math.floor(Math.random() * others.length)];
            }
            const chosenNum = resolveId(chosen.id);
            const dowries = ["50 مليون دولار 💵", "قصر في دبي 🏰", "سيارة لامبورغيني 🚗", "جزيرة خاصة 🏝️", "ألف وردة حمراء 🌹", "كنز مخفي 💎"];
            const duas = ["بارك الله لكما وبارك عليكما وجمع بينكما في خير 🤍", "الله يكتب لكم السعادة والتوفيق 💍", "عقبال ما نفرح بكم 🎊"];
            const card = [
                "🎊 *╔══════════════════╗*", "    *بطاقة زواج رسمية* 💍", "*╚══════════════════╝*", "",
                "*❀ العريس:* @" + senderNum, "*❀ العروس:* @" + chosenNum, "",
                "*❀ المهر:* " + dowries[Math.floor(Math.random() * dowries.length)], "",
                "_" + duas[Math.floor(Math.random() * duas.length)] + "_", "",
                "*━━━━━━━━━━━━━━━━━━*", "*Dr.Stone 🧭 | قسم العقود*"
            ].join("\n");
            await sock.sendMessage(chatId, { text: card, mentions: [senderJid, chosen.id] });
        } catch (e) { await sock.sendMessage(chatId, { text: "❌ " + e.message }); }
        return;
    }

    // .طلاق
    if (command === ".طلاق" && isGroup) {
        const mJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mJid) return sock.sendMessage(chatId, { text: "⚠️ منشن الشخص: .طلاق @شخص" });
        const tN = resolveId(mJid);
        const reasons = ["بسبب كثرة الغياب 💔", "بسبب اختلاف الطباع 😤", "بسبب عدم التفاهم 🚫", "بسبب حب الحرية 🦅", "بسبب ظروف الحياة 🌊"];
        const card = [
            "📜 *╔══════════════════╗*", "    *وثيقة طلاق رسمية* 💔", "*╚══════════════════╝*", "",
            "*❀ الطرف الأول:* @" + senderNum, "*❀ الطرف الثاني:* @" + tN, "",
            "*❀ السبب:* " + reasons[Math.floor(Math.random() * reasons.length)], "",
            "_أُشهدُ الله على هذا الفراق_", "_وكلٌّ منهما يمضي في طريقه_", "",
            "*━━━━━━━━━━━━━━━━━━*", "*Dr.Stone 🧭 | قسم الفراق*"
        ].join("\n");
        await sock.sendMessage(chatId, { text: card, mentions: [senderJid, mJid] });
        return;
    }

    // .غزل
    if (command === ".غزل" && isGroup) {
        const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        const targetJid = mentioned || senderJid;
        const targetNum = resolveId(targetJid);
        await sock.sendMessage(chatId, { react: { text: "🌹", key: msg.key } }).catch(() => {});
        const ghazalList = [
            "🌹 أنتِ الفجر حين يبزغ\nوأنتِ الليل حين يهدأ\nوأنتِ كل شيء بينهما.",
            "🌹 ما مررتِ إلا وتركتِ أثراً\nفي كل زاوية مررتِ بها\nكالعطر لا يُرى ولكن يُحسّ.",
            "🌹 قلبي يعرفكِ قبل أن تتكلمي\nويشتاق إليكِ قبل أن تغيبي.",
            "🌹 لو كانت الكلمات تكفي لوصفكِ\nلكنتُ أكتب منذ أزل\nولم أنتهِ بعد.",
            "🌹 أنتِ لستِ فقط جميلة\nأنتِ من النوع الذي يُعلّمك\nأن الجمال أعمق مما ظننت.",
            "🌹 حين تبتسمين يُخيّل لي\nأن الدنيا توقفت لحظة\nلترى ما أرى.",
            "🌹 ما في شيء في هذا العالم\nيشبه الطريقة التي تقولين بها اسمي.",
            "🌹 أنتِ البيت الذي أعود إليه\nحين يتعب الروح من كل شيء.",
            "🌹 لو كان القمر يعرفكِ\nلاحتار بينه وبينكِ\nمن يُنير الليل.",
            "🌹 عيونكِ فيها قصص\nما قرأتها كلها بعد\nوأنا مستعد للقراءة طول عمري.",
            "🌹 ليس كل من مررنا بهم تركوا أثراً\nأنتِ استثناء في قانون النسيان.",
            "🌹 أحبّ كيف تكونين أنتِ\nبلا تكلّف ولا اصطناع\nكالماء يجري بطبيعته.",
        ];
        if (!global._usedGhazal) global._usedGhazal = {};
        const gk = chatId + "_ghazal";
        if (!global._usedGhazal[gk] || global._usedGhazal[gk].length >= ghazalList.length) global._usedGhazal[gk] = [];
        const gRem = ghazalList.map((_, i) => i).filter(i => !global._usedGhazal[gk].includes(i));
        const gIdx = gRem[Math.floor(Math.random() * gRem.length)];
        global._usedGhazal[gk].push(gIdx);
        const ghazalText = "@" + targetNum + "\n\n" + ghazalList[gIdx];
        const ghazalDir = path.join(__dirname, '..', '..', 'Dr.4');
        const ghazalJpg = path.join(ghazalDir, "ghazal.jpg");
        const ghazalPng = path.join(ghazalDir, "ghazal.png");
        const gImgPath = fs.existsSync(ghazalJpg) ? ghazalJpg : fs.existsSync(ghazalPng) ? ghazalPng : null;
        if (gImgPath) {
            await sock.sendMessage(chatId, { image: fs.readFileSync(gImgPath), caption: ghazalText, mentions: [targetJid] });
        } else {
            await sock.sendMessage(chatId, { text: ghazalText, mentions: [targetJid] });
        }
        return;
    }

    // .شاذ
    if (command === ".شاذ" && isGroup) {
        const mJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mJid) return sock.sendMessage(chatId, { text: "⚠️ منشن الشخص: .شاذ @شخص" });
        const tN = resolveId(mJid);
        const pct = Math.floor(Math.random() * 101);
        const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
        await sock.sendMessage(chatId, { text: "🏳️‍🌈 *نسبة الشذوذ عند @" + tN + "*\n*━━━━━━━━━━━━━━━━━━*\n[" + bar + "]\n*النسبة:* " + pct + "%\n*━━━━━━━━━━━━━━━━━━*", mentions: [mJid] });
        return;
    }

    // .زنجي
    if (command === ".زنجي" && isGroup) {
        const mJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mJid) return sock.sendMessage(chatId, { text: "⚠️ منشن الشخص: .زنجي @شخص" });
        const tN = resolveId(mJid);
        const pct = Math.floor(Math.random() * 101);
        const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
        await sock.sendMessage(chatId, { text: "🖤 *نسبة الزنجية عند @" + tN + "*\n*━━━━━━━━━━━━━━━━━━*\n[" + bar + "]\n*النسبة:* " + pct + "%\n*━━━━━━━━━━━━━━━━━━*", mentions: [mJid] });
        return;
    }

    // .حب
    if (command === ".حب" && isGroup) {
        const mJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
        if (!mJid) return sock.sendMessage(chatId, { text: "⚠️ منشن الشخص: .حب @شخص" });
        const tN = resolveId(mJid);
        const pct = Math.floor(Math.random() * 101);
        const bar = "❤️".repeat(Math.floor(pct / 20)) + "🖤".repeat(5 - Math.floor(pct / 20));
        const label = pct >= 80 ? "💕 حبٌّ عميق!" : pct >= 50 ? "💛 محبةٌ جيدة" : pct >= 20 ? "💙 برود نسبي" : "🖤 لا يوجد حب!";
        await sock.sendMessage(chatId, { text: "💘 *نسبة المحبة بينك وبين @" + tN + "*\n*━━━━━━━━━━━━━━━━━━*\n" + bar + "\n*النسبة:* " + pct + "%\n*" + label + "*\n*━━━━━━━━━━━━━━━━━━*", mentions: [senderJid, mJid] });
        return;
    }

    // .كشف — viewOnce reveal
    if (command === ".كشف" && isGroup) {
        const ctxQ = msg.message?.extendedTextMessage?.contextInfo;
        if (!ctxQ?.quotedMessage) return sock.sendMessage(chatId, { text: "⚠️ رد على صورة أو فيديو مرة واحدة." });
        const qMsg = ctxQ.quotedMessage;
        const voInner = qMsg?.viewOnceMessage?.message
                     || qMsg?.viewOnceMessageV2?.message
                     || qMsg?.viewOnceMessageV2Extension?.message;
        const isImg = voInner?.imageMessage || qMsg?.imageMessage;
        const isVid = voInner?.videoMessage || qMsg?.videoMessage;
        if (!isImg && !isVid) return sock.sendMessage(chatId, { text: "⚠️ رد على صورة أو فيديو مرة واحدة." });
        try {
            const { downloadMediaMessage } = require('@itsliaaa/baileys');
            const fakeMsg = {
                key: { remoteJid: chatId, id: ctxQ.stanzaId, participant: ctxQ.participant || undefined, fromMe: false },
                message: qMsg
            };
            const buf = await downloadMediaMessage(fakeMsg, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
            if (isImg) {
                await sock.sendMessage(chatId, { image: buf, caption: "🔓 *صورة مكشوفة*" });
            } else {
                await sock.sendMessage(chatId, { video: buf, caption: "🔓 *فيديو مكشوف*" });
            }
        } catch (e) {
            await sock.sendMessage(chatId, { text: "❌ فشل الكشف: " + e.message });
        }
        return;
    }
}

module.exports = { handle };
