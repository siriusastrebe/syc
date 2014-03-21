syc
===

Sync a variable on the client and the server using Socket.io and Object.observe


## Binding a variable

`syc.sync (variable)`

This is the most basic way to use syc. Any changes to `variable` on the server will be reflected on a variable by the same name on every client.

This is accomplished by tracking the variable with Object.observe (or use a dirty-checking polyfill if Object.observe is not available. More on that in the Polyfill section).

WARNING: This is intended for prototyping a project. This use of syc is not recommended for public-facing or sites with untrusted clients. If any client modifies the variable, the changes will be reflected in the server as well as every other client.
