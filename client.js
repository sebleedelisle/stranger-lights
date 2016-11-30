var config = require('/boot/lightconfig.json');

var socket = require('socket.io/node_modules/socket.io-client')(config.server || 'http://sebsmac.local');
var neopixels = require('rpi-ws281x-native');
var Colour = require('color');
var isOnline = require('is-online');
var exec = require('child_process').exec;


var NUM_LEDS = 50,
	pixelData = new Uint32Array(NUM_LEDS),
	pixelDataProcessed = new Uint32Array(NUM_LEDS);
	
neopixels.init(NUM_LEDS);
neopixels.render(pixelData);


var lastMessageTime = 0; 
var socket; 
var room = config.room || 'default';
var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"; 
var lightIndex = config.lightIndex || {
	A : 42, 
	B : 43, 
	C : 44, 
	D : 45, 
	E : 46, 
	F : 47, 
	G : 48, 
	H : 49, 
	I : 40, 
	J : 39, 
	K : 38, 
	L : 37, 
	M : 36, 
	N : 35, 
	O : 34, 
	P : 33, 
	Q : 32, 
	R : 22,
	S : 23,
	T : 24,
	U : 25,
	V : 26,
	W : 27,
	X : 28,
	Y : 29,
	Z : 30

}; 

var colours = {
	white : {h:20, s:80, l:80},
	blue : {h:185, s:100, l:50},
	red : {h:350, s:80, l:50},
	green : {h:160, s:90, l:50},
	yellow : {h:35, s:100, l:60},
}
var lightColours = [ 
	'white', 	// A
	'blue', 	// B
	'red', 		// C
	'green', 	// D
	'blue', 	// E
	'yellow', 	// F
	'red',		// G
	'green',	// H
	'green',	// I
	'red',		// J
	'blue',		// K
	'green', 	// L
	'yellow',	// M
	'red',		// N
	'red', 		// O
	'green', 	// P
	'red', 		// Q
	'green',	// R
	'white',	// S
	'yellow', 	// T
	'blue', 	// U
	'red',		// V
	'blue',		// W
	'yellow',	// X
	'red',		// Y
	'red', 		// Z
	
];
var lightColoursByIndex = []; 

for(var i = 0; i<NUM_LEDS; i++) { 
	var c = colours[lightColours[i%lightColours.length]];
	lightColoursByIndex.push(c); 
}
for(var i = 0; i<letters.length; i++) { 
	var index = lightIndex[letters[i]]; 
	lightColoursByIndex[index] = colours[lightColours[i]]; 
}

var lights = []; 

for (var i = 0; i<NUM_LEDS; i++) { 
	lights.push(new Light(lightColoursByIndex[i])); 
	
}
var allLightsOn = false; 
var lightsChanged = true; 
var internetConnection = false; 

initialise(); 

function initialise() { 
	
	doRainbowStrobe(); 
	initSocketConnection();
	setInterval(update, 1000/30); 
	startInternetChecks(); 
}
function startInternetChecks(){ 
	isOnline(function(err, online) {
		if(online) { 
			internetConnection = true; 
		} else { 
			internetConnection = false; 
		} 
		setTimeout(startInternetChecks, 1000); 
	});
	
}

// ---- animation-loop

function update() {
	
	if(!socket.connected) { 
		var hue = 135; 
		if(!internetConnection) hue = 0; 
		for(var i = 0; i<lights.length; i++) { 
			if((i==0) || (i==lights.length-1)) {
				pixelData[i] = Colour().hsl(135,100,(Math.sin(Date.now()*0.01)*0.5+0.5)*50).rgbNumber(); 
			} else { 
				pixelData[i] = 0;	
			}
		}
		updatePixels();
		
	} else { 

		if((Date.now()-lastMessageTime > 10000)&& (!allLightsOn)) { 
			allLightsOn = true; 
			for(var i = 0; i<lights.length; i++) { 
				lights[i].turnLightOn();
			}
		} 
			
		for(var i = 0; i<lights.length; i++) { 
			var light=lights[i];
			light.update(); 
			if(light.changed) {
				pixelData[i] = lights[i].getColour(); 
				lightsChanged = true; 
			}
		}
		if(lightsChanged) {
			updatePixels(); 
			lightsChanged = false; 
		}
	}
}

