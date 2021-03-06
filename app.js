/*---------- BASIC SETUP ----------*/
var express   = require('express'),
  bodyParser  = require('body-parser');     // helper for parsing HTTP requests
var app = express();                        // our Express app
var PORT = 4000;
var server = require('http').Server(app);   // Socket.io setup
var io = require('socket.io')(server);

// Body Parser
app.use(bodyParser.urlencoded({ extended: false }));// parse application/x-www-form-urlencoded
app.use(bodyParser.json());                         // parse application/json

// Detecting if the connecting user is using mobile or desktop
app.use('/', express.static(__dirname + '/public'));
app.use('*', function(req, res) {
  // console.log(req.headers['user-agent']);
  // Say if req.headers['user-agent'] contains "Mobile", re-route the user to mobile interface
  var ua = req.headers['user-agent'];
  
  // if (ua.indexOf('Mobile') > -1) {
  //   console.log('User is using mobile device');
  //   res.redirect('mobile.html');
  // } else {
  //   // Else display a desktop version
  //   console.log('User is using desktop device');
  //   res.redirect('desktop.html');
  // }
});

server.listen(PORT, function(){
    console.log('Express server is running at ' + PORT);
});

var users = {};
var loop;


//Assign function to 'connection' event for the connected socket
io.on('connection', function(socket) {

  /*––––––––––– SOCKET.IO starts here –––––––––––––––*/
  console.log('SOCKET: connection');
  console.log('A new client has connected: ' + socket.id);
  socket.emit('welcome', {
      msg: 'Welcome! your id is ' + socket.id,
      users: users
  });

  // DESKTOP
  // Getting dimensions
  socket.on('from-desktop-add', function(data, callback){
    console.log("SOCKET: from-desktop-add");
    console.log(data);

    // Dimensions are specific to each "user" (a desktop/mobile pair)
    // We'll send them when adding a new user
    addDesktopUser(socket.id, data["width"], data["height"], function(key){
      // After the (desktop) user is added, send the key to render on the screen
      callback(key);
    });
  });

  socket.on("from-desktop-reset-calibration", function(){
    console.log("SOCKET: from-desktop-reset-calibration");
    resetMobileCalibration();
    socket.broadcast.to(users[socket.id]["partner"]).emit("to-mobile-reset-calibration");
  });

  socket.on("from-desktop-start-application", function(){
    console.log("SOCKET: from-desktop-start-application");
    socket.broadcast.to(users[socket.id]["partner"]).emit("to-mobile-start-application");
  });



  // MOBILE
  socket.on('from-mobile-add', function() {
    console.log('SOCKET: from-mobile-add');
    addMobileUser(socket.id);
  });

  socket.on("from-mobile-match-key", function(data, callback){
    console.log('SOCKET: from-mobile-match-key');
    console.log(data);
    matchMobileUser(socket.id, data, function(msg, partner){
      callback(msg);
      if(partner !== undefined){
        socket.emit("to-mobile-confirm-connection", "You're now partnered with " + partner);
        socket.broadcast.to(users[socket.id]["partner"]).emit("to-desktop-confirm-connection", "You're now partnered with " + socket.id);
      }
    });
  });

  socket.on("from-mobile-calibrate-center", function(msg){
    console.log("SOCKET: from-mobile-calibrate-center");
    console.log(msg);
    socket.broadcast.to(users[socket.id]["partner"]).emit("to-desktop-center-confirmation", msg);
  });

  socket.on("from-mobile-calibrate-top-left", function(data){
    console.log("SOCKET: from-mobile-calibrate-top-left");
    console.log(data);
    calibrateMobileTopLeft(socket.id, data);
    socket.broadcast.to(users[socket.id]["partner"]).emit("to-desktop-top-left-confirmation", users[socket.id]["offset"]);
  });

  socket.on("from-mobile-calibrate-bottom-right", function(data){
    console.log("SOCKET: from-mobile-calibrate-bottom-right");
    console.log(data);
    calibrateMobileBottomRight(socket.id, data);
    socket.broadcast.to(users[socket.id]["partner"]).emit("to-desktop-bottom-right-confirmation", users[socket.id]["offset"]);
  });

  // Listening for coordinates
  socket.on('orientation', function(data) {
    console.log('SOCKET: orientation');
    // console.log('has sent: ' + socket.id, data);
    
    if(users.hasOwnProperty(socket.id)){
      users[socket.id]['isTouching'] = data.isTouching;
  
      if(users[socket.id]["partner"] !== ""){

        updateUserPosition(socket.id, data, function(){

          socket.broadcast.to(users[socket.id]["partner"]).emit("to-desktop-orientation", {
            pos: users[socket.id]["pos"],
            orientation: users[socket.id]["orientation"],
            isTouching: users[socket.id]['isTouching']
          });

        });
      }
    }
    // console.log(users[socket.id]['isTouching']);
  });
  
  socket.on('disconnect', function() {
    console.log('SOCKET: disconnect');
    console.log(socket.id + ' just disconnected');
    io.sockets.emit('to-all-user-disconnected', socket.id + ' just disconnected');
    // Let's disconnect the partner first
    if(users.hasOwnProperty(socket.id) && users[socket.id]["partner"] !== ""){
      socket.broadcast.to(users[socket.id]["partner"]).emit("to-all-partner-disconnected");
    }
    // Now remove the user from our list
    removeUser(socket.id);
  });
});


