var connected = [];
var observe_lock = {};
var observe_redirect = {};
var object_map = {};
var observable = !!Object.observe;

var buffers = [];

var mapping_timer;
var send_timer;

var reset_counter = {};

Syc = {
  Connect: function (socket) { 
    connected.push(socket);

    socket.on('syc-object-change', function (data) { Receive_Change(data, socket)}) 

    Welcome(socket);
    
    if (!Syc.initialized) {
      Syc.initialized = true;
      setInterval(Traverse, Syc.polyfill_interval);
    }
  },

  sync: function (name, variable) {
    if (variable instanceof Syc.sync)
      var variable = this; 
    if (variable === undefined)
      var variable = {};
    if (Type(variable) !== 'object' && Type(variable) !== 'array')
      throw "Syc error: Can't synchronize a stand-alone variable. Put the data as a property of an object or an array instead."

    New_Variable(name, variable);

    return variable;
  },

  serve: function (name) {
    if (variable instanceof Syc.sync)
      var variable = this; 
    if (variable === undefined)
      var variable = {};
    if (Type(variable) !== 'object' && Type(variable) !== 'array')
      throw "Syc error: Can't synchronize a stand-alone variable. Use an object or an array instead."

    New_Variable(name, this, true);
  },

  connect:   function (socket) { return Syc.Connect(socket) },
  List:      List,
  list:      List,
  Ancestors: Ancestors,
  ancestors: Ancestors,
  Exists:    Exists,
  exists:    Exists,
  Watch:     Watch,
  watch:     Watch,
  Unwatch:   Unwatch,
  unwatch:   Unwatch,
  Unwatch_Recursive:   Unwatch_Recursive,
  unwatch_recursive:   Unwatch_Recursive,
  Verify:    Verify,
  verify:    Verify,
  Verify_Recursive:    Verify_Recursive,
  verify_recursive:    Verify_Recursive,
  Type: Type,
  type: Type,

  watchers: {},
  verifiers: {},

  variables: {},
  objects: {},
  callbacks: {},

  initialized: false,
  polyfill_interval: 260,
  buffer_delay: 20,
//  integrity_interval: 36000,
//  reset_limit: 8
}

                
// ---- ---- ---- ----  Helper  ---- ---- ---- ----
function Emit (title, data, sockets) { 
  // Sanitizing
  if (Syc.Type(sockets) !== 'array') throw "Syc error: Emit(title, data, sockets), sockets must be an array."
  if (data[0] && data[0].hasOwnProperty('emit')) 
    throw "Syc error: Emit(title, data, sockets) can't take sockets as a second parameter."

  // Emitting
  var audience = sockets || connected;

  Buffer(title, data, audience)
}

