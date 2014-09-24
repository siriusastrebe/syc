Syc
===

Change a variable on your node.js server, and see that same change reflected on your clients' browsers.

When you create a Syc variable, an identical variable will appear on the client side. Changes to this variable will be communicated and updated via socket.io instantaneously. Clients can also modify the variable and the changes will be broadcast to the server and other clients. It works under a simple principle: All data bound to the variable in question is identical between Server and Client, removing the headache of data synchronization.

Like Meteor, but without the framework.

Syc uses Object.observe if it's available for immediate responsiveness and performance, but will easily fall back onto a polyfill for older clients or Node instances without --harmony.

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

And see the change reflected everywhere else.

    // On the server or any client...
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

    function alertMe (change) {
        console.log(change);
    }
    
    syc.watch('name', alertMe)

This will pop up an alert every time you receive a remote change to an object bound to the variable 'name'.

`change` has the following properties available to it:

`change.variable` - The variable whose property was modified.

`change.property` - The modified property. The actual changed value can be found in `change.variable[change.property]`.

`change.root` - The root of the syc variable that triggered the watcher.

`change.old_value` - A record of the previous value held in `change.variable[change.property]`.

`change.change_type` - Any one of `add`, `update` or `delete`.

`change.paths` - This is a 2-dimensional list. Each inner list is a full path from the root of the syc variable to the location of the change. Cycles are only counted once.

*Note:* Server side watchers have access to the originating socket `function (changes, socket)`

## Verifiers (Server side)

While watchers are good for alerting changes after they happen, often you'll want to verify that a change is harmless before it takes effect. Verifiers look similar to watchers, but `change` has an additional property `result`.

    function check (change, socket) {
      if (typeof change.result !== 'string') 
        return false
      else
        return true
    }
    
    Syc.verify('name', check)
    
If a client makes a change, verify will be called *before* the change happens. If the verifier returns a truthy value, the change is accepted and then any watchers will be called. If falsy, the verifier drops the change, watchers will not be called, and the client is re-synced.

`change.result` can be modified within the verifying function and whatever value contained in change.result when the verifier returns will be used. **warning** change.result sometimes can reference an existing object, and modifications to change.result will reflect even if the verifier returns false.



- - - 
This library is a work in progress.

Planned features: Observers, Converting an existing variable to a Syc variable.

Syc currently supports nested arrays/objects any number of levels deep, and circular data structures. Try it!
