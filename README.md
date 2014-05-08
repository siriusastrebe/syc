Syc
===

WebSockets are great for dynamic web-apps, but message passing from Server to Client can add a lot of code, maintenance, confusion, and obfuscation. 

Syc allows you to create a variable which, when modified on the server, will reflect those same changes on the client. It works under a simple principle: All data bound to the variable in question is identical between Server and Client.

Like Meteor, but without the framework.

** Currently, Syc requires ECMA 7 on the server side to operate. Update Node.js to latest and run: `node --harmony app.js` **

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

Now, any time the variable is modified on the server side, 

    synced['hello'] = 'world';
    
The client side will match to reflect what's on the server.

- - - 
Syc currently supports the primitive types (numbers, strings, booleans), as well as dates and regular expressions. Syc also supports Objects, Arrays, any any recursive combination of the two. If you would like to see additional types supported by Syc, please send an email to https://github.com/siriusastrebe
