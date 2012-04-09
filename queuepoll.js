var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var mongodb = require("mongodb");


var PollQueue = function(host, port, dbName, collectionName, options){
    EventEmitter.call(this);
    this.dbName = dbName;
    this.collectionName = collectionName;
    mongoserver = new mongodb.Server(host, port, {}),
    this.db_connector = new mongodb.Db(this.dbName, mongoserver, {});
    this.filters = {};
    this.pollInterval = 500;
    this.remove = true;
    if(options && options.maxInterval){
        this.pollInterval = options.maxInterval;
    }

    if(options && 'remove' in options){
        this.remove = options.remove;
    }

}
inherits(PollQueue, EventEmitter);

PollQueue.prototype.addQuery = function(id, query){
    this.filters[id] = query;
}

PollQueue.prototype.start = function(){
    var self = this;
    this.db_connector.open(function(err, db){
        if(err || db == null){
            console.error("Error opening db", err);
            return;
        }
        self.collection = db.collection(self.collectionName);
        self.pollQuery();
        self.emit("ready");
    });
}


PollQueue.prototype.pollQuery = function(filterids, lastFullScan){
    var now = new Date();
    if(!lastFullScan || lastFullScan.getTime() < (now.getTime() - this.pollInterval)){
        lastFullScan = now;
        filterids = null;
    }
    var self = this;
    var activeFilters = []
    var filtersToScan;
    if(filterids){
        filtersToScan = filterids;
    }else{
        filtersToScan = Object.keys(self.filters);
    }

    var numRemaining = filtersToScan.length;
    var queueGetCallBack = function(err, doc){
        numRemaining -= 1;
        if(doc){
            activeFilters.push(filterId);
            self.emit("message", doc, filterId);
        }
        if(numRemaining == 0){
            if(activeFilters.length > 0){
                console.log("now!");
                process.nextTick(function(){
                    self.pollQuery(activeFilters, lastFullScan);
                });
            }else{
                setTimeout(function(){self.pollQuery(null,lastFullScan)}, 1000);
            }
        }
    }
    for(var i=0;i<filtersToScan.length;i++){
        var filterId = filtersToScan[i]
        var filter = self.filters[filterId];
        self.collection.findAndModify(filter, {priority:-1}, {}, {remove:true}, queueGetCallBack)
    }
}
exports.PollQueue = PollQueue;
