const fs = require('fs');
const path = require('path');
const ytdl = require('youtube-dl');
const uuidv1 = require('uuid/v1');

const getInfo = url =>
    new Promise((res, rej) => {
        ytdl.getInfo(url, [], (err, info) => {
            if (err) {
                rej(err);
            } else {
                res(info);
            }
        });
    });

const downloadAudio = (url, uuid) =>
    new Promise((res, rej) => {
        ytdl.exec(
            url,
            [
                '-x',
                '--audio-format',
                'mp3',
                '-o',
                `${getDownloadDirectory(uuid)}/%(title)s.%(ext)s`,
                '--audio-quality',
                '0'
            ],
            {},
            (err, output) => {
                if (err) {
                    rej(err);
                } else {
                    console.log(output.join('\n'));
                    res();
                }
            }
        );
    });

const getDownloadDirectory = id =>
    path.resolve(__dirname, './download', `./${id}`);

const download = (url, title) => {
    const uuid = uuidv1();
    const downloadDirectory = getDownloadDirectory(uuid);

    try {
        fs.mkdirSync(downloadDirectory);
    } catch (err) {
        console.error(`Error creating video directory: ${err.message}`);
        process.exit();
    }
    return downloadAudio(url, uuid)
        .then(() => {
            fs.writeFileSync(path.resolve(downloadDirectory, './title'), title);
        })
        .then(() => {
            const files = fs.readdirSync(downloadDirectory);
            if (files && files[0]) {
                const filePath = path.resolve(downloadDirectory, files[0]);
                return {
                    id: uuid,
                    data: fs.readFileSync(filePath),
                    title
                };
            } else {
                throw 'Not found';
            }
        });
};

const listDownloads = () => {
    const resultList = [];
    const downloadsPath = path.resolve(__dirname, './download');
    fs.readdirSync(downloadsPath).forEach(uuidDir => {
        const uuidDirPath = path.resolve(downloadsPath, uuidDir);
        fs.readdirSync(uuidDirPath).forEach(downloadedContentFile => {
            const downloadedContentFilePath = path.resolve(
                uuidDirPath,
                downloadedContentFile
            );
            resultList.push(downloadedContentFilePath);
        });
    });
    return resultList;
};

const getDownloadedData = id => {
    const downloadDirectory = getDownloadDirectory(id);
    console.log('Looking for data in download directory', downloadDirectory);
    const files = fs.readdirSync(downloadDirectory);
    if (files && files[0]) {
        const filePath = path.resolve(downloadDirectory, files[0]);
        const { size } = fs.statSync(filePath);
        console.log('Found file', filePath);
        console.log('File ' + filePath + ' size', size);
        return Promise.resolve({
            id,
            dataStream: fs.createReadStream(filePath),
            title: fs.readFileSync(
                path.resolve(downloadDirectory, './title'),
                'utf8'
            ),
            size
        });
    } else {
        return Promise.reject('Not found');
    }
};

module.exports = { download, getDownloadedData, getInfo, listDownloads };
