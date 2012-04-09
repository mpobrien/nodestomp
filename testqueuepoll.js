var PollQueue = require('./queuepoll').PollQueue;

var pq = new PollQueue('localhost', 27017, "queue", "queue", 
    {maxInterval : 500,
     remove      : true});

pq.addQuery("blah", {});

pq.on("message", function(doc, filterId){
    console.log("received from ", filterId, doc);
});

pq.start();
