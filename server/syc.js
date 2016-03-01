// # https://github.com/siriusastrebe/syc
// # MIT License

var connected = [];
var observe_lock = {};
var object_map = {};
var observable = !!Object.observe;

var buffers = [];

var send_timer;

Syc = {
  Connect: function (socket) { 
    socket.on('syc-message-parcel', function (data) { Receive_Message(data, socket)}) 

    Welcome(socket);
    connected.push(socket);
    
    if (!Syc.initialized) {
      Syc.initialized = true;
      setInterval(Traverse, Syc.polyfill_interval);
    }
  },

  sync: function (name, variable) {
    if (Type(name) !== 'string') throw "Syc error: Syc.sync(name, variable) requires a string as the first argument."
    if (variable === undefined) var variable = {};
    if (Type(variable) !== 'object' && Type(variable) !== 'array')
      throw "Syc error: Syc.sync(name, variable) can't synchronize a primitive value, and takes an object or array as the second parameter. "

    New_Variable(name, variable);
    return variable;
  },

  serve: function (name, variable) { 
    if (Type(name) !== 'string') throw "Syc error: Syc.serve(name, variable) requires a string as the first argument."
    if (variable === undefined) var variable = {};
    if (Type(variable) !== 'object' && Type(variable) !== 'array')
      throw "Syc error: Syc.serve(name, variable) can't serve a primitive value, and takes an object or array as the second parameter. "  

    Create_Group(variable, name, {readonly: true, global: true});
    New_Variable(name, variable, name);
    return variable; 
  },

  groupsync: function (name, variable, sockets) { 
    if (Type(name) !== 'string') throw "Syc error: Syc.groupsync(name, variable, [sockets]) requires a string as the first argument."
    if (variable === undefined) var variable = {};
    if (Type(variable) !== 'object' && Type(variable) !== 'array')
      throw "Syc error: Syc.groupsync(name, variable, [sockets]) can't synchronize a primitive value, and takes an object or array as the second parameter. "  

    Create_Group(variable, name, {sockets: sockets});
    New_Variable(name, variable, name);
  },

  groupserve: function (name, variable, sockets) { 
    if (Type(name) !== 'string') throw "Syc error: Syc.groupserve(name, variable, [sockets]) requires a string as the first argument."
    if (variable === undefined) var variable = {};
    if (Type(variable) !== 'object' && Type(variable) !== 'array')
      throw "Syc error: Syc.groupserve(name, variable, [sockets]) can't serve a primitive value, and takes an object or array as the second parameter. "  

    Create_Group(variable, name, {readonly: true, sockets: sockets});
    New_Variable(name, variable, name);
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

  Add:       Add,
  add:       Add,

  watchers: {},
  verifiers: {},

  variables: {},
  objects: {},
  groups: {},
  callbacks: {},

  initialized: false,
  polyfill_interval: 260,
  buffer_delay: 20,
}

                
// ---- ---- ---- ----  Listing and Welcoming   ---- ---- ---- ---- //
function List (name) {
  // Sanitizing
  var type = typeof name;
  if (name) { 
    if (type !== 'string') 
      throw "Syc error: Syc.list('name') requires a string for its first argument, but you provided " +type+ ".";
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
    return obj;
  }
}

function Welcome (socket) {
  for (var name in Syc.variables) {
    var id = Syc.variables[name],
        variable = Syc.objects[id],
        group = variable['syc-group'];

    if (Read_Permissions(group, socket))
      Emit('syc-variable-new', {name: name, value: id, description: Describe_Recursive(variable, group)}, socket);
  }

  Emit('syc-welcome', {}, socket);
}




// ---- ---- ---- ----  Publically Accessible Helper Functions  ---- ---- ---- ---- //
function Ancestors (variable, visited, objects) {
  // Sanitize
  var type = typeof variable;
  if (type !== 'object') throw "Syc error: Syc.ancestors() takes an object, you provided " +type+ ".";

  // Ancestors
  var id = variable['syc-object-id'],
      visited = visited || {},
      objects = objects || [];

  if (Type(visited) === 'array')
    visited = Array_To_Dictionary(visited);

  if (visited[id]) return;
  else visited[id] = true;

  objects.push(variable);

  for (var property in variable) {
    var type = Type(variable[property]);

    if ((type === 'object' || type === 'array') && Exists(variable[property])) 
      Ancestors(variable[property], visited, objects);
  }

  return objects;
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



// ---- ---- ---- ----  Groups and Access Control ---- ---- ---- ---- //
function Create_Group (variable, name, options) {
  // Sanitize
  if (sockets && Type(sockets) !== 'array') throw "Syc error: Creating a group takes an array of sockets as an optional fourth parameter. You provided a " + Type(sockets) + ".";

  var readonly, global, sockets;

  if (options) { 
    readonly = options.readonly;
    global = options.global;
    sockets = options.sockets;
  }

  if (sockets === undefined || global === true) 
    sockets = connected;

  Syc.groups[name] = { readonly: readonly, global: global, sockets: [], root: variable };

  if (!global) { 
    for (var s in sockets) {
      Add(name, sockets[s]);
    }
  }
}

function Write_Permissions (group, socket) { 
  if (Syc.groups[group] === undefined) return true;    // throw "Syc error: Syc.Write_Permission(groupname, socket), can't find a group by the provided groupname " + group + ".";

  if (Syc.groups[group].readonly) 
    return false;
  else if (Syc.groups[group].global === true) 
    return true
  else 
    return (Syc.groups[group].sockets.indexOf(socket) !== -1);
}

function Read_Permissions (group, socket) { 
  if (Syc.groups[group] === undefined) return true;    //throw "Syc error: Syc.Read_Permission(groupname, socket), can't find a group by the provided groupname " + group + ".";

  if (Syc.groups[group].global === true) 
    return true

  if (group) 
    return Syc.groups[group].sockets.indexOf(socket) !== -1;

  else 
    return true
}

function Add (group, socket) {
  if (Syc.groups[group] === undefined) throw "Syc error: Syc.add(groupname, socket), can't find a group by the provided groupname " + group + ".";
  if (socket.id === undefined) throw "Syc error: Syc.add(groupname, socket) did not find a socket as the second parameter.";

  Syc.groups[group].sockets.push(socket);

  var root = Syc.groups[group].root,
      id = root['syc-object-id'];

  var description = Describe_Recursive(root, group);

  Emit('syc-variable-new', {name: group, value: id, description: description}, socket);
}

// TODO: Removal of group members



// ---- ---- ---- ----  Observing changes, Communicating those changes  ---- ---- ---- ---- //
function Observed (changes) { 
  var watcher_queue = []; 

  for (var change in changes) { 
    var object = changes[change].object,
        property = changes[change].name,
        changed = object[property],
        type = Standardize_Change_Type(changes[change].type),
        oldValue = changes[change].oldValue,
        id = object['syc-object-id'],
        group = object['syc-group'];

    // Object.observe will also trigger on changing array length. Ignore this case.
    if (Type(object) === 'array' && property === 'length') continue;

    // Do not trigger when receiving changes from elsewhere.
    if (Unlock(id, changed, property))////Locked(id, property, true))
      continue;

    var description = Describe(changed, group);

    Map_Property(object, property);

    var data = { value: id, type: type, property: property, changes: description }

    Broadcast('syc-object-change', data, group);

    watcher_queue.push([object, property, type, oldValue]);
  }

  for (var i in watcher_queue) { 
    var x = watcher_queue[i];
    Awake_Watchers(true, x[0], x[1], x[2], x[3]);
  }
}


function Describe (variable, group) { 
  // Describing is a two step process. The first is returning a {type, value} description the variable.
  // When encountering objects or arrays not registered by syc, it recurses into it and registers them.
  var type = Type(variable),
      value = Evaluate(type, variable);

  if (Recurrable(type)) { 
    if (value === undefined) { 
      var properties = {};

      value = Meta(variable, group);

      for (var property in variable) {
        properties[property] = Describe(variable[property], group);
      }

      return {type: type, value: value, properties: properties, group: group};
    } else { 
      if (group && variable['syc-group'] !== group)
        console.warn("Syc error: Variables belonging to group ", group, " attempted to be referenced by another group ", variable['syc-group']);

      return {type: type, value: value, group: group};
    }
  } else { 
    return {type: type, value: value};
  }
}


function Describe_Recursive (variable, group, visited) { 
  // Describe_Recursive will send the client the entire variable's ancestry. New clients and new variables.
  var type = Type(variable),
      value = Evaluate(type, variable);

  if (Recurrable(type)) { 
    if (value === undefined) {
      value = Meta(variable, group);
    }

    if (group && variable['syc-group'] !== group)
      throw "Syc error: Variables belonging to one group cannot be referenced by other groups."

    if (visited === undefined) var visited = [];
    if (visited.indexOf(value) !== -1) return {type: type, value: value};
    visited.push(value);

    var properties = {};

    for (var property in variable) {
      properties[property] = Describe_Recursive(variable[property], group, visited);
    }

    return {type: type, value: value, properties: properties};
  } else { 
    return {type: type, value: value};
  }
}


function New_Variable (name, variable, group) { 
  if (name in Syc.variables) throw "There is already a syc variable by the name " +name+ ".";

  if (!variable['syc-object-id']){ 
    var id = Meta(variable, group),
        description = Describe_Recursive(variable, group);

    Syc.variables[name] = id;
    Broadcast('syc-variable-new', {name: name, value: id, description: description}, group);
  } else { 
    // TODO: This is allowing Syc variables to be assigned to one another.
    var description = Describe(variable, group),
        id = description.value;

    Syc.variables[name] = id;
    Broadcast('syc-variable-new', {name: name, value: id, description: description}, group);
  }
}


function Standardize_Change_Type (type) { 
  // V8 engine has 'new', 'updated', and 'delete, whereas canary uses 'add', 'update'
  // We use 'add', 'update', and 'delete' as our three operators.
  if (type === 'updated') return 'update';
  if (type === 'new') return 'add';

  return type;
}



// ---- ---- ---- ----  Receiving client changes, communicating those changes  ---- ---- ---- ---- //
function Receive_Message (data, socket) { 
  // So far, the only messages accepted from clients are syc-object-change.
  for (var index in data) { 
    var message = data[index];
    if (message.title === 'syc-object-change')
      Receive_Change(message.data, socket); 
  }
}

function Receive_Change (data, socket) { 
  console.log(data)
  var type     = data.type,
      id       = data.value,
      property = data.property,
      changes  = data.changes;
      variable = Syc.objects[id];
  
  if (variable === undefined) { 
    console.warn("Received changes to an unknown object: " + id + ".");
		return;
  }

  var group    = variable['syc-group'];

  // Permission checking
  if (group && !Write_Permissions(group, socket)) { 
    console.warn('Syc warning: Received a client\'s illegal changes to a restricted variable belonging to ' + group + '. Discarding changes and syncing the client. ', 'Type: ', type, ', Property: ', property, ', Changes ', changes);
    Resync_Sender(variable, property, type, changes, socket);
    return;
  }

  // Create a simulation, so that it can be verified before taking effect
  var oldValue = variable[property],
      simulations = [],
      simulated_root = Simulate_Changes(changes, group, simulations), 
      verifier_options = {newValue: simulated_root};

  // Check verifiers
  var verified = Awake_Verifiers(verifier_options, variable, property, type, oldValue, socket);

  if (verified) { 
    // Apply the change
    Change_Property(type, variable, property, verifier_options.newValue);

    var description = Describe_Simulation(variable[property], group);

    // Sync all other clients
    Broadcast('syc-object-change', { value: id, type: type, property: property, changes: description }, group, socket);

    // Trigger watchers
    Awake_Watchers(false, variable, property, type, oldValue, socket);
  } else {
    // Verifier failed, destroy the simulated newValue and resync the originating client
    Destroy_Simulation(simulations);
    Resync_Sender(variable, property, type, changes, socket);
  }


  function Describe_Simulation (variable, group) {
    var type = Type(variable),
        value = Evaluate(type, variable);

    if (type === 'object' || type === 'array') {
      var id = value;

      if (id in Syc.objects) {
        return {type: type, value: value}
      } else {
        var properties = {}

        for (var property in variable) {
          properties[property] = Describe_Simulation(variable[property], group);
        }

        Meta(variable, group, id);
      
        return {type: type, value: id, properties: properties}
      }
    } else {
      return {type: type, value: value}
    }
  }

  function Resync_Sender (variable, property, changetype, client, socket, simulated) {
    // Compares the value provided in the changes argument (client) to the actual (server) of the variable.
    // If they're out of sync, it will send the proper value back to the client. 
    var id = variable['syc-object-id'],
        type = Type(variable[property]),
        value  = Evaluate(type, variable[property]),
        server = {type: type, value: value},
        complementary_type;

    if (client.type !== type || client.value !== value) { 
      if (variable.hasOwnProperty(property)) {
        if (changetype === 'add' || changetype === 'update')
          complementary_type = 'update';
        if (changetype === 'delete') 
          complementary_type = 'add';
      } else { 
        complementary_type = 'delete';
      }

      var data = {value: id, type: complementary_type, property: property, changes: server}

      Emit('syc-object-change', data, socket);
    }
  }

  function Change_Property (type, object, property, value) {
    var id = object['syc-object-id'];

    Lock(id, property, value);

    if (type === 'delete') {
      if (object.hasOwnProperty(property))
        delete variable[property];
    } else if (type === 'add' || type === 'update') {
      object[property] = value;
    } else {
      console.error('Syc error: Received changes for an unknown change type: ' + type);
    }

    Map_Property(object, property);
  }

  function Destroy_Simulation (simulations) {
    simulations.forEach( function (object) {
      var id = object['syc-object-id'];

      delete object_map[id];
    });
  }

  function Simulate_Changes (changes, group, simulated_objects) { 
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
        if (object['syc-group'] && group !== object['syc-group']) { 
          console.warn('Syc warning: A client is attempting to assign a variable belonging to one group to a variable belonging to another group. Ignoring client request.');
        } else {
          return object;
        }
      } else { 
        if (type === 'object') variable = {};
        if (type === 'array') variable = [];

        Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});
        if (group) 
          Object.defineProperty(variable, 'syc-group', {value: group, enumerable: false});

        for (var property in properties) {
          variable[property] = Simulate_Changes(properties[property], group, simulated_objects);
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




// ---- ---- ---- ----  Helper functions for observing and receiving changes  ----- ---- ---- ---- 
function Meta (variable, group, foreign_id) {
  var id = foreign_id || token();

  Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});

  if (group)
    Object.defineProperty(variable, 'syc-group', {value: group, enumerable: false});
  
  Syc.objects[id] = variable;
 
  if (observable) Object.observe(variable, Observed);

  Map_Object(variable);
  
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

function Unlock (id, val, property) { 
  if (observable) {
    if (id in observe_lock) { 
      var lock = observe_lock[id],
          type = Type(val),
          value = Evaluate(type, val),
          identifier = property + type + value;

      if (identifier in lock) { 
        delete lock[identifier];
        return true;
      }
    }
  }
}

function Lock (id, property, val) { 
  if (observable) {
      var locks = observe_lock,
          type = Type(val),
          value = Evaluate(type, val);
          identifier = property + type + value;

      // Note: i'm a little worried identifier being a string could cause issues.
      // Maybe not, since Evaluate() serializes data. If it ain't broke...

      if (!(id in locks)) {
        locks[id] = {}
      }

      var lock = locks[id];

      lock[identifier] = true;
  }
}


function Evaluate (type, value) { 
  if (type === 'string')   return value;
  if (type === 'number')   return Number(value);
  if (type === 'boolean')  return value === true;
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



// ---- ---- ---- ----  Watchers, verifiers  ---- ---- ---- ----
function Watch (object, func, preferences) {
  Record(object, func, preferences, 'watch');
}

function Verify (object, func, preferences) {
  Record(object, func, preferences, 'verify');
}

function Watch_Recursive (object, func, preferences) {
  if (Type(preferences) !== 'object') preferences = {};
  preferences.recursive = true;

  Watch(target, func, preferences);
}

function Verify_Recursive (object, func, preferences) {
  if (Type(preferences) !== 'object') preferences = {};
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
        old_type = Type(old_value),
        new_value = change.newValue,
        new_type = Type(new_value);

    if (old_type === 'array' || old_type === 'object') { 
      var referenced = Ancestors(root),
          unreferenced = Ancestors(old_value, referenced);

      for (var obj in unreferenced) {
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
  if (!Exists(object)) throw "Syc error: in Syc.unverify_recursive(object/array, [function]), object/array must be a variable registered by Syc."
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
  change.newValue = change.variable[change.property];
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



// ---- ---- ---- ----  Sending data  ---- ---- ---- ----
function Emit (title, data, socket) { 
  // Sanitizing
  if (socket.id === undefined) throw "Syc error: Emit(title, data, socket), socket must be a socket."
  if (data[0] && data[0].hasOwnProperty('emit')) 
    throw "Syc error: Emit(title, data, socket) can't take a socket as a second parameter."

  // Emitting
  Buffer(title, data, [socket])
}

function Broadcast (title, data, group, sender) { 
  // Sanitizing
  if (data.hasOwnProperty('emit')) throw "Syc error: Broadcast(title, data, sockets) can't take sockets as a second parameter."
  if (group && Syc.groups[group] === undefined) throw "Syc error: can't find a group by the provided name " + group + ".";

  // Broadcasting
  if (group) 
    var audience = Syc.groups[group].sockets.slice(0); // create a clone blah blah
  else 
    var audience = connected.slice(0); // create a clone so we don't tamper the original

  // Exclude the sender (they made the change, they already have the value)
  var index = audience.indexOf(sender);
  if (index !== -1) {
    audience.splice(index, 1); // Ommit the sender
  } 

  Buffer(title, data, audience);
}

function Buffer (title, data, audience) { 
  // I don't actually know how I wrote this, and I hope it never breaks. 
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



// ---- ---- ---- ----  Polyfill  ---- ---- ---- ---- 
// ---- ---- ---- ----  Garbage Collection ---- ---- ---- ---- 
// Map_Object should come after a call to Meta for the variable in question, and
// after a recursive describe/resolve (so as to ensure Map_Object's properties all
// have syc-object-id).
function Map_Object (variable) { 
  var id = variable['syc-object-id'];

  // Reset the mapping
  object_map[id] = [];

  for (var property in variable) { 
    Map_Property(variable, property);
  }
}

function Map_Property (variable, property) {
  var id = variable['syc-object-id'],
      type = Type(variable[property]),
      value = Evaluate(type, variable[property]),
      map = object_map[id]

  if (property in variable) { 
    map[property] = {type: type, value: value};
  } else if (map[property]) {
    delete map[property];
  }
}


function Traverse () { 
  var visited = {};

  for (var name in Syc.variables) { 
    var root = Syc.objects[Syc.variables[name]],
        descendants = Ancestors(root);

    descendants.forEach(function (node) {
      var id = node['syc-object-id'],
          map = object_map[id];

      for (var property in map) {
        if (!(property in node)) {
          Observer(property, node, 'delete', map[property].value);
        }
      }

      for (var property in node) { 
        if (!(property in map)) { 
          Observer(property, node, 'add', undefined);
        } else { 
          var mapped_type = map[property].type,
              mapped_value = map[property].value,
              current_type = Type(node[property]),
              current_value = Evaluate(current_type, node[property]);

          if (mapped_type !== current_type || mapped_value !== current_value) {
            Observer(property, node, 'update', map[property].value);
          }
        }
      }

      visited[id] = true;
    });
  }

  function Observer (property, object, type, oldValue) { 
    var changes = {name: property, object: object, type: type};

    if (oldValue) { 
      if (oldValue.type === 'array' || oldValue.type === 'object') { 
        if (oldValue.value in Syc.objects) { 
          changes.oldValue = Syc.objects[oldValue.value];
        }
      } else {
        changes.oldValue = oldValue;
      }
    }

    Observed([changes]);
  }
}

function Generate_Hash () {
  var hash = 0;

  for (var object in object_map) {
    var stringified = JSON.stringify(object_map[object]);
    hash += Hash_Code(stringified);
  }

  return hash;
}

function Hash_Code (string) {
  var hash = 0, i, chr, len;
  if (string.length === 0) return hash;

  for (var i = 0, len = string.length; i < len; i++) {
//    chr   = string.charcodeat(i);
    hash  = ((hash << 5) - hash);// + chr;
    hash |= 0; // convert to 32bit integer
  }
  return hash;
}



// ---- ---- ---- ----  Export to Node!  ---- ---- ---- ----
module.exports = Syc;
