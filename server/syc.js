var connected = [];
var observe_lock = {};
var object_map = {};
var observable = !!Object.observe;
var object_paths = {};
var watchers = {};
var verifiers = {};
var buffers = [];

var mapping_timer;
var send_timer;

var reset_counter = {};

Syc = {
  connect: function (socket) { 
    connected.push(socket);

    socket.on('syc-object-change', function (data) { Receive_Change(data, socket)}) 
    socket.on('syc-reset-request', function (data) { Reset(socket) }) 

    Reset(socket);
    
    if (Object.observe)
      Syc.traversal_interval = Syc.integrity_interval;
    else
      Syc.traversal_interval = Syc.polyfill_interval;

    if (!mapping_timer) mapping_timer = setInterval(Traverse, Syc.traversal_interval);
  },
  
  sync: function (name, variable) {
    if (variable instanceof Syc.sync)
      var variable = this; 
    if (variable === undefined)
      var variable = {};

    Name(name, variable);
  },

  serve: function (name) {
    if (variable instanceof Syc.sync)
      var variable = this; 
    if (variable === undefined)
      var variable = {};

    Name(name, this, true);
  },

  watch: function (variable_name, func) { Watch(variable_name, func) },
  verify: function (variable_name, func) { Verify(variable_name, func) },

  type: Type,

  variables: {},
  objects: {},

  polyfill_interval: 260,
  integrity_interval: 24000,
  buffer_delay: 20,
  reset_limit: 8
}

                

/*         Error Handlers        */
function DuplicateNameError (name) { 
  this.value = name;
  this.message = "There is already a syc variable by that name";
  this.toString = function () { return this.value + " " + this.message }
} 

function InvalidTypeError (type) { 
  this.value = type;
  this.message = "Unsupported variable type introduced into this syc object.";
  this.toString = function () { return this.value + " " + this.message }
}


// ---- ---- ---- ----  Helper  ---- ---- ---- ----

function Emit (title, data, sockets) { 
  var audience = sockets || connected;

  Buffer(title, data, audience)
}

function Broadcast (title, data, sender) { 
  var audience = connected.slice(0), // create a clone so we don't tamper the original
      index = audience.indexOf(sender);

  if (index !== -1) { 
    audience.splice(index, 1);
  }

  Buffer(title, data, audience);
}

function Buffer (title, data, audience) { 
  buffers.push({title: title, data: data, audience: audience});

  if ( !(send_timer) ) { 
    send_timer = setTimeout(
   
      function () {
        var sockets = {};

        buffers.forEach( function (message) { 
          message.audience.forEach (function (member) { 
            var id = member.id;
            
            if (sockets[id]) sockets[id].push([message.title, message.data]);
            else sockets[id] = [member, [message.title, message.data]];
          });
        });

        for (id in sockets) {
          // TODO: This is kinda a hilarious hack...
          var socket = sockets[id][0];
          var messages = sockets[id].splice(1);

          if (socket.disconnected) {
            var index = connected.indexOf(socket);
            if (index !== -1) connected.splice(index, 1);
            continue;
          }

          socket.emit('syc-message-parcel', messages);
        }

        buffers = [];
        send_timer = false;
      }, Syc.buffer_delay

    )
  }
}



/* ---- ---- ---- ----  Observing and New Variables  ---- ---- ---- ---- */
function Name (name, variable, one_way) { 
  var one_way = one_way || false;

  if (name in Syc.variables) throw DuplicateNameError(name);
   
  id = Meta(variable, one_way);
  Syc.variables[name] = id;
  watchers[name] = [];

  var description = Describe_Recursive(variable);

  Map_Object(variable);

  Emit('syc-variable-new', {name: name, id: id, description: description});
}


function Observed (changes) { 
  for (change in changes) { 
    var object = changes[change].object,
        property = changes[change].name,
        changed = object[property],
        type = Standardize_Change_Type(changes[change].type),
        old_value = changes[change].old_value;
        id = object['syc-object-id'];

    var changes;

    if (observable && id in observe_lock) {
      delete observe_lock[id]; return
    }

    changes = Describe(changed, object, property);

    Map_Object(variable);

    Emit('syc-object-change', { id: id, type: type, property: property, changes: changes });
  }
}

