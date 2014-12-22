Syc
===

Javascript variables, automatically synchronized between client and server.

Create an object/array on your Node server and pass it through Syc. An identical object/array will appear on the client side. Changes will be communicated and synchronized across the server and all clients instantly. It works under a simple principle: All data bound to the variable in question is identical between Server and Clients, removing the headache of data synchronization.

Syc uses Object.observe when available for responsiveness and performance, but will easily fall back onto a polyfill if unavailable.

### Samples

A sample chat application written using Syc:

http://treebeard.herokuapp.com/

## Syncing a variable (Server side)

To sync a variable from the server to the client, create an object or array and pass it through Syc:

    // On the server side...
    var shared = {hello: 'world'}
    syc.sync('name', shared);
    
The client can use `syc.list()` to see all existing syc variables.

    // On the client side...
    syc.list('name')
    -> {hello: 'world'}
    
You can change the data on either the server or the client... And see the change reflected everywhere else.    

    shared.goodbye = "farewell!"

    // elsewhere...
    syc.list('name')
    -> {hello: 'world', goodbye: 'farewell!'}

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
    
### Accessing initial data (Client side)

    // Client side...
    Syc.connect(socket);
    var data = Syc.list('name');

If done in the manner above, most often `data` will come back as undefined, as it takes a moment for Syc to synchronize. There are two methods for dealing with this delay:

    Syc.connect(socket, callback);

This lets you run code as you connect to the server. `callback` is an optional parameter and will be triggered when Syc is entirely synchronized to the data held on the server.

The second method allows you to call a function whenever data becomes availble: 

    function callback (variable_root) { }
    Syc.list('name', callback);

The callback function will be triggered immediately when data is already associated with Syc.list('name'). Otherwise, it will wait until the client receives data for that variable. Useful when `'name'` will be synced or served at some point in the future.

## One-way Variables (Server side)

    // Server side
    var served = [1, 2, 3];
    syc.serve('name', served);

Serving a variable restricts the client from making any changes to data bound to the served variable. Useful for when you do not want a malicious client to tampering with the data. 

*Note*: To ensure good practice, Syc forbids one-way served variables from referencing or being referenced by two-way variables.

## Watchers (Client and Server Side)

Occasionally, you'll want to be notified when changes are made to your variable.

    function alertMe (changes) {
        console.log(changes);
    }
    
    syc.watch(object, alertMe)

Watchers provide insight into an object whose property has been changed. If multiple properties are changed simultaneously, the watcher will trigger once for each property. 

`changes` has the following properties available to it:

    changes.variable  // The variable whose property was modified.
    changes.property  // The modified property's name. The actual changed value can be found in change.variable[change.property].
    changes.change    // The actual changed value, shorthand for `change.variable[change.property]`
    changes.oldValue  // A record of the previous value held in `change.variable[change.property]`.
    changes.type      // Any one of `add`, `update` or `delete`.
    changes.local     // True if the change originated locally.
    changes.remote    // True if the change was received from elsewhere.

*Note:* Server side watchers have access to the originating socket: 

    function alertMe (changes, socket)

You can also specify preferences: 
    
    syc.watch(object, alertMe, {remote: true, local: true, recursive: false})

`remote` and `local` default to true. Setting them to false will ignore changes from that origin.

`recursive` defaults to `false`. If recursive is true, all descendants to the object in question will be watched. New descendants created later on will also be given the watcher. Descendants removed from the object will automatically be unwatched.

### Unwatching

    syc.unwatch(function, object)

Object is an optional parameter. If blank, then all watcher that utilizes the function will be deleted.

## Verifiers (Server side)

While watchers are good for alerting changes after they happen, often you'll want to verify that a client's change is harmless before it takes effect. Verifiers have identical syntax to watchers, but will accept a change only if the function returns true.

    function check (changes, socket) {
      if (typeof changes.change !== 'string') 
        return false;
      else
        return true;
    }
    
    Syc.verify(object, check)

By its nature, verifiers are only triggered on receiving a remote change originating from a client.

When a client makes a change to the object, verifiers will be called *before* the change happens. If all verifiers attached to the modified object returns truthy, the change is accepted. Watchers will then be called. If any return falsy, the verifier drops the change, watchers will not be called, and the client is re-synced.

In watchers `change` is synonymous with `variable[property]`. This is not the case in verifiers. Instead, `variable[property]` contains the existing value, and `change` is a simulation of what will replace `variable[property]` if all verifiers return true. *Advanced Tip*: You can modify `change` and the final result will reflect these modifications. **Warning**: Careful when doing so. `change` can sometimes reference an already existing object, and your modifications will reflect on that object even if the verifier returns false.

### Unverify

    syc.unverify(function, object)

Object is an optional parameter. If blank, all verifiers that utilizes the function will be deleted.

## Helper Functions (Server Side)

    Syc.exists(object)
    // This checks if the given object is registered by Syc and is being tracked.
    
    Syc.ancestors(object)
    // This returns objects and arrays that are referenced downstream from this object.
    
    Syc.Type(variable)
    // The built in type system Syc uses. Can differentiate between 'object' and 'array'.
- - - 
This library is a work in progress.

Planned features: Groups (Still in planning): This feature would provide security and selective data sharing for clients, Custom datastructures (Still in planning): This feature would allow you to specify conversion of arbitrary data structures to JSON and back, allowing synchronization from server to client.

Syc currently supports nested arrays/objects any number of levels deep, and circular data structures. Built with efficiency and minimum network utilization in mind. Try it!
