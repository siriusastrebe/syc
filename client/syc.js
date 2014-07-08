var Syc = {
  connect: function (socket) {
    Syc.Socket = socket;

    socket.on('syc-object-change', Syc.Receive_Object);
    socket.on('syc-variable-new', Syc.New_Variable);

    if (!(Syc.mapping_timer)) Syc.mapping_timer = setInterval(Syc.Traverse, 6000);
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

  /* ---- ---- ---- ----  New Variables  ---- ---- ---- ---- */
  New_Variable: function (data) { 
    var name = data.name,
        id = data.id,
        description = data.description;

    Syc.variables[name] = id;

    var variable = Syc.Resolve(description);
  },

  /* ---- ---- ---- ----  Receiving Objects  ---- ---- ---- ---- */

  Receive_Object: function (data) { 
    var type        = data.type,
        id          = data.id,
        property    = data.property
        changes     = data.changes;

    var variable = Syc.objects[id];

    if (variable === undefined)
      throw "Out of sync error: received changes to an unknown object: " + id;

    Syc.observe_lock[id] = true;

    if (type === 'add' || type === 'update') { 
      variable[property] = Syc.Resolve(changes)
    } else if (type === 'delete') { 
      delete variable[property];
    } else { 
      throw 'Received changes for an unknown change type: ' + type;
    }
  },

  Resolve: function (changes) { 
    var type = changes.type,
        variable,
        properties,
        value,
        id; 
     
    if (type === 'object' || type === 'array') { 
      properties = changes.properties,
      id         = changes.id;

      if (id in Syc.objects) { 
        return Syc.objects[id];
      } else { 
        if (type === 'object') variable = {};
        if (type === 'array') variable = [];

        id = Syc.Meta(variable, id);

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
          id = object['syc-object-id'];

      if (id in Syc.observe_lock) { delete Syc.observe_lock[id]; return }

      var changes = Syc.Describe(changed);

      console.log(changes);
      Syc.Socket.emit('syc-object-change', { id: id, type: type,  property: property, changes: changes });
    }
  },


  Describe: function (variable) { 
    var type = Syc.Type(variable),
        value = Syc.Evaluate(type, variable);

    if (type === 'object' || type === 'array') { 
      id = variable['syc-object-id'];

      if (id === undefined) { 
        var properties = {};

        id = Syc.Meta(variable);

        for (property in variable) {
          properties[property] = Syc.Describe(variable[property]);
        }

        Syc.Map_Object(variable);

        return {type: type, id: id, properties: properties};
      } else { 
        return {type: type, id: id} ;
      }
    } else { 
      return {type: type, value: value};
    }
  },

  Type: function (obj) { 
    return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
  },

  // --- --- ------ ----  Helper Functions  ---- ---- ---- ----
  Meta: function (variable, id) {
    var id = id || token();

    Syc.objects[id] = variable;
    Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});
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

  
  // ---- ---- ---- ----  Polyfill ---- ---- ---- ---- 
  // Map_Object should come after a call to Meta for the variable in question, and
  // after a recursive describe/resolve (so as to ensure Map_Object's properties all
  // have syc-object-id.

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
    for (id in Syc.variables) { 
      Syc.Map(Syc.objects[Syc.variables[id]]);
    }
  },

  Map: function (variable) {
    var id = variable['syc-object-id'];
    if (id === undefined) throw 'No id error: polyfill cannot determine object id';

    Syc.Per_Variable(variable, id);

    for (property in variable) {
      var recur = Syc.Per_Property(variable, property, id);

      if (recur) { // Map shouldn't recur over untracked objects/arrays
        Syc.Map(variable[property]);
      }
    }

    Syc.Map_Object(variable);
  },

  Per_Variable: function (variable, id) { 
    var map = Syc.object_map[id];

    for (property in map) {
      if (!(property in variable)) { 
        Syc.Observer(property, variable, 'delete', map[property]);
      }
    }
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
  }
}

var syc = Syc;
