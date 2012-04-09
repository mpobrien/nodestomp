from pymongo import Connection, ReplicaSetConnection
import time
db = ReplicaSetConnection("10.83.146.45:27017", replicaSet='mikey').queue

i = 0
while True:
	#time.sleep(.00001)
	try:
		db.queue_capped.insert({"x":i})
		i+=1
		print i
	except Exception, e:
		print e
		continue




