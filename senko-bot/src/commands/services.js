'use strict';

const { FILES } = require('../config');
const { getDb } = require('../database');
const { save, httpsGet, resolveId } = require('../helpers');

async function handle(ctx) {
    const { sock, msg, chatId, isGroup, senderJid, senderNum,
            isOwner, isSuperOwner, command, args, target, quoted } = ctx;

    const config = getDb('config');

    // .حاسبة
    if (command === ".حاسبة") {
        const expr = args.trim();
        if (!expr) return sock.sendMessage(chatId, { text: "⚠️ .حاسبة [معادلة]\nمثال: .حاسبة 50*3+10" });
        try {
            let result;
            try {
                const math = require('mathjs');
                result = math.evaluate(expr);
            } catch {
                const safeExpr = expr
                    .replace(/[^0-9+\-*/().%^ \t]/g, '')
                    .replace(/\^/g, '**');
                if (!safeExpr.trim()) throw new Error('معادلة غير صالحة');
                result = Function('"use strict"; return (' + safeExpr + ')')();
            }
            const formatted = typeof result === 'number'
                ? (Number.isInteger(result) ? result : parseFloat(result.toFixed(10)))
                : String(result);
            await sock.sendMessage(chatId, {
                text: `🧮 *الحاسبة*\n*━━━━━━━━━━━━━━━━━━*\n*│📝 المعادلة:* \`${expr}\`\n*│✅ النتيجة:* *${formatted}*\n*━━━━━━━━━━━━━━━━━━*`
            });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `❌ خطأ في المعادلة: ${e.message}\nتأكد من كتابة المعادلة بشكل صحيح.\nأمثلة: 2+2 | 50*3 | (10+5)*2 | 100/4` });
        }
        return;
    }

    // .طقس
    if (command === ".طقس") {
        const city = args.trim();
        if (!city) return sock.sendMessage(chatId, { text: "⚠️ .طقس [مدينة أو دولة]\nمثال: .طقس الرياض" });
        if (!config.weatherKey) {
            return sock.sendMessage(chatId, {
                text: "⚙️ *إعداد مطلوب*\n*━━━━━━━━━━━━━━━━━━*\nلتشغيل أمر الطقس:\n1. سجّل في: *openweathermap.org*\n2. احصل على API Key مجاني\n3. أرسل للمطور: `.weatherkey [المفتاح]`\n*━━━━━━━━━━━━━━━━━━*"
            });
        }
        try {
            const encodedCity = encodeURIComponent(city);
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodedCity}&appid=${config.weatherKey}&units=metric&lang=ar`;
            const data = await httpsGet(url);
            if (data.cod !== 200) throw new Error(data.message || 'مدينة غير موجودة');
            const t = data.main;
            const wind = data.wind;
            const desc = data.weather?.[0]?.description || '—';
            const emoji = (() => {
                const id = data.weather?.[0]?.id || 0;
                if (id >= 200 && id < 300) return '⛈️';
                if (id >= 300 && id < 400) return '🌧️';
                if (id >= 500 && id < 600) return '🌧️';
                if (id >= 600 && id < 700) return '❄️';
                if (id >= 700 && id < 800) return '🌫️';
                if (id === 800) return '☀️';
                if (id > 800) return '⛅';
                return '🌤️';
            })();
            await sock.sendMessage(chatId, {
                text: `${emoji} *الطقس في ${data.name}*\n*━━━━━━━━━━━━━━━━━━*\n*│🌡️ الحرارة:* ${t.temp}°C (تشعر بـ ${t.feels_like}°C)\n*│📊 الحد الأعلى:* ${t.temp_max}°C\n*│📊 الحد الأدنى:* ${t.temp_min}°C\n*│💧 الرطوبة:* ${t.humidity}%\n*│💨 الرياح:* ${wind.speed} م/ث\n*│☁️ الحالة:* ${desc}\n*━━━━━━━━━━━━━━━━━━*\n🧭 *𝑫𝒓. 𝑺𝒕𝒐𝒏𝒆* 🧭`
            });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `❌ فشل جلب الطقس: ${e.message}` });
        }
        return;
    }

    // .weatherkey — إعداد مفتاح الطقس
    if (command === ".weatherkey" && isSuperOwner) {
        config.weatherKey = args.trim();
        save(FILES.CONFIG, config);
        await sock.sendMessage(chatId, { text: "✅ تم حفظ مفتاح الطقس." });
        return;
    }

    // .currencykey — إعداد مفتاح العملة
    if (command === ".currencykey" && isSuperOwner) {
        config.currencyKey = args.trim();
        save(FILES.CONFIG, config);
        await sock.sendMessage(chatId, { text: "✅ تم حفظ مفتاح العملة." });
        return;
    }

    // .ترجمة
    if (command === ".ترجمة") {
        const ctxTr = msg.message?.extendedTextMessage?.contextInfo;
        const quotedText = ctxTr?.quotedMessage?.conversation
            || ctxTr?.quotedMessage?.extendedTextMessage?.text || '';
        const targetLang = args.trim().toLowerCase() || 'ar';
        if (!quotedText) return sock.sendMessage(chatId, {
            text: "⚠️ *كيف تستخدم .ترجمة:*\n1. رد على رسالة\n2. اكتب: .ترجمة [اللغة]\n\n*أمثلة على اللغات:*\nar — عربي | en — إنجليزي\nfr — فرنسي | tr — تركي\nde — ألماني | es — إسباني\nja — ياباني | zh — صيني\nru — روسي | it — إيطالي"
        });

        const langMap = {
            'عربي': 'ar', 'عربية': 'ar', 'arabic': 'ar',
            'إنجليزي': 'en', 'انجليزي': 'en', 'english': 'en', 'إنجليزية': 'en',
            'فرنسي': 'fr', 'french': 'fr', 'فرنسية': 'fr',
            'تركي': 'tr', 'turkish': 'tr', 'تركية': 'tr',
            'ألماني': 'de', 'german': 'de', 'ألمانية': 'de', 'الماني': 'de',
            'إسباني': 'es', 'spanish': 'es', 'اسباني': 'es',
            'ياباني': 'ja', 'japanese': 'ja',
            'صيني': 'zh', 'chinese': 'zh',
            'روسي': 'ru', 'russian': 'ru',
            'إيطالي': 'it', 'italian': 'it', 'ايطالي': 'it',
            'كوري': 'ko', 'korean': 'ko',
            'برتغالي': 'pt', 'portuguese': 'pt',
            'هندي': 'hi', 'hindi': 'hi',
        };
        const langCode = langMap[targetLang] || targetLang;

        const isArabic = /[؀-ۿ]/.test(quotedText);
        const isJapanese = /[぀-ヿ]/.test(quotedText);
        const isChinese = /[一-鿿]/.test(quotedText);
        const isRussian = /[Ѐ-ӿ]/.test(quotedText);
        const sourceLang = isArabic ? 'ar' : isJapanese ? 'ja' : isChinese ? 'zh' : isRussian ? 'ru' : 'en';

        if (sourceLang === langCode) {
            return sock.sendMessage(chatId, { text: `⚠️ النص مكتوب بالفعل بـ ${langCode}` });
        }

        try {
            const encoded = encodeURIComponent(quotedText.slice(0, 500));
            const url = `https://api.mymemory.translated.net/get?q=${encoded}&langpair=${sourceLang}|${langCode}`;
            const data = await httpsGet(url);
            const translated = data?.responseData?.translatedText;
            if (!translated || translated === quotedText)
                throw new Error('لم تُترجم الرسالة. تأكد من كود اللغة');
            const langNames = {
                ar: 'عربي', en: 'إنجليزي', fr: 'فرنسي', tr: 'تركي', de: 'ألماني',
                es: 'إسباني', ja: 'ياباني', zh: 'صيني', ru: 'روسي', it: 'إيطالي',
                ko: 'كوري', pt: 'برتغالي', hi: 'هندي'
            };
            await sock.sendMessage(chatId, {
                text: `🌍 *الترجمة إلى ${langNames[langCode] || langCode}*\n*━━━━━━━━━━━━━━━━━━*\n*الأصل:*\n${quotedText}\n\n*الترجمة:*\n${translated}\n*━━━━━━━━━━━━━━━━━━*`
            });
        } catch (e) {
            await sock.sendMessage(chatId, { text: `❌ فشل الترجمة: ${e.message}` });
        }
        return;
    }

    // .عملة
    if (command === ".عملة") {
        if (!args.trim()) return sock.sendMessage(chatId, {
            text: "⚠️ .عملة [مبلغ][عملة]\nمثال: .عملة 100دولار\nأو: .عملة 50يورو\nأو: .عملة 200ريال"
        });
        if (!config.currencyKey) {
            return sock.sendMessage(chatId, {
                text: "⚙️ *إعداد مطلوب*\n*━━━━━━━━━━━━━━━━━━*\nلتشغيل تحويل العملات:\n1. سجّل في: *exchangerate-api.com*\n2. احصل على API Key مجاني\n3. أرسل للمطور: `.currencykey [المفتاح]`\n*━━━━━━━━━━━━━━━━━━*"
            });
        }
        const currencyNames = {
            'دولار': 'USD', 'دولارات': 'USD', 'usd': 'USD',
            'يورو': 'EUR', 'eur': 'EUR',
            'ريال': 'SAR', 'riyal': 'SAR', 'sar': 'SAR', 'ريال سعودي': 'SAR',
            'درهم': 'AED', 'aed': 'AED', 'درهم اماراتي': 'AED',
            'جنيه': 'EGP', 'egp': 'EGP', 'جنيه مصري': 'EGP',
            'دينار': 'KWD', 'kwd': 'KWD', 'دينار كويتي': 'KWD',
            'ليرة': 'TRY', 'try': 'TRY', 'ليرة تركية': 'TRY',
            'روبية': 'INR', 'inr': 'INR',
            'جنيه استرليني': 'GBP', 'gbp': 'GBP', 'إسترليني': 'GBP',
            'يوان': 'CNY', 'cny': 'CNY',
            'ين': 'JPY', 'jpy': 'JPY',
            'شلن': 'UGX', 'ugx': 'UGX', 'شلن اوغندي': 'UGX',
        };
        let amount = 0, fromCurr = '';
        const numMatch = args.match(/[\d.,]+/);
        if (numMatch) amount = parseFloat(numMatch[0].replace(',', ''));
        const textPart = args.replace(/[\d.,\s]/g, '').toLowerCase();
        for (const [k, v] of Object.entries(currencyNames)) {
            if (textPart.includes(k.toLowerCase())) { fromCurr = v; break; }
        }
        if (!amount || !fromCurr) return sock.sendMessage(chatId, {
            text: "❌ لم أفهم المبلغ أو العملة.\nمثال: .عملة 100دولار | .عملة 50يورو | .عملة 200ريال"
        });

        const currencyMenuKey = `${chatId}_currency_${senderNum}`;
        const sentMenu = await sock.sendMessage(chatId, {
            text: `💱 *لديك ${amount} ${fromCurr}*\n*━━━━━━━━━━━━━━━━━━*\n*اختر العملة التي تريد التحويل إليها:*\n\n1️⃣ دولار (USD)\n2️⃣ يورو (EUR)\n3️⃣ ريال سعودي (SAR)\n4️⃣ درهم إماراتي (AED)\n5️⃣ جنيه مصري (EGP)\n6️⃣ دينار كويتي (KWD)\n7️⃣ ليرة تركية (TRY)\n8️⃣ جنيه إسترليني (GBP)\n\n*أرسل الرقم (1-8) رداً على هذه الرسالة*\n*━━━━━━━━━━━━━━━━━━*`
        });
        global._currencySession = global._currencySession || {};
        global._currencySession[currencyMenuKey] = {
            amount, fromCurr, msgId: sentMenu.key.id,
            ts: Date.now(), senderNum
        };
        return;
    }
}

module.exports = { handle };