function Broadcast (title, data, sender) { 
  // Sanitizing
  if (data.hasOwnProperty('emit')) throw "Syc error: Emit(title, data, sockets) can't take sockets as a second parameter."

  // Emitting
  var audience = connected.slice(0), // create a clone so we don't tamper the original
      index = audience.indexOf(sender);

  if (index !== -1) { 
      audience.splice(index, 1); // Ommit the sender
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
            var sid = member.id;
            
            if (sockets[sid]) sockets[sid].push([message.title, message.data]);
            else sockets[sid] = [member, [message.title, message.data]];
          });
        });

        for (var sid in sockets) {
          // TODO: This is kinda a hilarious hack...
          var socket = sockets[sid][0];
          var messages = sockets[sid].splice(1);

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

function List (name) {
  // Sanitizing
  var type = typeof name;
  if (name) { 
    if (type !== 'string') 
      throw "Syc error: Syc.list('name') requires a string for its first argument, but you provided " +type+ ".";
  }
  if (callback) { 
    var type = typeof callback;
    if (type !== "function") throw "Syc error: The second argument you provided for Syc.list(string, callback) is " +type+ " but needs to be a function."
  }

  // listing
  if (name === undefined) { 
    var all = {}
    for (var variable in Syc.variables) {
      var id = Syc.variables[variable];
      all[variable] = Syc.objects[id];
    }
    return all;
  } else {
    var obj = Syc.objects[Syc.variables[name]];
    if (obj === undefined) {
      if (!Syc.callbacks[name]) Syc.callbacks[name] = [];
      Syc.callbacks[name].push(callback);
    } else if (callback) { 
      callback(obj);
    }

    return obj;
  }
}

function Ancestors (variable, visited, objects) {
  // Sanitize
  var type = typeof variable;
  if (type !== 'object') throw "Syc error: Syc.ancestors() takes an object, you provided " +type+ ".";

  // Ancestors
  var id = variable['syc-object-id'],
      visited = visited || {},
      objects = objects || [];

  if (Syc.Type(visited) === 'array')
    visited = Array_To_Dictionary(visited);

  if (visited[id]) 
    return;
  else
    visited[id] = true;

  objects.push(variable);

  for (var property in variable) {
    var type = Type(variable[property]);

    if (type === 'object' || type === 'array') 
      Ancestors(variable[property], visited, objects);
  }

  return objects;

  function Array_To_Dictionary (objects) {
    var dick = {};
    for (var o in objects) {
      var id = objects[o]['syc-object-id'];
      dick[id] = objects[o];
    }
    return dick;
  }
}

function Exists (object) {
  // Sanitize
  var type = typeof object;
  if (type !== 'object') throw "Syc error: Syc.exists() takes an object, you provided " +type+ ".";

  // Exists
  var id = object['syc-object-id'];
  if (!id) return false;   
  if (Syc.objects[id]) return true;
  return false;
}



/* ---- ---- ---- ----  Observing and New Variables  ---- ---- ---- ---- */
function New_Variable (name, variable, one_way) { 
  var one_way = one_way || false;

  if (name in Syc.variables) throw "There is already a syc variable by the name " +name+ ".";

  if (!variable['syc-object-id']){ 
    var id = Meta(variable, one_way),
        description = Describe_Recursive(variable);

    Syc.variables[name] = id;
    Map_Object(variable);
    Broadcast('syc-variable-new', {name: name, value: id, description: description});
  } else { 
    var description = Describe(variable),
        id = description.value;

    Syc.variables[name] = id;
    Broadcast('syc-variable-new', {name: name, value: id, description: description});
  }

  var callbacks = Syc.callbacks[name];
  if (callbacks) {
    while (callbacks.length > 0) { 
      var callback = callbacks.pop();
      callback(variable);
    }
  }
}


function Observed (changes) { 
  for (var change in changes) { 
    var object = changes[change].object,
        property = changes[change].name,
        changed = object[property],
        type = Standardize_Change_Type(changes[change].type),
        oldValue = changes[change].oldValue,
        id = object['syc-object-id'];

    // Object.observe will also trigger on changing array length. Ignore this.
    if (Type(object) === 'array' && property === 'length') continue;

    // Do not trigger when receiving changes from elsewhere.
    if (observable && observe_lock[id]) { delete observe_lock[id]; return }

    var description = Describe(changed, object, property);

    Map_Property(object, property);

    var data = { value: id, type: type, property: property, changes: description }

    if (observe_redirect[id]) {
      Emit('syc-object-change', data, observe_redirect[id]);
    } else {
      Broadcast('syc-object-change', data);
    }

    Awake_Watchers(true, object, property, type, oldValue);
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

      for (var property in variable) {
        properties[property] = Describe(variable[property], variable, property);
      }

      Map_Object(variable);

      return {type: type, value: value, properties: properties, one_way: one_way};
    } else { 
      if (parent) { 
        var one_way = variable['syc-one-way'];
        Variable_Compatibility(variable, parent, pathname);
      }

      return {type: type, value: value, one_way: one_way};
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
    if (visited.indexOf(value) !== -1) return {type: type, value: value};
    visited.push(value);

    var properties = {};

    for (var property in variable) {
      properties[property] = Describe_Recursive(variable[property], visited, variable, property);
    }

    Map_Object(variable);

    return {type: type, value: value, properties: properties, one_way: one_way};
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
  console.log(data)
  var type     = data.type,
      id       = data.value,
      property = data.property
      changes  = data.changes;


  var variable = Syc.objects[id];
  
  if (variable === undefined) {
    console.warn("Received changes to an unknown object: " + id + ".");
  }

  var oldValue = variable[property],
      description = Describe(variable[property]);

  if (variable['syc-one-way'] === true) { 
    console.warn('Syc warning: Received a client\'s illegal changes to a one-way variable... Discarding changes and syncing the client.');
    Resync(type, id, property, description, socket);
  }

  var simulations = [];

  var simulated_root = Simulate_Changes(changes, simulations); 
  var change = {change: simulated_root};
  var verified = Awake_Verifiers(change, variable, property, type, oldValue, socket);

  if (verified) { 
    Change_Property(type, variable, property, change.change);

    var description = Describe_Simulation(variable[property]);

    Detect_Changes(variable, property, data.changes, simulations, socket);

    Broadcast('syc-object-change', { value: id, type: type, property: property, changes: description }, socket);

    Awake_Watchers(false, variable, property, type, oldValue, socket);
  } else {
    Destroy_Simulation(simulations);
    Resync(type, id, property, description, socket);
  }


  function Describe_Simulation (variable) {
    var type = Type(variable),
        value = Evaluate(type, variable);

    if (type === 'object' || type === 'array') {
      var id = value;

      if (id in Syc.objects) {
        return {type: type, value: value}
      } else {
        var properties = {}

        for (var property in variable) {
          properties[property] = Describe_Simulation(variable[property]);
        }

        Meta(variable, false, id);

        return {type: type, value: id, properties: properties}
      }
    } else {
      return {type: type, value: value}
    }
  }

  function Detect_Changes (root, property, changes, objects, socket) {
    var id = root['syc-object-id'],
        type = Type(root[property]),
        value = Evaluate(type, root[property]);
        
    if (type !== changes.type || value !== changes.value) {
      var changes = {type: type, value: value}

      var data = {value: id, type: 'update', property: property, changes: changes }

      Emit('syc-object-change', data, [socket]);
    }

    objects.forEach( function (object) {
      var id = object['syc-object-id'];
      
      observe_redirect[id] = socket;
      
      Detect_Deletions(object);
      for (var property in object) {
        Detect_Modifications(object, property);
      }

      delete observe_redirect[id];
    });
  }

  function Change_Property (type, object, property, value) {
    var id = object['syc-object-id'];

    observe_lock[id] = true;

    if (type === 'delete') {
      if (object[property]) {
        delete variable[property];
      } else {
        observe_lock[id] = false;
      }
    } else if (type === 'add' || type === 'update') {
      object[property] = value;
    } else {
      console.error('Syc error: Received changes for an unknown change type: ' + type);
    }

    Map_Property(object, property);
  }

  function Resync (type, id, property, description, socket) {
    var description = Describe(variable[property], variable, property);

    if (type === 'add') {
      Emit('syc-object-change', {type: 'delete', value: id, property: property}, [socket]);
    } else if (type === 'delete') {
      Emit('syc-object-change', {type: 'add', value: id, property: property, changes: description}, [socket]);
    } else if (type === 'update') {
      Emit('syc-object-change', {type: 'update', value: id, property: property, changes: description}, [socket]);
    }
  }

  function Destroy_Simulation (simulations) {
    simulations.forEach( function (object) {
      var id = object['syc-object-id'];

      delete object_map[id];
    });
  }

  function Simulate_Changes (changes, simulated_objects) { 
    var type = changes.type,
        variable,
        properties,
        value,
        id;
   
    if (Recurrable(type)) { 
      properties = changes.properties,
      id         = changes.value;

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

        Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});

        for (var property in properties) {
          variable[property] = Simulate_Changes(properties[property], simulated_objects);
        }
 
        var map = Map_Object(variable);

        simulated_objects.push(variable); 

        return variable;
      }
    } else { 
      value = changes.value;
      return Evaluate(type, value);
    }
  }
}




