
/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
    user = require('./routes/user'),
    http = require('http'),
    path = require('path'),
    socket = require('socket.io'),
    syc = require('./server/syc');

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
app.use(express.static(path.join(__dirname, 'client')));

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

//setTimeout(function () {
//setInterval(function () { v[i] = i; i++ }, 7000);
//v[i++] = [1, 2, 5, 7, 8];
v[i++] = [[1, 2,], [3, 4], [5,6]];
/*
v[i++] = {};

y['hi'] = 'hello';


setTimeout(function () { 
  console.log(v['syc-variable-name'], v['syc-object-id']);
}, 3000);

setInterval(function () { 
  v[2][random_word()] = random_word();
}, 5500);
*/


function random_word () { 
  english = "The mental features discoursed of as the analytical, are, in themselves, but little susceptible of analysis. We appreciate them only in their effects. We know of them, among other things, that they are always to their possessor, when inordinately possessed, a source of the liveliest enjoyment. As the strong man exults in his physical ability, delighting in such exercises as call his muscles into action, so glories the analyst in that moral activity which disentangles. He derives pleasure from even the most trivial occupations bringing his talents into play. He is fond of enigmas, of conundrums, of hieroglyphics; exhibiting in his solutions of each a degree of acumen which appears to the ordinary apprehension preternatural. His results, brought about by the very soul and essence of method, have, in truth, the whole air of intuition";
  
  split = english.split(' ');
  return split[Math.floor(Math.random() * (split.length))]
}



/*
a = 2
setTimeout(function () { 
  v[a] = a * a;
  a++;
}, 9000);
*/

//v[i++] = [{a: '1', b: '2'}, {z: '3'}];
//v[i++] = {Yeezus: 'ima let you finish, but', hank: 'Propane Accessories'};
//  setTimeout(function () { 
//    v[0].push(9); v[1].push(3); v[2][1]['y'] = '2';
//  }, 1000);
//}, 3000);


/*
setInterval(function () { 
  var counter = 0;

  var change_interval = setInterval( function () { 
    var i = getI();
    v[i] = []; 
    for (var j=i; j--; j>0) {
      v[i].push(j)
    }

    if (i > 10) i = 1;

    var i = getI();
    
    v[i] = { left: recurse(Math.floor(Math.random() * 5)), right: recurse(Math.floor(Math.random() * 5)) }

    counter++;

  if (counter > 5) { clearInterval(change_interval) }
  }, 1000);
}, 30000);

function recurse (depth) { 
  if (depth === 0) return "8)";
  var tumor = {}

  tumor['left'] = recurse(depth-1);
  tumor['right'] = recurse(depth-1);

  return tumor;
}

function getI () { 
  var a = i;
  i++;
  return a;
}

y['hello'] = 'world';
*/



server.listen(3000);

