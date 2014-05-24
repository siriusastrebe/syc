var connected = [];
var observe_lock = {};

Syc = {
  connect: function (socket) { 
    connected.push(socket);
    socket.on('syc-object-change', function (data) { console.log(data); Receive_Object(data, socket)}) 
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


// ---- ---- ---- ----  Observe  ---- ---- ---- ----
function Observed (changes) { 
  for (change in changes) { 
    var property = changes[change].name,
        variable = changes[change].object[property],
        id = changes[change].object['syc-object-id'];

    if (id in observe_lock) {
      delete observe_lock[id];
      continue;
    }

    if (toType(changes[change].object) === 'array' && property === 'length') continue;
    
    var type = Type(variable);
    
    if (type.type === 'object' || type.type === 'array') { 
      if (type.value === undefined) {
        type.value = Track_Object(variable);
      }
    }
    
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

function Broadcast (title, data, sender) { 
  var audience = connected.slice(0); // create a clone so we don't tamper the original
  audience.splice(audience.indexOf(sender), 1);

  audience.forEach( function (socket) { 
    soket.emit(title, data);
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

  for (property in variable) {
    type = Type(variable[property]);

    if ((type.type === 'object' || type.type === 'array') && type.value === undefined) {
      Track_Object(variable[property]);
    }
  }

  data = Describe_Object(id);

  Emit('syc-object-create', data);

  return id;
}

function Meta (variable, id) {
  var id = id || token();

  Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});

  Syc.objects[id] = variable;

  if (Object.observe) Object.observe(variable, Observed);

  function token () {
    function rand () { return Math.random().toString(36).substr(2) }
    return rand() + rand();
  }

  return id;
}

function Describe_Object (id) { 
  var variable = Syc.objects[id],
      properties = {};

  if (variable === undefined) throw 'Request for unknown variable ' + id;

  for (property in variable) {
    properties[property] = Type(variable[property])
  }

  return { id: id, properties: properties }
}




// ---- ---- ---- ---- Recieving ---- ---- ---- ----

function Receive_Object (data, socket) { 
  var type     = data.type,
      id       = data.id,
      property = data.property
      changes   = data.changes;

  var variable = Syc.objects[id];

  if (variable === undefined)
    throw "Received changes to an unknown object: " + id;

  observe_lock[id] = true;

  variable[property] = Resolve(changes);
}

function Resolve (changes) { 
  var type = changes.type,
      properties,
      value,
      id; 
   
  if (type === 'object' || type === 'array') { 
    var properties = changes.properties,
        id         = changes.id;

    if (id in Syc.objects) { 
      return Syc.objects[id];
    } else { 

      variable = { };
      id = Meta(variable, id);

      for (property in properties) {
        variable[property] = Resolve(properties[property])
      }

      return variable;
    }
  } else { 
    value = changes.value;
    return Evaluate(type, value);
  }
}

function Evaluate (type, value) { 
  if (type === 'string')   return value;
  if (type === 'number')   return Number(value);
  if (type === 'boolean')  return value === 'true';
  if (type === 'date')     return JSON.parse(value);
  if (type === 'regexp')   return new RegExp(value);

  if (type === 'object' || type === 'array') {
    return Syc.objects[value];
  }

  throw 'Object type ' + type + ' not supported by syc';
}

// ---- ---- ---- ----  Traversals  ---- ---- ---- ----
/*
var timer;

function Start_Map () { 
  if (timer === undefined) { 
    timer = setInterval(Mapper, 500);
  }
}

function Mapper () { 
  var unmarked_objects = Syc.objects;

  for (variable in Syc.variables) {
    Traverse(Syc.variables[variable], variable, [])
  }

  // Garbage Collect 
  for (object in unmarked_objects) {
    var id = unmarked_objects[object]['syc-object-id'];
    Emit('syc-variable-delete', {id: id});
    delete Syc.objects[object];
  }
}

function Traverse (object, variable, pathway) { 
  var id = object['syc-variable-id'];

  if (id === undefined) { 
    id = Track_Object(object);
    if (Object.observe)
      console.log('Syc warning: New object bypassed by Object.observe. Id: ' + id); 
  }

  // Bookkeeping 
  if (object_to_variable_map[id] === undefined)
    object_to_variable_map[id] = [];
 
  object_to_variable_map[id].push(variable);

  delete unmarked_objects[id];

  // Traversal 
  for (property in object) {
    var element = object[property],
        type = Type(element);

    if (type.type === 'object' || type.type === 'array') {
      Traverse(element, variable, pathway.slice(0).push(property));
    }
  }
}

function Compare (a, b) { 
  for (property in a) { 
    
  }
}
*/


// ---- ---- ---- ----  Requests  ---- ---- ---- ----
function Reset (socket) { 
  for (variable in Syc.variables) {
    Emit('syc-variable-new', {name: variable, id: Syc.variables[variable]}, [socket]);
  }

  for (object in Syc.objects) { 
    var object = Syc.objects[object];

    Emit('syc-object-create', Describe_Object(object['syc-object-id']), [socket]);
  }
}



module.exports = Syc;
