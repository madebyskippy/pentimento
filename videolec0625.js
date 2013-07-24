var Grapher = function() {
    exports = {};
    var c;
    var context;
    var contextHeight=600;
    
    var ymax=800;
    var ymin=0;
    var xmin=0;
    var xmax=1100;
    var yscale;
    var xscale;
    
    var audio;
    
    var lines = new Array();
    var patterns = [/[numberofPrimitives=][0-9]+/ig, 
                    /[numberofVertices=][0-9]+/ig, 
                    /[0-9.]+/ig];
    var dataPoints = new Array();
    //array of strokes. one stroke is an array of [x,y,t],[x,y,t],...
    
    var imax;	// maximum time value
    
    var initialTime; //initial time of start of video
    var currentI; //current index of time (in seconds)
    var currentTime; //current time, as given by date.now();
    var offsetTime=0; //for use with pause
    var paused=true; //only for slider moving
    var draw;
    
    // updates lines and dataPoints with new file
    function getData(file) {
        lines = file.responseText.split("\n").slice();
        matcher();
    }

    function matcher() {
        var current = new Array();
        //current is array: [[x,y,t],[x,y,t],[x,y,t],...]
        for (i = 0; i < lines.length; i++) { //goes thru each line
            var str = lines[i];
            var x = null;
            var y = null;
            var time = null;
            
            var lastTime;
            
            for (j = 0; j < patterns.length; j++) { //check if this line matches anything
                var m = str.match(patterns[j]);
                if (m != null) { //there's a match
                    // if matches "number of vertices", push current array of points
                    if (j == 1) {
                        if (current.length != 0) {
                            dataPoints.push(current);
                            current = new Array();
                            break;
                        }
                    }
                    //if it's a point
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
        var lastData=dataPoints[dataPoints.length-1];
        imax=lastData[lastData.length-1][2];
        $('#slider').slider("option","max",imax);
        slider.max=imax;
        return dataPoints;
	}

	function readFile(url, callback) {
		var txtFile = new XMLHttpRequest();
		txtFile.open("GET", url, true);	
		//txtFile.setRequestHeader('User-Agent','XMLHTTP/1.0');
		txtFile.onreadystatechange = function() {
			if (txtFile.readyState != 4) {return;}  // document is ready to parse.	
			if (txtFile.status != 200 && txtFile.status != 304) {return;}  // file is found
			callback(txtFile);
		}
		if (txtFile.readyState == 4) return;
		txtFile.send(null);
	}
    
    
    function graphData(){
		context.clearRect(0,0,c.width,c.height);
		currentTime=Date.now(); //gets current time
		currentI=(currentTime/1000.0)-(initialTime/1000.0) //converts to seconds passed
		var done=false;
		changeSlider(currentI);
        oneFrame(currentI);
		
        if (done) stop();
	}
    
    function oneFrame(current){
        for(var i=0; i<dataPoints.length; i++){
			var data = dataPoints[i];
			context.beginPath();
			context.moveTo((data[0][0]*xscale),ymax*yscale-data[0][1]*yscale);
			
			for (var j = 1; j < data.length; j++) {
				if (data[j][2] < current){
					var x=data[j][0]*xscale
					var y=data[j][1]*yscale	
					context.lineTo(x,ymax*yscale-y);
				}
				else {
					done=true;
					break;}

			}
            context.stroke();
        }
    }
    
    function changeSlider(current){
        if (current<imax){ 
            $('#slider').slider('value',current);
            root.find('.time').html(Math.round(current*10)/10);
        }
    }
    
    //triggered on every mouse move
    function sliderTime(){
        var val=$('#slider').slider('value');
        var pausedTime=val*1000;
        offsetTime=pausedTime;
		context.clearRect(0,0,c.width,c.height);
        oneFrame(val);
        changeSlider(val);
    }
    
    //triggered after a user stops sliding
    function sliderStop(event, ui){
        if (paused){ //if it was paused, don't do anything
            return;
        }
        start();
    }
    
    //triggered when user starts sliding
    function sliderStart(event, ui){
        var initialpause=paused;
        pause();
        paused=initialpause;
    }
    
    function start(){
        console.log("starting");
        paused=false;
        initialTime=Date.now()-offsetTime;
        draw=setInterval(graphData,50);
        audio.play();
    }
    
    function pause(){
        console.log("paused");
        paused=true;
        draw=clearInterval(draw);
        audio.pause();
        var pausedTime=Date.now();
        offsetTime=pausedTime-initialTime;
    }
    
    function stop(){
        console.log("stopped");
        paused=true;
        draw=clearInterval(draw);
        audio.pause();
        audio.currentTime=0;
        offsetTime=0;
    }
    
    
    var template="<div class='lecture'>"
        + "<canvas class='video'></canvas>"
        + "<br> <input class='start' type='button' value='start'/>"
        + "<input class='pause' type='button' value='pause'/>"
        + "<input class='stop' type='button' value='stop'/>"
        //+ "<br><input class='timeSlide' type='range' min='0' max='100' step='.1' value='0'/>"
        + "<div id='slider'></div>"
        + "<div class='time'>0</div>"
        + "<audio class='audio' preload='auto'>"
        + "     <source id='lectureAudio' type='audio/mpeg'>"
        + "</audio>"
        + "</div>";
    exports.initialize = function() {
        root = $("<div class='pentimento'></div>").appendTo($('body'));
        root.append(template);
        
        audio=root.find('.audio')[0];
        var source=root.find('#lectureAudio');
        source.attr('src',audioSource).appendTo(source.parent());
        
        $('#slider').slider({
            max:100,
            min:0,
            step:.1,
            range: 'max',
            stop: sliderStop,
            start: sliderStart,
            slide: sliderTime,
            change: function(event,ui){
                if (event.originalEvent) sliderTime(event,ui)}
                    //only call if it was a user-induced change, not program-induced
        });
        
        c=root.find('.video')[0];
        c.height=ymax * contextHeight/ymax;
        c.width=xmax * contextHeight/ymax;
        context=c.getContext('2d');
		context.strokeStyle='black';
		context.lineCap='round';
        
        yscale=(c.height)/ymax;
        xscale=(c.width)/xmax;
        readFile(datafile,getData); //dataPoints now filled with data
        
        root.find('.pause').on('click',pause);
        root.find('.start').on('click',start);
        root.find('.stop').on('click',stop);
    }
    return exports;
};


(function() {
    var createGrapher = function() {
        window.grapher = Grapher(jQuery);
        window.grapher.initialize();
    }

    // Add the CSS file to the HEAD
    var css = document.createElement('link');
    css.setAttribute('rel', 'stylesheet');
    css.setAttribute('type', 'text/css');
    css.setAttribute('href', 'style.css'); // XXX TODO CHANGEME!!
    document.head.appendChild(css);

    if ('jQuery' in window) {
      createGrapher(window.jQuery);
    } else {
        // Add jQuery to the HEAD and then start polling to see when it is there
        var scr = document.createElement('script');
        scr.setAttribute('src',
                    'http://ajax.googleapis.com/ajax/libs/jquery/1.7.1/jquery.min.js');
        document.head.appendChild(scr);
        
        var t = setInterval(function() {
            if ('jQuery' in window) {
                var scr2 = document.createElement('script');
                scr2.setAttribute('src',
                    'http://code.jquery.com/ui/1.10.3/jquery-ui.js');
                document.head.appendChild(scr2);
                clearInterval(t); // Stop polling 
                createGrapher();
            }
        }, 50);
    }
})();


/*
TODO:
-click a stroke to navigate to the time the stroke was drawn
-reorganize data so that you have type of stroke in it
    (so you can do color, highlight, etc)
    
CURRENT BUGS:
*/