// ---- ---- ---- ----  Object Conversion  ----- ---- ---- ---- 
function Meta (variable, one_way, foreign_id) {
  var id = foreign_id || token();

  Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});

  if (one_way)
    Object.defineProperty(variable, 'syc-one-way', {value: true, enumerable: false});
  
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

function Welcome (socket) {
  for (var name in Syc.variables) {
    var id = Syc.variables[name],
        variable = Syc.objects[id];

    Emit('syc-variable-new', {name: name, value: id, description: Describe_Recursive(variable)}, [socket]);
  }

  Emit('syc-welcome', {}, [socket]);
}

/*
function Reset (socket, data) { 
  var described = {},
      sid = socket.id,
      local_hash = Generate_Hash(),
      foreign_hash;

  // DDOS prevention
  if (data) {
    if (!(sid in reset_counter)) 
      reset_counter[sid] = 0

    reset_counter[sid] += 1;
          
    if (reset_counter[sid] > Syc.reset_limit) {
      console.warn('Syc: integrity check failed ' + reset_counter[sid] + ' times with client ' + sid + '. Giving up on hard resetting client.');
      reset_counter[sid] + 5 // Wait 5 integrity check cycles before allowing a reset.
      return;
    }
  }

  // Resetting
  if (data) foreign_hash = data.hash;
  else foreign_hash = local_hash; 

  // Resetting requires a full handshake so the client agrees which hash to synchronize.
  if (foreign_hash === local_hash) { 
    if (data) { console.log('Client out of sync, resetting client... Socket sid: ' + sid + ' Provided hash: ' + foreign_hash + ', local hash: ' + local_hash); }
    else { console.log('Synchronizing client sid: ' + sid + '.'); }

    Emit('syc-reset-command', {}, [socket]);

    for (var name in Syc.variables) {
      var id = Syc.variables[name],
          variable = Syc.objects[id];

      Emit('syc-variable-new', {name: name, value: id, description: Describe_Recursive(variable)}, [socket]);
    }

    Emit('syc-welcome', {}, [socket]);

  } else {
    Emit('syc-integrity-check', {hash: local_hash}, [socket]);
  }
  
}
*/

