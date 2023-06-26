const express = require("express");
const http = require("http");
const mongodb= require("mongodb")
const PORT = process.env.PORT ;
const amqp = require('amqplib')
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

if (!process.env.RABBIT) {
    throw new Error("Please specify the name of the RabbitMQ host using environment variable RABBIT");
}

const VIDEO_STORAGE_PORT = parseInt(process.env.VIDEO_STORAGE_PORT);
const VIDEO_STORAGE_HOST = process.env.VIDEO_STORAGE_HOST;
const DBHOST = process.env.DBHOST;
const DBNAME = process.env.DBNAME;
const RABBIT = process.env.RABBIT

function connecRabbit(){
    console.log(`Connecting to RabbitMQ server at ${RABBIT} .`);
    return amqp.connect(RABBIT)
        .then(connection => {
            console.log("Connected to RabbitMQ.");

            return connection.createChannel()
        })
}
function sendViewedMessage(messageChannel, videoPath){
    console.log(`Publishing message on "viewed" queue.`);
    const msg = {
        videoPath: videoPath
    };
    const jsonMsg = JSON.stringify(msg);
    messageChannel.publish("", "viewed", Buffer.from(jsonMsg))
}
function setupHandlers(app, messageChannel){
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
                        sendViewedMessage(messageChannel, videoRecord.videoPath)
                        // console.log('message send')
                    })
                    .catch(err => {
                        console.error("Database query failed.");
                        console.error(err && err.stack || err);
                        res.sendStatus(500);
                    });
            });

    });
}
function startHttpServer(messageChannel){
    return new Promise(resolve => {
        const app = express();
        setupHandlers(app, messageChannel);
        const port = process.env.PORT && parseInt(process.env.PORT) || 3000;
        app.listen(port, () => {
            resolve();
        });
    })
}
function main(){
    return connecRabbit()
        .then(messageChannel => {
            return startHttpServer(messageChannel);
        })
}
main()
    .then(() => console.log("Microservice online"))
    .catch(err => {
        console.error("Microservice failed to start.");
        console.error(err && err.stack || err);
    });