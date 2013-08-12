var Grapher = function() {
    exports = {};
    var c; //the canvas
    var context;
    var contextHeight=600;
    
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
    var isDragging = false; //true if currently panning/zooming
    var wasDragging = false; //true if currently paused and panning/zooming
    var dragToPan = true; //true if dragging to pan, false if dragging to zoom
    var zoomRectW = 0, zoomRectH = 0;
    var zoomRect;
    var offset;
    var scrollBarWidth, scrollBarLeft, scrollBarHeight, scrollBarTop;
    var fullscreenMode = false;
    var controlsVisible = true;
    var btnsVisible = true;
    var freePosition = false;
    var animating = false;
    var animateID;
    var discoMode = false;
    var minDistance=10; //if the point is further than this then ignore it
    
    //LIMITS ON THINGS
    var boundingRect = {xmin: 0, xmax: 0, ymin: 0, ymax: 0, width: 0, height: 0};
    var maxZoom = 4, minZoom = 1;
    
    var audio;
    
    var isScreenshot=false; //true when you're getting a screenshot and don't want scroll bars
    
    var furthestpoint=0; // furthest point in seconds
    
    var imax;	// maximum time value
    
    var currentI=0; //current index of time (in seconds)
    var initialPause = true; //used in dragging 
        //(dragging pauses but unpauses if it was just a click)
    var draw;
    
    var numStrokes=0;
    var dataArray;
    
    /***********the dataArray object****************
        durationInSeconds: number
        height: number
        width: number
        cameraTransforms: [ { m11: number,
                              m12: number,
                              m21: number,
                              m22: number,
                              time: number,
                              tx: number,
                              ty: number,
                            }, {} ...]
        pageFlips: [ { page: number,
                       time: number
                     }, {} ...]
        visuals: [ { doesItGetDeleted: boolean,
                     tDeletion: number,
                     tEndEdit: number,
                     tMin: number,
                     type: string ( "stroke" )
                     properties: [ { alpha: number,
                                     alphaFill: number, 
                                     blue: number, 
                                     blueFill: number, 
                                     green: number, 
                                     greenFill: number, 
                                     red: number, 
                                     redFill: number, 
                                     thickness: number, 
                                     time: number, 
                                     type: string ( "basicProperty" )
                                    }, {}...]
                     verticies: [ {x: number, y: number, t: number, pressure: number}, {}...]
                   }, {} ...]
    */
    
    function preProcess(json) {
        //get bounding box
        boundingRect.xmax = json.width;
        boundingRect.ymax = json.height;
        var origVertices = 0;
        var finalVertices = 0;
        for(k in json.visuals) {
            
            var properties = json.visuals[k].properties;
            for(p in properties) {
                var property = properties[p];
                property.red = Math.round(parseFloat(property.red)*255);
                property.blue = Math.round(parseFloat(property.blue)*255);
                property.green = Math.round(parseFloat(property.green)*255);
                property.redFill = Math.round(parseFloat(property.redFill)*255);
                property.blueFill = Math.round(parseFloat(property.blueFill)*255);
                property.greenFill = Math.round(parseFloat(property.greenFill)*255);
            }
            
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
            //simplify strokes
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
            //clean up beginning/end
            var clean = false;
            while(!clean & stroke.length > 10) {
                if(stroke[0].pressure < 0.1 | stroke[0].pressure < 0.5*stroke[1].pressure)
                    stroke.splice(0,1);
                else
                    clean = true;
            }
            clean = false;
            while(!clean & stroke.length > 10) {
                if(stroke[stroke.length-1].pressure < 0.1 | stroke[stroke.length-1].pressure < 0.5*stroke[stroke.length-2].pressure)
                    stroke.splice(stroke.length-1,1);
                else
                    clean = true;
            }
            //straighten straight lines
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
        //divide into similar-direction polygons
        for(var i=0; i<json.visuals.length; i++) {
            var visual = json.visuals[i],
                stroke = visual.vertices;
            //find all breaking points
            var cosb;
            var j=2;
            
            while(j<stroke.length-2) {
                var point = stroke[j],
                    next = stroke[j+1];
                var ab = getDistance(Math.round(point.x), Math.round(point.y), Math.round(next.x), Math.round(next.y)),
                    bc = getDistance(Math.round(next.x), Math.round(next.y), Math.round(next.x)+5, Math.round(next.y)+5),
                    ac = getDistance(Math.round(point.x), Math.round(point.y), Math.round(next.x)+5, Math.round(next.y)+5);
                if(ab !== 0 & bc !== 0) {
                    var newcosb = (Math.pow(ab,2)+Math.pow(bc,2)-Math.pow(ac,2))/(2*ab*bc);
                    if(!isNaN(newcosb) & Math.abs(newcosb) > 0.3) {
                        if(cosb !== undefined & newcosb/cosb <= 0) {
                            json.visuals[i].vertices[j].break = true;
                        }
                        cosb = newcosb;
                    }
                }
                j++;
            }
        }
        //invert y transforms
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
        root.show();
        resizeVisuals();
        numStrokes=json.visuals.length;
        
        console.log(json);
        
        return json;
    }
    
    // fills dataArray with data from given .lec file, in JSON format
    function getData(file) {
        dataArray = JSON.parse(file.responseText);
        imax = dataArray.durationInSeconds;
        xmax=dataArray.width;
        ymax=dataArray.height;
        $('#slider').slider("option","max",imax);
        slider.max=imax;
        $('#totalTime').html("0:00 / "+secondsToTimestamp(imax));
        dataArray = preProcess(dataArray);
        
        if (localStorage[datafile]!==undefined){ //if there is data in the localstorage
            var newTransform = getTransform(currentI);
            totalZoom = newTransform.m11;
            translateX = newTransform.tx;
            translateY = newTransform.ty;
            displayZoom(totalZoom);
            clearFrame();
            changeSlider(currentI);
            oneFrame(currentI);
            audio.addEventListener('canplay', function(){
                audio.currentTime=currentI;
            });
        }

    }

    //access the .lec file and passes it to getData to process
	function readFile(url, callback) {
		var txtFile = new XMLHttpRequest();
		txtFile.open("GET", url, true);	
		txtFile.onreadystatechange = function() {
			if (txtFile.readyState != 4) {return;}  // document is ready to parse.	
			if (txtFile.status != 200 && txtFile.status != 304) {return;}  // file is found
			callback(txtFile);
		}
		if (txtFile.readyState == 4) return;
		txtFile.send(null);
	}
    
    
    //called when you click on the canvas
    //finds closest stroke to the click point and goes to the beginning of the stroke
    //if no stroke is found within minDistance, nothing happens
    function selectStroke(x,y){
        x=x/xscale;
        y=y/yscale;
        var closestPoint={stroke:-1,point:-1,distance:minDistance*xscale,time:0};
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
        
        console.log(closestPoint, initialPause);
        if (closestPoint.stroke!= -1){ //it found a close enough point
            //update current timestep
            var time=parseFloat(dataArray.visuals[closestPoint.stroke].vertices[0].t);
            currentI = time;
            audio.currentTime = time;
            changeSlider(time);
            
            if(!freePosition) {
                var newTransform = getTransform(currentI);
                freePosition = true;
                animateToPos(Date.now(), 500, translateX, translateY, totalZoom, newTransform.tx, newTransform.ty, newTransform.m11, function(){
                    freePosition = false;
                });
            }
            else if(audio.paused) { //if it was previously paused, remain paused
                clearFrame();
                oneFrame(currentI);
            }
        }
    }
    
    function drawScrollBars(tx, ty, z) {
        context.beginPath();
        context.strokeStyle = 'rgba(0,0,0,0.3)';
        context.lineCap = 'round';
        context.lineWidth = 8;
        scrollBarLeft = (-tx-boundingRect.xmin*xscale*z)/(boundingRect.width*xscale*z)*c.width+10;
        scrollBarTop = (-ty-boundingRect.ymin*yscale*z)/(boundingRect.height*yscale*z)*c.height+10;
        scrollBarWidth = xmax/boundingRect.width/z*c.width-20;
        scrollBarHeight = ymax/boundingRect.height/z*c.height-20;
        context.moveTo(scrollBarLeft, c.height-10);
        context.lineTo(scrollBarLeft+scrollBarWidth, c.height-10);
        context.moveTo(c.width-10, scrollBarTop);
        context.lineTo(c.width-10, scrollBarTop+scrollBarHeight);
        context.stroke();
    }
    
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
    
    function clearFrame() {
        // Use the identity matrix while clearing the canvas
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, c.width, c.height);
        
        if(discoMode) {
            context.fillStyle = 'rgb('+Math.round(Math.random()*255)+','+Math.round(Math.random()*255)+','+Math.round(Math.random()*255)+')';
            context.fillRect(0,0,c.width,c.height);
        }
        
        translateX = Math.min(Math.max(translateX,c.width-boundingRect.xmax*xscale*totalZoom),-boundingRect.xmin*xscale*totalZoom);
        translateY = Math.min(Math.max(translateY,c.height-boundingRect.ymax*yscale*totalZoom),-boundingRect.ymin*yscale*totalZoom);
        totalZoom = Math.min(maxZoom, Math.max(totalZoom, minZoom));
        
        if((audio.paused | freePosition) & totalZoom !== minZoom & !isScreenshot) {
            drawScrollBars(translateX, translateY, totalZoom);
        }
        
        // Restore the transform
        context.setTransform(totalZoom,0,0,totalZoom,
                             translateX,translateY);
        
        //draw indicator box
        if(freePosition) {
            freePosition = false;
            var box = getTransform(audio.currentTime);
            drawBox(box.tx, box.ty, box.m11);
            freePosition = true;
        }
    }
    
    function getDistance(x1,y1,x2,y2){
        return Math.sqrt( (x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
    }
    
    function getTransform(time) {
        if(!freePosition) {
            var newTransform = {};
            
            if (dataArray != undefined) {
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
            }
            
            return newTransform;
        }
        else
            return {tx: translateX, ty: translateY, m11: totalZoom};
    }
    
    //executes each frame of the lecture, including visual, slider & audio
    //this is the method that gets called each timestep.
    function graphData(){
		currentI=audio.currentTime;
		changeSlider(currentI);
        if (currentI > furthestpoint){
            furthestpoint=currentI;
        }
        
        var local = { 'currentTime': parseFloat(currentI), 
                     'furthestPoint': parseFloat(furthestpoint)};
        
        localStorage[datafile]=JSON.stringify(local);
        
        if(!freePosition) {
            var newTransform = getTransform(currentI);
            totalZoom = newTransform.m11;
            translateX = newTransform.tx;
            translateY = newTransform.ty;
            displayZoom(totalZoom);
        }
        clearFrame();
        oneFrame(currentI);
        draw = window.requestAnimationFrame(graphData);
	}
    
    //draw polygon for each stroke
    //TODO: break stroke into portions
    function calligraphize(startIndex, path, reversed) {
        if(startIndex === 0)
            context.beginPath();
        var point = path[startIndex];
        var endIndex = path.length-1;
        context.moveTo(point[0]+point[2],point[1]-point[2]);
        for(var i=startIndex+1; i<path.length-1; i++) {
            point = path[i];
            if(point[3]) {
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
    
    //displays one frame
    //only deals with visuals
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
                var graypath = [];
                
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
    
    //turns total seconds into a timestamp of minute:seconds
    //returns string
    function secondsToTimestamp(totalseconds){
        var minutes=Math.floor(totalseconds/60);
        var seconds=Math.round(totalseconds - minutes * 60);
        var zeros='';
        if (seconds < 10) zeros='0';
        return minutes +":"+zeros+seconds;
    }
    
    //changes where the handle is on the slider and the accompanying timestamp
    //also changes the furthesttime bar
    function changeSlider(current){
        if (current<=imax){ 
            $('#slider').slider('value',current);
            var secondsPassed=parseFloat(current);
            root.find('.time').html(secondsToTimestamp(secondsPassed));
            
            root.find('#totalTime').html(secondsToTimestamp(secondsPassed)+" / ");
            root.find('#totalTime').append(secondsToTimestamp(imax));
            
            //update furthest time bar
            var percentage = (furthestpoint)/imax * 100;
            $('.tick').css('width',percentage+'%');
            $('.tick').css('left', '0%');//percentage + '%');
            
        }
    }
    
    //triggered on every mouse move of the slider
    //sets currentI, changes lecture to reflect new currentI
    function sliderTime(){
        var val=$('#slider').slider('value');
        currentI=val;
        
        var newTransform = getTransform(currentI);
        totalZoom = newTransform.m11;
        translateX = newTransform.tx;
        translateY = newTransform.ty;
        displayZoom(totalZoom);
        clearFrame();
        oneFrame(val);
        changeSlider(val);
        audio.currentTime=val;
    }
    
    //triggered after a user stops sliding
    //controls if lecture goes back to playing or not
    function sliderStop(event, ui){
        if (initialPause){ //if it was paused, don't do anything
            return;
        }
        if (ui.value == imax){
            stop();
            return;
        }
        audio.play();
    }
    
    //triggered when user starts sliding
    //pauses lecture while scrubbing
    function sliderStart(event, ui){
        initialPause=audio.paused;
        audio.pause();
    }
    
    //triggered when user scrolls and zoom function is started
    function zoomStart() {
        wasDragging = true;
        previousX = translateX;
        previousY = translateY;
        previousZoom = totalZoom;
    }
    
    function zooming(event, ui) {
        totalZoom = Math.max(minZoom, Math.min(ui.value, maxZoom));
        displayZoom(totalZoom);
        
        //zoom in on center of visible portion achieved by extra translations
        translateX = previousX + (1-totalZoom/previousZoom)*(c.width/2-previousX);
        translateY = previousY + (1-totalZoom/previousZoom)*(c.height/2-previousY);
        if(audio.paused) {
            clearFrame();
            oneFrame(audio.currentTime);
        }
    }
    
    
    function displayZoom(totalZoom){
        var initialFree = freePosition;
        freePosition = false;
        var zoom = getTransform(audio.currentTime).m11;
        freePosition = initialFree;
        $('#zoomIn').css({'-webkit-transform':totalZoom>zoom?'scale(1.5)':'scale(1)',
                          'transform':totalZoom>zoom?'scale(1.5)':'scale(1)'});
        $('#zoomOut').css({'-webkit-transform':totalZoom<zoom?'scale(1.5)':'scale(1)',
                           'transform':totalZoom<zoom?'scale(1.5)':'scale(1)'});
    }
    
    function pan(dx, dy) {
        translateX += dx;
        translateY += dy;
        if(audio.paused) {
            clearFrame();
            oneFrame(audio.currentTime);
        }
    }
    
    //triggered when mouse pressed on canvas
    function dragStart(e) {
        isDragging = true;
        previousX = e.pageX;
        previousY = e.pageY;
        wasDragging = false;
        if(!dragToPan)
            zoomRect.css({visibility: 'visible', top: previousY, left: previousX});
    }
    
    //triggered when mouse dragged across canvas
    function dragging(e) {
        var x = e.pageX,
            y = e.pageY;
        if(isDragging) {
            if(!freePosition)
                setFreePosition(true);
            wasDragging = true;
            if(dragToPan) {
                var newTx = (x-previousX);
                var newTy = (y-previousY);
                pan(newTx, newTy);
                previousX = x;
                previousY = y;
            }
            else {
                zoomRectW = Math.max(offset.left, Math.min(x, offset.left+c.width))-previousX;
                zoomRectH = Math.max(offset.top, Math.min(y, offset.top+c.height))-previousY;
                if(zoomRectW/zoomRectH > c.width/c.height) //maintains aspect ratio of zoom region
                    zoomRectH = c.height/c.width*zoomRectW;
                else
                    zoomRectW = c.width/c.height*zoomRectH;
                if(audio.paused) {
                    clearFrame();
                    oneFrame(audio.currentTime);
                }
                zoomRect.css({width: zoomRectW, height: zoomRectH});
                if(c.width/Math.abs(zoomRectW/totalZoom) < maxZoom)
                    zoomRect.css('background-color', 'rgba(0,255,0,0.1)');
                else
                    zoomRect.css('background-color', 'rgba(255,0,0,0.1)');
            }
        }
        
        //CHANGE THIS - for mouse move to show stuff in fullscreenmode
        if(fullscreenMode) {
            if(!controlsVisible & y > $(window).height()-15)
                animateControls(true);
            if(controlsVisible & y < $(window).height()-controls.outerHeight(true)-20)
                animateControls(false);
            if(!btnsVisible & x > offset.left+c.width)
                animateBtns(true);
            if(btnsVisible & x < offset.left+c.width)
                animateBtns(false);
        }
    }
    
    //for fullscreen, animates when the bottom controls come up and down
    function animateControls(show) {
        if(show) {
            controls.animate({top: (c.height-controls.outerHeight(true))},200);
            controlsVisible = true;
        }
        else {
            controls.animate({top: c.height},200);
            controlsVisible = false;
        }
    }
    
    function animateBtns(show) {
//        if(show) {
//            $('.sideButtons').animate({opacity: 1},200);
//            btnsVisible = true;
//        }
//        else {
//            $('.sideButtons').animate({opacity: 0.3},200);
//            btnsVisible = false;
//        }
    }
    
    //triggered when mouse released on canvas
    function dragStop() {
        if(isDragging) {
            isDragging = false;
            
            if(!dragToPan & wasDragging) { //zoom in on region
                var nz = c.width/Math.abs(zoomRectW/totalZoom);
                if(nz < maxZoom) {
                    if(zoomRectW < 0)   previousX += zoomRectW; // upper left hand corner
                    if(zoomRectH < 0)   previousY += zoomRectH;
                    var nx = -(previousX - offset.left - translateX)/totalZoom*nz;
                    var ny = -(previousY - offset.top - translateY)/totalZoom*nz;
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
            
            if(!wasDragging) { // click
                previousX=Math.round((previousX-offset.left-translateX)/totalZoom);
                previousY=Math.round((previousY-offset.top-translateY)/totalZoom);
                selectStroke(previousX,previousY);
            }
        }
    }
    
    //animates back to playing position before playing
    function animateToPos(startTime, duration, tx, ty, tz, nx, ny, nz, callback) {
        clearTimeout(animateID);
        animating = true;
        nz = Math.min(Math.max(nz,minZoom),maxZoom);
        nx = Math.min(Math.max(nx,c.width-boundingRect.xmax*xscale*nz),-boundingRect.xmin*xscale);
        ny = Math.min(Math.max(ny,c.height-boundingRect.ymax*yscale*nz),-boundingRect.ymin*yscale);
        
        var interpolatedTime = Math.pow((Date.now() - startTime)/duration-1,5)+1;
        
        if(Date.now()-startTime > duration | (tx === nx & ty === ny & tz === nz)) {
            animating = false;
            translateX = nx, translateY = ny, totalZoom = nz;
            displayZoom(totalZoom);
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
                drawScrollBars(translateX, translateY, totalZoom);
                clearFrame();
                oneFrame(audio.currentTime);
            }
            
            animateID = setTimeout(function() {
                animateToPos(startTime, duration, tx, ty, tz, nx, ny, nz, callback);
            }, 33);
        }
    }
    
    //starts lecture
    function start(){
        wasDragging = false;
        root.find('.start').css('background-image',
            "url('http://web.mit.edu/lilis/www/videolec/pause.png')");
        $('#slider .ui-slider-handle').css('background','#0b0');
        root.find('.video').css('border','1px solid #eee');
        
        $('#pauseIcon').attr("src",'play_big.png');
        fadeSign('pause_big.png');
        
//        draw=clearInterval(draw);
//        draw=setInterval(graphData,50);
        window.cancelAnimationFrame(draw);
        draw = window.requestAnimationFrame(graphData);
    }
    
    //pauses lecture at current timestamp
    function pause(){
        $('#timeStampURL').attr("disabled",false);
        $('#screenshotURL').attr("disabled",false);
        root.find('.start').css('background-image',
            "url('play.png')");
        $('#slider .ui-slider-handle').css('background','#f55');
        root.find('.video').css('border','1px solid #f88');
        
        $('#pauseIcon').attr("src",'pause_big.png');
        fadeSign('play_big.png');
        
//        draw=clearInterval(draw);
        window.cancelAnimationFrame(draw);
    }
    
    //stop lecture, clears furthestpoint back to beginning
    function stop(){
//        draw=clearInterval(draw);
        window.cancelAnimationFrame(draw);
        
        localStorage.removeItem(datafile);
        
        root.find('.start').css('background-image',
            "url('play.png')");
        $('#slider .ui-slider-handle').css('background','#f55');
        root.find('.video').css('border','1px solid #f88');
        
        furthestpoint=0;
        
        oneFrame(imax);
    }
    
    //animation for the pause/play image that shows up in the middle of the lecture
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
    
    //resizes controls upon window size changing
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
        $('.buttons button').css('border-radius',smallButtonWidths);
        $('.jumpForward').css('margin-left',smallButtonWidths+4);
        
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
        oneFrame(currentI);
    }
    
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
        
        if(fullscreenMode) {
            $('body').css('padding',0);
            root.find('.menulink').hide();
            c.height = windowHeight;
            c.width = xmax/ymax*c.height;
            if(c.width > windowWidth) {
                c.width = windowWidth;
                c.height = ymax/xmax*c.width;
            }
            $('.lecture').css({height: c.height,
                               width: c.width});
            controls.css({position: 'absolute',
                                top: ((windowHeight-controls.outerHeight(true))+'px'),
                                left: 0,
                                'background-color':'rgba(245,245,245,0.9)'});
        }
        else {
            $('body').css('padding','');
            root.find('.menulink').show();
            c.height=ymax * videoDim/scaleFactor;
            c.width=xmax * videoDim/scaleFactor;
            $('.lecture').css({height: 'auto',
                               width: 'auto'});
            controls.css({position: 'absolute',
                                top: (($('.video').offset().top+
                                       $('.video').height()+10)+'px'),
                                left: ($('.video').offset().left+'px'),
                                'background-color':''});
            $('.sideButtons').css('opacity',1);
        }
        
        $('.captions').css('width',c.width);
        $('.captions').css('top',$('.controls').offset().top - 50 + 'px');
        $('.speedDisplay').css('top', -45 + 'px');
        var fontsize = c.width * 30/575;
        if (fontsize > 30 ) fontsize=30; //max font size 30
        $('.speedDisplay').css('font-size', fontsize+'px');
        
        yscale=(c.height)/ymax;
        xscale=(c.width)/xmax;
        offset = root.find('.video').offset();
        resizeControls(c.width);
        
        var onScreenStatusWidth=c.width * 80/575;
        $('.onScreenStatus').css('margin-top', -c.height/2-onScreenStatusWidth/2);
        $('.onScreenStatus').css('margin-left',c.width/2-onScreenStatusWidth/2);
        $('#pauseIcon').css('width',onScreenStatusWidth+"px");
        $('#pauseIcon').css('height',onScreenStatusWidth+"px");
        $('.onScreenStatus').css('opacity',".5");
        $('.onScreenStatus').css('visibility',"hidden");
        
        var sideIncrement = c.height/7;
        var transBtnDim = sideIncrement/2;
        $('.transBtns').css({height:transBtnDim,
                             width:transBtnDim,
                             left:(fullscreenMode?windowWidth-1.5*transBtnDim:offset.left+c.width+transBtnDim/2)});
        $('#zoomIn').css({top: (offset.top+0.25*sideIncrement)});
        $('#revertPos').css({top: (offset.top+1.25*sideIncrement)});
        $('#zoomOut').css({top: (offset.top+2.25*sideIncrement)});
        $('#seeAll').css({top: (offset.top+3.25*sideIncrement)});
        $('#fullscreen').css({top: (offset.top+4.25*sideIncrement)});
        $('#screenshotURL').css({top: (offset.top+5.25*sideIncrement)});
        $('#timeStampURL').css({top: (offset.top+6.25*sideIncrement)});
    }
    
    //custom handler to distinguish between single- and double-click events
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
                console.log('click');
                if(!doubled)
                    up();
                doubled = false;
                element.off('mouseup');
                on();
            },tolerance);
            element.on('mouseup', function() {
                console.log('doubleclick');
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
                console.log('click');
                if(!doubled)
                    up();
                doubled = false;
                element.off('touchend');
                on();
            },tolerance);
            element.on('touchend', function() {
                offClick();
                console.log('doubleclick');
                clearTimeout(tap);
                double(e.originalEvent.changedTouches[0], e.target);
                doubled = true;
                element.off('touchend');
                on();
            });
        }
        on();
    }
    
    function fullscreen(yes) {
        fullscreenMode = yes;
        try{
            if(yes) {
                try {root[0].mozRequestFullScreen();}
                catch(e) {root[0].webkitRequestFullScreen();}
            }
            else {
                try {document.mozCancelFullScreen();}
                catch(e) {document.webkitCancelFullScreen();}
            }
        }catch(e){}
        root.find('#fullscreen').find('img').attr('src', fullscreenMode?"exitfs.png":"fs.png");
        root.find('#fullscreen').attr('title', fullscreenMode?'Exit Fullscreen':'Fullscreen');
        resizeVisuals();
    }
    
    function speedIndicators(){
        console.log(audio.playbackRate);
        $('.speedDisplay').text(Math.round(audio.playbackRate/1*10)/10 +" x");
        if (audio.playbackRate>1){
            $('.jumpForward').css('border-color','#0e9300');
            $('.jumpForward').css('opacity','.7');
            $('.jumpBack').css('border-color','');
            $('.jumpBack').css('opacity','');
        } else if (audio.playbackRate < 1 & audio.playbackRate > 0){
            $('.jumpBack').css('border-color','#0e9300');
            $('.jumpBack').css('opacity','.7');
            $('.jumpForward').css('border-color','');
            $('.jumpForward').css('opacity','');
        } else if (audio.playbackRate < 0){
            $('.jumpBack').css('border-color','#f44');
            $('.jumpBack').css('opacity','.7');
            $('.jumpForward').css('border-color','');
            $('.jumpForward').css('opacity','');
        } else {
            $('.speedDisplay').text("");
            $('.jumpBack').css('border-color','');
            $('.jumpBack').css('opacity','');
            $('.jumpForward').css('border-color','');
            $('.jumpForward').css('opacity','');
        }
    }
    
    function getURLParameter(name,data) {
        return decodeURI(
            (RegExp('[?|&]'+name + '=' + '(.+?)(&|$)').exec(data)||[,-100])[1]
        );
    }
    
    function urlExists(url){
        var http=new XMLHttpRequest();
        http.open('HEAD',url,false);
        http.send();
        return http.status!=404;
    }
    
    function setFreePosition(free) {
        freePosition = free;
        $('#revertPos').css({'-webkit-filter': free?'sepia(100%)':'',
                             '-moz-filter': free?'sepia(100%)':'',
                             'filter': free?'sepia(100%)':'',
                             '-webkit-transform': free?'scale(1.1)':'',
                             'transform': free?'scale(1.1)':''});
    }
    
    function animateZoom(nz) {
        var nx = translateX + (1-nz/totalZoom)*(c.width/2-translateX);
        var ny = translateY + (1-nz/totalZoom)*(c.height/2-translateY);
        setFreePosition(true);
        animateToPos(Date.now(), 500, translateX, translateY, totalZoom, nx, ny, nz);
    }
    
    var template="<a class='menulink' href='index.html'>back to menu</a><div class='lecture'>"
        + "<canvas class='video'></canvas>"
        + "<div class='onScreenStatus'> <img src='pause_big.png' id='pauseIcon' width='0px' height='0px'> </div>"
        + "<br> <div class='captions'>test captions</div>"
        + "<div class='controls'>"
        + " <div id='slider'></div>"
        + " <div class='buttons'>"
        + "     <input class='start' type='button'/>"
        + " </div>"
        + " <div id='totalTime'></div>"
        + " <div class='toggleControls'>Drag/Scroll To:<br/><span id='zoom'>Zoom</span><div id='toggleDrag'></div><span id='pan'>Pan</span></div>"
        + " <button class='volume'></button>"
        + " <div class='volumeSlider'></div>"
        + " <textarea class='URLs' readonly='readonly' rows='1' cols='35' wrap='off'></textarea>"
        + "<audio class='audio' preload='metadata'>"
        + "     <source id='lectureAudio' type='audio/mpeg'>"
        + "     <source id='lectureAudioOgg' type='audio/ogg'>"
        + "</audio>"
        + "</div>"
        + "</div>"
        + "<div class='zoomRect'></div>";
    exports.initialize = function() {
        var requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame;
        window.requestAnimationFrame = requestAnimationFrame;
        var cancelAnimationFrame = window.cancelAnimationFrame || window.webkitCancelAnimationFrame || window.mozCancelAnimationFrame;
        window.cancelAnimationFrame = cancelAnimationFrame;
        
        root=$('.pentimento');
        root.append(template);
        zoomRect = root.find('.zoomRect');
        controls = root.find('.controls');
        root.hide();
        
        var filename=getURLParameter('n',location.search);
        var t=getURLParameter('t',location.search);
        var end=getURLParameter('end',location.search);
        console.log(filename,t,end);
        
        datafile="lectures/"+filename+".lec";
        audioSource="lectures/"+filename+".mp3";
        
        audio=root.find('.audio')[0];
        var source=root.find('#lectureAudio');
        source.attr('src',audioSource).appendTo(source.parent());
        var sourceOgg=root.find('#lectureAudioOgg');
        sourceOgg.attr('src',audioSource.replace('.mp3','.ogg')).appendTo(sourceOgg.parent());
        
        audio.volume=.5; //initial volume
        $('.volumeSlider').slider({
            max:1,
            min:0,
            step:.1,
            value:audio.volume,
            range: "min",
            slide: function(event, ui){
                audio.volume=ui.value;},
        });
        
        $('.volume').on('click',function(){
            if (audio.muted){ //it was muted, unmute it
                audio.muted=false;
                $('.volumeSlider').slider('enable');
                $('.volume').css('background-image','url("vol.png")');
            }else { //it wasn't muted, mute it
                audio.muted=true;
                $('.volumeSlider').slider('disable');
                $('.volume').css('background-image','url("mute.png")');
            }
        });
        
        $('.buttons').append('<button class="jumpBack"></button>');
        $('.buttons').append('<button class="jumpForward"></button>');
        $('.controls').append('<div class="speedDisplay"></div>');
        
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
        
        c=root.find('.video')[0];
        
        context=c.getContext('2d');
        
        var doubleClick = doubleClickHandler({
            element: $(window),
            down: function(e) {
                if(e.target === c)
                    dragStart(e);
            },
            move: dragging,
            up: dragStop,
            double: function(e, target) {
                if(target === c) {
                    setFreePosition(true);
                    
                    var x = e.pageX,
                        y = e.pageY;
                    isDragging = false;
                    var nz = totalZoom===1?2:1;
                    if(nz === 2) {
                        previousX = x-c.width/2/nz;
                        previousY = y-c.height/2/nz;
                    }
                    else {
                        previousX = x>c.width/2?-c.width:0;
                        previousY = y>c.height/2?-c.height:0;
                    }
                    var nx = -(previousX - offset.left - translateX)/totalZoom*nz;
                    var ny = -(previousY - offset.top - translateY)/totalZoom*nz;
                    
                    animateToPos(Date.now(), 500, translateX, translateY, totalZoom, nx, ny, nz);
                }
            },
            tolerance: 200
        });
        
        c.addEventListener('mousewheel', function(e){
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
            wasDragging = true;
        });
        
        readFile(datafile,getData);
        
        //fast forward & slow down
        root.find('.jumpForward').on('click', function() {
            audio.playbackRate += 0.1;
            speedIndicators();
        });
        root.find('.jumpBack').on('click', function() {
            audio.playbackRate -= 0.1;
            speedIndicators();
        });
        
        root.find('#toggleDrag').slider({
            min: -1, max: 1, step: 2, value: 1,
            slide: function(e, ui) {
                dragToPan = ui.value > 0;
                //true if dragging to pan
                if (dragToPan) {
                    $('.toggleControls #pan').css('color','#000');
                    $('.toggleControls #zoom').css('color','#aaa');
                } else{
                    $('.toggleControls #pan').css('color','#aaa');
                    $('.toggleControls #zoom').css('color','#000');
                }
            }
        });
        
        //SHIFT TO TOGGLE SCROLL TO ZOOM
        window.addEventListener('keydown', function(e) {
            var key = e.keyCode || e.which;
            if(key === 16) {
                root.find('#toggleDrag').slider({value: -1, disabled: true});
                dragToPan = false;
                root.find('.video').css('cursor', '-webkit-zoom-in');
            }
        });
        window.addEventListener('keyup', function(e) {
            var key = e.keyCode || e.which;
            if(key === 16) {
                root.find('#toggleDrag').slider({value: 1, disabled: false});
                dragToPan = true;
                root.find('.video').css('cursor', 'default');
            }
        });
        
        var sideButtons=$('<div class="sideButtons"></div>');
        root.append(sideButtons);
        sideButtons.append('<button class="big transBtns" id="revertPos" title="Refocus"><img src="target.png"></img></button>');
        sideButtons.append('<button class="big transBtns" id="seeAll" title="Big Board View"><img src="seeall.png"></img></button>');
        sideButtons.append('<button class="big transBtns" id="fullscreen" title="Fullscreen"><img src="fs.png"></img></button>');
        sideButtons.append('<button class="big transBtns" id="screenshotURL" title="Screenshot"><img src="camera.png"></img></button>');
        sideButtons.append('<button class="small transBtns" id="zoomIn" title="Zoom In"><img src="plus.png"></img></button>');
        sideButtons.append('<button class="small transBtns" id="zoomOut" title="Zoom Out"><img src="minus.png"></img></button>');
        sideButtons.append('<button class="big transBtns" id="timeStampURL" title="Link of video at current time"><img src="link.png"></img></button>');
        
        
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
            fullscreen(fullscreenMode);
        });
        $('#zoomIn').on('click', function() {
            animateZoom(Math.min(totalZoom*1.5,maxZoom));
        });
        $('#zoomOut').on('click', function() {
            animateZoom(Math.max(totalZoom*2/3,minZoom));
        });
        
        audio.addEventListener('play', start);
        audio.addEventListener('pause', pause);
        audio.addEventListener('ended', stop);
        
        $('#timeStampURL').on('click',function(){
            console.log("timestamp url clicked");
            if ( $('.URLs').css('visibility')=='hidden'){
                $('.URLs').css('visibility','visible');
            } else {
                $('.URLs').css('visibility','hidden');
            }
            var url = window.location.origin + window.location.pathname
            url = url + '?n='+ getURLParameter('n',location.search);
            $('.URLs').val(url+'&t='+Math.round(currentI*100)/100);
            $('.URLs').select();
        });
        
        $('#screenshotURL').on('click',function(){
            isScreenshot=true;
            clearFrame();
            oneFrame(currentI);
            isScreenshot=false;
            var dataURL=c.toDataURL("image/png");
            window.open(dataURL);
            fullscreen(false);
        });
        
        $('.captionsOption').on('click',function(){
            if ($(this).is(':checked'))
                $('.captions').css('visibility','visible');
            else $('.captions').css('visibility','hidden');
        });
                
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
        
        $(document).on('keyup',function(event){
            var keyCode = event.keyCode || event.which;
            console.log(keyCode);
            if (keyCode===32){ // space was pressed
                //trigger button click
                root.find('.start').click();
            }
            if (keyCode===27) { // esc was pressed
                event.preventDefault();
                event.stopPropagation();
                fullscreen(false);
            }
            if(keyCode===68)
                discoMode = !discoMode;
        });
        
        console.log(localStorage);
        
        if (localStorage[datafile]!==undefined){ //checking for localstorage data
            var local=JSON.parse(localStorage[datafile]);
            currentI=local.currentTime;
            furthestpoint=local.furthestPoint;
        }
        
        if (t != -100) { //check if URL came with timestamp
            currentI=t;
        }
        
        $(window).on('resize',resizeVisuals);
    }
    return exports;
};


//implements everything
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
