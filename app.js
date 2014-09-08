
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

z = new syc.serve('HO');

var i = 0;

v[i] = {}


// Test Aaron: Basic test for ensuring data passing
/*
v[i++] = [[1, 2,], [3, 4]];
v[i++] = {};

// Test Betsy: Basic test for ensuring multi-referential data structure
v[i] = [[[]], []];
v[i][0][0].push('yo');
v[i][1].push(v[i][0][0]);
i++;


syc.watch('YO', function (a,b,c,d,e,f) { console.log(' - - - - ', a,b,c,d,e,f); });

*/




 
// Test Cathy, basic persistent test for polyfill comprehension of circular objects (Does not succeed currently)
setInterval(function() { 
  var rand = random_word();
//  v[i][rand] = 3;
  v[i][rand] = v[i];
//  console.log(rand);
}, 6000);



// Test Derek: persistent, massive scale test for complex path structures
/*
syc.watch('YO', function (object, property, paths, type, old_value) { 
  console.log(object[property], paths, type, old_value);
});
*/


/*
frank = v[i];
bob = v[i];

setInterval(function () { 
  var rand = random_word();
  frank[rand] = {}
  if (rand.substring(0, 1) === 'a') { 
    var randy = random_word();
    bob[randy] = frank;
    bob = bob[randy];
  } 

  frank = frank[rand];
}, 5000);
*/

/*
*/

function random_word () { 
  english = "The mental features discoursed of as the analytical, are, in themselves, but little susceptible of analysis. We appreciate them only in their effects. We know of them, among other things, that they are always to their possessor, when inordinately possessed, a source of the liveliest enjoyment. As the strong man exults in his physical ability, delighting in such exercises as call his muscles into action, so glories the analyst in that moral activity which disentangles. He derives pleasure from even the most trivial occupations bringing his talents into play. He is fond of enigmas, of conundrums, of hieroglyphics; exhibiting in his solutions of each a degree of acumen which appears to the ordinary apprehension preternatural. His results, brought about by the very soul and essence of method, have, in truth, the whole air of intuition. The Canadian paused in his work. But one word twenty times repeated, one dreadful word, told me the reason for the agitation spreading aboard the Nautilus. We weren't the cause of the crew's concern.  Maelstrom! Maelstrom! they were shouting.  The Maelstrom! Could a more frightening name have rung in our ears under more frightening circumstances? Were we lying in the dangerous waterways off the Norwegian coast? Was the Nautilus being dragged into this whirlpool just as the skiff was about to detach from its plating?";
  
  split = english.split(' ');
  return split[Math.floor(Math.random() * (split.length))]
}
/*
*/

// Test Emma: Basic test to confirm separation of one-way and two-way structures. It should error.
/*
v[i] = z;
*/

// Test Frank: One-way variable integrity test
/*
z['Greek'] = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega']
z['Phonecian'] = ['Aleph', 'Beth', 'Gimel', 'Daleth', 'He', 'Waw', 'Zayin', 'Heth', 'Teth', 'Yodh', 'Kaph', 'Lamedh', 'Mem', 'Nun', 'Samekh', '\'ayin', 'Pe', 'Sade', 'Qoph', 'Res', 'Sin', 'Taw', 'Waw']
z[0] = z['Greek'][0];
z[1] = z['Greek'][1];
z[2] = {a: {b: {c: {d: ['e', 'f', 'g']}}}};
*/





server.listen(3000);

