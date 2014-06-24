function arrFloatProfile () { 
  a = new Array; 
  var x = 10000000; 
  for (var i=0; i<100000; i++) 
  { 
    a.push(Math.random()*x);
    a.sort(); 
    for (var j=0; j<1000000; j++) { 
      delete a[j];
    }
  }
}
