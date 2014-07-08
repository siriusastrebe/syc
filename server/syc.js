var connected = [];
var observe_lock = {};
var Object_Mapping = {};
var mapping_timer;

Syc = {
  connect: function (socket) { 
    connected.push(socket);
    socket.on('syc-object-change', function (data) { Receive_Object(data, socket)}) 
    Reset(socket);
    
//    if (!mapping_timer) mapping_timer = setInterval(Map, 6001);
  },
  
  sync: function (name) {
    Verify(this);
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


// ---- ---- ---- ----  Helper  ---- ---- ---- ----

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
    socket.emit(title, data);
  });
}


function Verify (variable) { 
  if ( !(variable instanceof Syc.sync) )  
    throw "Improper use of Syc.sync(). Try: 'new Syc.sync()'";
}


/* ---- ---- ---- ----  Observing and New Variables  ---- ---- ---- ---- */
function Name (name, variable) { 
  if (name in Syc.variables) throw DuplicateNameError(name);

  Object.defineProperty(variable, 'syc-variable-name', {value: name, enumerable: false});
  id = Meta(variable);
  Syc.variables[name] = id;

  var description = Describe_Recursive(variable);

  Emit('syc-variable-new', {name: name, id: id, description: description});
}


function Observed (changes) { 
  for (change in changes) { 
    var object = changes[change].object,
        property = changes[change].name,
        changed = object[property],
        type = Standardize_Change_Type(changes[change].type),
        id = object['syc-object-id'];

    var changes;

    if (id in observe_lock) {
      delete observe_lock[id]; return
    }

    changes = Describe_Untracked(changed);

    Emit('syc-object-change', { id: id, type: type, property: property, changes: changes });
  }
}

function Update_Map (id, property, type, changed) {
  if (type === 'delete') { 
    delete Object_Mapping[id][property];
  } else {
    Object_Mapping[id][property] = Describe(changed);
  }
}

function Standardize_Change_Type (type) { 
  // V8 engine has 'new', 'update', and 'delete, whereas canary uses 'add', 'update'
  if (type === 'updated') return 'update';
  if (type === 'new') return 'add';

  return type;
}

/* ---- ---- ---- ----  Describing and Resolving  ---- ---- ---- ---- */
function Describe_Properties (variable) { 
  properties = {};
  for (property in variable) { 
    properties[property] = Describe(variable[property]);
  }
  return properties;
}

function Describe (variable) { 
  var type = Type(variable),
      value = Evaluate(type, variable),
      id = variable['syc-object-id'];

  if (Recurrable(type)) { 
    if (id === undefined) { 
      id = Meta(variable);
    }
    
    return {type: type, id: id};
  } else { 
    return {type: type, value: value};
  }
}

function Describe_Untracked (variable) { 
  var type = Type(variable),
      value = Evaluate(type, variable),
      id = variable['syc-object-id'];

  if (Recurrable(type)) { 
    if (id === undefined) { 

      var properties = {};

      for (property in variable) {
        properties[property] = Describe_Untracked(variable[property]);
      }

      return {type: type, id: id, properties: properties};
    } else { 
      return {type: type, id: id};
    }
  } else { 
    return {type: type, value: value};
  }
}

function Describe_Recursive (variable, visited) { 
  var type = Type(variable),
      value = Evaluate(type, variable),
      id = variable['syc-object-id'];

  if (Recurrable(type)) { 
    if (id === undefined) {
      id = Meta(variable);
    }

    if (visited === undefined) var visited = [];
    if (visited.indexOf(id) !== -1) 
      return;
    visited.push(id);

    var properties = {};

    for (property in variable) {
      properties[property] = Describe_Recursive(variable[property], visited);
    }

    return {type: type, id: id, properties: properties};
  } else { 
    return {type: type, value: value};
  }
}


function Receive_Object (data, socket) { 
  console.log(data);
  var type     = data.type,
      id       = data.id,
      property = data.property
      changes   = data.changes;

  var variable = Syc.objects[id];

  if (variable === undefined)
    throw "Received changes to an unknown object: " + id;

  observe_lock[id] = true;

  if (type === 'add' || type === 'update') { 
    variable[property] = Apply_Changes(changes);
  } else if (type === 'delete') { 
    delete variable[property];
  } else { 
    throw 'Recieved changes for an unknown change type: ' + type;
  }

  Broadcast('syc-object-change', data, socket);
}

