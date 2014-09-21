Syc
===

Wouldn't it be nice if you could change a variable on your node.js server, and see that same change reflected on your clients' browsers?

When you create a Syc variable, an identical variable will appear on the client side. Changes to this variable will be communicated and updated via socket.io instantaneously. Clients can also modify the variable and the changes will be broadcast to the server and other clients. It works under a simple principle: All data bound to the variable in question is identical between Server and Client, removing the headache of data synchronization.

Like Meteor, but without the framework.

Syc uses Object.observe if it's available for incredible responsiveness and performance, but will easily fall back onto a polyfill for older clients or Node instances without --harmony.

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

*Note*: To ensure good practice, Syc forbids one-way served variables from referencing or being referenced by two-way variables.


## Watchers (Client and Server Side)

Occasionally, you'll want to be notified when a remote source changes your variable.

    function alertMe (object, property, change_type, paths, old_value) {
        alert(object, property, change_type, paths, old_value);
    }
    
    syc.watch('name', function)

This will pop up an alert every time you receive a remote change to an object bound to the variable 'name'.

    synced.ascending = [1, 2, 3, 4]

At this point alertMe will be called, and you will see

    -> [Object], 'ascending', 'add', [[]], undefined 

`object[property]` will get you the specific change. 

`change_type` will be one of `add`, `delete`, or `update`.

`paths` is a 2 dimensional list. Each inner list is a full path from the root of the variable, to the object where the change occurred (cycles are only counted once).

    syc.watch('name', function (object, property, change_type, paths, old_value) { console.log(paths) })
    synced.ascending[4] = 5;
    -> [['ascending', '4']]

*Note:* Server side watchers have access to the originating socket `function (object, property, change_type, paths, old_value, socket)`

## Verifiers

While watchers are good for alerting changes after they happen, often you'll want to verify that a change is harmless before it takes effect.

    function check (change, object, property, change_type, paths, old_value, socket)



- - - 
This library is a work in progress.

Planned features: Verifiers, Observers, Synchronization/Integrity checks, Converting an existing variable to a Syc variable.

Syc currently supports nested arrays/objects any number of levels deep, and circular data structures. Try it!