// MOBILE
function addMobileUser(id) {
  console.log('FUNCTION: addMobileUser');
  if(!users.hasOwnProperty(id)) {
      users[id] = {
        type: "mobile",
        offset: {
          x: {
            min: "",
            max: ""
          },
          y: {
            min: "",
            max: ""
          }
        },
        pos: {
          x: "",
          y: ""
        },
        orientation: {
          tiltLeftToRight: "",
          tiltFrontToBack: "",
          direction: ""
        },
        isTouching: false,
        partner: ""
      };
      console.log("New user:" + JSON.stringify(users[id]));
  }
  console.log('current users: ' + Object.keys(users).length);
}

function matchMobileUser(id, key, callback){
  var msg = "wrong-key";
  var partner;
  for(prop in users){
    // Loop through users and find the desktop one with a matching key and no partner
    if(users[prop]["type"] === "desktop" && users[prop]["key"] === key && users[prop]["partner"] === ""){
      msg = "right-key";
      users[prop]["partner"] = id;
      users[id]["partner"] = prop;
      console.log(JSON.stringify(users[id]));
      partner = prop;
    }
  }
  callback(msg, partner);
}

function calibrateMobileTopLeft(id, data){
  console.log('FUNCTION: calibrateMobileTopLeft');

  data["alphaMin"] = fixAngle(data.orientation.direction);
  data["betaMax"] = fixAngle(-data.orientation.tiltFrontToBack);
  
  if(users.hasOwnProperty(id)){
    users[id]['offset'].x.min = data["alphaMin"];
    users[id]['offset'].y.max = data["betaMax"];
    console.log(users[id]['offset']);
  }
}

function calibrateMobileBottomRight(id, data){
  console.log('FUNCTION: calibrateMobileBottomRight');

  data["alphaMax"] = fixAngle(data.orientation.direction);
  data["betaMin"] = fixAngle(-data.orientation.tiltFrontToBack);  
  
  if(users.hasOwnProperty(id)){
    users[id]['offset'].x.max = data["alphaMax"];
    users[id]['offset'].y.min = data["betaMin"];
    console.log(users[id]['offset']);
  }
    // if(Object.keys(users).length === 1){
    //   loop = setInterval(function(){
    //     renderOnClient(io);
    //   }, 20);
    // }      
}

function resetMobileCalibration(id){
  if(users.hasOwnProperty(id)){
    users[id]['offset'] = {
      x: {
        min: "",
        max: ""
      },
      y: {
        min: "",
        max: ""
      }
    };
  }
}

function fixAngle(angle){
  var fixedAngle = angle;
  if(fixedAngle > 180) fixedAngle -= 360;
  return fixedAngle;
}

function updateUserPosition(id, data, callback){
  console.log('FUNCTION: updateUserPosition');
  // console.log(data);
  if(users.hasOwnProperty(id)) {
    // console.log('in:\t' + data.orientation.x);
    // console.log('in:\t' + data.orientation.y);    

    users[id]["orientation"] = data.orientation;
    users[id]["pos"]["x"] = angleToPosition(id, data.orientation.direction, "x");
    users[id]["pos"]["y"] = angleToPosition(id, -data.orientation.tiltFrontToBack, "y");

    callback();   // Emit mapped coordinates + orientation to desktop
  }
}

function angleToPosition(id, angle, axis){

  var pos;
  
  angle = fixAngle(angle);

  // Clamping
  if(angle > users[id]['offset'][axis]["min"]) angle = users[id]['offset'][axis]["min"];
  if(angle < users[id]['offset'][axis]["max"]) angle = users[id]['offset'][axis]["max"];

  var partner = users[id]["partner"];
  var dimensions = users[partner]["dimensions"];

  if(axis === "x"){
    pos = map(angle,
              users[id]['offset'][axis]["min"], users[id]['offset'][axis]["max"],
              0, dimensions[axis]);
  }else{
    pos = map(angle,
              users[id]['offset'][axis]["min"], users[id]['offset'][axis]["max"],
              dimensions[axis], 0); // y is inverted :/
  }
  pos = Math.round(pos);
  return pos;
}



// DESKTOP

function addDesktopUser(id, width, height, callback) {
  console.log('FUNCTION: addDesktopUser');
  if(!users.hasOwnProperty(id)) {
      users[id] = {
        type: "desktop",
        key: generateKey(),
        dimensions: {
            x: width,
            y: height
          },
        partner: ""
      };

      console.log("New user:" + JSON.stringify(users[id]));
      callback(users[id]["key"]);
  }
  console.log('current users: ' + Object.keys(users).length);
}

function generateKey(){
  // http://stackoverflow.com/questions/1349404/generate-a-string-of-5-random-characters-in-javascript
  var possible = "0123456789";
  var uniqueKey = newKey();

  var existingKeys = [];
  for(prop in users){
    existingKeys.push(users[prop]["key"]);
  }

  // Let's check whether the key already exist
  while(existingKeys.indexOf(uniqueKey) > -1){
    uniqueKey = newKey();
  }

  function newKey(){
    var key = "";
    for(var i=0; i < 4; i++){
      key += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return key;
  }
  return uniqueKey;
}

function removeUser(id) {
  console.log('FUNCTION: removeUser');
  if(users.hasOwnProperty(id)) {

      // remove user from "partner" property
      // if(users[id]["type"] === "mobile"){
        for(prop in users){
          if(users[prop]["partner"] === id){
            users[prop]["partner"] = "";
          }
        }
      // }

      // remove id from user list
      delete users[id];
  }
  console.log('current users: ' + Object.keys(users).length);
  console.log(JSON.stringify(users));
  if(Object.keys(users).length === 0){
    clearInterval(loop);
  }
}

// HELPERS
var map = function (n, start1, stop1, start2, stop2) {
  return (n - start1) / (stop1 - start1) * (stop2 - start2) + start2;
};

var constrain = function(num, min, max) {
  return Math.min(Math.max(num, min), max);
};