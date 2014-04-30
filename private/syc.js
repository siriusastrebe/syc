var connected = [];

Syc = {
  connect: function (socket) { 
    connected.push(socket);
    socket.on('syc-reset-request', function () { Reset(socket) });
    Reset(socket)
  },
  
  sync: function (name) {
    List(name, this);
    Meta(name, this);
    New(this);
    Object.observe(this, Observed);
  },

  list: {}
}

                
/*         Error Handlers        */
function DuplicateNameError (name) { 
  this.value = name;
  this.message = "There is already a syc variable by that name";
  this.toString = function () { return this.value + this.message }
} 


/*         Syc functions         */
function List (name, variable) { 
  if (!(name in Syc.list)) { 
    Syc.list[name] = variable;
  } else { 
    throw DuplicateNameError(name)
  }
}

function Meta (name, variable) { 
  Object.defineProperty(variable, 'syc-variable-name', {value: name, enumerable: false});
}


function New (variable) { 
  Emit('syc-variable-new', { variable: Json(variable, true) });
}

function Emit (title, data, sockets) { 
  var audience = sockets || connected;

  audience.forEach( function (socket) { 
    socket.emit(title, data);
  });
}


function Reset (socket) { 
  var variables = [];

  for (variable in Syc.list) { 
    variables.push(Json(Syc.list[variable], true));
  }

  Emit('syc-reset-response', {variables: variables});
}


function Json (variable, recursive) { 
  var name = variable['syc-variable-name'],
      recursive = recursive || false;

  var object = {};
  object['syc-variable-name'] = name;

  for (var property in variable) { 
    object[property] = Type(variable[property])
  }

  return object;
  
  function Type (variable) { 
    var type = toType(variable),
        value;

    if (type === 'string')   value = variable;
    if (type === 'number')   value = variable.toString();
    if (type === 'boolean')  value = variable ? 'true' : 'false';
    if (type === 'array')    value = '[' + variable.map(Type) + ']';
    if (type === 'date')     value = JSON.stringify(variable);
    if (type === 'regexp')   value = variable.toString();

    if (type === 'object') { 
      if (recursive) { value = Json(variable); }
      else { return { type: type, name: variable['syc-variable-name'] } }
    }

    return {type: type, value: value}
  }
   
  // Better type checking, stolen from: 
  // http://javascriptweblog.wordpress.com/2011/08/08/fixing-the-javascript-typeof-operator/
  function toType (obj) {
    return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase()
  }
}

function Observed (change) { 
  var property = change[0].name;

  Synchronize(change[0].object, property, Sanitize(change[0].object[property]));


  function Synchronize (variable, property, change) {
    var name = variable['syc-variable-name'];

    Emit('syc-variable-change', { name: name, property: property, change: change });
  }

  function Sanitize (contents) { 
    return JSON.stringify(contents);
  }
}

module.exports = Syc;
