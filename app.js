
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
});

v = new syc.sync('YO');

var i = 0;

setTimeout(function () {
//setInterval(function () { v[i] = i; i++ }, 7000);
v[i++] = [1, 2, 5, 7, 8];
v[i++] = [[1, 2,], [3, 4], [5,6]];
v[i++] = [{a: '1', b: '2'}, {z: '3'}];
v[i++] = {Yeezus: 'ima let you finish, but', hank: 'Propane Accessories'};
  setTimeout(function () { 
    v[0].push(9); v[1].push(3); v[2][1]['y'] = '2';
  }, 1000);
}, 3000);

/*
setInterval(function () { v[i] = []; for (var j=0; j++; i<i) { v[i].push(i)}; i++ }, 3000);
*/

function recurse (h) { 
  if (h > 0) return {h: recurse(h-1)}
  else return 0;
}

server.listen(3000);

