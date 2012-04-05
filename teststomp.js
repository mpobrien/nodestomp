var StompServer = require('./stomp').StompServer;
var StompFrame = require('./stomp').StompFrame;
var net = require('net')


var sftest2 = StompFrame.build('CONNECT',
        {'accept-version':'1.1', 'key2':'value2'},
        "four \x00score and seven years ago", true)

var sftest3 = new StompFrame()
sftest3.command = 'ANOTHER_COMMAND'
sftest3.headers = {'blah1':'arg1', 'blah2':'blah2', 'content-length':'43'}
sftest3.body = "the quick brown fox jumps over the lazy dog";

var buf1 = sftest2.serialize()
var buf2 = sftest3.serialize()
var buf3 = new Buffer(buf1.length + buf2.length)
buf1.copy(buf3, 0);
buf2.copy(buf3, buf1.length);

console.log(buf1.length, buf2.length);
var myserver = new StompServer(8124);
myserver.on("open", function(){
    console.log("got open event");
    doit();
});

var numreceived = 0;
myserver.on("message", function(frame, client){
    console.log("received frame",frame.toString());
});


var buf4 = StompFrame.build("SEND", {"destination":"whatever"}, "yooo!", false).serialize();

myserver.start();

function doit(){
    var client = net.connect(8124, function() { //'connect' listener
        client.write(buf4);
        client.write(buf1);
        client.write(buf2);
    });
}



