var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var mongodb = require("mongodb");


var QueuePoll = function(host, port, dbName, collectionName){
    EventEmitter.call(this);
    this.dbName = dbName;
    this.collectionName = collectionName;
    mongoserver = new mongodb.Server(host, port, {}),
    this.db_connector = new mongodb.Db(this.dbName, mongoserver, {});
    this.filters = {};
}
inherits(QueuePoll, EventEmitter);

QueuePoll.prototype.addQuery = function(id, query){
    this.filters[id] = query;
}

QueuePoll.prototype.start = function(){
    var self = this;
    this.db_connector.open(function(err, db){
        if(err || db == null){
            console.err("Error opening db", err);
            return;
        }
        self.collection = db.collection(self.collectionName);
        self.emit("ready");
    });
}


QueuePoll.prototype.pollQuery = function(){
    console.log("checking.");
    var self = this;
    for(filterId in this.filters){
        var filter = this.filters[filterId];
        this.collection.findAndModify(filter, {priority:-1}, {}, {remove:true}, function(err, doc){
            console.log("hey!", err, doc);
        })
    }
    setTimeout(function(){self.pollQuery()}, 1000);
}
exports.QueuePoll = QueuePoll;
