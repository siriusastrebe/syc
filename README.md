Syc
===

Reactive javascript variables, automatically synchronized between server and client.

Pass an object or array through Syc on the server, and an identical object/array will appear on the client side. Changes to this variable will be communicated and synchronized across the server and all clients instantly. It works under a simple principle: All data bound to the variable in question is identical between Server and Clients, removing the headache of data synchronization.

Like Meteor, but without the framework.

Syc uses Object.observe when available for responsiveness and performance, but will easily fall back onto a polyfill if unavailable.

## Syncing a variable (Server side)

To sync a variable from the server to the client, take an object or array and pass it through Syc:

    // On the server side...
    var shared = {hello: 'world'}
    syc.sync('name', shared);
    
The client can use `syc.list()` to see all existing syc variables.

    // On the client side...
    var shared = syc.list('name')
    shared.hello
    -> "world"
    
You can change the data on either the server or the client... And see the change reflected everywhere else.    

    shared.goodbye = "farewell!"

    // elsewhere...
    syc.list('name').goodbye
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

### Accessing initial data (Client side)

    Syc.connect(socket);
    var data = Syc.list('name');

Most often `data` will come back as undefined if used in the manner above. It takes a moment for Syc to retrieve data from the server, so `Syc.list()` needs a second to synchronize. There are two methods for dealing with this delay:

    Syc.connect(socket, callback);

`callback` is an optional parameter and will be triggered when Syc is entirely synchronized to the data held on the server.

    Syc.list('name', callback);

If `Syc.list('name')` comes back as undefined, the callback function will be triggered whenever the client receives data for the variable. Useful when `'name'` will be synced or served at some point in the future.


## One-way Variables (Server side)

    // Server side
    var served = [1, 2, 3];
    syc.serve('name', served);

Serving a variable restricts the client from making any changes to data bound to the served variable. Useful for when you do not want a malicious client to tampering with the data. 

*Note*: To ensure good practice, Syc forbids one-way served variables from referencing or being referenced by two-way variables.

## Watchers (Client and Server Side)

Occasionally, you'll want to be notified when changes are made to you variable.

    function alertMe (change) {
        console.log(change);
    }
    
    syc.watch(object, alertMe)

Watchers provide insight into an object whose property has been changed. If multiple properties are changed simultaneously, the watcher will trigger once for each property. 

`change` has the following properties available to it:

`change.variable` - The variable whose property was modified.

`change.property` - The modified property's name. The actual changed value can be found in `change.variable[change.property]`.

`change.change` - The actual changed value, shorthand for `change.variable[change.property]`

`change.root` - The root of the syc variable that triggered the watcher.

`change.oldValue` - A record of the previous value held in `change.variable[change.property]`.

`change.type` - Any one of `add`, `update` or `delete`.

`change.local`, `change.remote` One of these will be true depending on the origin of the change.

*Note:* Server side watchers have access to the originating socket `function (changes, socket)`.

You can also specify preferences: 
    
    syc.watch(object, alertMe, {remote: true, local: true, recursive: false})

If the preferences argument is ommitted, `remote` and `local` default to `true` and `recursive` to `false`. 

If recursive, all descendants to the object in question will be watched. Any new children object/arrays created after the watcher will automatically be given a trigger for the same function. Objects that whose references were deleted after the watcher was created will automatically be unwatched.

### Unwatching

You can unwatch an existing watcher:

    syc.unwatch(func, object)

Object is an optional parameter. If its left blank, then all watcher that utilizes the function will be deleted.

## Verifiers (Server side)

While watchers are good for alerting changes after they happen, often you'll want to verify that a client's change is harmless before it takes effect. Verifiers look similar to watchers, but will accept a change only if the function returns true.

    function check (change, socket) {
      if (typeof change.change !== 'string') 
        return false;
      else
        return true;
    }
    
    Syc.verify(object, check)

By its nature, verifiers are only triggered on receiving a remote change originating from a client.

When a client makes a change, verifiers will be called *before* the change happens. If all verifiers attached to the modified object returns truthy, the change is accepted and then watchers will be called. If any return falsy, the verifier drops the change, watchers will not be called, and the client is re-synced.

*Advanced tip*: `change.change` can be altered by the callback. This change will be reflected in the final result. **Warning**: Careful when making modifications to `change.change`. When it references an existing object, changes will reflect on that object even when the verifier returns false.

- - - 
This library is a work in progress.

Planned features: Unverifiers, Groups (Still in planning): This feature would provide security and selective data sharing for clients, Custom datastructures (Still in planning): This feature would allow you to specify conversion of arbitrary data structures to JSON and back, allowing synchronization from server to client.

Syc currently supports nested arrays/objects any number of levels deep, and circular data structures. Built with efficiency and minimum network utilization in mind. Try it!
