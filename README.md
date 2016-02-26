Syc
===

Register an ordinary javascript array or object with Syc, and an identical copy will become available on the client side. Changes by either the server or the client will be automatically synchronized.

    var shared = {hello: 'world'}
    Syc.sync('name', shared);

No need to wrap your getters or setters, Syc will observe the change as it happens automatically (or via a polyfill for older clients).

    shared.hello = "Goodbye!!!"

Syc philosophy: Data bound to the registered variable is identical between the server and all clients, removing the headache of data synchronization. 


Examples
===

A side project proof of concept using Syc:

http://treebeard.herokuapp.com/

A simple chat application demonstrating Syc

https://github.com/siriusastrebe/Syc-Demo

Documentation
===

## Syncing a variable (Server side)

To sync a variable from the server to the client, create an object or array and pass it through Syc:

    // Server side...
    var shared = ['w', 'x', 'y'];
    Syc.sync('name', shared);
    
The client can use `Syc.list()` to see all existing Syc variables.

    // Client side...
    Syc.list('name')
    -> ['w', 'x', 'y']
    
    // or alternately, list all available synchronized variables:
    Syc.list()
    -> {name: ['w', 'x', 'y']}
    
Modifying the shared variable is easy, just treat it as a regular object or array and changes will propagate to the server and other clients.

    Syc.list('name').push('z');
    

## Setting up Syc

Syc utilizes socket.io but isn't a wrapper for it. So you'll have to initalize it as such:

    // Server side setup
    var io = require('socket.io').listen(80),
        Syc = require('syc');

    io.sockets.on('connection', function (socket) {
      Syc.connect(socket);
    });

And on the client:

    // Client side setup
    var socket = io.connect();
    Syc.connect(socket);
    
Syc.list() will only work once Syc is connected. Syc.loaded will tell if you Syc is connected, and will take a callback function that is run when syc is properly synchronized (or immediately if already synchronized):

    // Client side...
    var synchronized_variable;
    
    Syc.loaded(function () {
      synchronized_variable = Syc.list('name');
    });

## One-way Variables (Server side)

    // Server side
    var served = {};
    Syc.serve('name', served);

Served variables can't be modified on the client side, providing blanket security over the data.

*Note*: Syc forbids served variables from referencing or being referenced by sync'd variables.

## Watchers (Client and Server Side)

Occasionally, you'll want to be notified when changes are made to your variable.

    function log_changes (changes, socket) {
        console.log(changes);
    }

    Syc.watch(object, log_changes)
    
Watchers trigger whenever a property of the object or array has been changed.

`changes` has the following properties available to it:

    changes.variable  // The variable whose property was modified.
    changes.property  // The modified property's name.
    changes.newValue  // The actual changed value, shorthand for `change.variable[change.property]`
    changes.oldValue  // The contents of `change.variable[change.property]` before it was modified.
    changes.type      // Any one of `add`, `update` or `delete`.
    changes.local     // True if the change originated locally.
    changes.remote    // True if the change was received from elsewhere.

If multiple properties are changed simultaneously, the watcher will trigger once for each property. 

You can also specify preferences for triggering only on changes from one origin. 
    
    Syc.watch(object, alertMe, {remote: true, local: false})

##### Recursive Watching

    Syc.watch_recursive(object, log_changes)

or

    Syc.watch_recursive(object, log_changes, {remote: false})

Recursively watching a will apply a watcher on that variable and all of its descendant object/arrays. New descendant objects will also be watched, and descendants removed from the object will automatically be unwatched.


### Unwatching

    Syc.unwatch(object);

or

    Syc.unwatch(object, log_changes);

Unwatching removes all watchers from that object. If `function` is provided, only that function

##### Recursive Unwatching

    Syc.unwatch_recursive(object, [function]);

## Verifiers (Server side)

While watchers are good for alerting changes after they happen, often you'll want to verify that a client's change is harmless before it takes effect. Verifiers look similar to watchers, but will accept a change only if the function returns true.

    function check (changes, socket) {
      // Reject the change and revert if it is not a 'string' type.
      return (typeof changes.newValue !== 'string'); 
    }
    
    Syc.verify(object, check)
    
By its nature, verifiers are avaiable only on the server side, and will trigger only on changes from clients.

When a client makes a change to the object, verifiers will be called *before* the change happens. If the verifier's function returns true, the change is accepted and then watchers are called. If the verifier returns false the change is rejected, watchers will not be called, and the offending client is re-synced.

`changes` has the following properties available to it:

    changes.variable  // The variable whose property was modified.
    changes.property  // The modified property's name.
    changes.newValue  // A simulation of the proposed change.
    changes.oldValue  // What was previously held in `change.variable[change.property]`.
    changes.type      // Any one of `add`, `update` or `delete`.
    changes.local     // True if the change originated locally.
    changes.remote    // True if the change was received from elsewhere.

##### Recursive Verification

    Syc.verify_recursive(object, check);
    
Recursively verifying a will apply a verifier on that variable and all of its descendant object/arrays. Any new descendant object will also be given the verifier, and descendants removed from the object will automatically be unverified.

### Unverify

    Syc.unverify(object, [function])

Unwatching removes all watchers from that object. `function` is optional, and will selectively unwatch only that function from the object.

##### Recursive Unverification

    Syc.unverify_recursive(object, [function]);
    
## Security Groups (Server Side) 

Sometimes you will want to keep data hidden only from certain clients. Syc.groupsync and Syc.groupserve will allow only clients whose sockets have been added to the security group to access the variables.

    Syc.groupsync('restricted', {data: 'zero'})
    Syc.add('restricted', socket)

For restricting a readonly:

    Syc.groupserve('restricted', {data: 'one'})
    Syc.add('restricted', socket)

## Helper Functions (Server Side)

    Syc.exists(object)
    // This checks if the given object is registered by Syc and is being synchronized.
    
    Syc.ancestors(object)
    // This returns objects and arrays that are referenced downstream from this object.
    
    Syc.Type(variable)
    // The built in type system Syc uses. Can differentiate between 'object' and 'array'.

- - - 

Syc supports nested arrays/objects any number of levels deep, and circular data structures. Built with efficiency and minimum network utilization in mind.
