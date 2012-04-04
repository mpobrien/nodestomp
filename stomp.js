var net = require('net')
var fs  = require('fs')

var supported_versions = {'1.1':true, '1.0':true}


var NEWLINE = new Buffer('\n')[0]
var MAX_HEADERS = 64;
var MAX_HEADERLINE_LENGTH = 1024;
var MAX_FRAMESIZE = 4096;

var username = null;
var passcode = null;

var unEscapeHeader = function(input){//{{{
    input = input.replace('\\n', '\n')
    input = input.replace('\\c', ':')
    input = input.replace('\\\\', '\\')
    return input;
}//}}}
var escapeHeader = function(input){//{{{
    input = input.replace('\n', '\\n')
    input = input.replace(':', '\\c')
    input = input.replace('\\', '\\\\')
    return input;
}//}}}

// Parse a Stomp Frame from a buffer of incoming data
var StompFrame = function(raw){//{{{
    this.command = null;
    this.headers = {};
    this.body = null;

    //Check if we are parsing data or just constructing an empty frame
    if( raw == undefined ) return;

    var index = 0;
    while(raw[index] != NEWLINE) index++;
    this.command = raw.toString('utf-8', 0, index);
    index++;
    
    var numHeadersFound = 0

    // parse headers
    do{
        var startLine = index;
        while(raw[index] != NEWLINE) index++;
        var headerInfo = raw.toString('utf-8', startLine, index);
        index++;
        if(headerInfo.length == 0){// || startLine == headerInfo.length-1){
            break;
        }else{
            if( headerInfo.length > MAX_HEADERLINE_LENGTH ){
                throw Error("Maximum header length exceeded:" + MAX_HEADERLINE_LENGTH);
            }
            numHeadersFound++;
            var headerSplit = headerInfo.split(':')
            if(headerSplit.length != 2) throw Error("Invalid header");
            var headerKey = unEscapeHeader(headerSplit[0])
            var headerValue = unEscapeHeader(headerSplit[1])
            if(headerKey in this.headers){
                continue
            }else{
                this.headers[headerKey] = headerValue;
            }
        }
    }while(headerInfo.length != 0 && numHeadersFound < MAX_HEADERS);

    //The remainder of the message is just the body:
    var bodyStart = index;
    while(index < raw.length && raw[index] != '\x00') index++;
    this.body = raw.toString('utf-8', bodyStart, index);
}//}}}

StompFrame.build = function(command, headers, body, addMeta){//{{{
    var frameObj = new StompFrame();
    frameObj.command = command;
    frameObj.headers = headers;
    frameObj.body    = body;
    console.log("here1");

    if(addMeta){
        if( body ){
            frameObj.headers['content-length'] = body.length;
            frameObj.headers['content-type'] = 'utf-8';
        }
    }
    console.log("here2");
    return frameObj;
}//}}}

// Utility method to show the contents of a STOMP frame
StompFrame.prototype.toString = function(){//{{{
    var result = "command: " + this.command + "\n";
    result += "headers:\n";
    console.log(this.headers);
    for(var key in this.headers){
        result += "\t" + key  + " : " + this.headers[key] + "\n";
    }

    result += "BODY:\n\t";
    result += this.body;
    return result;
}//}}}

StompFrame.prototype.serialize = function(stream){//{{{
    //TODO assert that this.command and this.body are non null
    var output = this.command + '\n';
    for(var headerKey in this.headers){
        output += escapeHeader(headerKey) + ':' + escapeHeader(this.headers[headerKey]) + '\n'
    }
    output += '\n'
    output += this.body;
    output += '\x00'
    if(stream){
        var buf = new Buffer(output, 'utf-8')
        if(Array.isArray(stream)){
            //broadcast to a bunch of streams
            for(var i=0;i<stream.length;i++){
                stream[i].write(buf)
            }
        }else{
            // send to a single stream
            stream.write(buf)
        }
        return buf;
    }else{
        return new Buffer(output, 'utf-8')
    }
}//}}}

