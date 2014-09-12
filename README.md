Syc
===

If you're using Javascript on both the server and client, why worry about message passing from server to client?

Syc syncs a variable from server to client. When you create a Syc variable, an identical variable will appear on the client side. Any changes to this variable will be communicated via socket.io instantaneously and will see those same changes on the client. Clients can modify the variable and have it reflected on the server side. It works under a simple principle: All data bound to the variable in question is identical between Server and Client.

Like Meteor, but without the framework.

Syc uses Object.observe if it's available for incredible responsiveness and performance, but will easily fall back onto a polyfill for older clients, or when you need to run Node without the --harmony flag.

## Syncing a variable (Server side)

To sync a variable from the server to the client:

    // On the server side...
    var synced = new syc.sync('name')
    synced['hello'] = 'world';
    
The client will be able to access this variable by getting the reference to it:

    // On the client side...
    var synced = syc.list('name')
    synced.hello
    -> "world"
    
You can change the data on either the server or the client...
    
    synced.goodbye = "farewell!"

And see the change reflected on every other client.

    // On any client...
    synced.goodbye
    -> "farewell!"

## Setting up Syc

Syc utilizes socket.io but isn't a wrapper for it. So you'll have to initalize it as such:

    // Server side setup
    var io = require('socket.io').listen(80),
        syc = require('syc');

    io.sockets.on('connection', function (socket) {
      syc.connect(socket);
    });

And on the client:

    // Client side setup
    var socket = io.connect();
    Syc.connect(socket);

Now syc will be able to sync variables with this client.

## One-way Variables (Server side)

    // Server side 
    var served = new syc.serve('name')

Serving a variable restricts the client from making any changes to data bound to the served variable. Useful for when you do not want a malicious client to tampering with the data. 

*Note*: To ensure good practice, Syc forbids one-way served variables from referencing or being referenced by objects bound to two-way variables.


## Watchers (Client and Server Side)

    function alertMe (object, property, type, paths, old_value) {
        alert(object, property, type, paths, old_value);
    }
    
    syc.watch('synced', function)

This will pop up an alert every time an object bound to the variable 'synced' is modified.

    synced.ascending = [1, 2, 3, 4]

At this point alertMe will be called, and you will see

    -> [Object], 'ascending', 'add', [[]], undefined 

`object[property]` will get you the specific change. 

`type` is the change type that happened, and can be one of `add`, `delete`, or `update`.

`paths` is a 2 dimensional list. Each inner list is a full path from the root of the variable, to the object where the change occurred.

    syc.watch('synced', function (object, property, type, paths, old_value) { console.log(paths) })
    synced.ascending[4] = 5;
    -> [['ascending', '4']]


- - - 
This library is a work in progress, don't mind the extra files lying around. All you need is server/syc.js and client/syc.js.

Planned features: Verifiers, Synchronization/Integrity checks

Syc currently supports nested arrays/objects any number of levels deep, and circular data structures. Try it!
