var mongodb = require("mongodb");
mongoserver = new mongodb.Server("localhost", 27017, {auto_reconnect:true}),
db_connector = new mongodb.Db("test", mongoserver, {retryMiliSeconds:50});


db_connector.on("close", function(err){
    console.log("closed1", err);
});
db_connector.open(function(err, db){
    if(err || db == null){
        console.error("Error opening db", err);
        return;
    }

    db.on("close", function(err){
        console.log("closed2", err);
    });
    var col = db.collection("test");

    var testCursor = function(){
        col.findOne({}, function(err, doc){
            if(err){
                console.log(err);
            }
            if(doc){
                console.log(doc);
            }
            setTimeout(function(){testCursor()}, 1000);
        });
    }
    testCursor();
});
