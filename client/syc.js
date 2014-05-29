var Syc = {
  connect: function (socket) {
    Syc.Socket = socket;

    socket.on('syc-object-change', Syc.Receive_Object);
    socket.on('syc-variable-new', Syc.New_Variable);
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
    var type     = data.type,
        id       = data.id,
        property = data.property
        changes   = data.changes;

    var variable = Syc.objects[id];

    if (variable === undefined)
      throw "Out of sync error: received changes to an unknown object: " + id;

    Syc.observe_lock[id] = true;

    if (type === 'add' || type === 'update') { 
      variable[property] = Syc.Resolve(changes)
    } else if (type === 'delete') { 
      delete variable[property];
    } else { 
      console.log('Received changes for an unknown change type: ' + type);
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

        for (property in properties) {
          variable[property] = Syc.Resolve(properties[property])
        }

        id = Syc.Meta(variable, id);

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
      return Syc.objects[value];
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

      if (id in Syc.observe_lock) {
        delete Syc.observe_lock[id];
        return ;
      }

      var changes = Syc.Describe(changed);

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

        for (property in variable) {
          properties[property] = Syc.Describe(variable[property]);
        }

        id = Syc.Meta(variable);

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
}

var syc = Syc;