Buffer.prototype.indexOf = function(str) { //{{{
  if (typeof str !== 'string' || str.length === 0 || str.length > this.length) return -1; 
  var search = str.split("").map(function(el) { return el.charCodeAt(0); }), 
      searchLen = search.length, 
      ret = -1, i, j, len; 

  for (i=0,len=this.length; i<len; ++i) { 
    if (this[i] == search[0] && (len-i) >= searchLen) { 
      if (searchLen > 1) { 
        for (j=1; j<searchLen; ++j) { 
          if (this[i+j] != search[j]) 
            break; 
          else if (j == searchLen-1) { 
            ret = i; 
            break; 
          } 
        } 
      } else 
        ret = i; 
      if (ret > -1) 
        break; 
    } 
  } 
  return ret; 
}; //}}}

var disconnectedHandler = function(frame, client){
    console.log("received", frame.toString())
    if(frame.command.toLowerCase() != 'connect'){
        console.log("mob1");
        //Message must be a "CONNECT" message
        StompFrame.build('ERROR', {message : "was expecting a CONNECT command"}, null, true)
                  .serialize(client)
        client.end();
        return;
    }

        console.log("mob2");
    var acceptedVersion = "1.0";
    if(!('accept-version' in frame.headers)){
        console.log("mob3");
        acceptedVersion = "1.0";
    }else{
        var versions = frame.headers['accept-version'].split(',');
        for(var i=0;i<versions.length;i++){
            if(versions[i] in supported_versions && versions[i] > acceptedVersion){
                acceptedVersion = versions[i]
            }
        }
        console.log("mob4", acceptedVersion);
    }

    console.log("mob5", acceptedVersion);

    //if the accept-version header is missing, default to 1.0
    var reply = StompFrame.build('CONNECTED', {"version":acceptedVersion}, null, true)
    console.log("mob6")//, acceptedVersion);
    console.log("sent back:", reply.toString())
    console.log("sent back:", reply.toString())
    return;
}

var connectedHandler = function(message, client){
}

var states = {
    'disconnected' : disconnectedHandler, 
    'connected'    : connectedHandler
}

function handleMessage(buf, client){
    try{
        var frame = new StompFrame(buf);
        states[client.state](frame, client)
    }catch(err){
        // handle a bad frame?
    }
}

var server = net.createServer(function(c) { //'connection' listener
  var data = [], dataLen = 0;
  c.state = 'disconnected'

  var collectBuffers = function(bufs, totalLen){//{{{
    var buf = new Buffer(totalLen);
    for(var i=0, pos=0;i<bufs.length;i++){
      bufs[i].copy(buf, pos);
      pos += data[i].length;
    }
    return buf;
  }//}}}

  function processData(buf){//{{{
      var nullpos = buf.indexOf('\x00');
      if(nullpos>=0){
          data.push(buf.slice(0, nullpos+1))
          dataLen += nullpos + 1;
          var frameData = collectBuffers(data, dataLen);
          data = []
          dataLen = 0;
          handleMessage(frameData, c);
          return buf.slice(nullpos+1)
      }else{
          data.push(buf);
          dataLen += buf.length;                            
          return null;
      }
  }//}}}

  console.log('Server Connected');
  c.on('end', function() {
    console.log('Server Disconnected');
  });

  c.on('data', function(chunk){
      var remainder = processData(chunk);

      //Process any additional messages if available
      while(remainder != null){
        remainder = processData(remainder);
      }
  });

});

server.listen(8124, function() { //'listening' listener
  console.log("server ready");
});


/* TESTS

var testbuf = "CONNECT\naccept-version:1.1\nhost:sto\\cmp.\\\\gith\\nub.org\n\n1234\x00"
var sftest = new StompFrame(new Buffer(testbuf))
console.log(sftest.toString());

var sftest2 = new StompFrame()
sftest2.command = 'HERES_A_COMMAND'
sftest2.headers = {'key1':'value1', 'key2':'value2'}
sftest2.body = "four score and seven years ago";

var sftest3 = new StompFrame()
sftest3.command = 'ANOTHER_COMMAND'
sftest3.headers = {'blah1':'arg1', 'blah2':'blah2'}
sftest3.body = "the quick brown fox jumps over the lazy dog";

var buf1 = sftest2.serialize()
var buf2 = sftest3.serialize()
var buf3 = new Buffer(buf1.length + buf2.length)
buf1.copy(buf3, 0);
buf2.copy(buf3, buf1.length);
console.log(buf3)

function doit(){
    var client = net.connect(8124, function() { //'connect' listener
      console.log('client connected');
      client.write(buf3);
    });
}

*/


