Syc
===

If you're using Javascript on both the server and client, why worry about message passing from server to client?

When you create a Syc variable, an identical variable will appear on the client side. Any changes to this variable will be communicated via socket.io instantaneously and will see those same changes on the client. Clients can modify the variable and have it reflected on the server side. It works under a simple principle: All data bound to the variable in question is identical between Server and Client.

Like Meteor, but without the framework.

Syc uses Object.observe if it's available for incredible responsiveness and performance, but will easily fall back onto a polyfill for older clients, or when you need to run Node without the --harmony flag.

## Syncing a variable (Server side)

To sync a variable from the server to the client:

    var synced = new syc.sync('name')
    synced['hello'] = 'world';
    
The client will be able to access this variable by getting the reference to it:

    var synced = syc.list('name')
    synced.hello
    -> "world"
    
You can change the data on either the server or the client...
    
    synced.goodbye = "farewell!"

And see the change reflected on every other client.

    synced.goodbye
    -> "farewell!"

## Setting up Syc

Syc utilizes socket.io but isn't a wrapper for it. So you'll have to initalize it as such:

    var io = require('socket.io').listen(80),
        syc = require('syc');

    io.sockets.on('connection', function (socket) {
      syc.connect(socket);
    });

And on the client:

    var socket = io.connect();
    Syc.connect(socket);

Now syc will be able to sync variables with this client.

## Watchers (Client and Server Side)

    function alertMe (object, property, paths, type, old_value) {
        alert(object[property]);
    }
    
    syc.watch('synced', function)

This will pop up an alert every time an object bound to the variable 'synced' is modified.

    synced.ascending = [1, 2, 3, 4]

At this point alertMe will be called, and you will see an alert listing 1,2,3,4.

`type` is the change type for the object, and can take the values `add`, `delete`, or `update`.

`paths` is a list of paths to the object that has been modified from the root of the object structure. For example, if you were to modify the newly created property `ascending` as such:

    synced.ascending[4] = {value: 'five'}

then alertMe would be called with the argument `property` set to `4` and `paths` being set to `[['ascending']]`, meaning you can access the modified value via `synced['ascending'][4]`. Multiple paths to the same object will be listed, but loops and circular references are ignored.



- - - 
This library is a work in progress, don't mind the extra files lying around. All you need is server/syc.js and client/syc.js.

Planned features: Server -> Client one way synchronization, watchers, and verifiers.

Syc currently supports nested arrays/objects any number of levels deep, and circular data structures. Try it!
