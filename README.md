Syc
===

Synchronize data by putting it in an object or an array. Whenever that object or array changes, all your clients receive that change. If a client makes a change, you can verify it before it is synchronized.

The isomorphism and reactivity of Meteor, without the framework. 

    var shared = {hello: 'world'}
    syc.sync('name', shared);

Instead of having to wrap your data in function calls for reactivity, Syc will observe the change as it happens automatically (or via polyfills for older clients).

    shared.hello = "Goodbye!!!"

Simply: Data bound to the registered variable is identical in all locations, removing the headache of data synchronization. 


Examples
===

A side project proof of concept using Syc:

http://treebeard.herokuapp.com/

A simple chat application demonstrating Syc, commented for your pleasure:

https://github.com/siriusastrebe/Syc-Demo

Documentation
===

## Syncing a variable (Server side)

To sync a variable from the server to the client, create an object or array and pass it through Syc:

    // On the server side...
    var shared = {hello: 'world'}
    syc.sync('name', shared);
    
The client can use `syc.list()` to see all existing syc variables.

    // On the client side...
    syc.list('name')
    -> {hello: 'world'}
    
You can change the data on either the server or the client. Instead of having to wrap your data in function calls for reactivity, Syc will observe the change as it happens automatically (or via polyfills for older clients).

    shared.goodbye = "farewell!"

    // elsewhere...
    syc.list('name').goodbye
    -> 'farewell!'

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

*Note*: To avoid confusion, Syc forbids one-way served variables from referencing or being referenced by two-way variables.

## Watchers (Client and Server Side)

Occasionally, you'll want to be notified when changes are made to your variable.

    syc.watch(object, alertMe)
    function alertMe (changes, socket) {
        console.log(changes);
    }

Watchers provide insight into an object whose property has been changed. If multiple properties are changed simultaneously, the watcher will trigger once for each property. 

`changes` has the following properties available to it:

    changes.variable  // The variable whose property was modified.
    changes.property  // The modified property's name.
    changes.change    // The actual changed value, shorthand for `change.variable[change.property]`
    changes.oldValue  // What was previously held in `change.variable[change.property]`.
    changes.type      // Any one of `add`, `update` or `delete`.
    changes.local     // True if the change originated locally.
    changes.remote    // True if the change was received from elsewhere.

You can also specify preferences: 
    
    syc.watch(object, alertMe, {remote: true, local: true, recursive: false})

If `remote` or `local` are set to false, the watcher will not trigger on changes from that origin.

Watching a variable will only watch that particular object or array. Setting `recursive` to `true` will apply a watcher on that variable and all of its descendant object/arrays. Any new descendant object will also be given the watcher, and descendants removed from the object will automatically be unwatched.

You can manually watch each object/array returned by `Syc.ancestors(object)` if you do not want new descendants to also be watched. 

### Unwatching

    syc.unwatch(function, object);

Object is an optional parameter. If blank, then all watcher that utilizes the function will be deleted.

## Verifiers (Server side)

While watchers are good for alerting changes after they happen, often you'll want to verify that a client's change is harmless before it takes effect. Verifiers look similar to watchers, but will accept a change only if the function returns true.

    Syc.verify(object, check)
    function check (changes, socket) {
      // Reject the change and revert if it is not a 'string' type.
      return (typeof changes.change !== 'string'); 
    }
    
By its nature, verifiers are avaiable only on the server side, and will trigger only on changes from the client.

When a client makes a change to the object, verifiers will be called *before* the change happens. For multiple verifiers, all must return true to accept the change. If accepted the change is applied, then watchers will be called. If any return false, the verifier drops the change, watchers will not be called, and the offending client is re-synced.

Verifiers have a property `changes.change` which is not available to watchers. It is a simulation of what will be placed within `variable[property]` if the change is accepted. 

**Advanced Tip**: You can modify `change` and the final result will reflect these modifications. The originating client and all other clients will receive the modified result. 

<sub>**Warning**: Careful when doing so, if the change references another registered Syc object or array, any changes you make will apply *even if* the verifier returns **false**. To check for this, use </sub> `Syc.exists(object)`.

### Unverify

    syc.unverify(function, object)

Object is an optional parameter. If blank, all verifiers that utilizes the function will be deleted.

## Helper Functions (Server Side)

    Syc.exists(object)
    // This checks if the given object is registered by Syc and is being synchronized.
    
    Syc.ancestors(object)
    // This returns objects and arrays that are referenced downstream from this object.
    
    Syc.Type(variable)
    // The built in type system Syc uses. Can differentiate between 'object' and 'array'.

- - - 
This library is a work in progress.

Planned features: Groups (Still in planning): This feature would provide security and selective data sharing for clients, Custom datastructures (Still in planning): This feature would allow you to specify conversion of arbitrary data structures to JSON and back, allowing synchronization from server to client.

Syc currently supports nested arrays/objects any number of levels deep, and circular data structures. Built with efficiency and minimum network utilization in mind. Try it!
