var StompServer = require('./stomp').StompServer;
var StompFrame = require('./stomp').StompFrame;
var net = require('net')
var supported_versions = {'1.1':true, '1.0':true}

var myserver = new StompServer(8124);
myserver.on("open", function(){
    console.log("Server ready.");
});

myserver.on("connect", function(client){
    client.state = "new";
    console.log("New client connected");
});

myserver.on("message", function(frame, client){
    var cmd = frame.command.toLowerCase();

    //Client is trying to send some commands but hasn't negotiated 
    //protocol with "CONNECT" yet.
    if( client.state == "new" && 
        (cmd != "connect" && cmd != "stomp")){
        StompFrame.build('ERROR',
                         {message : "was expecting a CONNECT command"}, null, true)
                  .serialize(client)
        client.end();
        console.log("here");
        return;
    }

    if(cmd == 'connect'){
        //Figure out the highest version that our server supports
        var acceptedVersion = "1.0";
        if(!('accept-version' in frame.headers)){
            acceptedVersion = "1.0";
        }else{
            var versions = frame.headers['accept-version'].split(',');
            for(var i=0;i<versions.length;i++){
                if(versions[i] in supported_versions && versions[i] > acceptedVersion){
                    acceptedVersion = versions[i]
                }
            }
        }

        //if the accept-version header is missing, default to 1.0
        var reply = StompFrame.build('CONNECTED', {"version":acceptedVersion}, null, true)
        reply.serialize(client);
        client.state = 'connected'
        client.version = acceptedVersion;
        return;
    }

    if(cmd == 'subscribe'){
        var destination = frame.headers['destination']
        console.log("subscribing", frame.headers, frame.body);
    }

    if(cmd == "send"){
        console.log(frame.toString());
        var destination = frame.headers['destination']
        console.log("sending", frame.headers, frame.body);
        myserver.collection.insert({"message":frame.body});
    }
});

myserver.start();

/*db_connector.open(function(err, db){
    if(err || db == null){
        console.err("Error opening db", err);
        return;
    }
    myserver.collection = db.collection("queue");
    console.log("Mongo connection ready.");
});*/
