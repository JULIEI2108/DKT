const express = require("express");
const http = require("http");
const mongodb= require("mongodb")
const PORT = process.env.PORT ;

const app = express();
if (!process.env.PORT) {
    throw new Error("Please specify the port number for the HTTP server with the environment variable PORT.");
}

if (!process.env.VIDEO_STORAGE_HOST) {
    throw new Error("Please specify the host name for the video storage microservice in variable VIDEO_STORAGE_HOST.");
}

if (!process.env.VIDEO_STORAGE_PORT) {
    throw new Error("Please specify the port number for the video storage microservice in variable VIDEO_STORAGE_PORT.");
}

if (!process.env.DBHOST) {
    throw new Error("Please specify the databse host using environment variable DBHOST.");
}

if (!process.env.DBNAME) {
    throw new Error("Please specify the name of the database using environment variable DBNAME");
}
const VIDEO_STORAGE_PORT = parseInt(process.env.VIDEO_STORAGE_PORT);
const VIDEO_STORAGE_HOST = process.env.VIDEO_STORAGE_HOST;
const DBHOST = process.env.DBHOST;
const DBNAME = process.env.DBNAME;

function sendViewedMessage(videoPath){
    const postOptions = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
    };
    const requestBody = {
        videoPath: videoPath
    };
    const req = http.request(
        "http://history/viewed",
        postOptions
    );
    req.on("close",() => {
        
    });
    req.on("err",() => {
        console.log(err && err.stack || err)
        
    });
    req.write(JSON.stringify(requestBody));
    req.end()
}
function main(){
    return mongodb.MongoClient.connect(DBHOST)
        .then(client => {
            const db = client.db(DBNAME);
            const videosCollection = db.collection('videos');
            app.get("/video", (req, res) => {
                const videoId = new mongodb.ObjectId(req.query.id);
                console.log(videoId)
                videosCollection
                    .findOne({ _id: videoId })
                    .then(videoRecord => {
                        if (!videoRecord) {
                            res.sendStatus(404);
                            return;
                        }
                        console.log(`Translated id ${videoId} to path ${videoRecord.videoPath}.`);
                        const forwardRequest = http.request(
                            {
                                host: VIDEO_STORAGE_HOST,
                                port: VIDEO_STORAGE_PORT,
                                path: `/video?path=${videoRecord.videoPath}`,
                                method: 'GET',
                                headers: req.headers
                            },
                            forwardResponse => {
                                res.writeHead(forwardResponse.statusCode, forwardResponse.headers);
                                forwardResponse.pipe(res);
                            }
                        
                        );
                        req.pipe(forwardRequest);
                        sendViewedMessage(videoRecord.videoPath)
                        // console.log('message send')
                    })
                    .catch(err => {
                        console.error("Database query failed.");
                        console.error(err && err.stack || err);
                        res.sendStatus(500);
                    });
            });
        app.listen(PORT, () => {
            console.log(`Microservice listening on port ${PORT}, point your browser at http://localhost:3000/video`);
        });
    });
}
main()
    .then(() => console.log("Microservice online"))
    .catch(err => {
        console.error("Microservice failed to start.");
        console.error(err && err.stack || err);
    });