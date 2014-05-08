var connected = [];

Syc = {
  connect: function (socket) { 
    connected.push(socket);
    socket.on('syc-object-request', Object_Request) 
    Reset(socket);
  },
  
  sync: function (name) {
    Verify(this);
    Track_Object(this);
    Name(name, this);
  },

  variables: {},
  objects: {}
}

                

/*         Error Handlers        */
function DuplicateNameError (name) { 
  this.value = name;
  this.message = "There is already a syc variable by that name";
  this.toString = function () { return this.value + " " + this.message }
} 

function InvalidTypeError (type) { 
  this.value = type;
  this.message = "Unsupported variable type introduced into this syc object.";
  this.toString = function () { return this.value + " " + this.message }
}


var a = 0;

// ---- ---- ---- ----  Observe  ---- ---- ---- ----
function Observed (changes) { 
  for (change in changes) { 
    var property = changes[change].name,
        variable = changes[change].object[property],
        id;

    if (toType(changes[change].object) === 'array' && property === 'length') continue;
    
    var type = Type(variable);
    
    if (type.type === 'object' || type.type === 'array') { 
      if (type.value === undefined) {
        type.value = Track_Object(variable);
      }
    }

    id = changes[change].object['syc-object-id'];
    
    Emit('syc-object-change', { id: id, property: property, type: type.type, value: type.value });
  }
}


// ---- ---- ---- ----  Helpers  ---- ---- ---- ----
function Type (variable) { 
  var type = toType(variable),
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
}

// Better type checking, stolen from: 
// http://javascriptweblog.wordpress.com/2011/08/08/fixing-the-javascript-typeof-operator/
function toType (obj) {
  return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
}


function Emit (title, data, sockets) { 
  var audience = sockets || connected;

  audience.forEach( function (socket) { 
    socket.emit(title, data);
  });
}

function Name (name, variable) { 
  var id = variable['syc-object-id'];

  if (!(name in Syc.variables)) { 
    Object.defineProperty(variable, 'syc-variable-name', {value: name, enumerable: false});

    Syc.variables[name] = id;
  } else throw DuplicateNameError(name)

  Emit('syc-variable-new', {name: name, id: id});
}

function Verify (variable) { 
  if ( !(variable instanceof Syc.sync) )  
    throw "Improper use of Syc.sync(). Try: 'new Syc.sync()'";
}


/* ---- ---- ---- ----  Objects  ---- ---- ---- ---- */
function Track_Object(variable) { 
  var id = Meta(variable),
      data;

  Object.observe(variable, Observed);

  for (property in variable) {
    type = Type(variable[property]);

    if ((type.type === 'object' || type.type === 'array') && type.value === undefined) {
      Track_Object(variable[property]);
    }
  }

  data = Map_Object(id);

  Emit('syc-object-create', data);

  return id;
}

function Meta (variable) {
  var id = token();
  while (id in Syc.objects) {
    id = token();
  }

  Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});

  Syc.objects[id] = variable;

  function token () {
    function rand () { return Math.random().toString(36).substr(2) }
    return rand() + rand();
  }

  return id;
}

function Map_Object (id) { 
  var variable = Syc.objects[id],
      properties = {};

  if (variable === undefined) throw 'Request for unknown variable ' + id;

  for (property in variable) {
    properties[property] = Type(variable[property])
  }

  return { id: id, properties: properties }
}


// ---- ---- ---- ----  Requests  ---- ---- ---- ----
function Reset (socket) { 
  for (variable in Syc.variables) {
    Emit('syc-variable-new', {name: variable, id: Syc.variables[variable]}, [socket]);
  }

  for (object in Syc.objects) { 
    var object = Syc.objects[object];

    Emit('syc-object-create', Map_Object(object['syc-object-id']), [socket]);
  }
}


function Object_Request (data) {
  Emit('syc-object-create', Map_Object(data.id), [socket]);
}





module.exports = Syc;
