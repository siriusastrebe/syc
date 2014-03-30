Syc
===

Sync a variable on the client and the server using Socket.io and Object.observe.

It works under a simple principle: All data bound to the variable in question is identical between the server, and the clients.

## Setting up Syc

Syc utilizes socket.io but isn't a wrapper for it. So you'll have to initalize it as such:

    var io = require('socket.io').listen(80),
        syc = require('syc');

    io.sockets.on('connection', function (socket) {
      syc.connect(socket);
    });

Now syc will be able to sync variables with this client.


## Syncing a variable (Server side)

To sync a variable from the server to the client:

    var synced = new syc.sync('name')

The client will be able to access this variable by getting the reference to it:

    var synced = syc.list('name')

Now, if you modify the variable on the either the server or the client side, an Object.observe call (or a polyfill when server/client does not have Object.observe, see the Polyfill section) will use socket.io to automatically sync the variable. If a client changes the variable in this way, the change will be reflected on the server, and therefore, every other client.

Warning: Syncing a variable like this without verifying is intended for prototyping a project. A client can maliciously change the variable have this change reflected on every client.

Sometimes you don't want a client mucking with the variable. You can serve the variable as such:

    var served = new syc.serve(name)

Now, if the client modifies the variable, it will instantly be reverted to the value the server contains.

## Juggling Users (Server Side)

    io.sockets.on('connection', function (socket) {
      var user = syc.connect(socket);
    });
    
`syc.connect()` returns a User type variable. If you want to sync a variable with just a single user:

    var synced = new user.sync('name')

    var served = new user.serve('name')
    
You can access a list of currently connected users

    syc.connections
    syc.users

Both are synonymous.

## Using Groups (Server Side)

You can create a group to add users to.

    var misfits = new syc.group()

    misfits.add(user)

Now, if you sync a variable to the group, the variable will be synced with all current users, as well as any users added to the group.

    var synced = misfits.sync('name')
    
`syc.serve` is also available. 

For brevity, you can get a user to join a group:

    var user.join(misfits)

## Watching a variable (Client and Server)

Occasionally you want to be notified whenever a variable is modified:

    function logger (oldValue, newValue) { 
    
    syc.watch(synced, )
    
Now you can

    


    syc.verify(synced)
    
    syc.verify(synced.gamertag)


    group = syc.group()

    

    user.join(group)
    new user.sync(name)
    new user.serve(name)
    
# Client
    syc.monitor(name, callback)
    syc.watch(synced, callback)
    
    
