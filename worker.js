const VERSION_API = "https://osekai.net/snapshots/api/api";
global.XMLHttpRequest = require('xhr2');
const request = require('request'),
    fs = require('fs'),
    _cliProgress = require('cli-progress');
const { version } = require('os');

const mirrors = [
    // name, apilink
    ["Anonfiles", "https://api.anonfiles.com/upload"],

]

var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

var nextDate = new Date();
if (nextDate.getMinutes() === 0) {
    processMirrors()
} else {
    nextDate.setHours(nextDate.getHours() + 1);
    nextDate.setMinutes(0);
    nextDate.setSeconds(0);

    var difference = nextDate - new Date();
    setTimeout(processMirrors, difference);
}

processMirrors();

const download = (url, filename, callback) => {

    const progressBar = new _cliProgress.SingleBar({
        format: '{bar} {percentage}% | ETA: {eta}s'
    }, _cliProgress.Presets.shades_classic);

    const file = fs.createWriteStream(filename);
    let receivedBytes = 0


    request.get(url)
        .on('response', (response) => {
            if (response.statusCode !== 200) {
                return callback('Response status was ' + response.statusCode);
            }

            const totalBytes = response.headers['content-length'];
            progressBar.start(totalBytes, 0);
        })
        .on('data', (chunk) => {
            receivedBytes += chunk.length;
            progressBar.update(receivedBytes);
        })
        .pipe(file)
        .on('error', (err) => {
            fs.unlink(filename);
            progressBar.stop();
            return callback(err.message);
        });

    file.on('finish', () => {
        progressBar.stop();
        file.close(callback);
    });

    file.on('error', (err) => {
        fs.unlink(filename);
        progressBar.stop();
        return callback(err.message);
    });
}

function processMirrors() {
    var versions = null;
    // get versions from https://osekai.net/snapshots/api/api
    const req = new XMLHttpRequest();
    req.responseType = 'json';
    req.open('GET', VERSION_API);
    req.onload = () => {
        console.log(req.response);
        versions = req.response;
        // for each in versions
        for (i = 0; i < versions.length; i++) {
            var versionDownloaded = false;
            var thisVersion = versions[i];
            console.log("checking " + thisVersion["version_info"]["version"]);
            for (x = 0; x < mirrors.length; x++) {
                var mirroredAlready = false;
                var mirrorInfo = mirrors[x];
                console.log("Checking info for " + mirrorInfo[0]);
                for (y = 0; y < thisVersion["downloads"].length; y++) {
                    var thisDownload = thisVersion["downloads"][y];
                    if (thisDownload["name"] == mirrorInfo[0]) {
                        console.log("already mirrored this one! moving on...");
                        mirroredAlready = true;
                    }
                }
                if (mirroredAlready == false) {
                    if (versionDownloaded == false) {
                        console.log("this one isn't mirrored... let's download it locally then upload it to the mirrors");
                        if (thisVersion["downloads"]["main"] == null) {
                            thisVersion["downloads"]["main"] = thisVersion["downloads"][0];
                        }
                        console.log(thisVersion["downloads"]["main"]["link"])
                        const path = "versions/" + thisVersion["downloads"]["main"]["link"];

                        if (fs.existsSync(path)) {
                            console.log("file already exists.");
                        } else {
                            console.log("downloading " + "https://osekai.net/snapshots/versions/" + thisVersion["version_info"]["version"] + "/" + thisVersion["downloads"]["main"]["link"]);
                            download("https://osekai.net/snapshots/versions/" + thisVersion["version_info"]["version"] + "/" + thisVersion["downloads"]["main"]["link"], path, () => {
                                console.log('✅ Done!')
                            })
                        }


                        console.log("uploading to " + mirrorInfo[1]);

                        var formData = {
                            file: fs.createReadStream(path)
                        };

                        var Request = {
                            url: mirrorInfo[1],
                            method: 'POST',
                            formData: formData
                        }

                        request.post(Request, function optionalCallback(err, httpResponse, body) {
                            if (err) {
                                return console.error('upload failed:', err);
                            }
                            console.log('Upload successful!  Server responded with:', body);

                            var body = JSON.parse(body);


                            if (mirrorInfo[0] == "Anonfiles") {
                                var link = body["data"]["file"]["url"]["full"];
                            }

                            console.log("uploaded to " + mirrorInfo[0] + "! adding link on osekai.net...")

                            var params = new Object();
                            // secret key
                            params.bykey = config["bykey"];
                            params.name = mirrorInfo[0];
                            params.link = link;
                            params.id = thisVersion["version_info"]["id"];

                            request.post({
                                url: "https://osekai.net/snapshots/api/admin_addmirror.php",
                                formData: params
                            }, function optionalCallback(err, httpResponse, body) {
                                if (err) {
                                    return console.error('upload failed:', err);
                                }
                                console.log('Mirror add successful!  Server responded with:', body);
                            });
                        });
                    }
                }
            }
            //break;
        }
    };
    req.send();
}