// ---- ---- ---- ----  Watchers  ---- ---- ---- ----
function Watch (object, func, preferences) {
  Record(object, func, preferences, 'watch');
}

function Verify (object, func, preferences) {
  Record(object, func, preferences, 'verify');
}

function Watch_Recursive (object, func, preferences) {
  if (Syc.Type(preferences) !== 'object') preferences = {};
  preferences.recursive = true;

  Watch(target, func, preferences);
}

function Verify_Recursive (object, func, preferences) {
  if (Syc.Type(preferences) !== 'object') preferences = {};
  preferences.recursive = true;

  Verify(target, func, preferences);
}

function Record (object, func, preferences, kind) { 
  // sanitizing
  var typeo = Type(object); var typef = Type(func);
  if ((typeo !== 'object' && typeo !== 'array') || typef !== 'function') throw "syc error: syc." +kind+ "() takes an object and a function. you gave " +typeo+ " and " +typef+ ".";
  if (!Exists(object)) throw "syc error: in syc." +kind+ "(object, function), object must be a variable registered by syc."

  // Record
  var local = true,
      remote = true,
      recursive = false,
      id = object['syc-object-id'],
      root;

  if (kind !== 'verify' && preferences) {
    if (preferences.local && preferences.remote) {
      local = true; remote = true;
    } else if (preferences.local || preferences.remote === false) {
      local = true; remote = false;
    } else if (preferences.remote || preferences.local === false) { 
      local = false; remote = true;
    }
    if (preferences.remote === false && preferences.local === false) 
      return;

    recursive = preferences.recursive || false;
  }

  var identifier = Hash_Code(String(func));

  if (kind === 'verify') { 
    Syc.verifiers[id] = (Syc.verifiers[id] || {});
    Syc.verifiers[id][identifier] = Wrapper;
  } else {
    Syc.watchers[id] = (Syc.watchers[id] || {});
    Syc.watchers[id][identifier] = Wrapper;
  }

  if (recursive) {
    root = object;

    var ancestors = Ancestors(object);
    ancestors.forEach ( function (object) { 
      var id = object['syc-object-id'];

      if (kind === 'verify') { 
        Syc.verifiers[id] = (Syc.verifiers[id] || {});
        Syc.verifiers[id][identifier] = Wrapper;
      } else {
        Syc.watchers[id] = (Syc.watchers[id] || {});
        Syc.watchers[id][identifier] = Wrapper;
      }
    });
  }

  function Wrapper (change, socket) { 
    var result;
    if (local && !remote) { 
       result = Local_Only(change, socket);
    } else if (remote && !local) { 
       result = Remote_Only(change, socket);
    } else if (remote && local) {
       result = Both(change, socket);
    }

    if (recursive) {
      Recursive(change);
    }

    return result;
  }

  function Local_Only (change, socket) { 
    if (change.local && !change.remote) {
      try { return func(change, socket); }
      catch (e) { console.error("Syc." + kind + "() callback error: ", e, e.stack) }
    }
  }

  function Remote_Only (change, socket) { 
    if (change.remote && !change.local) {
      try { return func(change, socket); }
      catch (e) { console.error("Syc." + kind + "() callback error: ", e, e.stack) }
    }
  }

  function Both (change, socket) { 
    if (change.remote || change.local) { 
      try { return func(change, socket); }
      catch (e) { console.error("Syc." + kind + "() callback error: ", e, e.stack) }
    }
  }

  function Recursive (change) {
    var old_value = change.oldValue,
        old_type = Syc.Type(old_value),
        new_value = change.change,
        new_type = Syc.Type(new_value);

    if (old_type === 'array' || old_type === 'object') { 
      var referenced = Ancestors(root),
          unreferenced = Ancestors(old_value, referenced);

      for (obj in unreferenced) {
        if (kind === 'verify') {
          Unverify(unreferenced[obj]);
        } else {
          Unwatch(unreferenced[obj]);
        }
      }
    }

    if (new_type === 'array' || new_type === 'object') {
      var ancestors = Ancestors(new_value);

      ancestors.forEach( function (object) { 
        var id = object['syc-object-id'];

        Syc.watchers[id] = (Syc.watchers[id] || {});
        Syc.watchers[id][identifier] = Wrapper;
      });
    }
  }
}

