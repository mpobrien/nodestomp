var QueuePoll = require('./queuepoll').QueuePoll;

var qp = new QueuePoll('localhost', 27017, "queue", "queue");
qp.start();
qp.pollQuery();

qp.addQuery({});
