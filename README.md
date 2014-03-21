syc
===

Sync a variable on the client and the server using Socket.io and Object.observe

## Setting up syc

Syc uses socket.io to transmit information from client to server. You will need to set up socket.io independently of syc.

    var syc = require('syc');
    var io = require('socket.io').listen(80);

    io.sockets.on('connection', function (socket) {
        syc.connect(socket);
    });

The client will gain access to any variables already bound, and will recieve any changes to those variables.

## Using Syc

### Binding a variable

    syc.sync (variable)

This is the most basic way to use syc. Any changes to `variable` on the server will be reflected on a variable by the same name on every client. Changes on the client will reflect on the server (and therefore to every other client).

This is accomplished by tracking the variable with Object.observe (or use a dirty-checking polyfill if Object.observe is not available. More on that in the Polyfill section).

**WARNING**: This is intended for prototyping a project. This use of syc is not recommended for public-facing or sites with untrusted clients. If any client maliciously modifies the variable, the changes will be reflected in the server as well as every other client.
