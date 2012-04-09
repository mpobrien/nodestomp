var TailQueue = require('./queuetail').TailQueue;

var tq = new TailQueue('localhost', 27017, "queue", "queue_capped", 
        {increasing : "_id"});
tq.addQuery("blah", {});

tq.on("message", function(doc, filterId){
    console.log("received from ", filterId, doc);
});

tq.start();