function Apply_Changes (changes) { 
  var type = changes.type,
      variable,
      properties,
      value,
      id; 
   
  if (Recurrable(type)) { 
    properties = changes.properties,
    id         = changes.id;

    if (id in Syc.objects) { 
      return Syc.objects[id];
    } else { 
      if (type === 'object') variable = {};
      if (type === 'array') variable = [];
      
      for (property in properties) {
        variable[property] = Apply_Changes(properties[property])
      }

      id = Meta(variable, id);

      return variable;
    }
  } else { 
    value = changes.value;
    return Evaluate(type, value);
  }
}


// ---- ---- ---- ----  Object Conversion  ----- ---- ---- ---- 
function Meta (variable, id) {
  if (variable['syc-object-id']) { throw "Already Existing object" };

  var id = id || token();
  Object.defineProperty(variable, 'syc-object-id', {value: id, enumerable: false});

  Syc.objects[id] = variable;

  var properties =  Describe_Properties(variable);
  Object_Mapping[id] = properties;

  if (Object.observe) Object.observe(variable, Observed);
  
  function token () { 
    // TODO: There's a small offchance that two separate clients could create an object with the same token before it's registered by the server.
    function rand () { return Math.random().toString(36).substr(2) }
    var toke = rand() + rand();
    if (toke in Syc.objects) return token();
    else return toke;
  }

  return id;
}

function Type (obj) { 
  return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
}

function Evaluate (type, value) { 
  if (type === 'string')   return value;
  if (type === 'number')   return Number(value);
  if (type === 'boolean')  return value === 'true';
  if (type === 'date')     return JSON.parse(value);
  if (type === 'regexp')   return new RegExp(value);

  if (Recurrable(type)) {
    return Syc.objects[value];
  }

  if (type === 'undefined') return undefined;

  throw 'Object type ' + type + ' not supported by syc';
}

function Recurrable (type) {
  return (type === 'array' || type === 'object');
}


// ---- ---- ---- ----  Requests  ---- ---- ---- ----

function Reset (socket) { 
  var described = {};

  for (name in Syc.variables) {
    var id = Syc.variables[name],
        variable = Syc.objects[id];

    Emit('syc-variable-new', {name: name, id: id, description: Describe_Recursive(variable)}, [socket]);
  }
}


// ---- ---- ---- ----  Traversals  ---- ---- ---- ----

/*
  Garbage Collection (mark, sweep)
  Polyfill
  Verifier
*/
var Object_Ownership = {};

function Map () { 
  /* Traversal has four purposes
  * 1) Act as a polyfill for Object.observe
  * 2) Create a mapping of Object to Variables for use in Watchers
  * 3) Garbage collection of unreferenced objects
  * 4) 
  * As such, it's this is a real friggin big function, so I've tried to abstract out each piece as much as I can.
  */
  var Visited = {},
      Marked = Syc.objects;
      
  for (name in Syc.variables) { 
    Traverse(Syc.objects[Syc.variables[name]]);
  }


/*
  // Garbage Collect
  for (unvisited in Marked) {
    delete Syc.objects[unvisited];
  }
*/

  function Traverse (object, variable) { 
    var id = object['syc-object-id'];

    if (!(id in Object_Ownership) || Object_Ownership[id].indexOf(variable) === -1) {  // Prevent cycling
      Check_Changes(object, variable);
    }

    /*
    // Object to Variables
    if (Object_Ownership[id] === undefined) Object_Ownership[id] = [];
    Object_Ownership[id].push(variable);
    */

    return id;
  }

  function Check_Changes (object, variable) { 
    var id = object['syc-object-id'];

    var map = JSON.parse( JSON.stringify(Object_Mapping[id]) ); // Clone this object

    for (property in object) { 
      var current = Describe(object[property]);

      if (property in map) { 
        var previous = map[property];
        delete map[property];

        if ((current.type !== previous.type) || 
           ((Recurrable(current.type)) && (current.id !== previous.id)) ||
           (current.value !== previous.value)) 
        {
          Observation(property, 'update', object, previous);
        }
      } else { 
        Observation(property, 'add', object);
      }

      if (Recurrable(current.type)) { 
        if (object[property]['syc-object-id'] !== undefined) { 
          Traverse(object[property], variable)
        } else { 
          Observation(property, 'add', object);
          Traverse(object[property], variable);
        }
      }
    }

    for (property in map) { 
      Observation(property, 'delete', object, Syc.objects[id]);
    }
  }

  function Observation (name, type, object, oldValue) { 
    Observed([{name: name, type: type, object: object, oldValue: oldValue}]);

  }
}




module.exports = Syc;

