Syc
===

Sync a variable on the client and the server using Socket.io and Object.observe.

It works under a simple principle: All data bound to the variable in question is identical between the server, and the clients.

# Setting up Syc

Syc uses socket.io but isn't a wrapper for it. So you'll have to initalize it as such:

    var io = require('socket.io').listen(80),
        syc = require('syc');

    io.sockets.on('connection', function (socket) {
      syc.connect(socket);
    });    

Now syc will be able to sync variables with this client.


# Syncing a variable (Server side)

    synced = new syc.sync(name)
    served = new syc.serve(name)

    synced = new syc.twoWay(name)
    served = new syc.oneWay(name)
    
    syc.verify(synced)
    syc.watch(synced)
    
    syc.verify(synced.gamertag)
    
    syc.list

    syc.connections
    syc.users

    group = syc.group()

    group.add(user)
    new group.sync(name)
    new group.serve(name)
    

    user.join(group)
    new user.sync(name)
    new user.serve(name)
    
# Client
    syc.monitor(name, callback)
    syc.watch(synced, callback)
    
    
