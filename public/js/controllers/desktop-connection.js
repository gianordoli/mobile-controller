var connection = (function(){

  console.log("Loaded module: connection");
  
  var obj = {};             // This module
  var socket;               // Shared across modules

  obj.init = function(_socket){
    console.log("init");
    socket = _socket;
    socketSetup();
  };

  function socketSetup(){

    console.log("socketSetup");

    // Start by asking to be added to the list of users and sending screen dimensions
    socket.emit('from-desktop-add', {
      width: window.innerWidth,
      height: window.innerHeight
    }, function(data){
      console.log(data);
      document.querySelector("#key").innerHTML = data;
    });

    socket.on('to-desktop-confirm-connection', function(data) {
      console.log(data);
      localStorage["isConnected"] = true;
      location.hash = "calibration";
    });

    attachEvents();
  }

  function attachEvents(){

  }

  return obj;
})();