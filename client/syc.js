var Syc = {
  connect: function (socket) {
    Syc.Socket = socket;

    socket.on('syc-message-parcel', Syc.Receive_Message);

    if (!(Syc.mapping_timer)) Syc.mapping_timer = setInterval(Syc.Traverse, Syc.polyfill_interval);
  },

  list: function (name) {
    if (name === undefined) { 
      var all = {}
      for (variable in Syc.variables) {
        var id = Syc.variables[variable];
        all[variable] = Syc.objects[id];
      }
      return all;
    } else {
      return Syc.objects[Syc.variables[name]];
    }
  },

  List: function (argument) { return Syc.list(argument) },

  watch: function (variable_name, func) { Syc.Watch(variable_name, func) },

  variables: {},
  objects: {},

  polyfill_interval: 200,

  watchers: {},

  observe_lock: {},
  object_map: {},
  object_paths: {},

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
      } else if (title === 'syc-object-sync') {
	Syc.Sync_Object(data);
      } else if (title === 'syc-reset-command') {
	Syc.Reset(data);
      } else { 
        console.error("Syc error: Received a message title " + title + " which is not recognized");
      }
    });
  },


  New_Variable: function (data) { 
    var name = data.name,
        id = data.id,
        description = data.description;

    Syc.variables[name] = id;

    var variable = Syc.Resolve(description);
  },


  Receive_Change: function (data) { 
    var type        = data.type,
        id          = data.id,
        property    = data.property
        changes     = data.changes;

    var variable = Syc.objects[id];

    if (variable === undefined)
      console.error("Syc error: Out of sync error: received changes to an unknown object: " + id)

    if (Syc.observable) Syc.observe_lock[id] = true;

    var old_value = variable[property];

    if (type === 'add' || type === 'update') { 
      variable[property] = Syc.Resolve(changes)
    } else if (type === 'delete') { 
      delete variable[property];
    } else { 
      console.error('Syc error: Received changes for an unknown change type: ' + type);
    }

    Syc.Map_Object(variable);

    Syc.Awake_Watchers(variable, property, type, old_value);
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
      id         = changes.id,
      one_way    = changes.one_way;

      if (id in Syc.objects) { 
        return Syc.objects[id];
      } else { 
        if (type === 'object') variable = {};
        if (type === 'array') variable = [];

        for (property in properties) {
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

  Sync_Object: function (data) {
    var id = data.id,
        variable = Syc.objects[id],
        description = data.description;

    for (property in variable) {
      delete variable[property];
    }

    Syc.Resolve(description);
  },

  Reset: function (data) {
    Syc.objects = {};
    Syc.variables = {};
  },

  // ---- ---- ---- ----  Observing  ---- ---- ---- ----
  Observed: function (changes) { 
    for (change in changes) { 
      var object = changes[change].object,
          property = changes[change].name,
          changed = object[property],
          type = changes[change].type,
          id = object['syc-object-id'],
          old_value = changes[change].old_value;

      if (Syc.observable && id in Syc.observe_lock) { delete Syc.observe_lock[id]; return }

      if (object['syc-one-way'] === true) { 
        if (old_value) { object[property] = old_value } 
        else { delete object[property] }
        console.error("Syc error: Cannot make changes to a one-way variable.");
        return;
      }

      var changes = Syc.Describe(changed, object, property);

      Syc.Socket.emit('syc-object-change', { id: id, type: type,  property: property, changes: changes });
    }
  },


  Describe: function (variable, parent, path) { 
    var type = Syc.Type(variable),
        value = Syc.Evaluate(type, variable);

    if (type === 'object' || type === 'array') { 
      if (value === undefined) {

        var properties = {};

        for (property in variable) {
          properties[property] = Syc.Describe(variable[property], variable, property);
        }

        value = Syc.Meta(variable);

        Syc.Map_Object(variable);

        return {type: type, id: value, one_way: false, properties: properties};
      } else { 
        var one_way = variable['syc-one-way'];
        if (one_way === true) { 
          delete parent[path];
          console.error("Syc error: Cannot make a two-way variable reference a one-way variable");
        }
        return {type: type, id: value, one_way: one_way};
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
      // TODO: There's a small offchance that two separate clients could create an object with the same token before it's registered by the server.
      function rand () { return Math.random().toString(36).substr(2) }
      var toke = rand() + rand();
      if (toke in Syc.objects) return token();
      else return toke;
    }

    return id;
  },


  // ---- ---- ---- ----  Watchers  ---- ---- ---- ---- 
  Watch: function (variable_name, func) { 
    if (variable_name in Syc.watchers) {
      Syc.watchers[variable_name].push(func);
    } else { 
      Syc.watchers[variable_name] = [func];
    }
  },

  Awake_Watchers: function (variable, property, type, old_value) { 
    var id = variable['syc-object-id'];

    // TODO: This only accounts for the first variable to traverse onto this object
    for (variable in Syc.watchers) { 
      if (variable in Syc.object_paths) { 
        if (id in Syc.object_paths[variable]) { 
          Syc.watchers[variable].forEach( function (watcher) { 
            watcher(variable, property, type, old_value, Syc.Path(id, variable));
          });
        }
      }
    }
  },

  // ---- ---- ---- ----  Integrity Check  ---- ---- ---- ---- 
  Integrity_Check: function (data) {
    var foreign_hash = data.hash,
        local_hash = Generate_Hash();

    console.log(foreign_hash);
    console.log(local_hash);

    if (foreign_hash !== local_hash) {
      Syc.Socket.emit('syc-reset-request');
    }

    function Generate_Hash () {
      var hash = 0;
  
      for (object in Syc.object_map) {
        var stringified = JSON.stringify(Syc.object_map[object]);
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
      };
    }
  },

/*
  Generate_Hash: function () {
    var stringified = JSON.stringify(Syc.object_map);
    console.log(stringified)
    
    return HashCode(stringified);

    function HashCode (string) {
      var hash = 0, i, chr, len;
      if (string.length == 0) return hash;
      for (i = 0, len = string.length; i < len; i++) {
        chr   = string.charCodeAt(i);
        hash  = ((hash << 5) - hash) + chr;
        hash |= 0; // Convert to 32bit integer
      }
      return hash;
    };
  },
*/
  
  // ---- ---- ---- ----  Polyfill  ---- ---- ---- ---- 
  // ---- ---- ---- ----  Garbage Collection ---- ---- ---- ---- 
  // Map_Object should come after a call to Meta for the variable in question, and
  // after a recursive describe/resolve (so as to ensure Map_Object's properties all
  // have syc-object-id).
  Map_Object: function (variable) { 
    var id = variable['syc-object-id'];

    Syc.object_map[id] = []; // Reset the mapping

    for (property in variable) { 
      var type = Syc.Type(variable[property]),
          value = Syc.Evaluate(type, variable[property]);

      Syc.object_map[id][property] = {type: type, value: value};
    }
  },


  Traverse: function () { 
    var visited = {};
 
    for (obj in Syc.objects) { 
      visited[obj] = false;
    }

    // Start the recursion
    for (name in Syc.variables) { 
      Syc.object_paths[name] = {};
      Map(Syc.objects[Syc.variables[name]], name);
    }

    // Mark Sweep algorithm for garbage collection (if unvisited, garbage collect)
    for (obj in visited) { 
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
        for (property in variable) {
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
  
      for (property in map) {
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
  
    function Observer (name, object, type, old_value) { 
      var changes = {name: name, object: object, type: type};

      if (old_value) { 
        if (old_value.type === 'array' || old_value.type === 'object') { 
          if (old_value.value in Syc.objects) { 
            changes.old_value = Syc.objects[old_value.value];
          }
        } else {
          changes.old_value = old_value;
        }
      }
  
      Syc.Observed([changes]);
    }
  },


  Path: function (target_id, variable_name) {
    // TODO: This function is dependent on Traverse() having been called to update object_paths.

    var origin = Syc.objects[Syc.variables[variable_name]],
        paths = Syc.object_paths[variable_name][target_id].slice(0); // Create a copy so we don't tamper the original.

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
