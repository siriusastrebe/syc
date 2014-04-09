var socket = io.connect();

socket.on('syc-variable-change', function (data) {
  console.log(data);
});

socket.on('conn', function (data) { 
  console.log(data)
});
