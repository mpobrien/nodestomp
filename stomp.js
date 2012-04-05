var net = require('net')
var fs  = require('fs')
var EventEmitter = require('events').EventEmitter;
var inherits = require('util').inherits;

var NEWLINE = new Buffer('\n')[0]
var MAX_HEADERS = 64;
var MAX_HEADERLINE_LENGTH = 1024;
var MAX_FRAMESIZE = 4096;

var username = null;
var passcode = null;

var CLIENT_FRAMES = {"send":true, "subscribe":true, "unsubscribe":true,
                     "ack":true, "nack":true, "begin":true,
                     "commit":true, "abort":true, "disconnect":true}

var unEscapeHeader = function(input){//{{{
    input = input.replace('\\n', '\n')
    input = input.replace('\\c', ':')
    input = input.replace('\\\\', '\\')
    return input;
}//}}}
var escapeHeader = function(input){//{{{
    input = String(input).replace('\n', '\\n')
    input = input.replace(':', '\\c')
    input = input.replace('\\', '\\\\')
    return input;
}//}}}

// Parse a Stomp Frame from a buffer of incoming data
var StompFrame = function(raw){//{{{
    this.command = null;
    this.headers = {};
    this.body = '';
    this.bytesRemaining = null;

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

    // if we have a content length header and it matches the number of bytes
    // available
    if('content-length' in this.headers){
        var contentLen = parseInt(this.headers['content-length']);
        if(contentLen == (raw.length - 1 - bodyStart)){
            this.body = raw.slice(bodyStart, bodyStart + contentLen);
        }else{
            this.bytesRemaining = contentLen - (raw.length-bodyStart);
            this.body = raw.slice(bodyStart);
        }
    }else{
        this.body = raw.slice(bodyStart, raw.length-1);
    }
    //if(this.headers
    //while(index < raw.length && raw[index] != '\x00') index++;
}//}}}

StompFrame.build = function(command, headers, body, addMeta){//{{{
    var frameObj = new StompFrame();
    frameObj.command = command;
    frameObj.headers = headers;
    frameObj.body    = body;

    if(addMeta){
        if( body ){
            frameObj.headers['content-length'] = body.length;
            frameObj.headers['content-type'] = 'utf-8';
        }
    }

    return frameObj;
}//}}}

// Utility method to show the contents of a STOMP frame
StompFrame.prototype.toString = function(){//{{{
    var result = "command: " + this.command + "\n";
    result += "headers:\n";
    for(var key in this.headers){
        result += "\t" + key  + " : " + this.headers[key] + "\n";
    }

    result += "BODY:\n\t";
    result += "[" + JSON.stringify(this.body.toString()) + "]"
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


var connectedHandler = function(frame, client){//{{{
    var cmd = frame.command.toLowerCase()
    if(cmd == 'SEND'){
        if(!('destination' in frame.headers)){
            //Message must be a "CONNECT" message
            StompFrame.build('ERROR', {message : "missing required destination header"}, null, true)
                      .serialize(client)
        }
    }
}//}}}


var StompServer = function(port){
    EventEmitter.call(this); this.port = port;
}
inherits(StompServer, EventEmitter);

StompServer.prototype.start = function(){
    var self = this;
    var server = net.createServer(function(c) { //{{{
      var data = [], dataLen = 0;
      c.bytesLeft = 0;
      c.partialMessage = null;
      self.emit("connect", c);

      var collectBuffers = function(bufs, totalLen){//{{{
        var buf = new Buffer(totalLen);
        for(var i=0, pos=0;i<bufs.length;i++){
          bufs[i].copy(buf, pos);
          pos += data[i].length;
        }
        return buf;
      }//}}}

    function handleMessage(buf, client){//{{{
        try{
            var frame = new StompFrame(buf);
            if(frame.bytesRemaining){
                client.partialMessage = frame;
                client.bytesLeft = frame.bytesRemaining;
            }else{
                emitMessage(frame, client);
            }
        }catch(err){
            // handle a bad frame?
        }
    }//}}}

    function emitMessage(frame, client){//{{{
        self.emit("message", frame, client)
        var cmdLower = frame.command.toLowerCase();
        if(cmdLower in CLIENT_FRAMES){
            self.emit(cmdLower, frame, client);
        }
    }//}}}

      function processData(buf){//{{{
          if(c.partialMessage != null){
            if(buf.length >= c.partialMessage.bytesRemaining){
                c.partialMessage.body += buf.slice(0, c.partialMessage.bytesRemaining)
                var msg = c.partialMessage;
                c.partialMessage = null;
                emitMessage(msg, c);
                var retval = buf.slice(msg.bytesRemaining+1)
                return retval;
            }else{
                c.partialMessage.body += buf;
                c.partialMessage.bytesRemaining -= buf.length;
                return null;
            }
          }
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

      c.on('data', function(chunk){//{{{
          var remainder = processData(chunk);

          //Process any additional messages if available
          while(remainder != null){
              remainder = processData(remainder);
          }
      });//}}}

    });//}}}
    var self = this
    server.listen(this.port, function(){
        self.emit("open");
    });
}

exports.StompServer = StompServer;
exports.StompFrame  = StompFrame;



