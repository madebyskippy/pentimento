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
    var paused=true;
    var setTime=false; //true if time was set by slider or strokeFinding
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
    
    
    //called when you click on the canvas
    function selectStroke(x,y){
        x=x/xscale;
        y=(c.height-y)/yscale;
        var minDistance=5; //if the point is further than this then ignore it
        var closestPoint={stroke:-1,point:-1,distance:minDistance,time:0};
        var done=false;
        for(var i=0; i<dataPoints.length; i++){
            var currentStroke=dataPoints[i];
            for(var j=0;j<currentStroke.length; j++){
                if (currentStroke[j][2]<currentI){
                    //check closeness of x,y to this current point
                    var dist = getDistance(x,y,currentStroke[j][0],currentStroke[j][1])
                    if (dist<closestPoint.distance){
                        closestPoint.distance=dist;
                        closestPoint.stroke=i;
                        closestPoint.point=j;
                        closestPoint.time=currentStroke[j][2];
                    }
                }else{
                    done=true;
                    break;
                }
            }
            if (done) break;
        }
        
        console.log(closestPoint);
        if (closestPoint.stroke!= -1){ //it found a close enough point
            var time=parseFloat(dataPoints[closestPoint.stroke][0][2]);
            offsetTime=time*1000;
            setTime=true;
            context.clearRect(0,0,c.width,c.height);
            oneFrame(time);
            changeSlider(time);
            audio.currentTime=time;
        }
        if(!paused){ // if it wasn't paused, keep playing
            paused=true; //it only starts if it was previously paused.
            start();
        }
    }
    
    function getDistance(x1,y1,x2,y2){
        return Math.sqrt( (x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
    }
    
    function graphData(){
		context.clearRect(0,0,c.width,c.height);
		currentTime=Date.now(); //gets current time
		currentI=(currentTime/1000.0)-(initialTime/1000.0) //converts to seconds passed
		changeSlider(currentI);
        oneFrame(currentI);
        if (currentI>imax) stop();
	}
    
    function oneFrame(current){
        var done=false;
        for(var i=0; i<dataPoints.length; i++){
			var data = dataPoints[i];
			context.beginPath();
			context.moveTo((data[0][0]*xscale),ymax*yscale-data[0][1]*yscale);
			
			for (var j = 1; j < data.length; j++) {
				if (data[j][2] < current){
					var x=data[j][0]*xscale
					var y=data[j][1]*yscale	
					context.lineTo(x,ymax*yscale-y);
				}else {
                    done=true;
					break;}
			}
            context.stroke();
            if (done) break;
        }
    }
    
    function changeSlider(current){
        if (current<imax){ 
            $('#slider').slider('value',current);
            //current is # of seconds...convert that to minutes & sec
            var secondsPassed=parseFloat(current);
            var minutes=Math.floor(secondsPassed/60);
            var seconds=Math.round((secondsPassed - minutes*60)*10)/10;
            var zeros='';
            if (seconds % 1 === 0 ) zeros='.0';
            root.find('.time').html(minutes+":"+seconds+zeros);
        }
    }
    
    //triggered on every mouse move
    function sliderTime(){
        var val=$('#slider').slider('value');
        var pausedTime=val*1000;
        setTime=true;
        offsetTime=pausedTime;
		context.clearRect(0,0,c.width,c.height);
        oneFrame(val);
        changeSlider(val);
        audio.currentTime=val;
        currentI=val;
    }
    
    //triggered after a user stops sliding
    function sliderStop(event, ui){
        if (paused){ //if it was paused, don't do anything
            return;
        }
        paused=true; //only starts if it was previously paused
        start();
    }
    
    //triggered when user starts sliding
    function sliderStart(event, ui){
        var initialpause=paused;
        pause();
        paused=initialpause;
    }
    
    function start(){
        if(paused){
            paused=false;
            setTime=false;
            initialTime=Date.now()-offsetTime;
            draw=setInterval(graphData,50);
            audio.play();
        }
    }
    
    function pause(){
        paused=true;
        draw=clearInterval(draw);
        audio.pause();
        var pausedTime=Date.now();
        if (!setTime) {
            if (initialTime==null)
                offsetTime=0;
            else
                offsetTime=pausedTime-initialTime;
        }
    }
    
    function stop(){
        paused=true;
        draw=clearInterval(draw);
        audio.pause();
        audio.currentTime=0;
        offsetTime=0;
    }
    
    function resizeControls(vidWidth){
        
        $('.controls').css('width', vidWidth);
        
        var buttonWidths=parseInt((vidWidth/4-20)/3);
        $('.buttons').css('width', vidWidth/4);
        $('.pause').css('width',buttonWidths);
        $('.start').css('width',buttonWidths);
        $('.stop').css('width',buttonWidths);
        $('.pause').css('background-size',buttonWidths);
        $('.start').css('background-size',buttonWidths);
        $('.stop').css('background-size',buttonWidths);
        
        $('.timeControls').css('width',vidWidth/4*3);
        
        $('#slider').css('width',vidWidth/2-10);
        $('#slider').css('margin-top',buttonWidths/2);
        
        $('.time').css('margin-top',buttonWidths/2);
                         
        
        
        oneFrame(currentI);
    }
    
    function resetControlSize(){
        $('.controls').css('width', '575px');
        $('.buttons').css('width', '175px');
        $('.pause').css('width','50px');
        $('.start').css('width','50px');
        $('.stop').css('width','50px');
        $('.pause').css('background-size','50px');
        $('.start').css('background-size','50px');
        $('.stop').css('background-size','50px');
        $('.timeControls').css('width',375);
        $('#slider').css('width','300px');
        $('#slider').css('margin-top','20px');
        $('.time').css('margin-top','20px');
        oneFrame(currentI);
    }
    
    var template="<div class='lecture'>"
        + "<canvas class='video'></canvas>"
        + "<br> <div class='controls'>"
        + "<div class='buttons'>"
        + "<input class='start' type='button'/>"
        + "<input class='pause' type='button'/>"
        + "<input class='stop' type='button'/>"
        + "</div>"
        + "<div class='timeControls'>"
        + "<div id='slider'></div>"
        + "<div class='time'>0</div>"
        + "</div>"
        + "<audio class='audio' preload='auto'>"
        + "     <source id='lectureAudio' type='audio/mpeg'>"
        + "</audio>"
        + "</div>"
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
                if (event.originalEvent) {
                    sliderStart();
                    sliderTime(event,ui);
                    sliderStop();
                    }
                }
                    //only call if it was a user-induced change, not program-induced
        });
        
        var windowWidth=$(document).width();
        var windowHeight=$(document).height();
        var videoDim;
        //fit canvas to window width
            videoDim=windowWidth-125;
            var scaleFactor=xmax;
        console.log(videoDim);
        
        c=root.find('.video')[0];
        c.height=ymax * videoDim/scaleFactor;
        c.width=xmax * videoDim/scaleFactor;
        context=c.getContext('2d');
		context.strokeStyle='black';
		context.lineCap='round';
        
        if (c.width<575) {
            resizeControls(c.width);
        }
        
        yscale=(c.height)/ymax;
        xscale=(c.width)/xmax;
        readFile(datafile,getData); //dataPoints now filled with data
        
        root.find('.pause').on('click',pause);
        root.find('.start').on('click',start);
        root.find('.stop').on('click',stop);
        root.find('.video').on('click',function(event){
            var initialpause=paused;
            pause();
            paused=initialpause;
			var mx=event.pageX;
			var my=event.pageY;
			var offset=root.find('.video').offset(); //array of left and top
			mx=Math.round(mx-offset.left);
			my=Math.round(my-offset.top);
            selectStroke(mx,my);
        });
        
        $(window).on('resize',function(){
            var windowWidth=$(document).width();
            var windowHeight=$(document).height();
            console.log(windowHeight,windowWidth);
            var videoDim;
            //fit canvas to window width
                videoDim=windowWidth-125;
                var scaleFactor=xmax;
            //console.log(windowHeight,windowWidth,videoDim);
            c.height=ymax * videoDim/scaleFactor;
            c.width=xmax * videoDim/scaleFactor;
            yscale=(c.height)/ymax;
            xscale=(c.width)/xmax;
            if (c.width<575) {
                resizeControls(c.width);
            }
            else { resetControlSize(); }
        });
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
        
        //script . onload (do this stuff) instead of doing a setInterval
        
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
-resize window, fill up browser size
    -fit to smaller dimension
    -stroke width
-minimize amount of things you have to put in the actual html
-reorganize data so that you have type of stroke in it
    (so you can do color, highlight, etc)
    
CURRENT BUGS:
    -fits to smallest dimension but the screen isn't square ...
    so when it fits to the height, the width is too long :|
*/
