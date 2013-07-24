
var lines = new Array();
var patterns = [/[numberofPrimitives=][0-9]+/ig, /[numberofVertices=][0-9]+/ig, /[0-9.]+/ig];
var dataPoints = new Array();

var c=document.getElementById("canvas");
var context=c.getContext('2d');

var ymax=1100;
var ymin=0;
var xmin=0;
var xmax=1100;
var yscale=(c.height)/ymax;
var xscale=(c.width)/xmax;

//var datafile="bounds.lec"

//var datafile="bounds.lec";
var imax;	// maximum time value


// updates lines and dataPoints with new file
    function getData(file) {
		lines = file.responseText.split("\n").slice();
		matcher();
	//	document.getElementById("test").innerHTML=(dataPoints.length);
	}

	function matcher() {
		var current = new Array();
		
		for (i = 0; i < lines.length; i++) {
			var str = lines[i];
			var x = null;
			var y = null;
			var time = null;
			
			var lastTime;
			
			for (j = 0; j < patterns.length; j++) {
				var m = str.match(patterns[j]);
				
				if (m != null) {
					// if matches "number of vertices", push current array of points dataPoints
					if (j == 1) {
						if (current.length != 0) {
							dataPoints.push(current);
							current = new Array();
							break;
						}
					}
					
					if 	(j == 2) {
						x = m[0]; 
						y = m[1];
						time = m[2];
					}
				}
			}
			
			if (time != null) {
				var temp=new Array();
				temp.push(x)
				temp.push(y)
				temp.push(time)
				current.push(temp);
			}
		}
		
		if (current.length != 0) {
			dataPoints.push(current);
		}
		
		data=dataPoints[dataPoints.length-1];
		imax=data[data.length-1][2];
		document.getElementById("timeslide").max=imax;
		document.getElementById("test2").innerHTML=dataPoints.length;
		document.getElementById("test3").innerHTML=dataPoints[0].length;
		//alert(dataPoints)
		//if (fileChanged) {start();}
	}

	function readFile(url, callback) {
		var txtFile = new XMLHttpRequest();
		txtFile.open("GET", url, true);	
		txtFile.setRequestHeader('User-Agent','XMLHTTP/1.0');
		txtFile.onreadystatechange = function() {
			if (txtFile.readyState != 4) return;  // document is ready to parse.	
			if (txtFile.status != 200 && txtFile.status != 304) return;  // file is found
			callback(txtFile);
		}
		if (txtFile.readyState == 4) return;
		txtFile.send(null);
	}



var initialTime=0;
var currentTime;
var currentI;

	
	window.onload = function() {
		readFile(datafile, getData);
	};
	

//ADDING DRAWING STUFF
var drawD, changeS;

	function start(){ //runs when 'start' is clicked (basically the 'play' button)
		if (pause){ //if this is starting it after it was paused
			initialTime=Date.now() - (pausetime-origstart);
		}
		else{ //if this is the first time play is hit	
			//this sets start time as right now
			initialTime=Date.now(); //gets time in milliseconds since jan 1970
		}
		pause=false;
		document.getElementById("lecture").play();
		drawD = setInterval(graphData,10);
		changeS = setInterval(changeSlider,10);
		document.getElementById("test3").innerHTML='started';
	}
	
var pause=false;
var pausetime=0;
var origstart;

	function pausePlay(){
		//alert("NOOooo sigh");
		pause=true;
		pausetime=Date.now();
		origstart=initialTime;
		document.getElementById("lecture").pause();
		//alert(pausetime +","+origstart);
		document.getElementById("test2").innerHTML='paused';
	}
	
	function chooseT(t){
		var initialPause=pause;
		
		document.getElementById("test3").innerHTML=pause +'initialpause: '+ initialPause;
		pausePlay();
		//document.getElementById("t").innerHTML=(t);
		pausetime=t*1000;
		origstart=0;
		//pause=true; fileChanged=false;
		//initialTime=t*-1000+Date.now();
		document.getElementById("lecture").pause(); //for audio
		document.getElementById("lecture").currentTime=t; //for audio
		if (!initialPause){ //if it wasn't paused before you scrubbed
			document.getElementById("test2").innerHTML='started';
			pause=false;
			initialTime=Date.now() - (pausetime-origstart);
			document.getElementById("lecture").play();
			drawD = setInterval(graphData,10);
			changeS = setInterval(changeSlider,10);
		}
	}
	
	function stop(){
		pause=true;
		pausetime=initialTime;
		origstart=initialTime;
		document.getElementById("lecture").pause();
		document.getElementById("lecture").currentTime=0;
		document.getElementById("test2").innerHTML='stopped';
	}

	function graphData(){
		context.lineCap='round';
		context.clearRect(0,0,c.width,c.height);
		currentTime=Date.now(); //gets current time
		currentI=(currentTime/1000.0)-(initialTime/1000.0) //converts to seconds passed
		context.strokeStyle='blue';
		context.lineWidth=1;
		var done=false;
		
		for(var i=0; i<dataPoints.length; i++){
			var data = dataPoints[i];
			context.beginPath();
			context.moveTo((data[0][0]*xscale),ymax*yscale-data[0][1]*yscale);
			
			for (var j = 1; j < data.length; j++) {
				if (pause){
					break;
					}
				
				else if (data[j][2] < currentI){
					var x=data[j][0]*xscale
					var y=data[j][1]*yscale	
					context.lineTo(x,ymax*yscale-y);
					context.stroke();
				}
				else{
					done=true;
					break;}

			}
			
			if (pause){
				drawD=clearInterval(drawD);
				changeS=clearInterval(changeS);
				document.getElementById("test2").innerHTML='paused drawings';
				
				//draws everything up to this point
				for(var i=0; i<dataPoints.length; i++){
					var data = dataPoints[i];
					context.beginPath();
					context.moveTo((data[0][0]*xscale),ymax*yscale-data[0][1]*yscale);
					
					for (var j = 1; j < data.length; j++) {
						
						if (data[j][2] < currentI){
							var x=data[j][0]*xscale
							var y=data[j][1]*yscale	
							context.lineTo(x,ymax*yscale-y);
							context.stroke();
						}
						else{
							done=true;
							break;
						}
		
					}
				}
				break;
			}
			if (done) { break;}
			else if (currentI==imax){stop()}
		}
		
	}
	
	function changeSlider(){
		if(currentI<imax){
			document.getElementById("timeslide").value=(currentI);
			document.getElementById("t").innerHTML=(Math.round(currentI*100)/100);
		}
	
	}
	
	/*
	to do:
	anti aliasing
	
	debug start/stop because they mostly work but not fully...
	*/
