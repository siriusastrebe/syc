
/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    user = require('./routes/user'),
    http = require('http'),
    path = require('path'),
    socket = require('socket.io'),
    syc = require('./private/syc');

var app = express(),
    server = http.createServer(app),
    io = socket.listen(server);

// all environments
app.set('port', process.env.PORT || 3000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', routes.index);
app.get('/users', user.list);


io.on('connection', function (socket) {
  syc.connect(socket);
  socket.emit('conn', {one: 'drop da beat', two: 'feel da heat'});
});

v = new syc.sync('YO');

var i = 0;

setInterval(function () { v.i = i; i++ }, 3600);

server.listen(3000);


