const express = require("express")
const mongodb = require("mongodb")
const bodyParser = require('body-parser');
const amqp = require('amqplib')
if (!process.env.DBHOST) {
    throw new Error("Please specify the databse host using environment variable DBHOST.");
}

if (!process.env.DBNAME) {
    throw new Error("Please specify the name of the database using environment variable DBNAME");
}
if (!process.env.RABBIT) {
    throw new Error("Please specify the name of the RabbitMQ host using environment variable RABBIT");
}

const DBHOST = process.env.DBHOST;
const DBNAME = process.env.DBNAME;
const RABBIT = process.env.RABBIT
function connectDb() {
    return mongodb.MongoClient.connect(DBHOST)
    .then(client => {
        return client.db(DBNAME)
    })
}
function connecRabbit(){
    console.log(`Connecting to RabbitMQ server at ${RABBIT}.`);
    return amqp.connect(RABBIT)
        .then(messagingConnection => {
            console.log("Connect to RabbitMQ.");
            return messagingConnection.createChannel();
        })
}
function setupHandlers(app, db, messageChannel){
    const videosCollection = db.collection("videos");
    // app.post("/viewed", (req, res) => {
    //     const videoPath = req.body.videoPath;
    //     videosCollection.insertOne({videoPath: videoPath})
    //     .then (() => {
    //         console.log(`Added video ${videoPath} to history.`);
    //         res.sendStatus(200);
    //     })
    //     .catch(err => {
    //         console.error(`Error adding video ${videoPath} to history.`);
    //         console.error(err && err.stack || err) ;
    //         res.sendStatus(500) 
    //     });
    // });
    app.get("/history", (req,res) => {
        const skip = parseInt(req.query.skip);
        const limit = parseInt(req.query.limit);
        videosCollection.find()
            .skip(skip)
            .limit(limit)
            .toArray()
            .then(documents =>{
                res.json({history: documents});
            })
            .catch(err => {
                console.error(`Error retrieving history from database. `);
                console.error(err && err.stack || err);
                res.sendStatus(500);
            })
    })
    function consumeViewMessage(msg){
        console.log("Received a 'viewd' message");
        const parsedMsg = JSON.parse(msg.content.toString());
        console.log(parsedMsg)
        return videosCollection.insertOne({videoPath : parsedMsg.videoPath})
        .then(() => {
            console.log("Acknowledging message was handled.");
            messageChannel.ack(msg)
        });
    };
    return messageChannel.assertQueue("viewed", {})
        .then(() => {
            console.log("Asserted that the 'viewed' queue exists.");
            return messageChannel.consume("viewed", consumeViewMessage)
        })

}
function startHttpServer(db, messageChannel){
    return new Promise(resolve =>{
        const app = express();
        app.use(bodyParser.json());
        setupHandlers(app, db, messageChannel);

        const port= process.env.PORT && parseInt(process.env.PORT) || 3000;
        app.listen(port, () =>{
            resolve();
        });
    });
}

function main(){
    return connectDb(DBHOST)
        .then(db => {
            return connecRabbit()
            .then(messageChannel => {
                return startHttpServer(db, messageChannel)
            })
            
        })
   
}

main()
    .then(()=> console.log("Microservice online."))
    .catch(err =>{
        console.error("Microservice failed to start.");
        console.error(err && err.stack || err);
    });