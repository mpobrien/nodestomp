var PollQueue = require('./queuepoll').PollQueue;

var pq = new PollQueue('localhost', 27017, "queue", "queue", 
    {maxInterval : 500,
        op: {"$set":{"consumed":true}}
    });
     //remove      : true});

//pq.addQuery("blah", {});
pq.addQuery("asdf", {consumed:false});

pq.on("message", function(doc, filterId){
    console.log("received from ", filterId, doc);
});

pq.start();
