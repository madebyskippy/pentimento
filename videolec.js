var Grapher = function() {
    exports = {};
    var canvas; //the canvas
    var context;
//    var pdfCanvas;
//    var pdfContext;
    
    var root, controls;
    
    var ymax=800;
    var ymin=0;
    var xmin=0;
    var xmax=1100;
    var yscale;
    var xscale;
    var translateX = 0; //maybe should keep transform as matrix object?
    var translateY = 0;
    var totalZoom = 1;
    var previousX, previousY, previousZoom; //stand-in variables for many things
    var mousePressed = false; //true if mouse has been pressed
    var mouseDragged = false; //true if mouse was pressed then moved
    var dragToPan = true; //true if dragging to pan, false if dragging to zoom
    var startedToPan; //for if user switches modes (lets go of shift) mid-drag
    var zoomRect; //div representing region to zoom in
    var zoomRectW = 0, zoomRectH = 0; //zoom region dimensions
    var offset; //position of canvas
    var scrollBarWidth, scrollBarLeft, scrollBarHeight, scrollBarTop;
    var draggingVertScrollbar = false;
    var draggingHorizScrollbar = false;
    var hoveringOverScrollbars = false;
    var fullscreenMode = false;
    var embedded = false;
    var controlsVisible = true;
    var freePosition = false;
    var animating = false;
    var animateID;
    var discoMode = false;
    var minDistance=15; //if the point is further than this then ignore it
    
    //LIMITS ON THINGS
    var boundingRect = {xmin: 0, xmax: 0, ymin: 0, ymax: 0, width: 0, height: 0};
    var maxZoom = 4, minZoom = 1;
    
    var audio, datafile, audioSource;
    
    var isScreenshot=false; //true when you're getting a screenshot and don't want scroll bars
    
    var furthestpoint=0; // furthest point in seconds
    
    var endTime;	// maximum time value
    
    var currentTime=0; //current index of time (in seconds)
    var initialPause = true; //used in scrubbing
    var draw; // id for requestAnimationFrame/cancelAnimationFrame
    
    var numStrokes=0;
    var dataArray; //the given lecture data
    
    /*************************
    *
    *   Clean up and optimize data for playback
    *
    *************************/
    function preProcess(json) {
        boundingRect.xmax = json.width;
        boundingRect.ymax = json.height;
        
        //for counting overall reduction
        var origVertices = 0;
        var finalVertices = 0;
        
        for(k in json.visuals) {
            //translate colors to RGB values
            var properties = json.visuals[k].properties;
            for(p in properties) {
                var property = properties[p];
                property.red = Math.round(parseFloat(property.red)*255);
                property.blue = Math.round(parseFloat(property.blue)*255);
                property.green = Math.round(parseFloat(property.green)*255);
                property.redFill = Math.round(parseFloat(property.redFill)*255);
                property.blueFill = Math.round(parseFloat(property.blueFill)*255);
                property.greenFill = Math.round(
                    parseFloat(property.greenFill)*255);
            }
            
            //get bounding box, invert y-coordinates
            var stroke = json.visuals[k].vertices;
            for(j in stroke) {
                var point = stroke[j];
                point.y = json.height-point.y;
                if(point.x < boundingRect.xmin) boundingRect.xmin = point.x;
                if(point.x > boundingRect.xmax) boundingRect.xmax = point.x;
                if(point.y < boundingRect.ymin) boundingRect.ymin = point.y;
                if(point.y > boundingRect.ymax) boundingRect.ymax = point.y;
            }
            origVertices += stroke.length;
            
            //remove consecutive points closer than 2px
            var j=0;
            while(j<stroke.length-1 & stroke.length > 10) {
                var point = stroke[j];
                var next = stroke[j+1];
                if(getDistance(point.x, point.y, next.x, next.y) < 2) {
                    stroke.splice(j+1,1);
                }
                else
                    j++;
            }
            
            //amplify noisy low-pressure points at beginning and end
            var clean = false;
            var cleanIndex = 0;
            while(!clean & cleanIndex < stroke.length-1) {
                if(stroke[cleanIndex].pressure < 0.1 | stroke[cleanIndex].pressure < 0.5*stroke[cleanIndex+1].pressure) {
                    stroke[cleanIndex].pressure = stroke[cleanIndex+1].pressure;
                    cleanIndex++;
                }
                else
                    clean = true;
            }
            clean = false;
            cleanIndex = stroke.length-1;
            while(!clean & cleanIndex > 0) {
                if(stroke[cleanIndex].pressure < 0.1 | stroke[cleanIndex].pressure < 0.5*stroke[cleanIndex-1].pressure) {
                    stroke[cleanIndex].pressure = stroke[cleanIndex-1].pressure;
                    cleanIndex--;
                }
                else
                    clean = true;
            }
            
            //straighten straight lines and clean up further
            var begin = stroke[0];
            var end = stroke[stroke.length-1];
            var sumDist = 0;
            var bx = end.x-begin.x;
            var by = end.y-begin.y;
            for(i in stroke) {
                var point = stroke[i];
                var ax = point.x-begin.x;
                var ay = point.y-begin.y;
                var dot = (ax*bx+ay*by)/(bx*bx+by*by);
                var cx = ax-dot*bx;
                var cy = ay-dot*by;
                sumDist += Math.sqrt(cx*cx+cy*cy);
            }
            if(sumDist < getDistance(begin.x,begin.y,end.x,end.y)/10) {
                j=1;
                while(j<stroke.length-1) {
                    var point=stroke[j];
                    var timescale=(point.t-begin.t)/(end.t-begin.t);
                    point.x=timescale*(end.x-begin.x)+begin.x;
                    point.y=timescale*(end.y-begin.y)+begin.y;
                    var prev=stroke[j-1];
                    if(getDistance(point.x,point.y,prev.x,prev.y)<2)
                        stroke.splice(j,1);
                    else
                        j++;
                }
            }
            
            finalVertices += stroke.length;
        }
        console.log(origVertices, finalVertices);
        
        // divide stroke into similar-direction
        // polygons for calligraphy
        for(var i=0; i<json.visuals.length; i++) {
            var visual = json.visuals[i],
                stroke = visual.vertices;
            
            // use law of cosines to find when
            // a stroke breaks across 45degs
            var cosb;
            
            var j=0;
            while(j<stroke.length-1) {
                var point = stroke[j],
                    next = stroke[j+1];
                var ab = getDistance(Math.round(point.x), Math.round(point.y), Math.round(next.x), Math.round(next.y)),
                    bc = getDistance(Math.round(next.x), Math.round(next.y), Math.round(next.x)+5, Math.round(next.y)+5),
                    ac = getDistance(Math.round(point.x), Math.round(point.y), Math.round(next.x)+5, Math.round(next.y)+5);
                if(ab !== 0 & bc !== 0) {
                    var newcosb = (Math.pow(ab,2)+Math.pow(bc,2)-Math.pow(ac,2))/(2*ab*bc);
                    if(!isNaN(newcosb) & Math.abs(newcosb) > 0.3) {
                        if(cosb !== undefined & newcosb/cosb <= 0) {
                            point.break = true;
                        }
                        cosb = newcosb;
                    }
                }
                j++;
            }
        }
        
        // invert y transforms, 
        // set max/min zooms and bounding box based on transforms
        for(i in json.cameraTransforms) {
            var transform = json.cameraTransforms[i];
            transform.ty = -transform.ty;
            if(transform.m11 > maxZoom) maxZoom = transform.m11;
            if(transform.m11 < minZoom) minZoom = transform.m11;
            if(-transform.tx < boundingRect.xmin) boundingRect.xmin = -transform.tx;
            if(-transform.tx > boundingRect.xmax - json.width) boundingRect.xmax = json.width-transform.tx;
            if(-transform.ty < boundingRect.ymin) boundingRect.ymin = -transform.ty;
            if(-transform.ty > boundingRect.ymax - json.height) boundingRect.ymax = json.height-transform.ty;
        }
        boundingRect.width = boundingRect.xmax - boundingRect.xmin;
        boundingRect.height = boundingRect.ymax - boundingRect.ymin;
        minZoom = Math.min(json.width/boundingRect.width,json.height/boundingRect.height);
        numStrokes=json.visuals.length;
        
        // done loading, show player
        $('.lecture').show();
        $('.loadingMsg').remove();
        resizeVisuals();
        
//        pdfCanvas = document.createElement('canvas');
//        pdfCanvas.width = boundingRect.width*maxZoom;
//        pdfCanvas.height = boundingRect.height*maxZoom;
//        pdfContext = pdfCanvas.getContext('2d');
//        pdfContext.drawSvg('http://web.mit.edu/lu16j/www/Advising_Choice_Confirmation.svg', 0 , 0, pdfCanvas.width, pdfCanvas.height);
        
        return json;
    }
    
    /*************************
    *
    *   fills and preprocesses dataArray with data from given .lec file, in JSON format
    *
    *************************/
    function getData(file) {
        dataArray = JSON.parse(file.responseText);
        endTime = dataArray.durationInSeconds;
        xmax=dataArray.width;
        ymax=dataArray.height;
        $('#slider').slider("option","max",endTime);
        $('#totalTime').html("0:00 / "+secondsToTimestamp(endTime));
        dataArray = preProcess(dataArray);
        
        // set player according to localstorage
        if (localStorage[datafile]!==undefined & localStorage[datafile]!=='undefined'){
            if(audio.readyState === 4)
                audioReady();
            else {
                audio.addEventListener('canplay', function() {
                    audioReady();
                });
            }
        }

    }
    function audioReady() {
        audio.currentTime = currentTime;
        displayZoom(totalZoom);
        setFreePosition(freePosition);
        changeSlider(currentTime);
        var percentage = (furthestpoint)/endTime * 100;
        $('.tick').css('width',percentage+'%');
        clearFrame();
        oneFrame(currentTime);
    }

    /*************************
    *
    *   access the .lec file and pass it to getData to process
    *
    *************************/
	function readFile(url, callback) {
		var txtFile = new XMLHttpRequest();
		txtFile.open("GET", url, true);	
		txtFile.onreadystatechange = function() {
			if (txtFile.readyState != 4) {return;}  // document is ready to parse.	
			if (txtFile.status != 200 && txtFile.status != 304) {return;}  // file is found
			callback(txtFile);
		};
		if (txtFile.readyState == 4) return;
		txtFile.send(null);
	}
    
    /*************************
    *   called when you click on the canvas
    *   finds closest stroke to the click point and goes to the beginning of the stroke
    *   if no stroke is found within minDistance, nothing happens
    *************************/
    function selectStroke(x,y){
        x=x/xscale;
        y=y/yscale;
        var closestPoint={stroke:-1,point:-1,distance:minDistance*xscale,time:0};
        var actualfurthest = furthestpoint;
        if(audio.currentTime > furthestpoint)
            furthestpoint = audio.currentTime;
        for(var i=0; i<numStrokes; i++){ //run though all strokes
            var currentStroke=dataArray.visuals[i];
            for(var j=0;j<currentStroke.vertices.length; j++){ //run through all verticies
                var deletedYet=false;
                if (currentStroke.doesItGetDeleted){
                    if (currentStroke.tDeletion<furthestpoint) deletedYet=true;
                }
                if (currentStroke.vertices[j].t<furthestpoint & !deletedYet){
                    //check closeness of x,y to this current point
                    var dist = getDistance(x,y,currentStroke.vertices[j].x,
                                           currentStroke.vertices[j].y)
                    if (dist<closestPoint.distance){ //this point is closer. update closestPoint
                        closestPoint.distance=dist;
                        closestPoint.stroke=i;
                        closestPoint.point=j;
                        closestPoint.time=currentStroke.vertices[j].t;
                    }
                }
            }
        }
        furthestpoint = actualfurthest;
        
        if (closestPoint.stroke!= -1){ //it found a close enough point
            //update current timestep
            var time=parseFloat(dataArray.visuals[closestPoint.stroke].vertices[0].t);
            currentTime = time;
            audio.currentTime = time;
            changeSlider(time);
            
            if(!freePosition) { // animate to playing position of selected stroke
                var newTransform = getTransform(currentTime);
                freePosition = true;
                animateToPos(Date.now(), 500, translateX, translateY, totalZoom, newTransform.tx, newTransform.ty, newTransform.m11, function(){
                    freePosition = false;
                });
            }
            else if(audio.paused) { // draw the frame
                clearFrame();
                oneFrame(currentTime);
            }
        }
    }
    
    /*************************
    *
    *   draw scrollbars on canvas with given transform
    *
    *************************/
    function drawScrollBars(tx, ty, z) {
        context.beginPath();
        context.strokeStyle = 'rgba(0,0,0,0.2)';
        context.lineCap = 'round';
        context.lineWidth = 8;
        scrollBarLeft = (-tx-boundingRect.xmin*xscale*z)/(boundingRect.width*xscale*z)*canvas.width+10;
        scrollBarTop = (-ty-boundingRect.ymin*yscale*z)/(boundingRect.height*yscale*z)*canvas.height+10;
        scrollBarWidth = xmax/boundingRect.width/z*canvas.width-20;
        scrollBarHeight = ymax/boundingRect.height/z*canvas.height-20;
        context.moveTo(scrollBarLeft, canvas.height-10);
        context.lineTo(scrollBarLeft+scrollBarWidth, canvas.height-10);
        context.moveTo(canvas.width-10, scrollBarTop);
        context.lineTo(canvas.width-10, scrollBarTop+scrollBarHeight);
        context.stroke();
    }
    
    /*************************
    *
    *   draw blue box indicating intended playing position
    *
    *************************/
    function drawBox(tx, ty, z) {
        context.beginPath();
        context.strokeStyle = 'rgba(0,0,255,0.1)';
        context.lineCap = 'butt';
        context.lineWidth = 5/z;
        var width = xmax*xscale/z;
        var height = ymax*yscale/z;
        context.moveTo(-tx, -ty);
        context.lineTo(-tx+width, -ty);
        context.lineTo(-tx+width, -ty+height);
        context.lineTo(-tx, -ty+height);
        context.lineTo(-tx, -ty);
        context.stroke();
    }
    
    /*************************
    *
    *   clears canvas and draws scrollbars/box as appropriate
    *
    *************************/
    function clearFrame() {
        // Reset transform for clearing
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        if(discoMode) {
            context.fillStyle = 'rgb('+Math.round(Math.random()*255)+','+Math.round(Math.random()*255)+','+Math.round(Math.random()*255)+')';
            context.fillRect(0,0,canvas.width,canvas.height);
        }
        
        translateX = Math.min(Math.max(translateX,canvas.width-boundingRect.xmax*xscale*totalZoom),-boundingRect.xmin*xscale*totalZoom);
        translateY = Math.min(Math.max(translateY,canvas.height-boundingRect.ymax*yscale*totalZoom),-boundingRect.ymin*yscale*totalZoom);
        totalZoom = Math.min(maxZoom, Math.max(totalZoom, minZoom));
        
//        if(pdfCanvas !== undefined) {
//            var ratio = canvas.width/pdfCanvas.width;
//            context.drawImage(pdfCanvas,translateX,translateY,canvas.width*totalZoom,pdfCanvas.height*ratio*totalZoom);
//        }
        
        // Draw scrollbars when appropriate
        if((audio.paused | freePosition | hoveringOverScrollbars) & totalZoom !== minZoom & !isScreenshot) {
            drawScrollBars(translateX, translateY, totalZoom);
        }
        
        // Restore the transform
        context.setTransform(totalZoom,0,0,totalZoom,
                             translateX,translateY);
        
        // Draw indicator box when appropriate
        if(freePosition) {
            freePosition = false;
            var box = getTransform(audio.currentTime);
            drawBox(box.tx, box.ty, box.m11);
            freePosition = true;
        }
    }
    
    /*************************
    *
    *   returns distance between two points
    *
    *************************/
    function getDistance(x1,y1,x2,y2){
        return Math.sqrt( (x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
    }
    
    /*************************
    *
    *   fetches the current camera transform from data
    *
    *************************/
    function getTransform(time) {
        if(!freePosition) {
            var newTransform = {};
            
            var cameraChanges = dataArray.cameraTransforms;
            var nextTransform = cameraChanges[cameraChanges.length-1];
            var previousTransform = cameraChanges[0];
            for(var i=0; i< cameraChanges.length; i++){
                var currentTransform = cameraChanges[i];
                if (currentTransform.time < time & currentTransform.time > previousTransform.time) {
                    previousTransform = currentTransform;
                }
                if(currentTransform.time > time & currentTransform.time < nextTransform.time) {
                    nextTransform = currentTransform;
                }
            }
            newTransform = $.extend(true,{},previousTransform);
            if (nextTransform.time !== previousTransform.time) {
                var interpolatedTime = (time - previousTransform.time)/(nextTransform.time - previousTransform.time);
                newTransform.m11 = previousTransform.m11+(nextTransform.m11 - previousTransform.m11)*interpolatedTime;
                newTransform.tx = previousTransform.tx+(nextTransform.tx - previousTransform.tx)*interpolatedTime;
                newTransform.ty = previousTransform.ty+(nextTransform.ty - previousTransform.ty)*interpolatedTime;
            }
            newTransform.tx = newTransform.tx/newTransform.m11*xscale;
            newTransform.ty = newTransform.ty/newTransform.m11*yscale;
            
            return newTransform;
        }
        else
            return {tx: translateX, ty: translateY, m11: totalZoom};
    }
    
    /*************************
    *
    *   playback function -
    *   updates progress bar, canvas, and indicators
    *
    *************************/
    function graphData(){
		currentTime=audio.currentTime;
		changeSlider(currentTime);
        
        if(!freePosition) { // follows camera transform if focused
            var newTransform = getTransform(currentTime);
            totalZoom = newTransform.m11;
            translateX = newTransform.tx;
            translateY = newTransform.ty;
            displayZoom(totalZoom);
        }
        clearFrame();
        oneFrame(currentTime);
        draw = window.requestAnimationFrame(graphData);
	}
    
    /*************************
    *
    *   Draws each stroke in calligraphic style,
    *   breaking polygons and reversing draw order as needed to avoid overlap
    *   each point = [x, y, pressure, (whetherToReverse)]
    *
    *************************/
    function calligraphize(startIndex, path, reversed) {
        if(startIndex === 0)
            context.beginPath();
        var point = path[startIndex];
        var endIndex = path.length-1;
        context.moveTo(point[0]+point[2],point[1]-point[2]);
        for(var i=startIndex+1; i<path.length-1; i++) {
            point = path[i];
            if(point[3]) { // 
                endIndex = i+1;
                i = path.length-2;
            }
            if(reversed)
                context.lineTo(point[0]-point[2],point[1]+point[2]);
            else
                context.lineTo(point[0]+point[2],point[1]-point[2]);
        }
        for(var i=endIndex; i>=startIndex; i--) {
            point = path[i];
            if(reversed)
                context.lineTo(point[0]+point[2],point[1]-point[2]);
            else
                context.lineTo(point[0]-point[2],point[1]+point[2]);
        }
        point = path[startIndex];
        context.lineTo(point[0]+point[2],point[1]-point[2]);
        if(endIndex !== path.length-1)
            calligraphize(endIndex-1, path, !reversed);
        else {
            context.stroke();
            context.fill();
        }
    }
    
    /*************************
    *
    *   draws current frame on canvas
    *
    *************************/
    function oneFrame(current){
        
        var actualfurthest = furthestpoint;
        if(furthestpoint < current)
            furthestpoint = current;
        
        for(var i=0; i<numStrokes; i++){ //for all strokes
            var currentStroke = dataArray.visuals[i];
            var tmin = currentStroke.tMin;
            var deleted=false;
            
            if(tmin < furthestpoint){
                var data = currentStroke.vertices;
             
                var path = [];
                var graypath = []; // in case half the stroke is grayed out
                
                //process the properties
                var properties= currentStroke.properties;
                for(var k=0; k< properties.length; k++){ //for all properties of the stroke
                    var property=properties[k];
                    if (property.time < furthestpoint) { //if property is to be shown
                        var fadeIndex = 1;
                        if(property.type === "fadingProperty") { //calculate fade rate
                            var timeBeginFade = currentStroke.tDeletion+
                                property.timeBeginFade;
                            var fadeDuration = property.durationOfFade;
                            fadeIndex -= (current-timeBeginFade)/fadeDuration;
                            if(fadeIndex < 0)
                                deleted = true;
                        }
                        if(property.type === "basicProperty") { //normal property
                            if(currentStroke.tDeletion < current)
                                deleted = true;
                        }
                        
                        if(!deleted || !currentStroke.doesItGetDeleted) { //add properties
                            context.fillStyle="rgba("+property.redFill+","+property.greenFill+
                                              ","+property.blueFill+","+(property.alphaFill*fadeIndex)+")";
                            
                            context.strokeStyle="rgba("+property.red+","+property.green+
                                              ","+property.blue+","+(property.alpha*fadeIndex)+")";
                            
                            if(discoMode) {
                                context.fillStyle = 'rgb('+Math.round(Math.random()*255)+','+
                                    Math.round(Math.random()*255)+','+Math.round(Math.random()*255)+')';
                                context.strokeStyle = 'rgb('+Math.round(Math.random()*255)+','+
                                    Math.round(Math.random()*255)+','+Math.round(Math.random()*255)+')';
                            }
                            
                            context.lineWidth = property.thickness*xscale/10;
                            
                            if(tmin > current) { //grey out strokes past current time
                                context.fillStyle = "rgba(100,100,100,0.1)";
                                context.strokeStyle = "rgba(50,50,50,0.1)";
                                if(currentStroke.tDeletion < furthestpoint)
                                    deleted = true;
                            }
                        }
                    }
                }
                
                //draw the actual stroke
                if (!deleted || !currentStroke.doesItGetDeleted){
                    for (var j = 0; j < data.length; j++) { //for all verticies
                        var x=data[j].x*xscale;
                        var y=data[j].y*yscale;
                        var pressure = data[j].pressure;
                        var breaking = data[j].break;
                        if (data[j].t < current | tmin > current & data[j].t < furthestpoint){
                            path.push([x,y,pressure*context.lineWidth*3,breaking]);
                        }
                        else if(data[j].t < furthestpoint & data[j].t > current)
                            graypath.push([x,y,pressure*context.lineWidth*3,breaking]);
                    }
                    if(path.length > 0)
                        calligraphize(0, path, false);
                    if(graypath.length > 0) {
                        context.fillStyle = "rgba(100,100,100,0.1)";
                        context.strokeStyle = "rgba(50,50,50,0.1)";
                        calligraphize(0, graypath, false);
                    }
                }
            }
        }
        
        furthestpoint = actualfurthest;
    }
    
    /*************************
    *
    *   translates seconds into minutes:seconds
    *   returns string
    *************************/
    function secondsToTimestamp(totalseconds){
        var minutes=Math.floor(totalseconds/60);
        var seconds=Math.round(totalseconds - minutes * 60);
        var zeros='';
        if (seconds < 10) zeros='0'; //adds zero for stuff like 01, 02 , etc
        return minutes +":"+zeros+seconds;
    }
    
    /*************************
    *
    *   updates progress slider as video plays
    *   updates furthestpoint
    *************************/
    function changeSlider(current){
        if (current<=endTime){ 
            //updates progress bar
            $('#slider').slider('value',current);
            
            //update furthest time bar
            if (current > furthestpoint) {
                furthestpoint=current;
                var percentage = (furthestpoint)/endTime * 100;
                $('.tick').css('width',percentage+'%');
            }
            
            //updates time display
            var secondsPassed=parseFloat(current);
            root.find('.time').html(secondsToTimestamp(secondsPassed));
            root.find('#totalTime').html(secondsToTimestamp(secondsPassed)+" / ");
            root.find('#totalTime').append(secondsToTimestamp(endTime));
            
            //updates localstorage
            var local = {'currentTime': parseFloat(current), 
                         'furthestPoint': parseFloat(furthestpoint),
                         'tx': translateX, 'ty': translateY, 'tz': totalZoom, 'free': freePosition};
            localStorage[datafile]=JSON.stringify(local);
        }
    }
    
    /*************************
    *
    *   triggered on scrubbing
    *   sets player to scrubbed time
    *************************/
    function sliderTime(){
        var val=$('#slider').slider('value');
        currentTime=val;
        
        var newTransform = getTransform(currentTime);
        totalZoom = newTransform.m11;
        translateX = newTransform.tx;
        translateY = newTransform.ty;
        displayZoom(totalZoom);
        clearFrame();
        oneFrame(val);
        changeSlider(val);
    }
    
    /*************************
    *
    *   triggered when done scrubbing
    *   returns to playing if was playing
    *************************/
    function sliderStop(event, ui){
        audio.currentTime=ui.value;
        if (initialPause){ //if it was paused, don't do anything
            return;
        }
        if (ui.value == endTime){ //if scrubbed to end
            stop();
            return;
        }
        audio.play();
    }
    
    /*************************
    *
    *   triggered when starting to scrub
    *   temporarily pauses lecture
    *************************/
    function sliderStart(event, ui){
        initialPause=audio.paused;
        audio.pause();
    }
    
    /*************************
    *
    *   triggered when user uses scrolling to zoom
    *   currently over-modularized in case we want zoom slider back
    *************************/
    function zoomStart() { // originally called on zoom slider start
        previousX = translateX;
        previousY = translateY;
        previousZoom = totalZoom;
    }
    function zooming(event, ui) { // originally called on zoom slider slide
        totalZoom = Math.max(minZoom, Math.min(ui.value, maxZoom));
        displayZoom(totalZoom);
        
        //zoom in on center of visible portion achieved by extra translations
        translateX = previousX + (1-totalZoom/previousZoom)*(canvas.width/2-previousX);
        translateY = previousY + (1-totalZoom/previousZoom)*(canvas.height/2-previousY);
        if(audio.paused) {
            clearFrame();
            oneFrame(audio.currentTime);
        }
    }
    
    
    /*************************
    *
    *   sets side button indicators according to zoom
    *
    *************************/
    function displayZoom(newZoom){
        var initialFree = freePosition;
        freePosition = false;
        var zoom = getTransform(audio.currentTime).m11;
        freePosition = initialFree;
        $('#zoomIn').css({'-webkit-transform':newZoom>zoom?'scale(2) rotate(180deg)':'scale(1) rotate(0deg)',
                          'transform':newZoom>zoom?'scale(2) rotate(180deg)':'scale(1) rotate(0deg)'});
        $('#zoomIn').find('img').css('opacity',newZoom===maxZoom?0.1:1);
        $('#zoomOut').css({'-webkit-transform':newZoom<zoom?'scale(2) rotate(180deg)':'scale(1) rotate(0deg)',
                           'transform':newZoom<zoom?'scale(2) rotate(180deg)':'scale(1) rotate(0deg)'});
        $('#zoomOut').find('img').css('opacity',newZoom===minZoom?0.1:1);
        $('#seeAll').find('img').css('opacity',newZoom===minZoom?0.1:1);
    }
    
    /*************************
    *
    *   translates canvas by dx, dy
    *
    *************************/
    function pan(dx, dy) {
        translateX += dx;
        translateY += dy;
        if(audio.paused) {
            clearFrame();
            oneFrame(audio.currentTime);
        }
    }
    
    /*************************
    *
    *   mouse pressed
    *
    *************************/
    function mouseDown(e) {
        mousePressed = true;
        previousX = e.pageX;
        previousY = e.pageY;
        
        draggingHorizScrollbar = false, draggingVertScrollbar = false;
        if(previousX > offset.left+canvas.width-25)
            draggingVertScrollbar = true;
        else if(previousY > offset.top+canvas.height-25)
            draggingHorizScrollbar = true;
        
        mouseDragged = false;
        startedToPan = dragToPan;
        if(!dragToPan) { // initialize zoom rectangle
            zoomRect.css({visibility: 'visible', top: previousY, left: previousX});
        }
        
        if(fullscreenMode) toggleControlsVisibility(previousY);
    }
    
    
    /*************************
    *
    *   mouse moved
    *
    *************************/
    function mouseMove(e) {
        var x = e.pageX,
            y = e.pageY;
        if(mousePressed) { // dragging motion
            if(!freePosition)
                setFreePosition(true);
            mouseDragged = true;
            if(startedToPan) { // in panning mode
                var newTx = (x-previousX);
                var newTy = (y-previousY);
                if(draggingVertScrollbar)
                    pan(0, -newTy*boundingRect.height/ymax*totalZoom);
                else if(draggingHorizScrollbar)
                    pan(-newTx*boundingRect.width/xmax*totalZoom, 0);
                else
                    pan(newTx, newTy);
                previousX = x;
                previousY = y;
            }
            else { // in zoom rectangle mode
                zoomRectW = Math.max(offset.left, Math.min(x, offset.left+canvas.width))-previousX;
                zoomRectH = Math.max(offset.top, Math.min(y, offset.top+canvas.height))-previousY;
                if(zoomRectW < 0) {
                    zoomRect.css('left', previousX+zoomRectW);
                    zoomRectW *= -1;
                }
                if(zoomRectH < 0) {
                    zoomRect.css('top', previousY+zoomRectH);
                    zoomRectH *= -1;
                }
                if(zoomRectW/zoomRectH > canvas.width/canvas.height) //maintains aspect ratio of zoom region
                    zoomRectH = canvas.height/canvas.width*zoomRectW;
                else
                    zoomRectW = canvas.width/canvas.height*zoomRectH;
                if(audio.paused) {
                    clearFrame();
                    oneFrame(audio.currentTime);
                }
                zoomRect.css({width: zoomRectW, height: zoomRectH});
                if(canvas.width/zoomRectW*totalZoom < maxZoom)
                    zoomRect.css('background-color', 'rgba(0,255,0,0.1)');
                else
                    zoomRect.css('background-color', 'rgba(255,0,0,0.1)');
            }
        }
        else { // non-dragging mouse move
            if(fullscreenMode) toggleControlsVisibility(y);
            
            if(!audio.paused &
               ((x > offset.left+canvas.width-25 & x < offset.left+canvas.width & y > offset.top & y < offset.top+canvas.height) |
                (y > offset.top+canvas.height-25 & y < offset.top+canvas.height & x > offset.left & x < offset.left+canvas.width)))
                hoveringOverScrollbars = true;
            else
                hoveringOverScrollbars = false;
        }
    }
    
    /*************************
    *
    *   mouse released
    *
    *************************/
    function mouseUp() {
        mousePressed = false;
        
        if(!startedToPan & mouseDragged) { // if zoom region selected
            var nz = canvas.width/Math.abs(zoomRectW/totalZoom);
            if(nz < maxZoom) {
                var nx = -(zoomRect.position().left - offset.left - translateX)/totalZoom*nz;
                var ny = -(zoomRect.position().top - offset.top - translateY)/totalZoom*nz;
                animateToPos(Date.now(), 500, translateX, translateY, totalZoom, nx, ny, nz);
            }
            else if(audio.paused) {
                clearFrame();
                oneFrame(audio.currentTime);
            }
            zoomRectW = 0;
            zoomRectH = 0;
            zoomRect.css({visibility: 'hidden', height: 0, width: 0});
        }
        
        if(!mouseDragged) { // if clicked
            previousX=Math.round((previousX-offset.left-translateX)/totalZoom);
            previousY=Math.round((previousY-offset.top-translateY)/totalZoom);
            selectStroke(previousX,previousY);
        }
    }
    
    /*************************
    *
    *   show/hide playback controls depending on mouse position
    *
    *************************/
    function toggleControlsVisibility(y) {
        if(!controlsVisible & y > $(window).height()-5)
            animateControls(true);
        if(controlsVisible & y < $(window).height()-controls.outerHeight(true)-20)
            animateControls(false);
    }
    
    /*************************
    *   in fullscreen mode,
    *   animate playback controls in/out of bottom
    *
    *************************/
    function animateControls(show) {
        if(show) {
            controls.animate({top: (canvas.height-controls.outerHeight(true))},200);
            controlsVisible = true;
        }
        else {
            controls.animate({top: canvas.height},200);
            controlsVisible = false;
        }
    }
    
    /*************************
    *
    *   animate canvas from transform{tx,ty,tz} to transform{nx,ny,nz}
    *   (x,y = translation, z = zoom)
    *   callback = a function
    *   bounded = whether transform is within bounds
    *************************/
    function animateToPos(startTime, duration, tx, ty, tz, nx, ny, nz, callback, bounded) {
        clearTimeout(animateID);
        animating = true;
        displayZoom(nz);
        
        if(bounded===undefined) {
            nz = Math.min(Math.max(nz,minZoom),maxZoom);
            nx = Math.min(Math.max(nx,canvas.width-boundingRect.xmax*xscale*nz),-boundingRect.xmin*xscale);
            ny = Math.min(Math.max(ny,canvas.height-boundingRect.ymax*yscale*nz),-boundingRect.ymin*yscale);
        }
        
        var interpolatedTime = Math.pow((Date.now() - startTime)/duration-1,5)+1; // quintic easing
        
        if(Date.now()-startTime > duration | (tx === nx & ty === ny & tz === nz)) {
            animating = false;
            translateX = nx, translateY = ny, totalZoom = nz;
            if(callback !== undefined)
                callback();
            if(audio.paused) {
                clearFrame();
                oneFrame(audio.currentTime);
            }
        }
        else {
            totalZoom = tz + (nz - tz)*interpolatedTime;
            translateX = tx + (nx - tx)*interpolatedTime;
            translateY = ty + (ny - ty)*interpolatedTime;
            
            if(audio.paused) {
                clearFrame();
                oneFrame(audio.currentTime);
            }
            
            animateID = setTimeout(function() {
                animateToPos(startTime, duration, tx, ty, tz, nx, ny, nz, callback, true);
            }, 33);
        }
    }
    
    /*************************
    *
    *   begins visual playback
    *
    *************************/
    function start(){
        root.find('.start').css('background-image',
            "url('images/pause.png')");
        $('#slider .ui-slider-handle').css('background','#0b0');
        root.find('.video').css('border','1px solid #eee');
        
        $('#pauseIcon').attr("src",'images/play.png');
        fadeSign('images/pause.png');
        
        window.cancelAnimationFrame(draw);
        draw = window.requestAnimationFrame(graphData);
    }
    
    /*************************
    *
    *   pauses visual playback
    *
    *************************/
    function pause(){
        $('#timeStampURL').attr("disabled",false);
        $('#screenshotURL').attr("disabled",false);
        root.find('.start').css('background-image',
            "url('images/play.png')");
        $('#slider .ui-slider-handle').css('background','#f55');
        root.find('.video').css('border','1px solid #f88');
        
        $('#pauseIcon').attr("src",'images/pause.png');
        fadeSign('images/play.png');
        
        window.cancelAnimationFrame(draw);
        
        clearFrame();
        oneFrame(audio.currentTime);
    }
    
    /*************************
    *
    *   stops visual playback, resets furthestpoint and localstorage
    *
    *************************/
    function stop(){
        window.cancelAnimationFrame(draw);
        
        localStorage.removeItem(datafile);
        
        root.find('.start').css('background-image',
            "url('images/play.png')");
        $('#slider .ui-slider-handle').css('background','#f55');
        root.find('.video').css('border','1px solid #f88');
        
        furthestpoint=0;
    }
    
    /*************************
    *
    *   animates onscreen play/pause indicator
    *
    *************************/
    function fadeSign(nextImg){
        $('.onScreenStatus').stop();
        $('.onScreenStatus').css('visibility',"visible");
        $('.onScreenStatus').css('opacity',".5");
        $('.onScreenStatus').animate({
            opacity: 0
        },750,function(){ //function that executes once the animation finishes
            $('.onScreenStatus').css('visibility',"hidden");
            $('.onScreenStatus').css('opacity',".5");
            $('#pauseIcon').attr('src',nextImg);
        });
    }
    
    /*************************
    *
    *   resizes playback controls
    *
    *************************/
    function resizeControls(vidWidth){
        if(fullscreenMode)
            vidWidth = $(window).width();
        controls.css('width', vidWidth);
        
        //set the control buttons
        var bigButtonWidths=Math.round(vidWidth* 50 / 575);
        var smallButtonWidths=Math.round(vidWidth* 30/575);
        if (bigButtonWidths > 50 ) { //sets large button size max at 50
            bigButtonWidths=50;
            smallButtonWidths=30;
        }
        var totalButtonWidth=bigButtonWidths+smallButtonWidths*2+15;
        $('.buttons').css('width', totalButtonWidth);
        $('.start').css('width',bigButtonWidths);
        $('.start').css('background-size',bigButtonWidths);
        $('.buttons button').css('width',smallButtonWidths);
        $('.buttons button').css('height',smallButtonWidths);
        $('.buttons button').css('background-size',smallButtonWidths-4);
        $('.buttons button').css('margin-top',smallButtonWidths/2-2);
        $('.speedUp').css('margin-left',smallButtonWidths+4);
        $('.help').css('width',bigButtonWidths);
        $('.help').css('height',bigButtonWidths);
        $('.help').css('margin-top','3px');
        $('.help').css('background-size',bigButtonWidths);
        $('.help').css('left',vidWidth-bigButtonWidths);
        
        //set volume button and slider
        var volWidth= vidWidth * 30/575;
        if (volWidth > 30) volWidth=30; //max size of vol button is 30
        $('.volume').css('width',volWidth);
        $('.volume').css('height',volWidth);
        $('.volume').css('background-size',volWidth);
        $('.volume').css('margin-top',bigButtonWidths/2 - volWidth/2+3);
        $('.volumeSlider').position({
            my: 'left center',
            at: 'right+10 center',
            of: $('.volume'),
        });
        var volSliderWidth=vidWidth * 50/575
        if (volSliderWidth>100) volSliderWidth=100; //max size of slider is 100
        if (volSliderWidth<30) volSliderWidth=30; //min size of slider is 30
        $('.volumeSlider').css('width',volSliderWidth);
        
        //sets video slider and timestamps
        var timeControlWidth=Math.round(vidWidth)-totalButtonWidth-volWidth-5;
        $('.timeControls').css('width',timeControlWidth);
        $('.timeControls').css('margin-left',totalButtonWidth);
        $('#slider').css('width',vidWidth);
        $('#totalTime').css('margin-top',bigButtonWidths/2-5);
        
        //sets the drag toggle controls and the current URL button
        var fontSize='';
        var urlText="current URL";
        if (vidWidth < 500) { //shrink font size if the canvas is too small
            fontSize='10px';
            urlText="URL";
        }
        $('.toggleControls').css('font-size',fontSize);
        $('.toggleControls').css('margin-top',bigButtonWidths/2-10);
        
        displayZoom(totalZoom);
        
        clearFrame();
        oneFrame(audio.currentTime);
    }
    
    /*************************
    *
    *   resizes player components depending on mode
    *
    *************************/
    function resizeVisuals(){
        var windowWidth=$(window).width();
        var windowHeight=$(window).height();
        var videoDim;
        //fit canvas to window width
        if (windowWidth>(windowHeight+150)){//take smaller of the two
            //add 150 to get correct aspect ratio
            videoDim=(windowHeight-200); //200 allows for bottom controls
            if (videoDim< parseInt(400 * ymax/xmax)) { //min width of video is 400
                videoDim=parseInt(400* ymax/xmax);
            }
            var scaleFactor=ymax; //using height to scale
        }
        else {
            videoDim=windowWidth-185; //185 allows for side controls
            if (videoDim<400) videoDim=400; //min width of video is 400
            var scaleFactor=xmax; //using width to scale
        }
        
        if(fullscreenMode | embedded) { // take up all available space
            $('body').css('padding',0);
            root.find('.menulink').hide();
            root.find('.pentimentoDialog').hide();
            if(fullscreenMode) {
                canvas.height = windowHeight;
                canvas.width = xmax/ymax*canvas.height;
                if(canvas.width > windowWidth) {
                    canvas.width = windowWidth;
                    canvas.height = ymax/xmax*canvas.width;
                }
            }
            else {
                canvas.height = windowHeight-controls.outerHeight(true);
                canvas.width = xmax/ymax*canvas.height;
            }
            $('.lecture').css({height: canvas.height,
                               width: canvas.width,margin: embedded?0:'auto auto'});
            controls.css({position: 'absolute',
                                top: ((windowHeight-controls.outerHeight(true))+'px'),
                                left: 0,
                                'background-color':fullscreenMode?'rgba(245,245,245,0.9)':''});
        }
        else {
            $('body').css('padding','');
            root.find('.menulink').show();
            root.find('.pentimentoDialog').show();
            canvas.height=ymax * videoDim/scaleFactor;
            canvas.width=xmax * videoDim/scaleFactor;
            $('.lecture').css({height: 'auto',
                               width: 'auto'});
            controls.css({position: 'absolute',
                                top: (($('.video').offset().top+
                                       $('.video').height()+10)+'px'),
                                left: ($('.video').offset().left+'px'),
                                'background-color':''});
            $('.sideButtons').css('opacity',1);
            $('.pentimentoDialog').css('left',canvas.width-$('.pentimentoDialog').width()-$('.menulink').width());
        }
        
        $('.captions').css('width',canvas.width);
        $('.captions').css('top',$('.controls').offset().top - 50 + 'px');
        $('.speedDisplay').css('top', -45 + 'px');
        var fontsize = canvas.width * 30/575;
        if (fontsize > 30 ) fontsize=30; //max font size 30
        $('.speedDisplay').css('font-size', fontsize+'px');
        
        yscale=(canvas.height)/ymax;
        xscale=(canvas.width)/xmax;
        offset = root.find('.video').offset();
        resizeControls(canvas.width);
        
        var onScreenStatusWidth=canvas.width * 80/575;
        $('.onScreenStatus').css('margin-top', -canvas.height/2-onScreenStatusWidth/2);
        $('.onScreenStatus').css('margin-left',canvas.width/2-onScreenStatusWidth/2);
        $('#pauseIcon').css('width',onScreenStatusWidth+"px");
        $('#pauseIcon').css('height',onScreenStatusWidth+"px");
        $('.onScreenStatus').css('opacity',".5");
        $('.onScreenStatus').css('visibility',"hidden");
        
        var sideIncrement = fullscreenMode?canvas.height/7:canvas.height/6;
        var transBtnDim = sideIncrement/2;
        $('.sideButtons').css({top: (offset.top),
                               left: (fullscreenMode?windowWidth-sideIncrement-2:offset.left+canvas.width+(embedded?0:10)),
                               height: (transBtnDim*7),
                               width:sideIncrement,
                               'border-radius':transBtnDim,
                               background:'rgba(235,235,235,'+(fullscreenMode?'0.1':'0.3')+')'});
        $('.transBtns').css({height:transBtnDim,
                             width:transBtnDim,
                             margin:transBtnDim/2,
                             'margin-bottom':0});
        $('#zoomOut').css('margin-bottom',transBtnDim);
        $('.URLinfo').css({left: parseInt($('#timeStampURL').position().left,10) - parseInt($('.URLinfo').css('width'),10),
                           top: parseInt($('#timeStampURL').position().top,10),
                           'border-right-width': transBtnDim+20,height:sideIncrement});
    }
    
    /*************************
    *   custom mouse event handler
    *   distinguishes between and mutually excludes touch/mouse events
    *   distinguishes between and mutually excludes single/double-click events
    *************************/
    function doubleClickHandler(input) {
        var element = input.element;
        var down = input.down;
        var move = input.move;
        var up = input.up;
        var double = input.double;
        var tolerance = input.tolerance;
        var doubled = false;
        function offClick() {
            element.off('mouseup mousedown mousemove');
        }
        function offTap() {
            element.off('touchstart touchmove touchend');
        }
        function onClick() {
            element.on('mouseup', listenClick);
            element.on('mousedown', function(e) {
                e.preventDefault();
                e.stopPropagation();
                down(e);
            });
            element.on('mousemove', move);
        }
        function on() {
            setTimeout(onClick,tolerance*4);
            element.on('touchstart', function(e) {
                offClick();
                down(e.originalEvent.touches[0]);
            });
            element.on('touchmove', function(e) {
                e.preventDefault();
                e.stopPropagation();
                offClick();
                move(e.originalEvent.touches[0]);
            });
            element.on('touchend', function(e) {
                offClick();
                listenTap(e);
                setTimeout(onClick,tolerance*4);
            });
        }
        function listenClick(e) {
            offClick();
            doubled = false;
            var click = setTimeout(function() {
                up();
                element.off('mouseup');
                on();
            },tolerance);
            element.on('mouseup', function() {
                clearTimeout(click);
                double(e, e.target);
                doubled = true;
                element.off('mouseup');
                on();
            });
        }
        function listenTap(e) {
            offTap();
            doubled = false;
            var tap = setTimeout(function() {
                offClick();
                up();
                element.off('touchend');
                on();
            },tolerance);
            element.on('touchend', function() {
                offClick();
                clearTimeout(tap);
                double(e.originalEvent.changedTouches[0], e.target);
                doubled = true;
                element.off('touchend');
                on();
            });
        }
        on();
    }
    
    /*************************
    *
    *   toggle fullscreen mode
    *
    *************************/
    function setFullscreenMode(on) {
        fullscreenMode = on;
        try {
            if(on)  root[0].requestFullScreen();
            else    document.cancelFullScreen();
        } catch(e) {}
        root.find('#fullscreen').find('img').attr('src', fullscreenMode?"images/exitfs.png":"images/fs.png");
        root.find('#fullscreen').attr('title', fullscreenMode?'Exit Fullscreen (ESC)':'Fullscreen (F)');
        root.find('.help').css('visibility',fullscreenMode?'hidden':'visible');
        resizeVisuals();
    }
    
    /*************************
    *
    *   styles playback speed indicators
    *
    *************************/
    function speedIndicators(){
        $('.speedDisplay').text(Math.round(audio.playbackRate/1*100)/100 +" x");
        if (audio.playbackRate>1){
            $('.speedUp').css('opacity','.7');
            $('.slowDown').css('opacity','');
        } else if (audio.playbackRate < 1){
            $('.slowDown').css('opacity','.7');
            $('.speedUp').css('opacity','');
        } else {
            $('.speedDisplay').text("");
            $('.slowDown').css('opacity','');
            $('.speedUp').css('opacity','');
        }
    }
    
    /*************************
    *
    *   gets parameter [name] from url [data]
    *   or -100 if does not exist
    *************************/
    function getURLParameter(name,data) {
        return decodeURI(
            (RegExp('[?|&]'+name + '=' + '(.+?)(&|$)').exec(data)||[,-100])[1]
        );
    }
    
    /*************************
    *
    *   toggle focused lecture/free board exploration
    *
    *************************/
    function setFreePosition(free) {
        freePosition = free;
        $('#revertPos').find('img').css('opacity',free?1:0.1);
    }
    
    /*************************
    *
    *   animated zoom when using side buttons
    *
    *************************/
    function animateZoom(nz) {
        var nx = translateX + (1-nz/totalZoom)*(canvas.width/2-translateX);
        var ny = translateY + (1-nz/totalZoom)*(canvas.height/2-translateY);
        setFreePosition(true);
        animateToPos(Date.now(), 500, translateX, translateY, totalZoom, nx, ny, nz);
    }
    
    /*************************
    *
    *   HTML template
    *
    *************************/
    var template="<a class='menulink' href='index.html'>back to menu</a><div class='lecture'>"
        + "<canvas class='video'></canvas>"
        + "<div class='onScreenStatus'> <img src='images/pause.png' id='pauseIcon' width='0px' height='0px'> </div>"
        + "<br> <div class='captions'>test captions</div>"
        + "<div class='controls'>"
        + " <div id='slider'></div>"
        + " <div class='buttons'>"
        + "     <input class='start' type='button'/>"
        + " </div>"
        + " <div id='totalTime'></div>"
        + " <button class='volume'></button>"
        + " <div class='volumeSlider'></div>"
        + "<audio class='audio' preload='auto'>"
        + "     <source id='lectureAudio' type='audio/mpeg'>"
        + "     <source id='lectureAudioOgg' type='audio/ogg'>"
        + "</audio>"
        + "</div>"
        + "<div class='zoomRect'></div>"
        + "<div id='description-dialog'>"
        + "     <h3><img src='images/penti.png'></img> Pentimento Player</h3>"
        + "     <ul><li>Click on a stroke to go to that point in the video</li>"
        + "     <li>Drag, scroll, or use arrow keys to pan around</li>"
        + "     <li>Shift-Scroll to zoom</li>"
        + "     <li>Shift-Arrow Key to pan faster</li>"
        + "     <li>Keyboard shortcuts appear on hover</li>"
        + "</ul></div>"
        + "</div>"
    ;
    
    /*************************
    *
    *   called on load
    *
    *************************/
    exports.initialize = function() {
        $(window).off('doubleclick');
        
        // define global variables
        root=$('.pentimento');
        root.append(template);
        zoomRect = root.find('.zoomRect');
        controls = root.find('.controls');
        $('.lecture').hide(); //hide until all data loaded
        root.append("<br/><div class='loadingMsg'>loading ... </div>");
        canvas=root.find('.video')[0];
        context=canvas.getContext('2d');
        $('.toggleControls').hide();
        
        // generalizes vendor-prefixed functions
        window.requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;
        window.cancelAnimationFrame = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame;
        document.cancelFullScreen = document.cancelFullScreen || document.webkitCancelFullScreen || document.mozCancelFullScreen;
        root[0].requestFullScreen = root[0].requestFullScreen || root[0].webkitRequestFullScreen || root[0].mozRequestFullScreen;
        
        // fetch data from URL
        var filename=getURLParameter('n',location.search);
        var t=getURLParameter('t',location.search);
        var end=getURLParameter('end',location.search);
        embedded = getURLParameter('embed',location.search)==1;
        var tm = JSON.parse(getURLParameter('tm',location.search));
        
        datafile="lectures/"+filename+".lec";
        audioSource="lectures/"+filename+".mp3";
        $(document).find('title').html(filename);
        
        // set up audio
        
        audio=root.find('.audio')[0];
        var source=root.find('#lectureAudio');
        source.attr('src',audioSource).appendTo(source.parent());
        var sourceOgg=root.find('#lectureAudioOgg');
        sourceOgg.attr('src',audioSource.replace('.mp3','.ogg')).appendTo(sourceOgg.parent());
        
        audio.volume=.5; //initial volume
        $('.volumeSlider').slider({
            max:1,
            min:0,
            step:0.1,
            value:audio.volume,
            range: "min",
            slide: function(event, ui){
                audio.volume=ui.value;},
        });
        
        $('.volume').on('click',function(){
            if (audio.muted){ //it was muted, unmute it
                audio.muted=false;
                $('.volumeSlider').slider('enable');
                $('.volume').css('background-image','url("images/vol.png")');
            }else { //it wasn't muted, mute it
                audio.muted=true;
                $('.volumeSlider').slider('disable');
                $('.volume').css('background-image','url("images/mute.png")');
            }
        });
        
        
        // FETCH AND PROCESS THE DATA
        readFile(datafile,getData);
        
        // playback controls
        
        $('.buttons').append('<button class="slowDown"></button>');
        $('.buttons').append('<button class="speedUp"></button>');
        $('.controls').append('<div class="speedDisplay"></div>');
        $('.buttons').append('<button class="help" title="About"></button>');
        
        $('#slider').slider({
            max:100,
            min:0,
            step:0.1,
            range: 'max',
            stop: sliderStop,
            start: sliderStart,
            slide: sliderTime,
            change: function(event,ui){
                if (event.originalEvent) {
                    audio.currentTime = ui.value;
                    var next = getTransform(ui.value);
                    var initFree = freePosition;
                    freePosition = true;
                    animateToPos(Date.now(), 500, translateX, translateY, totalZoom, next.tx, next.ty, next.m11, function() {
                        freePosition = initFree;
                    });
                }
            }
                    //only call if it was a user-induced change, not program-induced
        });
        
        $('#slider').append('<div class="tick ui-widget-content"></div>');
        $('#slider').find('.ui-slider-range').removeClass('ui-corner-all');
        
        //side controls
        
        var sideButtons=$('<div class="sideButtons"></div>');
        $('.lecture').append(sideButtons);
        sideButtons.append('<button class="transBtns" id="zoomIn" title="Zoom In (+)"><img src="images/plus.png"></img></button>');
        sideButtons.append('<button class="transBtns" id="revertPos" title="Refocus (Enter)"><img src="images/target.png" style="opacity:0.1;"></img></button>');
        sideButtons.append('<button class="transBtns" id="seeAll" title="Big Board View (A)"><img src="images/seeall.png"></img></button>');
        sideButtons.append('<button class="transBtns" id="zoomOut" title="Zoom Out (-)"><img src="images/minus.png"></img></button>');
        sideButtons.append('<button class="transBtns" id="fullscreen" title="Fullscreen (F)"><img src="images/fs.png"></img></button>');
        sideButtons.append('<button class="transBtns" id="screenshotURL" title="Screenshot (S)"><img src="images/camera.png"></img></button>');
        sideButtons.append('<button class="transBtns" id="timeStampURL" title="State-saved URL or Embed Code (L)"><img src="images/link.png"></img></button>');
        sideButtons.append("<div class='URLinfo'>"+
                           "<button id='linkbutton'>Link at current time and transform</button> "+
                           "<button id='embedbutton'>Embed</button><br/>"+
                           "<textarea class='URLs' readonly='readonly' rows='1' cols='35' wrap='off'></textarea>"+
                           "</div>");
        
        $('#revertPos').on('click', function () {
            setFreePosition(false);
            var next = getTransform(audio.currentTime+0.5);
            freePosition = true;
            animateToPos(Date.now(), 500, translateX, translateY, totalZoom, next.tx, next.ty, next.m11, function() {
                freePosition = false;
            });
        });
        $('#seeAll').on('click', function() {
            setFreePosition(true);
            animateToPos(Date.now(), 500, translateX, translateY, totalZoom, 0, 0, minZoom);
        });
        $('#fullscreen').on('click', function() {
            fullscreenMode = !fullscreenMode;
            setFullscreenMode(fullscreenMode);
        });
        $('#zoomIn').on('click', function() {
            animateZoom(Math.min(totalZoom*3/2,maxZoom));
        });
        $('#zoomOut').on('click', function() {
            animateZoom(Math.max(totalZoom*2/3,minZoom));
        });
        
        $('#timeStampURL').on('click',function(){
            if ( $('.URLinfo').css('visibility')=='hidden'){
                $('.URLinfo').css('visibility','visible');
            } else {
                $('.URLinfo').css('visibility','hidden');
            }
            $('#linkbutton').click();
        });
        $('#linkbutton').on('click',function(){
            $(this).attr('disabled',true);
            $('#embedbutton').attr('disabled',false);
            var url = window.location.origin + window.location.pathname
            url = url + '?n='+ getURLParameter('n',location.search);
            $('.URLs').val(url+'&t='+Math.round(currentTime*100)/100+
                           '&tm='+JSON.stringify([
                               Math.round(translateX*100)/100,
                               Math.round(translateY*100)/100,
                               Math.round(totalZoom*100)/100,
                               freePosition?1:0
                           ]));
            $('.URLs').select();
        });
        $('#embedbutton').on('click',function(){
            $(this).attr('disabled',true);
            $('#linkbutton').attr('disabled',false);
            var url = window.location.origin + window.location.pathname
            url = url + '?n='+ getURLParameter('n',location.search);
            $('.URLs').val('<iframe src="'+url+
                           '" width=510 height=400 frameborder=1 '+
                           'allowfullscreen webkitallowfullscreen mozallowfullscreen></iframe>');
            $('.URLs').select();
        });
        
        $('#screenshotURL').on('click',function(){
            isScreenshot=true;
            clearFrame();
            oneFrame(currentTime);
            isScreenshot=false;
            var dataURL=canvas.toDataURL("image/png");
            window.open(dataURL);
            setFullscreenMode(false);
        });
        
        $('.captionsOption').on('click',function(){ //not currently in use
            if ($(this).is(':checked'))
                $('.captions').css('visibility','visible');
            else $('.captions').css('visibility','hidden');
        });
        
        // about modal dialog
        $('#description-dialog').dialog({
            autoOpen: false,
            modal: true,
            buttons: {
                OK: function() {
                    $(this).dialog('close');
                }
            }
        });
        $('.ui-dialog-titlebar').hide();
        $('.help').on('click',function(){
            $('#description-dialog').dialog('open');
        });
        
        
        /*************************
        *
        *   GENERAL EVENT LISTENERS
        *
        *************************/
        
        // shift to toggle drag/scroll to pan/zoom
        var shiftKeyPressed = false;
        window.addEventListener('keydown', function(e) {
            var key = e.keyCode || e.which;
            if(key === 16 & !shiftKeyPressed) {
                dragToPan = false;
                shiftKeyPressed = true;
            }
        });
        window.addEventListener('keyup', function(e) {
            var key = e.keyCode || e.which;
            if(key === 16) {
                dragToPan = true;
                shiftKeyPressed = false;
            }
        });
        
        // mouse actions, double click to zoom in
        doubleClickHandler({
            element: $(window),
            down: function(e) {
                if(e.target === canvas)
                    mouseDown(e);
                if(e.target !== $('.URLinfo')[0] & e.target !== $('.URLs')[0] &
                   e.target !== $('#linkbutton')[0] & e.target !== $('#embedbutton')[0])
                    $('.URLinfo').css('visibility','hidden');
            },
            move: mouseMove,
            up: mouseUp,
            double: function(e, target) {
                if(target === canvas) {
                    setFreePosition(true);
                    
                    var x = e.pageX,
                        y = e.pageY;
                    mousePressed = false;
                    var nz = totalZoom===1?2:1;
                    if(nz === 2) {
                        previousX = x-canvas.width/2/nz;
                        previousY = y-canvas.height/2/nz;
                    }
                    else {
                        previousX = x>canvas.width/2?-canvas.width:0;
                        previousY = y>canvas.height/2?-canvas.height:0;
                    }
                    var nx = -(previousX - offset.left - translateX)/totalZoom*nz;
                    var ny = -(previousY - offset.top - translateY)/totalZoom*nz;
                    
                    animateToPos(Date.now(), 500, translateX, translateY, totalZoom, nx, ny, nz);
                }
            },
            tolerance: 200
        });
        
        // scrolling action - pan or shift-to-zoom
        canvas.addEventListener('mousewheel', function(e){
            e.preventDefault();
            e.stopPropagation();
            setFreePosition(true);
            if(!dragToPan) {
                var scroll = e.wheelDeltaY;
                if(e.shiftKey)
                    scroll = e.wheelDeltaX;
                if(scroll !== 0) {
                    zoomStart();
                    zooming('trash', {value: totalZoom+0.1*scroll/Math.abs(scroll)});
                }
            }
            else
                pan(e.wheelDeltaX, e.wheelDeltaY);
        });
           
        // play/pause button controls audio playback
        root.find('.start').on('click',function() {
            if(audio.paused) {
                var next = getTransform(audio.currentTime);
                animateToPos(Date.now(), 500, translateX, translateY, totalZoom, next.tx, next.ty, next.m11, function() {
                    audio.play();
                });
            }
            else {
                audio.pause();
            }
        });
        
        // audio playback controls visual playback
        audio.addEventListener('play', start);
        audio.addEventListener('pause', pause);
        audio.addEventListener('ended', stop);
        
        //fast forward & slow down
        root.find('.speedUp').on('click', function() {
            if ( audio.playbackRate < 1 ){
                audio.playbackRate += .25;
                audio.defaultPlaybackRate += .25;
            } else if (audio.playbackRate < 5){
                audio.playbackRate += .5;
                audio.defaultPlaybackRate += .5;
            }
            speedIndicators();
        });
        root.find('.slowDown').on('click', function() {
            if (audio.playbackRate > 1){
                audio.playbackRate -= .5;
                audio.defaultPlaybackRate -= .5;
            } else if ( audio.playbackRate > 0){
                audio.playbackRate -= .25;
                audio.defaultPlaybackRate -= .25;
            }
            speedIndicators();
        });
        
        //keystrokes
        $(document).on('keyup',function(event){
            var keyCode = event.keyCode || event.which;
            if (keyCode===27) // esc
                setFullscreenMode(false);
            if (keyCode===32) // space
                root.find('.start').click();
            if(keyCode===68) // d
                discoMode = !discoMode;
            if(keyCode===13) // enter
                root.find('#revertPos').click();
            if(keyCode===187) // +
                root.find('#zoomIn').click();
            if(keyCode===189) // -
                root.find('#zoomOut').click();
            if(keyCode===65) // a
                root.find('#seeAll').click();
            if(keyCode===70) // f
                root.find('#fullscreen').click();
            if(keyCode===83) // s
                root.find('#screenshotURL').click();
            if(keyCode===76) // l
                root.find('#timeStampURL').click();
        });
        $(document).on('keydown',function(event){ // for keys which can be pressed and held
            var keyCode = event.keyCode || event.which;
            if(keyCode>=37 & keyCode <= 40) { // an arrow key, pan around
                setFreePosition(true);
                var increment = event.shiftKey?20:5;
                pan(keyCode%2*(38-keyCode)*increment, (keyCode+1)%2*(39-keyCode)*increment);
            }
        });
        
        // set data from localstorage
        if (localStorage[datafile]!==undefined & localStorage[datafile]!=='undefined'){
            var local=JSON.parse(localStorage[datafile]);
            currentTime=local.currentTime;
            furthestpoint=local.furthestPoint;
            translateX=local.tx;
            translateY=local.ty;
            totalZoom=local.tz;
            freePosition=local.free;
        }
        // then check data from URL
        if (t != -100) {
            currentTime=t;
        }
        if( tm != -100) {
            translateX=tm[0];
            translateY=tm[1];
            totalZoom=tm[2];
            freePosition=tm[3]===1;
        }
        
        $(window).on('resize',resizeVisuals);
        
        //to deal with fullscreen exit behavior differences between browsers
        $(document).on('mozfullscreenchange', function() {
            if(document.mozFullScreenElement === null)
                setFullscreenMode(false);
        });
        $(document).on('fullscreenchange webkitfullscreenchange', resizeVisuals);
    }
    return exports;
};

/*********************************
*
*   the function that starts it all
*
**********************************/
(function() {
    var createGrapher = function() {
        window.grapher = Grapher(jQuery);
        window.grapher.initialize();
    }

    // Add the CSS file to the HEAD
    var css = document.createElement('link');
    css.setAttribute('rel', 'stylesheet');
    css.setAttribute('type', 'text/css');
    css.setAttribute('href', 'style.css');
    document.head.appendChild(css);

    if ('jQuery' in window) {
      createGrapher(window.jQuery);
    }
})();
