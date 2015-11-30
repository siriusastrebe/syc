
/**
 * Module dependencies.
 */

var express = require('express'),
    routes = require('./routes'),
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


var bol = false;

io.on('connection', function (socket) {
  syc.connect(socket);
  console.log(Syc.groups);
  if (bol) { 
    Syc.add('BRO', socket);
  } else { 
    bol = !bol;
  }
});



v = new syc.sync('YO');

w = new syc.serve('GO', [{a: [0]}]);

x = new syc.serve('WHOA');

y = new syc.groupsync('BRO');

z = {first: false, second: false}



syc.sync('NO', z);

/*
recurse(v, 4);

function recurse (obj, i) {
  if (i > 0) {
    obj['a' + i] = {};
    obj['b' + i] = {};

    recurse(obj['a' + i], i-1);
    recurse(obj['b' + i], i-1);
  } else {
    obj['z'] = 'bottom';
  }
}
*/



function random_word () { 
  english = "The mental features discoursed of as the analytical, are, in themselves, but little susceptible of analysis. We appreciate them only in their effects. We know of them, among other things, that they are always to their possessor, when inordinately possessed, a source of the liveliest enjoyment. As the strong man exults in his physical ability, delighting in such exercises as call his muscles into action, so glories the analyst in that moral activity which disentangles. He derives pleasure from even the most trivial occupations bringing his talents into play. He is fond of enigmas, of conundrums, of hieroglyphics; exhibiting in his solutions of each a degree of acumen which appears to the ordinary apprehension preternatural. His results, brought about by the very soul and essence of method, have, in truth, the whole air of intuition. The Canadian paused in his work. But one word twenty times repeated, one dreadful word, told me the reason for the agitation spreading aboard the Nautilus. We weren't the cause of the crew's concern.  Maelstrom! Maelstrom! they were shouting.  The Maelstrom! Could a more frightening name have rung in our ears under more frightening circumstances? Were we lying in the dangerous waterways off the Norwegian coast? Was the Nautilus being dragged into this whirlpool just as the skiff was about to detach from its plating?";
  
  split = english.split(' ');
  return split[Math.floor(Math.random() * (split.length))]
}


server.listen(3000);