function initSocketConnection() { 
	socket.on('connect', function(){
		console.log("connected!");
		socket.emit('register', {type:'receiver', room:room}); 
		showMessage('join room '+room); 
	
	
	});


	socket.on('registered', function(data) { 
			console.log('registered', data); 
			console.log("Connected! Your id is "+data.name+" ");
	});

	socket.on('letter', function(data){
		console.log('letter', data);
		if((data.type =='on') || (data.type =='off')) { 
			if(allLightsOn) { 
				for(var i = 0; i<lights.length; i++) { 
					lights[i].turnLightOff(); 
				} 
				allLightsOn = false; 
			
			}
			if(lightIndex.hasOwnProperty(data.letter)) { 
				var pixelnum = lightIndex[data.letter]; 
				if(data.type=='on') lights[pixelnum].turnLightOn(); 
				else lights[pixelnum].turnLightOff(); 
			}
		}

		lastMessageTime = Date.now();

	});

	socket.on('disconnect', function(){
	
	});
	
	socket.on('reboot', function() { 
		console.log("REBOOT!"); 
		execute('/sbin/reboot', function(callback){
	    	console.log(callback);
		});
	});
	
}


function updatePixels() { 
	for(var i = 0; i<NUM_LEDS; i++) { 
		var pixel = pixelData[i]; 
		if(pixel==0) {
			pixelDataProcessed[i] = 0; 
		} else { 
			var g = pixel>>16; 
			var r = (pixel>>8) & 0xff; 
			var b = pixel & 0xff; 
			pixelDataProcessed[i] =  (r << 16) + (g  << 8) + b ; 
		}
	}
	neopixels.render(pixelDataProcessed);
}



function Light( colour) { 
	
	this.colour = colour; 
	var lightOn = false; 
	this.brightness = 0; 
	this.changed = true; 
	
	this.update = function() { 
	
		var newBrightness = this.brightness; 

		if (newBrightness<0.001) newBrightness = 0;
		if(lightOn) { 
			newBrightness+=((1-newBrightness))*0.2; 
		} else { 
			newBrightness*=0.7;
		}
		
		this.changed = this.brightness!=newBrightness; 
		this.brightness=newBrightness; 
	}
	
	this.turnLightOn = function() { 
		if(!lightOn) {
			lightOn = true; 
			this.brightness = 1.5; 
		} 
	}
	this.turnLightOff =function() { 
		if(lightOn) { 
			lightOn = false; 
		}
	}
	this.getColour = function() { 
		if(this.brightness <0.001) return 0; 
		else return Colour().hsl(colour.h, colour.s, colour.l * this.brightness).rgbNumber(); 
	}
	
}

function doRainbowStrobe(){ 

	for(var loop=0; loop<360*2; loop+=10) { 
		for(var i = 0; i<NUM_LEDS; i++) {
			//console.log(loop, i); 
			var position = (i*10)+loop; 
			var b = map(position, 360*1, 360*2, 1,0, true);  
			pixelData[i] = Colour().hsl(position%360, 100,50*b).rgbNumber(); 
			
		}
		updatePixels();
	}
	
	
}

function map(value, min1, max1, min2, max2, clampResult) { 
	var returnvalue = ((value-min1) / (max1 - min1) * (max2-min2)) + min2; 
	if(clampResult) return clamp(returnvalue, min2, max2); 
	else return returnvalue; 
};

function clamp(value, min, max) { 
	if(max<min) { 
		var temp = min; 
		min = max; 
		max = temp; 
	}
	return Math.max(min, Math.min(value, max)); 
};
function showMessage(message) { 
	console.log(message);
}

process.on('SIGINT', function () {
	neopixels.reset();
	process.nextTick(function () { process.exit(0); });
});

process.on('exit', function() { 
	neopixels.reset();
	
}); 

function execute(command, callback){
    exec(command, function(error, stdout, stderr){ callback(stdout); });
}


