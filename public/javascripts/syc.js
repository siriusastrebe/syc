var Syc = {
  connect: function (socket) {
    Syc.Socket = socket;

    socket.on('syc-object-change', Syc.Sync_Object);
    socket.on('syc-object-create', Syc.Add_Object);
    socket.on('syc-variable-new', Syc.New_Variable);
  },

  list: function () {
    var all = {}
    for (variable in Syc.variables) {
      var id = Syc.variables[variable];
      all[id] = Syc.objects[id];
    }
    return all;
  },


  /* ---- ---- ---- ----  Private Members  ---- ---- ---- ---- */
  Socket: undefined,
  variables: { },
  objects: { },

  Unlinked_Objects: [],
  
  Sync_Object: function (data) {
    Syc.Assign(data.id, data.property, data.type, data.value);
  },

  New_Variable: function (data) { 
    Syc.variables[data.name] = data.id;
  },

  Add_Object: function (data) { 
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

    setTimeout(Syc.Link, 100);
  },

  Assign: function (id, property, type, value) {
    var variable = Syc.objects[id];

    variable[property] = Syc.Type(type, value);
    console.log(Syc.Type(type, value));

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
        console.log(Syc.objects[unlinked[link].id]);
        Syc.objects[unlinked[link].owner] = Syc.objects[unlinked[link].id];
      }
      else {
        console.log('emitting');
        Syc.Socket.emit('syc-object-request', { id: unlinked[link].id });
      }
      delete unlinked[link];
    }
  },

  Type: function (type, value) { 
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
}

var syc = Syc;
