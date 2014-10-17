"use strict";

var Syc = {
  connect: function (socket, callback) {
    Syc.Socket = socket;

    socket.on('syc-message-parcel', Syc.Receive_Message);

    if ( !(Object.observe) && !(Syc.mapping_timer) )
      Syc.mapping_timer = setInterval(Syc.Traverse, Syc.polyfill_interval);

    Syc.handshake_callback = callback;
  },

  list: function (name) {
    if (name === undefined) { 
      var all = {}
      for (var variable in Syc.variables) {
        var id = Syc.variables[variable];
        all[variable] = Syc.objects[id];
      }
      return all;
    } else {
      return Syc.objects[Syc.variables[name]];
    }
  },

  List: function (argument) { return Syc.list(argument) },

  watch: function (variable_name, func, preferences) { Syc.Watch(variable_name, func, preferences) },

  variables: {},
  objects: {},

  polyfill_interval: 260,

  generalWatchers: {},
  localWatchers: {},
  remoteWatchers: {},

  observe_lock: {},
  object_map: {},
  object_paths: {},

  handshake_callback: undefined,

  observable: !!Object.observe,

  /* ---- ---- ---- ----  New Variables  ---- ---- ---- ---- */
  /* ---- ---- ---- ----  Receiving Objects  ---- ---- ---- ---- */
  Receive_Message: function (messages) { 
    messages.forEach( function (message) { 

      console.log(message);

      var title = message[0],
          data = message[1];

      if (title === 'syc-object-change') {
        Syc.Receive_Change(data);
      } else if (title === 'syc-variable-new') { 
        Syc.New_Variable(data);
      } else if (title === 'syc-integrity-check') { 
        Syc.Integrity_Check(data);
      } else if (title === 'syc-reset-command') {
	      Syc.Reset(data);
      } else if (title === 'syc-welcome') {
        Syc.Handshake
      } else { 
        console.error("Syc error: Received a message title " + title + " which is not recognized");
      }
    });
  },


  New_Variable: function (data) { 
    var name = data.name,
        id = data.value,
        description = data.description;

    Syc.variables[name] = id;

    var variable = Syc.Resolve(description);
  },

  Handshake: function (data) {
    Syc.handshake_callback();
  },


  Receive_Change: function (data) { 
    var type        = data.type,
        id          = data.value,
        property    = data.property,
        changes     = data.changes;

    var variable = Syc.objects[id];

    if (variable === undefined)
      console.error("Syc error: Out of sync error: received changes to an unknown object: " + id)

    if (Syc.observable) Syc.observe_lock[id] = true;

    var oldValue = variable[property];

    if (type === 'add' || type === 'update') { 
      variable[property] = Syc.Resolve(changes)
    } else if (type === 'delete') { 
      delete variable[property];
    } else { 
      console.error('Syc error: Received changes for an unknown change type: ' + type);
    }

    Syc.Map_Object(variable);

    Syc.Awake_Watchers(false, variable, property, type, oldValue);
  },

  Resolve: function (changes) { 
    var type = changes.type,
        variable,
        properties,
        value,
        id, 
        one_way;
     
    if (type === 'object' || type === 'array') { 
      properties = changes.properties,
      id         = changes.value,
      one_way    = changes.one_way;

      if (id in Syc.objects) { 
        return Syc.objects[id];
      } else { 
        if (type === 'object') variable = {};
        if (type === 'array') variable = [];

        for (var property in properties) {
          variable[property] = Syc.Resolve(properties[property])
        }

        id = Syc.Meta(variable, one_way, id);
     
        Syc.Map_Object(variable);

        return variable;
      }
    } else { 
      value = changes.value;
      return Syc.Evaluate(type, value);
    }
  },

  Evaluate: function (type, value) { 
    if (type === 'string')   return value;
    if (type === 'number')   return Number(value);
    if (type === 'boolean')  return value === 'true';
    if (type === 'date')     return JSON.parse(value);
    if (type === 'regexp')   return new RegExp(value);

    if (type === 'object' || type === 'array') {
      return value['syc-object-id'];
    }

    if (type === 'undefined') return undefined;

    throw 'Object type ' + type + ' not supported by syc';
  },

  Reset: function (data) {
    Syc.objects = {};
    Syc.variables = {};
  },

  // ---- ---- ---- ----  Observing  ---- ---- ---- ----
  Observed: function (changes) { 
    for (var change in changes) { 
      var object = changes[change].object,
          property = changes[change].name,
          changed = object[property],
          type = changes[change].type,
          id = object['syc-object-id'],
          oldValue = changes[change].oldValue;

      if (Syc.observable && id in Syc.observe_lock) { delete Syc.observe_lock[id]; return }

      if (object['syc-one-way'] === true) { 
        if (oldValue) { object[property] = oldValue } 
        else { delete object[property] }
        console.error("Syc error: Cannot make changes to a one-way variable.");
        return;
      }

      console.log("Observed...");

      var changes = Syc.Describe(changed, object, property);
      console.log("a");

      Syc.Map_Object(object);
      console.log("b");

      Syc.Awake_Watchers(true, object, property, type, oldValue);
      console.log("c");

      Syc.Socket.emit('syc-object-change', { value: id, type: type,  property: property, changes: changes });
    }
  },


  Describe: function (variable, parent, path) { 
    var type = Syc.Type(variable),
        value = Syc.Evaluate(type, variable);

    if (type === 'object' || type === 'array') { 
      if (value === undefined) {

        var properties = {};

        for (var property in variable) {
          properties[property] = Syc.Describe(variable[property], variable, property);
        }

        value = Syc.Meta(variable);

        Syc.Map_Object(variable);

        return {type: type, value: value, one_way: false, properties: properties};
      } else { 
        var one_way = variable['syc-one-way'];
        if (one_way === true) { 
          delete parent[path];
          console.error("Syc error: Cannot make a two-way variable reference a one-way variable");
        } else {
          return {type: type, value: value, one_way: one_way};
        }
      }
    } else {
      return {type: type, value: value};
    }
  },

  Type: function (obj) { 
    return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
  },

  // --- --- ------ ----  Helper Functions  ---- ---- ---- ----
  Meta: function (variable, one_way, id) {
    var id = id || token();

    Syc.objects[id] = variable;
    Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});
    
    if (one_way) {
      Object.defineProperty(variable, 'syc-one-way', {value: true, enumerable: false});
    }

    if (Object.observe) Object.observe(variable, Syc.Observed);


    function token () { 
      function rand () { return Math.random().toString(36).substr(2) }
      var toke = rand() + rand();
      if (toke in Syc.objects) return token();
      else return toke;
    }

    return id;
  },


  // ---- ---- ---- ----  Watchers  ---- ---- ---- ---- 
  Watch: function (variable_name, func, preferences) { 
    var local = true,
        remote = true;

    if (preferences) {
      local = preferences.local !== false;
      remote = preferences.remote !== false;
    }

    if (local && remote) {
      (Syc.generalWatchers[variable_name] = Syc.generalWatchers[variable_name] || []).push(func);
    } else if (local) {
      (Syc.localWatchers[variable_name] = Syc.localWatchers[variable_name] || []).push(func);
    } else if (remote) { 
      (Syc.remoteWatchers[variable_name] = Syc.remoteWatchers[variable_name] || []).push(func);
    }
  },

  Awake_Watchers: function (local, variable, property, type, oldValue) { 
    var id = variable['syc-object-id'];

    var change = {};

    change.variable = variable;
    change.property = property;
    change.change_type = type;
    change.oldValue = oldValue;
    change.change = change.variable[change.property];

    // TODO: This is shamefully inefficient to traverse on every watcher check
    Syc.Traverse();

    // TODO: This only accounts for the first variable to traverse onto this object
    if (local) {
      Find_Watchers(Syc.localWatchers);
    } else {
      Find_Watchers(Syc.remoteWatchers);
    }

    Find_Watchers(Syc.generalWatchers);

    function Find_Watchers (list) {
      for (var name in list) {

        if (name in Syc.object_paths) { 
          if (id in Syc.object_paths[name]) { 
            change.paths = Syc.Path(id, name);
            change.root = Syc.objects[Syc.variables[name]];

            list[name].forEach( function (watcher) { 
              watcher(change);
            });
          }
        }
      }
    }
  },

  // ---- ---- ---- ----  Integrity Check  ---- ---- ---- ---- 
  Integrity_Check: function (data) {
    Syc.Traverse();

    var foreign_hash = data.hash,
        local_hash = Syc.Generate_Hash();

    if (foreign_hash !== local_hash) {
      Syc.Socket.emit('syc-reset-request');
    }
  },

  Generate_Hash: function () {
    var hash = 0;
 
    for (var object in Syc.object_map) {
      var stringified = JSON.stringify(Syc.object_map[object]);
      hash += HashCode(stringified);
    }

    return hash;

    function HashCode (string) {
      var hash = 0, i, chr, len;
      if (string.length == 0) return hash;

      for (var i = 0, len = string.length; i < len; i++) {
        chr   = string.charCodeAt(i);
        hash  = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
      }
      return hash;
    }
  },


  // ---- ---- ---- ----  Polyfill  ---- ---- ---- ---- 
  // ---- ---- ---- ----  Garbage Collection ---- ---- ---- ---- 
  // Map_Object should come after a call to Meta for the variable in question, and
  // after a recursive describe/resolve (so as to ensure Map_Object's properties all
  // have syc-object-id).
  Map_Object: function (variable) { 
    var id = variable['syc-object-id'];

    Syc.object_map[id] = []; // Reset the mapping

    for (var property in variable) { 
      var type = Syc.Type(variable[property]),
          value = Syc.Evaluate(type, variable[property]);

      Syc.object_map[id][property] = {type: type, value: value};
    }
  },


  Traverse: function () { 
    var visited = {};
 
    for (var obj in Syc.objects) { 
      visited[obj] = false;
    }

    // Start the recursion
    for (var name in Syc.variables) { 
      Syc.object_paths[name] = {};
      Map(Syc.objects[Syc.variables[name]], name);
    }

    // Mark Sweep algorithm for garbage collection (if unvisited, garbage collect)
    for (var obj in visited) { 
      if (!(visited[obj])) { 
        delete Syc.objects[obj];
      }
    }

    function Map (variable, name, path) {
      var id = variable['syc-object-id'];

      if (id === undefined) throw 'Sanity Check: polyfill cannot determine object id';
      if (path === undefined) { var path = [] }
  
      var proceed = Per_Object(variable, id, name, path);

      if (proceed) { 
        for (var property in variable) {
          var recur = Per_Property(variable, property, id);
  
          if (recur) { 
            path.push(property)
            Map(variable[property], name, path);
            path.pop();
          }
        }

        Syc.Map_Object(variable);
      }
    }

    function Per_Object (variable, id, name, path) { 
      if (visited[id]) {
        Syc.object_paths[name][id].push(path.slice(0));
        return false;
      } else {
        visited[id] = true;
        Syc.object_paths[name][id] = [path.slice(0)];
      }

      var map = Syc.object_map[id];
  
      for (var property in map) {
        if (!(property in variable)) { 
          Observer(property, variable, 'delete', map[property]);
        }
      }

      return true;
    }

    function Per_Property (variable, name, variable_id) { 
      var property = variable[name],
          type = Syc.Type(property),
          value = Syc.Evaluate(type, property);
  
      var map = Syc.object_map[variable_id][name];
  
      if (map === undefined) {
        Observer(name, variable, 'add');
      }
  
      else if (map.type !== type) { 
        Observer(name, variable, 'update', map);
      }
  
      else if (type === 'array' || type === 'object') { 
        var property_id = property['syc-object-id'];
  
        if (property_id === undefined) {
          Observer(name, variable, 'update ', map);
          return false; // Map doesn't need to recur over untracked objects/arrays (Those are handled by Observed)
        }
  
        else if (map.value !== property_id) { 
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
          if (oldValue.value in Syc.objects) { 
            changes.oldValue = Syc.objects[oldValue.value];
          }
        } else {
          changes.oldValue = oldValue;
        }
      }
  
      Syc.Observed([changes]);
    }
  },


  Path: function (target_id, variable_name) {
    // This function is dependent on Traverse() having been called to update object_paths.

    var origin = Syc.objects[Syc.variables[variable_name]],
        paths = Syc.object_paths[variable_name][target_id].slice(0); // Create a copy so we don't tamper the original.

    for (var path_number in paths) { 
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
          paths = Syc.object_paths[variable_name][id];
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
}

var syc = Syc;
