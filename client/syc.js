var Syc = {
  connect: function (socket) {
    Syc.Socket = socket;

    socket.on('syc-object-change', Syc.Receive_Change);
    socket.on('syc-variable-new', Syc.New_Variable);

    if (!(Syc.mapping_timer)) Syc.mapping_timer = setInterval(Syc.Traverse, 600);
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

  variables: {},
  objects: {},

  observe_lock: {},
  object_map: {},
  object_paths: {},

  observable: !!Object.observe,

  /* ---- ---- ---- ----  New Variables  ---- ---- ---- ---- */
  /* ---- ---- ---- ----  Receiving Objects  ---- ---- ---- ---- */
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
      throw "Out of sync error: received changes to an unknown object: " + id;

    if (Syc.observable) Syc.observe_lock[id] = true;

    if (type === 'add' || type === 'update') { 
      variable[property] = Syc.Resolve(changes)
    } else if (type === 'delete') { 
      delete variable[property];
    } else { 
      throw 'Received changes for an unknown change type: ' + type;
    }

    Syc.Map_Object(variable);
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

        id = Syc.Meta(variable, one_way, id);

        for (property in properties) {
          variable[property] = Syc.Resolve(properties[property])
        }
     
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

        value = Syc.Meta(variable);

        for (property in variable) {
          properties[property] = Syc.Describe(variable[property], variable, property);
        }

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
    if (Object.observe) Object.observe(variable, Syc.Observed);

    if (one_way) {
      Object.defineProperty(variable, 'syc-one-way', {value: true, enumerable: false});
    }

    function token () { 
      // TODO: There's a small offchance that two separate clients could create an object with the same token before it's registered by the server.
      function rand () { return Math.random().toString(36).substr(2) }
      var toke = rand() + rand();
      if (toke in Syc.objects) return token();
      else return toke;
    }

    return id;
  },

  
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


  visited: {},

  Traverse: function () { 
    Syc.visited = {};
    for (obj in Syc.objects) { 
      Syc.visited[obj] = false;
    }

    // Start the recursion
    for (name in Syc.variables) { 
      Syc.object_paths[name] = {};
      Syc.Map(Syc.objects[Syc.variables[name]], name);
    }

    // Mark Sweep algorithm for garbage collection (if unvisited, garbage collect)
    for (obj in Syc.visited) { 
      if (!(Syc.visited[obj])) { 
        delete Syc.objects[obj];
      }
    }
  },

  Map: function (variable, name, path) {
    var id = variable['syc-object-id'];

    if (id === undefined) throw 'Sanity Check: polyfill cannot determine object id';
    if (path === undefined) { var path = [] }

    var proceed = Syc.Per_Object(variable, id, name, path);

    if (proceed) { 
      for (property in variable) {
        var recur = Syc.Per_Property(variable, property, id);

        if (recur) { 
          path.push(property)
          Syc.Map(variable[property], name, path);
          path.pop();
        }
      }
    }

    Syc.Map_Object(variable);
  },

  Per_Object: function (variable, id, name, path) { 
    if (syc.visited[id]) {
      Syc.object_paths[name][id].push(path.slice(0));
      return false;
    } else {
      Syc.visited[id] = true;
      Syc.object_paths[name][id] = [path.slice(0)];
    }

    var map = Syc.object_map[id];

    for (property in map) {
      if (!(property in variable)) { 
        Syc.Observer(property, variable, 'delete', map[property]);
      }
    }

    return true;
  },

  Per_Property: function (variable, name, variable_id) { 
    var property = variable[name],
        type = Syc.Type(property),
        value = Syc.Evaluate(type, property);

    var map = Syc.object_map[variable_id][name];

    if (map === undefined) {
      Syc.Observer(name, variable, 'add');
    }

    else if (map.type !== type) { 
      Syc.Observer(name, variable, 'update', map);
    }

    else if (type === 'array' || type === 'object') { 
      var property_id = property['syc-object-id'];

      if (property_id === undefined) {
        Syc.Observer(name, variable, 'update ', map);
        return false; // Map doesn't need to recur over untracked objects/arrays (Those are handled by Observed)
      }

      else if (map.value !== property_id) { 
        Syc.Observer(name, variable, 'update', map);
      }

      return true;

    } else if (map.value !== value) { 
      Syc.Observer(name, variable, 'update', map.value);
    }
 
    return false; 
  },

  Observer: function (name, object, type, old_value) { 
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
  },

  Path: function (target_id, variable_name) {
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