function Standardize_Change_Type (type) { 
  // V8 engine has 'new', 'updated', and 'delete, whereas canary uses 'add', 'update'
  // We use 'add', 'update', and 'delete' as our three operators.
  if (type === 'updated') return 'update';
  if (type === 'new') return 'add';

  return type;
}


/* ---- ---- ---- ----  Describing and Resolving  ---- ---- ---- ---- */
function Describe (variable, parent, pathname) { 
  var type = Type(variable),
      value = Evaluate(type, variable);

  if (Recurrable(type)) { 
    if (value === undefined) { 
      var properties = {};
      var one_way = parent['syc-one-way'];

      value = Meta(variable, one_way);

      for (property in variable) {
        properties[property] = Describe(variable[property], variable, property);
      }

      Map_Object(variable);

      return {type: type, id: value, properties: properties, one_way: one_way};
    } else { 
      var one_way = variable['syc-one-way'];
      Variable_Compatibility(variable, parent, pathname);

      return {type: type, id: value, one_way: one_way};
    }
  } else { 
    return {type: type, value: value};
  }
}


function Describe_Recursive (variable, visited, parent, pathname) { 
  var type = Type(variable),
      value = Evaluate(type, variable);

  if (Recurrable(type)) { 
    var one_way = variable['syc-one-way'];

    if (value === undefined) {
      one_way = parent['syc-one-way'];
      value = Meta(variable, one_way);
    } else if (parent) { 
      Variable_Compatibility(variable, parent, pathname);
    }

    if (visited === undefined) var visited = [];
    if (visited.indexOf(value) !== -1) return {type: type, id: value};
    visited.push(value);

    var properties = {};

    for (property in variable) {
      properties[property] = Describe_Recursive(variable[property], visited, variable, property);
    }

    Map_Object(variable);

    return {type: type, id: value, properties: properties, one_way: one_way};
  } else { 
    return {type: type, value: value};
  }
}


function Variable_Compatibility (variable, parent, pathname) { 
  if (variable['syc-one-way'] !== parent['syc-one-way']) {
    delete parent[pathname];
    throw "Syc error: Objects assigned to one-way served variables cannot be mixed with two-way synced objects."
  }
}


function Receive_Change (data, socket) { 
  var type     = data.type,
      id       = data.id,
      property = data.property
      changes  = data.changes;

  var variable = Syc.objects[id];

  if (variable === undefined)
    console.warn("Received changes to an unknown object: " + id);

  if (variable['syc-one-way'] === true) { 
    console.warn('Syc warning: Received a client\'s illegal changes to a one-way variable... Discarding changes and syncing the client.');
    Emit('syc-object-sync', {id: id, description: Describe_Recursive(variable)}, [socket])
  }

  var old_value = variable[property];

  if (type === 'delete')
    var change = {result: undefined};
  else
    var change = {result: Apply_Changes(changes, type)};

  var verified = Awake_Verifier(change, variable, property, type, old_value, socket);

  if (verified) { 
    if (observable) observe_lock[id] = true;

    variable[property] = change.result;

    Map_Object(variable);

    Awake_Watchers(variable, property, type, old_value, socket);
    
    var description = Describe(variable[property], variable, property);

    if (description.type === changes.type || description.value === changes.value)
      Broadcast('syc-object-change', {type: type, id: id, property: property, changes: description}, socket);
    else
      Broadcast('syc-object-change', {type: type, id: id, property: property, changes: description});

  } else {
    Emit('syc-object-sync', {id: id, description: Describe_Recursive(variable)}, [socket])
  }
}

function Apply_Changes (changes) { 
  var type = changes.type,
      variable,
      properties,
      value,
      id;
   
  if (Recurrable(type)) { 
    properties = changes.properties,
    id         = changes.id;

    if (id in Syc.objects) { 
      var object = Syc.objects[id];
      if (object['syc-one-way']) { 
        console.warn('Syc warning: A client\'s attempted to reference a one-way variable from a two-way variable. Ignoring client request.');
      } else {
        return object;
      }
    } else { 
      if (type === 'object') variable = {};
      if (type === 'array') variable = [];

      for (property in properties) {
        variable[property] = Apply_Changes(properties[property])
      }

      id = Meta(variable, false, id);

      Map_Object(variable);

      return variable;
    }
  } else { 
    value = changes.value;
    return Evaluate(type, value);
  }
}


