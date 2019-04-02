if (process.env.NODE_ENV !== 'production') {
    require('dotenv').load();
}

const Markup = require('telegraf/markup');
const JSZip = require('jszip');
const Telegraf = require('telegraf');
const TelegrafLogger = require('telegraf-logger');
const express = require('express');
const progress = require('progress-stream');

const {
    download,
    getDownloadedData,
    getInfo,
    listDownloads
} = require('./download');

const token = process.env.BOT_TOKEN;
const bot = new Telegraf(token);

const checkUser = ({ from: { username } }) =>
    process.env.ALLOWED_USERS.split(',').some(u => u === username);

const createMp3OrZipChoice = id =>
    Markup.inlineKeyboard([
        Markup.callbackButton('🎵 mp3', `download_mp3_${id}`),
        Markup.callbackButton('📦 zip', `download_zip_${id}`)
    ]).extra();

const getZippedDataStream = (title, data) => {
    const zip = new JSZip();
    return zip.file(title, data).generateNodeStream();
};

const makeMiddlewareOptional = m => Telegraf.optional(checkUser, m);

const startMiddleware = ctx => {
    ctx.reply('Ciao 🐈, mandami il link ad un video di una canzone');
};

const downloadMiddleware = ctx => {
    const url = ctx.message.text;
    ctx.reply('Molto bene, vediamo se trovo qualcosa... 🔍')
        .then(() => getInfo(url))
        .then(({ title }) =>
            ctx
                .replyWithHTML(
                    `👍 Ok, trovato <b>${title}</b>. Provo a scaricare...`
                )
                .then(() => download(url, title))
                .then(downloadedData =>
                    ctx.reply(
                        'Fatto! 😀\nPreferisci che ti mandi il file come mp3 o zip?',
                        createMp3OrZipChoice(downloadedData.id)
                    )
                )
        )
        .catch(err => {
            console.error(err);
            ctx.reply(`🙁 Non sono riuscito a scaricare il video ${url}`);
        });
};

const downloadResponse = (id, ctx, zip) =>
    getDownloadedData(id).then(({ dataStream, title, size }) => {
        console.log('retrieved download data', title);
        const progressStream = progress({
            length: size,
            time: 100 /* ms */
        });

        progressStream.on('progress', function(progress) {
            console.log(
                '[' + title + '] transferred ' + progress.percentage + '%'
            );
        });

        return ctx
            .answerCbQuery()
            .then(() => ctx.reply('Ok, ora te lo sto inviando! 🐶'))
            .then(() =>
                ctx
                    .replyWithDocument({
                        filename: `${title}.${zip ? 'zip' : 'mp3'}`,
                        source: zip
                            ? getZippedDataStream(
                                `${title}.mp3`,
                                dataStream.pipe(progressStream)
                            )
                            : dataStream.pipe(progressStream)
                    })
                    .then(() => ctx.reply('A presto! 👋'))
            );
    });

const downloadResponseMiddleware = zip => ctx =>
    downloadResponse(ctx.match[1], ctx, zip);

const logger = new TelegrafLogger();
bot.use(logger.middleware());

bot.start(makeMiddlewareOptional(startMiddleware));
bot.on('text', makeMiddlewareOptional(downloadMiddleware));
bot.action(
    /^download_mp3_(.*)$/,
    makeMiddlewareOptional(downloadResponseMiddleware(false))
);
bot.action(
    /^download_zip_(.*)$/,
    makeMiddlewareOptional(downloadResponseMiddleware(true))
);

const port = process.env.PORT || 3000;
const app = express();

const initWebApp = () =>
    new Promise(res => {
        app.get('/downloadlist', (req, res) => {
            const downloads = listDownloads();
            res.json(downloads);
        });

        app.listen(port, () => {
            console.log(`App listening on port ${port}!`);
            res();
        });
    });

const startDevPolling = () => {
    bot.startPolling();
    console.log('Start polling');
};

if (process.env.NODE_ENV !== 'production') {
    bot.telegram
        .deleteWebhook()
        .then(() => initWebApp())
        .then(() => startDevPolling());
} else {
    const secretPath = `/bot${token}`;
    app.use(bot.webhookCallback(secretPath));
    bot.telegram.setWebhook(`${process.env.URL}${secretPath}`);

    initWebApp();
}
