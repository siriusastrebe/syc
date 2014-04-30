var Syc = {
  connect: function (socket) {
    Syc.socket = socket;

    socket.on('syc-variable-change', Syc.Sync);
    socket.on('syc-variable-new', Syc.New);
    socket.on('syc-reset-response', Syc.Reconstruct);
  },

  list: { },
  All: { },
  Socket: undefined,
  
  Sync: function (data) {
    if (data.name in Syc.All) {
      var variable = Syc.All[data.name];

      variable[data.property] = data.change;
    } else { 
      Syc.Reset();
    }
  },

  New: function (data) { 
    if (data.name in Syc.All) { 
      Syc.Reset();
    } else { 
      console.log('new variable');
    }
  },
 
  Reset: function () {
    Syc.socket.emit('syc-reset-request');
    console.log('reset');
  },

  Reconstruct: function (json) { 
    delete Syc.All; Syc.All = { };

    json.variables.forEach( function (variable) {
      Syc.Construct(variable);
    });
  },

  Construct: function (definition) { 
    var object = {};

    for (property in definition) {
      if (property === 'syc-variable-name') {
        Syc.Track(object, definition[property]) 
      } else { 
        object[property] = Type(definition[property].type, definition[property].value);
      }
    }

    function Type (type, value) { 
      if (type === 'string')   return value;
      if (type === 'number')   return Number(value);
      if (type === 'boolean')  return value === 'true';
      if (type === 'array')    return value.map(Type);
      if (type === 'date')     return JSON.parse(value);
      if (type === 'regexp')   return new RegExp(value);
      if (type === 'object')   return Construct(value);
    }
  },

  Track: function (variable, name) { 
    Object.defineProperty(variable, 'syc-variable-name', {value: name, enumerable: false});

    if (!(name in Syc.All)) { 
      Syc.All[name] = variable;
    } else {
      throw "Duplicate Property Error";
    }
  }
}

var syc = Syc;