// ---- ---- ---- ----  Object Conversion  ----- ---- ---- ---- 
function Meta (variable, one_way,  id) {
  if (variable['syc-object-id']) { console.error("Already Existing object") };

  var id = id || token();
  Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});

  if (one_way) { 
    Object.defineProperty(variable, 'syc-one-way', {value: true, enumerable: false});
  }
 
  Syc.objects[id] = variable;

  if (observable) Object.observe(variable, Observed);
  
  function token () { 
    function rand () { return Math.random().toString(36).substr(2) }
    var toke = rand() + rand();
    if (toke in Syc.objects) return token();
    else return toke;
  }

  return id;
}

function Type (obj) { 
  return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
}

function Evaluate (type, value) { 
  if (type === 'string')   return value;
  if (type === 'number')   return Number(value);
  if (type === 'boolean')  return value === 'true';
  if (type === 'date')     return JSON.parse(value);
  if (type === 'regexp')   return new RegExp(value);

  if (Recurrable(type)) {
    return value['syc-object-id'];
  }

  if (type === 'undefined') return undefined;

  console.error('Object type ' + type + ' not supported by syc');
}

function Recurrable (type) {
  return (type === 'array' || type === 'object');
}


// ---- ---- ---- ----  Requests  ---- ---- ---- ----

function Reset (socket) { 
  var described = {},
      sid = socket.id;

  if (sid in reset_counter) {
    if (reset_counter[sid] > Syc.reset_limit + 2) {
      return
    } else if (reset_counter[sid] > Syc.reset_limit) {
      console.warn('Syc: integrity check + reset failed ' + reset_counter[sid] + ' times with client ' + sid + '. Giving up on hard resetting client.');

      reset_counter[sid] += 100;
    } else {
      reset_counter[sid] += 2;
    }
  } else {
    reset_counter[socket.id] = 2;
  }

  Emit('syc-reset-command', {}, [socket]);

  for (name in Syc.variables) {
    var id = Syc.variables[name],
        variable = Syc.objects[id];

    Emit('syc-variable-new', {name: name, id: id, description: Describe_Recursive(variable)}, [socket]);
  }
}


// ---- ---- ---- ----  Watchers  ---- ---- ---- ----
function Watch (variable_name, func) { 
  if (variable_name in watchers) {
    watchers[variable_name].push(func);
  } else { 
    watchers[variable_name] = [func];
  }
}

function Verify(variable_name, func) { 
  verifiers[variable_name] = func;
}

function Awake_Verifier (change, variable, property, change_type, old_value, socket) {
  var id = variable['syc-object-id'],
      verification = true;
  
  change.variable = variable;
  change.property = property;
  change.change_type = change_type;
  change.old_value = old_value;

  // TODO: This only accounts for the first variable to traverse onto this object
  for (name in verifiers) {
    if (name in object_paths) {
      if (id in object_paths[name]) {
        var verifier = verifiers[name];

        change.paths = Path(id, name);
        change.root = Syc.objects[Syc.variables[name]];

        verification = verifier(change, socket);
      }
    }
  }

  return verification;
}


function Awake_Watchers (variable, property, change_type, old_value, socket) { 
  var id = variable['syc-object-id'];

  var change = {};

  change.variable = variable;
  change.property = property;
  change.change_type = change_type;
  change.old_value = old_value;

  // TODO: This only accounts for the first variable to traverse onto this object
  for (name in watchers) { 
    if (name in object_paths) { 
      if (id in object_paths[name]) { 
        change.paths = Path(id, name);
        change.root = Syc.objects[Syc.variables[name]];

        watchers[name].forEach( function (watcher) { 
          watcher(change, socket);
        });
      }
    }
  }
}


function Path (target_id, variable_name) {
  // TODO: This function is dependent on Traverse() having been called to update object_paths.

  var origin = Syc.objects[Syc.variables[variable_name]],
      paths = object_paths[variable_name][target_id].slice(0); // Create a copy so we don't tamper the original.

  for (path_number in paths) { 
    var path = paths[path_number];
    
    var hidden = Hidden_Paths(path, origin, variable_name);
    if (hidden.length > 0) { 
      paths.push(hidden);
    }
  }

  return paths;


  function Hidden_Paths(path, object, variable_name, index) { 
    /* This fat function is necessitated by Traversals not traversing
    down through objects that have been visited already, failing to record 
    all possible paths to the target. */

    var id = object['syc-object-id'],
        paths = object_paths[variable_name][id];
        index = index || 0,
        next = object[path[index]],
        new_paths = [];

    if (paths.length > 0) { 

      for (var i=1; i<paths.length; i++) { 
        var new_path = paths[i].concat(path.slice(index));
        new_paths.push(new_path);
      }
    }

    if (index < path.length-1) { 
      return new_paths.concat(Hidden_Paths(path, next, variable_name, index+1));
    } else {
      return new_paths;
    }
  }
}


