
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

y = new syc.sync('BRO');

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


setInterval(function () { 
  var counter = 0;

  var change_interval = setInterval( function () { 
    v[i] = []; 
    for (var j=i; j--; j>0) {
      v[i].push(j)
    }

    if (i > 10) i = 1;

    i++;
    
    v[i] = { left: recurse(Math.floor(Math.random() * 5)), right: recurse(Math.floor(Math.random() * 4)) }

    i++; 
    counter++;

  if (counter > 5 && typeof change_interval !== 'undefined') { clearInterval(change_interval) }
  }, 1000);
}, 14000);

function recurse (depth, multiplier) { 
  if (depth === 0) return "8)";
  var tumor = {}

  for (var r=0; r++; r<multipler) { 
    tumor[left] = recurse(depth-1, multiplier);
    tumor[right] = recurse(depth-1, multipler);
  }

  return tumor;
}

y['hello'] = 'world';



server.listen(3000);

