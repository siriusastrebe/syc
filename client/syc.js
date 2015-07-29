"use strict";

var Syc = {
  Connect: function (socket, callback) {
    // Sanitize
    if (callback && Syc.Type(callback) !== 'function') throw "Syc error: Syc.connect() takes a socket and a callback function";

    // connect

    Syc.Socket = socket;

    socket.on('syc-message-parcel', Syc.Receive_Message);
    if ( !(Object.observe) && !(Syc.mapping_timer) )
      Syc.mapping_timer = setInterval(Syc.Traverse, Syc.polyfill_interval);

    Syc.handshake_callback = callback;
  },

  connect:           function (socket, callback) { return Syc.Connect(socket, callback) },
  list:              function (name, callback) { return Syc.List(name, callback) },
  ancestors:         function (object) { return Syc.Ancestors(object) },
  exists:            function (object) { return Syc.Exists(object) },
  watch:             function (o, f, p) { return Syc.Watch(o, f, p) },
  watch_recursive:   function (o, f, p) { return Syc.Watch_Recursive(o, f, p) },
  unwatch:           function (o, f) { return Syc.Unwatch(o, f) },
  unwatch_recursive: function (o, f) { return Syc.Unwatch_Recursive(o, f) },
  type:              function (variable) { return Syc.Type(variable) }, 

  Socket: undefined,
  variables: {},
  objects: {},
  callbacks: {},

  polyfill_interval: 260,

  watchers: {},

  observe_lock: {},
  object_map: {},

  handshake_callback: undefined,

  observable: !!Object.observe,


  /* ---- ---- ---- ----  Setting up  ---- ---- ---- ----  */
  Handshake: function () {
    if (Syc.handshake_callback) {
      try { Syc.handshake_callback() }
      catch (e) { console.error("Syc connection callback error", e) }
    }

    Syc.Traverse();

    Syc.handshake_callback = undefined; 
  },

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
      } else if (title === 'syc-welcome') {
        Syc.Handshake()
      } else { 
        console.error("Syc error: Received a message title " + title + " which is not recognized");
      }
    });
  },


  New_Variable: function (data) {
    var name = data.name,
        id = data.value,
        pending,
        description = data.description;

    Syc.variables[name] = id;

    var variable = Syc.Resolve(description);

    var callbacks = Syc.callbacks[name];
    if (callbacks) {
      while (callbacks.length > 0) { 
        var callback = callbacks.pop();
        callback(variable);
      }
    }
  },

  Receive_Change: function (data) { 
    var type        = data.type,
        id          = data.value,
        property    = data.property,
        changes     = data.changes;

    var variable = Syc.objects[id];

    if (variable === undefined)
      console.error("Syc error: Out of sync error: received changes to an unknown object: " + id);

    if (Syc.observable) Syc.observe_lock[id] = true;

    var oldValue = variable[property];

    if (type === 'add' || type === 'update') { 
      // Make the change
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

  // ---- ---- ---- ----  Observing & Tracking Changes  ---- ---- ---- ----
  Observed: function (changes) { 
    for (var change in changes) { 
      var object = changes[change].object,
          property = changes[change].name,
          changed = object[property],
          type = changes[change].type,
          id = object['syc-object-id'],
          oldValue = changes[change].oldValue;

      // Object.observe will also trigger on changing array length. Ignore this.
      if (Syc.Type(object) === 'array' && property === 'length') continue;

      // Do not trigger when receiving changes from elsewhere.
      if (Syc.observable && id in Syc.observe_lock) { delete Syc.observe_lock[id]; return }

      if (object['syc-one-way'] === true) { 
        if (oldValue) { object[property] = oldValue } 
        else { delete object[property] }
        console.error("Syc error: Cannot make changes to a one-way variable.");
        return;
      }

      var description = Syc.Describe(changed, object, property);

      Syc.Map_Property(object, property);

      Syc.Socket.emit('syc-object-change', { value: id, type: type,  property: property, changes: description });
      Syc.Awake_Watchers(true, object, property, type, oldValue);
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

  Meta: function (variable, one_way, id) {
    var id = id || token();

    Syc.objects[id] = variable;
    Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});
    
    if (one_way) {
      Object.defineProperty(variable, 'syc-one-way', {value: true, enumerable: false});
    }

    if (Syc.observable) Object.observe(variable, Syc.Observed);


    function token () { 
      function rand () { return Math.random().toString(36).substr(2) }
      var toke = rand() + rand();
      if (toke in Syc.objects) return token();
      else return toke;
    }

    return id;
  },

  Type: function (obj) { 
    return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
  },

  // --- --- ------ ----  Helper Functions  ---- ---- ---- ----
  List: function (name, callback) {
    // Sanitizing
    if (name) { var type = typeof name;
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
  },

  Ancestors: function (variable, visited, objects) {
    // Sanitize
    var type = typeof variable;
    if (type !== 'object') throw "Syc error: Syc.ancestors() takes an object, you provided " +type+ ".";
    if (!Syc.exists(variable)) throw "Syc error: Syc.ancestors can only be called on Syc registered objects and arrays.";

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
      var type = Syc.Type(variable[property]);

      if (type === 'object' || type === 'array') 
        Syc.Ancestors(variable[property], visited, objects);
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
  },

  Exists: function (object) {
    // Sanitize
    var type = typeof object;
    if (type !== 'object') throw "Syc error: Syc.exists() takes an object, you provided " +type+ ".";

    // Exists
    var id = object['syc-object-id'];
    if (!id) return false;   
    if (Syc.objects[id]) return true;
    return false;
  },

  // ---- ---- ---- ----  Watchers  ---- ---- ---- ---- 
  Watch_Recursive: function (target, func, preferences) {
    if (Syc.Type(preferences) !== 'object') preferences = {};
    preferences.recursive = true;

    Syc.Watch(target, func, preferences);
  },

  Watch: function (target, func, preferences) { 
    // Sanitizing
    var typeT = Syc.Type(target); var typeF = Syc.Type(func);
    if ((typeT !== 'object' && typeT !== 'array' && typeT !== 'string') || typeF !== 'function') throw "Syc error: Syc.watch() takes an object and a function. You gave " +typeT+ " and " +typeF+ ".";
    if (!Syc.exists(target)) throw "Syc error: in Syc.watch(target, function), target must be a string or a variable registered by Syc."
    // TODO: Add in support for string targets

    // Watch
    var local = true,
        remote = true,
        recursive = false,
        object = target,
        id = object['syc-object-id'],
        root;

    if (preferences) {
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

    var identifier = Syc.Hash_Code(String(func));
    
    Syc.watchers[id] = (Syc.watchers[id] || {});
    Syc.watchers[id][identifier] = Wrapper;

    if (recursive) {
      root = object;

      var ancestors = Syc.Ancestors(object);
      ancestors.forEach ( function (object) { 
        var id = object['syc-object-id'];

        Syc.watchers[id] = (Syc.watchers[id] || {});
        Syc.watchers[id][identifier] = Wrapper;
      });
    }

    function Wrapper (change, socket) { 
      if (local && !remote) { 
         Local_Only(change, socket);
      } else if (remote && !local) { 
         Remote_Only(change, socket);
      } else if (remote && local) {
         Both(change, socket);
      }

      if (recursive) {
        Recursive(change);
      }
    }

    function Local_Only (change, socket) { 
      if (change.local && !change.remote) {
        try { func(change, socket); }
        catch (e) { console.error("Syc.Watch() callback error: ", e) }
      }
    }

    function Remote_Only (change, socket) { 
      if (change.remote && !change.local) {
        try { func(change, socket); }
        catch (e) { console.error("Syc.Watch() callback error: ", e) }
      }
    }

    function Both (change, socket) { 
      if (change.remote || change.local) { 
        try { func(change, socket); }
        catch (e) { console.error("Syc.Watch() callback error: ", e) }
      }
    }

    function Recursive (change) {
      var old_value = change.oldValue,
          old_type = Syc.Type(old_value),
          new_value = change.change,
          new_type = Syc.Type(new_value);

      if (old_type === 'array' || old_type === 'object') { 
        var referenced = Syc.Ancestors(root),
            unreferenced = Syc.Ancestors(old_value, referenced);

        for (obj in unreferenced) {
          Unwatch(unreferenced[obj]);
        }
      }

      if (new_type === 'array' || new_type === 'object') {
        var ancestors = Syc.Ancestors(new_value);

        ancestors.forEach( function (object) { 
          var id = object['syc-object-id'];

          Syc.watchers[id] = (Syc.watchers[id] || {});
          Syc.watchers[id][identifier] = Wrapper;
        });
      }
    }
  },

  Unwatch_Recursive: function (object, func) { 
    // Sanitize
    var typeO = Syc.Type(object);

    if (typeO !== 'object' && typeO !== 'array') throw "Syc error: Syc.unwatch takes an object as the first argument. You provided a " +typeO+ ".";
    if (!Syc.exists(object)) throw "Syc error: in Syc.unwatch(object/array, [function]), object/array must be a variable registered by Syc."

    // Unwatch_Recursive
    var ancestors = Syc.Ancestors(object);

    ancestors.forEach(function (ancestor) { 
      Syc.Unwatch(ancestor, func);
    });
  },

  Unwatch: function (object, func) {
    // Sanitize
    var typeO = Syc.Type(object);
    var typeF = Syc.Type(func);

    if (typeO !== 'object' && typeO !== 'array') throw "Syc error: Syc.unwatch takes an object/array as the first argument. You provided a " +typeO+ ".";
    if (!Syc.exists(object)) throw "Syc error: in Syc.unwatch(object/array, [function]), object/array must be a variable registered by Syc."
    if (typeF !== 'undefined' && typeF !== 'function') throw "Syc error: Syc.unwatch() takes an optional function as the second argument. You provided a " +typeF+ ".";

    // Unwatch
    var id = object['syc-object-id'];

    if (func) { 
      if (Syc.watchers[id] && Syc.watchers[id][identifier])
        delete Syc.watchers[id][identifier];
      if (empty(Syc.watchers[id])) 
        delete Syc.watchers[id];
    } else {
      if (Syc.watchers[id])
        delete Syc.watchers[id];
    }
     
    function empty (object) { 
      for (property in object) {
        return false
      }
      return true;
    }
  },

  Awake_Watchers: function (local, variable, property, type, oldValue) { 
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
      Syc.watchers[id][identifier](change, Syc.Socket);
    }
  },


  // ---- ---- ---- ----  Integrity Check  ---- ---- ---- ---- 
/* Discontinued because I think I can do better
  Integrity_Check: function (data) {
    Syc.Traverse();

    var foreign_hash = data.hash,
        local_hash = Syc.Generate_Hash();

    if (foreign_hash !== local_hash) {
      console.warn('Syc warning: Out of sync. Client resetting. Provided hash: ' + foreign_hash + ', local hash: ' + local_hash);

      Syc.Socket.emit('syc-reset-request', {hash: foreign_hash});
    }
  },

  Generate_Hash: function () {
    var hash = 0;
 
    for (var object in Syc.object_map) {
      var stringified = JSON.stringify(Syc.object_map[object]);
      hash += Syc.Hash_Code(stringified);
    }

    return hash;
  },
*/

  Hash_Code: function (string) {
    var hash = 0, i, chr, len;
    if (string.length == 0) return hash;

    for (var i = 0, len = string.length; i < len; i++) {
      chr   = string.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  },



  // ---- ---- ---- ----  Polyfill  ---- ---- ---- ---- 
  // ---- ---- ---- ----  Garbage Collection ---- ---- ---- ---- 
  // Map_Object should come after a call to Meta for the variable in question, and
  // after a recursive describe/resolve (so as to ensure Map_Object's properties all
  // have syc-object-id).
  Map_Object: function (variable) { 
    var id = variable['syc-object-id'];

    // Reset the mapping
    Syc.object_map[id] = []; 

    for (var property in variable) { 
      Syc.Map_Property(variable, property);
    }
  },

  Map_Property: function (variable, property) {
    var id = variable['syc-object-id'],
        type = Syc.Type(variable[property]),
        value = Syc.Evaluate(type, variable[property]);

    Syc.object_map[id][property] = {type: type, value: value};
  },



  Traverse: function () {
    var visited = {};
 
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
        delete Syc.object_map[id];
      }
    }

    function Map (variable) {
      var id = variable['syc-object-id'];

      if (id === undefined) throw 'Sanity Check: polyfill cannot determine object id';
      if (path === undefined) { var path = [] }
  
      var proceed = Per_Object(variable);

      if (proceed) { 
        for (var property in variable) {
          var recur = Per_Property(variable, property);
  
          if (recur) { 
            Map(variable[property], name, path);
          }
        }

        Syc.Map_Object(variable);
      }
    }

    function Per_Object (variable) { 
      var id = variable['syc-object-id'];

      if (visited[id])
        return false;
      else 
        visited[id] = true;
      

      var map = Syc.object_map[id];
  
      for (var property in map) {
        if (!(property in variable)) { 
          Observer(property, variable, 'delete', map[property]);
        }
      }

      return true;
    }

    function Per_Property (variable, name) { 
      var property = variable[name],
          type = Syc.Type(property),
          value = Syc.Evaluate(type, property),
          id = variable['syc-object-id'];
  
      var map = Syc.object_map[id][name];
  
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
}

var syc = Syc;