function Unrecord (object, func, kind) {
  // sanitizing
  var typeO = Type(object)
  var typeF = Type(func);

  if (typeO !== 'object' && typeO !== 'array') throw "Syc error: Syc." +kind+ " takes an object/array as the first argument. You provided a " +typeO+ ".";
  if (!Syc.exists(object)) throw "Syc error: in Syc." +kind+ "(object/array, [function]), object/array must be a variable registered by Syc."
  if (typeF !== 'undefined' && typeF !== 'function') throw "Syc error: Syc." +kind+ " takes an optional function as the second argument. You provided a " +typeF+ ".";

  var id = object['syc-object-id'],
      record;

  if (kind === 'unwatch')
    record = Syc.watchers;
  else  if (kind === 'unveriy')
    record = Syc.verifiers;
  
  if (func) { 
    if (record[id] && record[id][identifier])
      delete record[id][identifier];
    if (empty(record[id])) 
      delete record[id];
  } else {
    if (record[id])
      delete record[id];
  }

  function empty (object) { 
    for (property in object) {
      return false
    }
    return true;
  }
}

function Unwatch (object, func) {
  Unrecord(object, func, 'unwatch');
}

function Unverify (object, func) {
  Unrecord(object, func, 'unverify');
}

function Unverify_Recursive (object, func) { 
  // Sanitize
  var typeO = Type(object);
  var typeF = Type(func);

  if (typeO !== 'object' && typeO !== 'array') throw "Syc error: Syc.unverify_recursive takes an object as the first argument. You provided a " +typeO+ ".";
  if (!Syc.exists(object)) throw "Syc error: in Syc.unverify_recursive(object/array, [function]), object/array must be a variable registered by Syc."
  if (typeF !== 'undefined' && typeF !== 'function') throw "Syc error: Syc.unverift_recursive() takes an optional function as the second argument. You provided a " +typeF+ ".";

  // Unverify_Recursive
  var ancestors = Ancestors(object);

  ancestors.forEach(function (ancestor) { 
    Unverify(ancestor, func);
  });
}

function Unwatch_Recursive (object, func) { 
  // Sanitize
  var typeO = Type(object);
  var typeF = Type(func);

  if (typeO !== 'object' && typeO !== 'array') throw "Syc error: Syc.unverify_recursive takes an object as the first argument. You provided a " +typeO+ ".";
  if (!Syc.exists(object)) throw "Syc error: in Syc.unverify_recursive(object/array, [function]), object/array must be a variable registered by Syc."
  if (typeF !== 'undefined' && typeF !== 'function') throw "Syc error: Syc.unverify_recursive() takes an optional function as the second argument. You provided a " +typeF+ ".";

  // Unwatch_Recursive
  var ancestors = Ancestors(object);

  ancestors.forEach(function (ancestor) { 
    Unwatch(ancestor, func);
  });
}


function Awake_Watchers (local, variable, property, type, oldValue, socket) { 
  var id = variable['syc-object-id'];

  var change = {};

  change.variable = variable;
  change.property = property;
  change.type = type;
  change.oldValue = oldValue;
  change.change = change.variable[change.property];
  change.local = local;
  change.remote = !local;

  for (var identifier in Syc.watchers[id]) {
    Syc.watchers[id][identifier](change, socket);
  }
}

