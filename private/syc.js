var sockets = [];

Syc = {
  connect: function (socket) { 
    sockets.push(socket);
  },
  
  sync: function (name) {
    List(name, this);
    Meta(name, this);
    Object.observe(this, Observed);
  },

  list: {}
}


function DuplicateNameError (name) { 
  this.value = name;
  this.message = "There is already a syc variable by that name";
  this.toString = function () { return this.value + this.message }
} 

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

function Observed (change) { 
  var property = change[0].name;
  Synchronize(change[0].object, property, Sanitize(change[0].object[property]));

  function Synchronize (variable, property, change) {
    var name = variable['syc-variable-name'];

    sockets.forEach( function (socket) { 
      socket.emit('syc-variable-change', { name: name, property: property, change: change });
    });
  }

  function Sanitize (contents) { 
    return JSON.stringify(contents);
  }
}


module.exports = Syc;
