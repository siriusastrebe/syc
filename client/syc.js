// # https://github.com/siriusastrebe/syc
// # MIT License

"use strict";

var Syc = {
  Connect: function (socket) {
    // connect
    Syc.Socket = socket;

    socket.on('syc-message-parcel', Syc.Receive_Message);

    if ( !(Object.observe) && !(Syc.mapping_timer) )
      Syc.mapping_timer = setInterval(Syc.Traverse, Syc.polyfill_interval);
  },

  connect:           function (socket) { return Syc.Connect(socket) },
	loaded:            function (callback) { return Syc.Loaded(callback) },
  list:              function (name) { return Syc.List(name) },
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

  polyfill_interval: 260,

  watchers: {},

  buffers: [],
  buffer_delay: 20, 
  send_timer: false,

  observe_lock: {},
  object_map: {},

  observable: !!Object.observe,

  handshaken: false,
  loaded_callbacks: [],

  // ---- ---- ---- ----  Setting up  ---- ---- ---- ----  //
  Handshake: function () {
    Syc.handshaken = true;
    Syc.Traverse();
    Syc.Loaded();
  },

  Loaded: function (callback) { 
    if (callback && Syc.type(callback) !== 'function') 
      throw "Syc error: Syc.loaded(callback) optionally requires a function for its argument."

    if (callback) { 
      Syc.loaded_callbacks.push(callback);
    }
    if (Syc.handshaken) {
      for (var c in Syc.loaded_callbacks) { 
        Syc.loaded_callbacks[c]();
      }
      Syc.loaded_callbacks.length = 0;
    }

    return Syc.handshaken;
  },

  // ---- ---- ---- ----  Receiving Objects  ---- ---- ---- ---- //
  Receive_Message: function (messages) { 
    messages.forEach( function (message) { 
      var title = message[0],
          data = message[1];

      console.log('Received: ', title, data);

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
  },

  Receive_Change: function (data) { 
    var type        = data.type,
        id          = data.value,
        property    = data.property,
        changes     = data.changes;

    var variable = Syc.objects[id];

    if (variable === undefined)
      console.error("Syc error: Out of sync error: received changes to an unknown object: " + id);

    if (type !== 'add' && type !== 'update' && type !== 'delete') 
      console.error('Syc error: Received changes for an unknown change type: ' + type);

    // Make sure Object.observe doesn't capture these remote changes
    Syc.Lock(id, property, changes);

    var oldValue = variable[property];

    if (type === 'add' || type === 'update') { 
      // Make the change
      variable[property] = Syc.Resolve(changes)
    } else if (type === 'delete') {
      if (variable.hasOwnProperty(property))
        delete variable[property];
    } else { 
      console.warn('Syc error: Received changes for an unknown change type: ' + type);
    }

    Syc.Map_Property(variable, property);

    setTimeout(function () {Syc.Awake_Watchers(false, variable, property, type, oldValue)}, 0);
  },

  Resolve: function (changes) { 
    var type = changes.type,
        variable,
        properties,
        value,
        id, 
        read;

    if (type === 'object' || type === 'array') { 
      var properties = changes.properties,
          id         = changes.value;

      if (id in Syc.objects) { 
        return Syc.objects[id];
      } else {
        if (type === 'object') variable = {};
        if (type === 'array') variable = [];

        for (var property in properties) {
          variable[property] = Syc.Resolve(properties[property])
        }

        Syc.Meta(variable, read, id);

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
    if (type === 'boolean')  return value === true;
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
    var watcher_queue = []; 

    for (var change in changes) { 
      var object = changes[change].object,
          property = changes[change].name,
          changed = object[property],
          type = changes[change].type,
          id = object['syc-object-id'],
          oldValue = changes[change].oldValue;

      // Object.observe will also trigger on changing array length. Ignore this case.
      if (Syc.Type(object) === 'array' && property === 'length') continue;

      // Do not trigger when receiving changes from elsewhere.
      if (Syc.Unlock(id, object, property)) { 
        console.log('-x-x-x-x- locked: ', property, changed, oldValue, type, change); 
        continue;
      }
      console.log('~o~o~o~o~ changed: ', property, changed, oldValue, type, change);

      if (object['syc-read-only'] === true) { 
        if (oldValue) 
          object[property] = oldValue;
        else 
          delete object[property];

        console.error("Syc error: Cannot make changes to a read-only variable.");
        continue;
      }

      var description = Syc.Describe(changed);

      Syc.Map_Property(object, property);

      Syc.Buffer('syc-object-change', { value: id, type: type,  property: property, changes: description });

      watcher_queue.push([object, property, type, oldValue]);
    }

    for (var i in watcher_queue) { 
      var x = watcher_queue[i];
      Syc.Awake_Watchers(true, x[0], x[1], x[2], x[3]);
    }
  },


  Describe: function (variable) { 
    var type = Syc.Type(variable),
        value = Syc.Evaluate(type, variable);

    if (type === 'object' || type === 'array') { 
      if (value === undefined) {

        var properties = {};

        for (var property in variable) {
          properties[property] = Syc.Describe(variable[property]);
        }

        value = Syc.Meta(variable);

        return {type: type, value: value, properties: properties};
      } else {
        return {type: type, value: value};
      }
    } else {
      return {type: type, value: value};
    }
  },

  Meta: function (variable, read, id) {
    var id = id || token();

    Syc.objects[id] = variable;
    Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});
    
    if (read) {
      Object.defineProperty(variable, 'syc-read-only', {value: true, enumerable: false});
    }

    if (Syc.observable) Object.observe(variable, Syc.Observed);

    Syc.Map_Object(variable);

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

  Unlock: function (id, variable, property) { 
    if (Syc.observable) {
      if (id in Syc.observe_lock) { 
        var lock = Syc.observe_lock[id],
            type = Syc.Type(variable[property]),
            value = Syc.Evaluate(type, variable[property]),
            identifier = property + type + value;

        if (identifier in lock) { 
          delete lock[identifier];
          return true;
        }
      }
    }
  },

  Lock: function (id, property, changes) { 
    if (Syc.observable) {
      var locks = Syc.observe_lock,
          type = changes.type,
          value = changes.value,
          identifier = property + type + value;

      // Note: i'm a little worried identifier being a string could cause issues.
      // Maybe not, since Evaluate() serializes data. If it ain't broke...

      if (!(id in locks)) {
        locks[id] = {}
      }

      var lock = locks[id];

      lock[identifier] = true;
    }
  },

  Buffer: function (title, data) { 
    Syc.buffers.push({title: title, data: data});

    if ( !(Syc.send_timer) ) { 
      Syc.send_timer = setTimeout(
  
        function () {
          Syc.Socket.emit('syc-message-parcel', Syc.buffers);
  
          Syc.buffers.length = 0;
          Syc.send_timer = false;
        }, Syc.buffer_delay
  
      )
    }
  },

  // --- --- ------ ----  Helper Functions  ---- ---- ---- ----
  List: function (name) {
    // Sanitizing
    if (name) { var type = typeof name;
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

    if (visited[id]) return;
    else visited[id] = true;

    objects.push(variable);

    for (var property in variable) {
      var type = Syc.Type(variable[property]);

      if ((type === 'object' || type === 'array') && Syc.Exists(variable[property])) 
        Syc.Ancestors(variable[property], visited, objects);
    }

    return objects;
  },

  Exists: function (object) {
    // Sanitize
    var type = typeof object;
    if (type !== 'object') throw "Syc error: Syc.exists() takes an object, you provided " +type+ ".";

    // Exists
    var id = object['syc-object-id'];
    if (!id) return false;   
    else if (Syc.objects[id]) return true;
    else return false;
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
          new_value = change.newValue,
          new_type = Syc.Type(new_value);

      if (old_type === 'array' || old_type === 'object') { 
        var referenced = Syc.Ancestors(root),
            unreferenced = Syc.Ancestors(old_value, referenced);

        for (var obj in unreferenced) {
          Syc.Unwatch(unreferenced[obj]);
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
    change.newValue = change.variable[change.property];
    change.local = local;
    change.remote = !local;

    for (var identifier in Syc.watchers[id]) {
      Syc.watchers[id][identifier](change, Syc.Socket);
    }
  },


  // ---- ---- ---- ----  Integrity Check  ---- ---- ---- ---- 
  Hash_Code: function (string) {
    var hash = 0, i, chr, len;
    if (string.length === 0) return hash;

    for (var i = 0, len = string.length; i < len; i++) {
      chr   = string.charCodeAt(i);
      hash  = ((hash << 5) - hash) + chr;
      hash |= 0; // Convert to 32bit integer
    }
    return hash;
  },



  // ---- ---- ---- ----  Polyfill  ---- ---- ---- ---- 
  // ---- ---- ---- ----  Garbage Collection ---- ---- ---- ---- 
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
        value = Syc.Evaluate(type, variable[property]),
        map = Syc.object_map[id];

    if (property in variable) { 
      map[property] = {type: type, value: value};
    } else if (map[property]) {
      delete map[property];
    }
  },


  Traverse: function () { 
    var visited = {};

    for (var name in Syc.variables) { 
      var root = Syc.objects[Syc.variables[name]],
          descendants = Syc.Ancestors(root);

      descendants.forEach(function (node) {
        var id = node['syc-object-id'],
            map = Syc.object_map[id];

        if (id === undefined) console.log('somthin weird');

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
                current_type = Syc.Type(node[property]),
                current_value = Syc.Evaluate(current_type, node[property]);
  
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
  
      Syc.Observed([changes]);
    }
  },
}

var syc = Syc;