function Awake_Verifiers (change, variable, property, type, oldValue, socket) { 
  var id = variable['syc-object-id'];

  change.variable = variable;
  change.property = property;
  change.type = type;
  change.oldValue = oldValue;
  change.remote = true;

  for (var identifier in Syc.verifiers[id]) {
    var result = Syc.verifiers[id][identifier](change, socket);
    if (!result) {
      return false;
    }
  }

  return true;
}

// ---- ---- ---- ----  Polyfill  ---- ---- ---- ---- 
// ---- ---- ---- ----  Garbage Collection ---- ---- ---- ---- 
// Map_Object should come after a call to Meta for the variable in question, and
// after a recursive describe/resolve (so as to ensure Map_Object's properties all
// have syc-object-id).
function Map_Object (variable) { 
  var id = variable['syc-object-id'];

  object_map[id] = []; // Reset the mapping

  for (var property in variable) { 
    var type = Type(variable[property]),
        value = Evaluate(type, variable[property]);

    object_map[id][property] = {type: type, value: value};
  }

  return object_map[id];
}

function Map_Property (variable, property) {
  var id = variable['syc-object-id'],
      type = Type(variable[property]),
      value = Evaluate(type, variable[property]);

  object_map[id][property] = {type: type, value: value};
}

var visited = {};
var hash_timer = 0;

function Traverse () { 
  for (var id in Syc.objects) { 
    visited[id] = false;
  }

  // Start the recursion
  for (var name in Syc.variables) { 
    Map(Syc.objects[Syc.variables[name]], name);
  }

  // Mark Sweep algorithm for garbage collection (if unvisited, garbage collect)
  for (var id in visited) { 
    if (!(visited[id])) { 
      delete Syc.objects[id];
      delete object_map[id];
    }
  }

  // Integrity check
  /* Commenting out cuz integrity checking is half-assed
  for (var sid in reset_counter) {
    if (reset_counter[sid] > 0) reset_counter[sid] -= 1;
    else delete reset_counter[sid];
  }

  hash_timer += Syc.polyfill_interval;
  if (hash_timer >= Syc.integrity_interval) {
    hash_timer -= Syc.integrity_interval;
    var hash = Generate_Hash();

    Broadcast('syc-integrity-check', {hash: hash});
  }
  */
}

function Map (variable, name, path) {
  var id = variable['syc-object-id'];

  if (id === undefined) console.error('Syc Sanity Check: polyfill cannot determine object id');
  if (path === undefined) { var path = [] }

  var proceed = Per_Object(variable, id, name, path);

  if (proceed) {
    for (var property in variable) {
      var recur = Detect_Modifications(variable, property, id);

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
  if (visited[id])  
    return false;
  else 
    visited[id] = true;
  

  Detect_Deletions(variable);

  return true;
}

function Detect_Deletions(variable) {
  var id = variable['syc-variable-id'],
      map = object_map[id];

  for (var property in map) {
    if (!(property in variable)) { 
      Observer(property, variable, 'delete', map[property]);
    }
  }
}

function Detect_Modifications (variable, name) { 
  var property = variable[name],
      id = variable['syc-object-id'],
      type = Type(property),
      value = Evaluate(type, property);

  var map = object_map[id][name];

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

function Observer (name, object, type, oldValue) { 
  var changes = {name: name, object: object, type: type};

  if (oldValue) { 
    if (oldValue.type === 'array' || oldValue.type === 'object') { 
      changes.oldValue = Syc.objects[oldValue.value];
    } else {
      changes.oldValue = oldValue;
    }
  }

  Observed([changes]);
}

function Generate_Hash () {
  var hash = 0;

  for (var object in object_map) {
    var stringified = JSON.stringify(object_map[object]);
    hash += Hash_Code(stringified);
  }

  return hash;
}

function hash_code (string) {
  var hash = 0, i, chr, len;
  if (string.length == 0) return hash;
  for (var i = 0, len = string.length; i < len; i++) {
    chr   = string.charcodeat(i);
    hash  = ((hash << 5) - hash) + chr;
    hash |= 0; // convert to 32bit integer
  }
  return hash;
}


module.exports = Syc;
