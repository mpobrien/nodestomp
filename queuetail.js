var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var mongodb = require("mongodb");


var TailQueue = function(host, port, dbName, collectionName, options){
    EventEmitter.call(this);
    this.dbName = dbName;
    this.collectionName = collectionName;
    var replSet = new mongodb.ReplSetServers([
    	new mongodb.Server("10.83.146.45", 27017, {auto_reconnect:true}),
    	new mongodb.Server("10.40.173.145", 27017, {auto_reconnect:true}),
    	new mongodb.Server("10.100.249.64", 27017, {auto_reconnect:true}),
	],
    {rs_name:"mikey"});

    this.db_connector = new mongodb.Db(this.dbName, replSet, {retryMiliSeconds:50});
    this.filters = {};
    this.increasing = "_id"
    this.retryInterval = 100;
    if(options && options.increasing){
        this.increasing = options.increasing
    }
    if(options && options.retryInterval){
        this.increasing = options.retryInterval
    }
    this.maxValue = null;
}


/*var TailQueue = function(host, port, dbName, collectionName, options){
    EventEmitter.call(this);
    this.dbName = dbName;
    this.collectionName = collectionName;
    mongoserver = new mongodb.Server(host, port, {auto_reconnect:true}),
    this.db_connector = new mongodb.Db(this.dbName, mongoserver, {retryMiliSeconds:50});
    this.db_connector
    this.filters = {};
    this.increasing = "_id"
    this.retryInterval = 100;
    if(options && options.increasing){
        this.increasing = options.increasing
    }
    if(options && options.retryInterval){
        this.increasing = options.retryInterval
    }
    this.maxValue = null;
}*/
inherits(TailQueue, EventEmitter);

TailQueue.prototype.addQuery = function(id, query){
    this.filters[id] = query;
}

//TODO this should probably just be a private method.
TailQueue.prototype.getHighest = function(callback){
    var self = this;
    var cursor = this.collection.findOne({}, {limit:1, sort:"$natural"}, function(err, doc){
        if(err){
            self.emit("error", err);
            return;
        }
        if(doc){
            self.maxValue = highest;
            callback(highest);
        }
    })
}

TailQueue.prototype.start = function(){
    console.log("START!");
    var self = this;
    this.db_connector.open(function(err, db){
        if(err || db == null){
            console.error("Error opening db", err);
            return;
        }
        db.on("close", function(error){
            console.log("closed!222", error);
        });
        self.collection = db.collection(self.collectionName);
        self.cursors = []
        self.collection.findOne({}, {limit:1, sort:[["$natural","descending"]]},
            function(err, doc){ 
                if(err){
                    console.log("yyyy",err);
                    self.emit("err");
                    return;
                }
                if(doc){             
                    console.log("asfff", doc)
                    console.log("increasing!", doc[self.increasing])
                    self.tail(doc[self.increasing]);
                }else{
                    console.log("nothing");
                    self.tail(null);
                }
            }
        );
    });

}


TailQueue.prototype.tail = function(minValue){
    console.log("tailing");
    var self = this;
    var max = minValue;
    if(max == null && self.highest != null){
        max = self.highest;
    }
    for(var filterId in this.filters){
        var filter = this.filters[filterId];

        if(minValue != null){
            filter[self.increasing] = {"$gt":max};
        }

        var cursor = self.collection.find(filter, {}, {tailable:true});
        cursor.each(function(err,doc){
            if(err){
                console.log("sss",err);
                setTimeout(function(){ self.tail(null); }, self.retryInterval);
                return;
            }
            if(doc == null ){
                console.log("!!!!!");
                setTimeout(function(){ self.tail(null); }, self.retryInterval);
                cursor.close();
            }else{
                if(self.highest == null || doc[self.increasing] > self.highest){
                    self.emit("message", doc, filterId);
                    self.highest = doc[self.increasing]
                }else{
                    //message is old or duplicate - skip
                }
            }
        });
    }
}
exports.TailQueue = TailQueue;
