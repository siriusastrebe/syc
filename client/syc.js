var Syc = {
  connect: function (socket) {
    Syc.Socket = socket;

    socket.on('syc-object-change', Syc.Sync_Object);
    socket.on('syc-object-create', Syc.Recieve_Object);
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


  /* ---- ---- ---- ----  Private Members  ---- ---- ---- ---- */

  /* ---- ---- ---- ----  Recieving Objects  ---- ---- ---- ---- */
  Socket: undefined,
  variables: { },
  objects: { },
  observe_lock: {},

  Unlinked_Objects: [],
  
  Sync_Object: function (data) {
    Syc.Assign(data.id, data.property, data.type, data.value);
  },

  New_Variable: function (data) { 
    Syc.variables[data.name] = data.id;
  },

  Recieve_Object: function (data) { 
    var variable = { },
        id = data.id,
        properties = data.properties;

    if (id in Syc.objects) throw 'Add Error: Object by id ' + id + ' already exists.';
    Syc.objects[id] = variable;

    Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});


    for (property in properties) { 
      contents = properties[property];

      Syc.Assign(id, property, contents.type, contents.value)
    }

    setTimeout(function () { Object.observe(variable, Syc.Observed) }, 500)

    setTimeout(Syc.Link, 100);
  },

  Assign: function (id, property, type, value) {
    var variable = Syc.objects[id];

    Syc.observe_lock[id] = true;

    variable[property] = Syc.Evaluate(type, value);

    if (variable[property] === undefined) { 
      if (type === 'object' || type === 'array') { 
        Syc.Unlinked_Objects.push({owner: id, property: property, id: value});
      }
    }
  },

  Link: function () { 
    var unlinked = Syc.Unlinked_Objects;

    for (link in unlinked) { 
      if (unlinked[link].id in Syc.objects) { 
        var data = unlinked[link];
        Syc.objects[data.owner][data.property] = Syc.objects[data.id];
      }
      else {
        Syc.Socket.emit('syc-object-request', { id: unlinked[link].id });
      }
      delete unlinked[link];
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

    throw 'Object type ' + contents.type + 'not supported by syc';
  },

  // ---- ---- ---- ---- Observing ---- ---- ---- ----
  Observed: function (changes) { 
    for (change in changes) { 
      var object = changes[change].object,
          property = changes[change].name,
          changed = object[property],
          id = object['syc-object-id'];

      if (id in Syc.observe_lock) {
        delete Syc.observe_lock[id];
        continue;
      }

      var changes = Syc.Describe(changed);

      Syc.Socket.emit('syc-object-change', { id: id, property: property, changes: changes });
    }
  },


  Describe: function (variable) { 
    var type = Syc.Type(variable),
        value = Syc.Evaluate(type, variable);

    if (type === 'object' || type === 'array') { 
      id = variable['syc-object-id'];

      if (id === undefined) { 
        id = Syc.Token();
        Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});
        Object.observe(variable, Observed);
        Syc.objects[id] = variable;

        var properties = {};

        for (property in variable) {
          properties[property] = Syc.Describe(variable[property]);
        }

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

  Token: function () {
    var token = rand() + rand();
    function rand () { return Math.random().toString(36).substr(2) }

    if (token in Syc.objects) return Syc.Token();
    else return token;
  },


/*
  Observed: function  (changes) { 
    for (change in changes) { 
      var object = changes[change].object,
          property = changes[change].name,
          changed = object[property],
          id = object['syc-object-id'];

      if (property === 'length' && Syc.toType(object) === 'array') continue;

      var type = Syc.toType(changed);
      var value = Syc.toValue(type, changed);

      if (type === 'object' || type === 'array') { 
        if (value === undefined) {
          value = Syc.Track_Object(changed);
        }
      }

      Syc.Socket.emit('syc-object-change', {id: id, property: property, type: type, value: value});
    }
  },

  Track_Object(variable, id) { 
    var id = Syc.Meta(variable, id),
        data;

    if (Object.observe)
      Object.observe(variable, Observed);


  },

  Meta (variable, id) {
    if (id === undefined) { 
      var id = token();
    }

    Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});

    Syc.objects[id] = variable;

    function token () {
      function rand () { return Math.random().toString(36).substr(2) }
      return rand() + rand();
    }

    return id;
  },

  toType: function (variable) { 
    // Better type checking, stolen from: 
    // http://javascriptweblog.wordpress.com/2011/08/08/fixing-the-javascript-typeof-operator/
    return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
  },

  toValue: function (type, variable) { 
    if      (type === 'string')   return variable;
    else if (type === 'number')   return variable.toString();
    else if (type === 'boolean')  return variable ? 'true' : 'false';
    else if (type === 'date')     return JSON.stringify(variable);
    else if (type === 'regexp')   return variable.toString();
    else if (type === 'array' || type === 'object') {
      return variable['syc-object-id'];
    }
    else throw 'Object type ' + type + ' not supported by syc';
  },
  /*

  /* ---- ---- ---- ----  Observing Objects  ---- ---- ---- ---- */
  /*
  Observed: function (changes) { 
    for (change in changes) { 
      var property = changes[change].name,
          variable = changes[change].object[property],
          id;

      if (Syc.toType(changes[change].object) === 'array' && property === 'length') continue;
    
      var type = Syc.Type(variable);
    
      if (type.type === 'object' || type.type === 'array') { 
        if (type.value === undefined) {
          type.value = Syc.Track_Object(variable);
        }
      }

      id = changes[change].object['syc-object-id'];
    
      Syc.Emit('syc-object-change', { id: id, property: property, type: type.type, value: type.value });
    }
  },

  Track_Object: function (variable) { 
    var properties;
        token = Syc.Meta(varible); 

    for (property in variable) {
      var type = Syc.Type(variable[property]);

      if ((type.type === 'object' || type.type === 'array') && type.value === undefined) {
        Syc.Track_Object(variable[property]);
      }

      properties[property] = type;
    }

    Syc.Emit('syc-object-create', {properties: properties, token: token });

    return token;
  },

  Meta: function (variable) {
    var id = token();

    Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});

    Syc.objects[id] = variable;

    function token () {
      function rand () { return Math.random().toString(36).substr(2) }
      return rand() + rand();
    }

    return id;
  },

  Type: function (variable) { 
    var type = Syc.toType(variable),
        value;

    if      (type === 'string')   value = variable;
    else if (type === 'number')   value = variable.toString();
    else if (type === 'boolean')  value = variable ? 'true' : 'false';
    else if (type === 'date')     value = JSON.stringify(variable);
    else if (type === 'regexp')   value = variable.toString();
    else if (type === 'array' || type === 'object') {
      value = variable['syc-object-id'];
    }
    else throw InvalidTypeError(type);

    return {type: type, value: value}
  },

  // Better type checking, stolen from: 
  // http://javascriptweblog.wordpress.com/2011/08/08/fixing-the-javascript-typeof-operator/
  toType: function (obj) {
    return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
  },
  */
}

var syc = Syc;