// ---- ---- ---- ----  Polyfill  ---- ---- ---- ---- 
// ---- ---- ---- ----  Garbage Collection ---- ---- ---- ---- 
// Map_Object should come after a call to Meta for the variable in question, and
// after a recursive describe/resolve (so as to ensure Map_Object's properties all
// have syc-object-id).
function Map_Object (variable) { 
  var id = variable['syc-object-id'];

  object_map[id] = []; // Reset the mapping

  for (property in variable) { 
    var type = Type(variable[property]),
        value = Evaluate(type, variable[property]);

    object_map[id][property] = {type: type, value: value};
  }
}

var visited = {};
var hash_timer = 0;

function Traverse () { 
  for (obj in Syc.objects) { 
    visited[obj] = false;
  }

  // Start the recursion
  for (name in Syc.variables) { 
    object_paths[name] = {};
    Map(Syc.objects[Syc.variables[name]], name);
  }

  // Mark Sweep algorithm for garbage collection (if unvisited, garbage collect)
  for (obj in visited) { 
    if (!(visited[obj])) { 
      delete Syc.objects[obj];
    }
  }

  // Integrity check
  for (sid in reset_counter) {
    if (reset_counter[sid] > 0) reset_counter[sid] -= 1;
    else delete reset_counter[sid];
  }

  hash_timer += Syc.traversal_interval;
  if (hash_timer >= Syc.integrity_interval) {
    hash_timer -= Syc.integrity_interval;
    var hash = Generate_Hash();

    Broadcast('syc-integrity-check', {hash: hash});
  }
}

function Map (variable, name, path) {
  var id = variable['syc-object-id'];

  if (id === undefined) console.error('Syc Sanity Check: polyfill cannot determine object id');
  if (path === undefined) { var path = [] }

  var proceed = Per_Object(variable, id, name, path);

  if (proceed) {
    for (property in variable) {
      var recur = Per_Property(variable, property, id);

      if (recur) {
        path.push(property)
        Map(variable[property], name, path);
        path.pop();
      }
    }

    Map_Object(variable);
  }
}

function Per_Object (variable, id, name, path) { 
  if (visited[id]) { 
    object_paths[name][id].push(path.slice(0));
    return false;
  } else { 
    visited[id] = true;
    object_paths[name][id] = [path.slice(0)];
  }

  var map = object_map[id];

  for (property in map) {
    if (!(property in variable)) { 
      Observer(property, variable, 'delete', map[property]);
    }
  }

  return true;
}

function Per_Property (variable, name, variable_id) { 
  var property = variable[name],
      type = Type(property),
      value = Evaluate(type, property);

  var map = object_map[variable_id][name];

  if (map === undefined) {
    Observer(name, variable, 'add');
  }

  else if (map.type !== type) { 
    Observer(name, variable, 'update', map);
  }

  else if (type === 'array' || type === 'object') { 
    if (value === undefined) {
      Observer(name, variable, 'update ', map);

      return false; // Map doesn't need to recur over untracked objects/arrays (Those are handled by Observed)
    }

    else if (value !== map.value) { 
      Observer(name, variable, 'update', map);
    }

    return true;

  } else if (map.value !== value) { 
    Observer(name, variable, 'update', map.value);
  }
 
  return false; 
}

function Observer (name, object, type, old_value) { 
  var changes = {name: name, object: object, type: type};

  if (old_value) { 
    if (old_value.type === 'array' || old_value.type === 'object') { 
      changes.old_value = Syc.objects[old_value.value];
    } else {
      changes.old_value = old_value;
    }
  }

  Observed([changes]);
}

function Generate_Hash () {
  var hash = 0;

  for (object in object_map) {
    var stringified = JSON.stringify(object_map[object]);
    hash += HashCode(stringified);
  }

  return hash;

  function HashCode (string) {
    var hash = 0, i, chr, len;
    if (string.length == 0) return hash;
    for (i = 0, len = string.length; i < len; i++) {
      chr   = string.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  }
}
 






module.exports = Syc;

