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
    var translateX = 0; //maybe should keep transform as matrix object?
    var translateY = 0;
    var totalZoom = 1;
    var previousX, previousY, previousZoom; //stand-in variables for many things
    var isDragging = false; //true if currently panning/zooming
    var wasDragging = false; //true if currently paused and panning/zooming
    var dragToPan = true; //true if dragging to pan, false if dragging to zoom
    var zoomRectW = 0, zoomRectH = 0;
    var offset;
    var scrollBarWidth, scrollBarLeft, scrollBarHeight, scrollBarTop;
    
    //LIMITS ON THINGS
    var boundingRect = {xmin: 0, xmax: 0, ymin: 0, ymax: 0, width: 0, height: 0};
    var maxZoom = 4, minZoom = 1;
    
    var audio;
    var isAudio=true;
    
    var furthestpoint=0; // furthest point in seconds
    
    var imax;	// maximum time value
    
    var initialTime; //initial time of start of video
    var currentI=0; //current index of time (in seconds)
    var currentTime=0; //current time, as given by date.now();
    var offsetTime=0; //for use with pause
    var paused=true;
    var setTime=false; //true if time was set by slider or strokeFinding
    var initialPause; //used in dragging 
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
        for(i in json.visuals) {
            var stroke = json.visuals[i].vertices;
            for(j in stroke) {
                var point = stroke[j];
                point.y = json.height-point.y;
                if(point.x < boundingRect.xmin) boundingRect.xmin = point.x;
                if(point.x > boundingRect.xmax) boundingRect.xmax = point.x;
                if(point.y < boundingRect.ymin) boundingRect.ymin = point.y;
                if(point.y > boundingRect.ymax) boundingRect.ymax = point.y;
            }
        }
//        //divide into similar-direction polygons
//        for(var i=0; i<json.visuals.length; i++) {
//            var visual = json.visuals[i],
//                stroke = visual.vertices,
//                newStrokes = [];
//            //find all breaking points
//            var cosb;
//            for(var j=0; j<stroke.length-1; j++) {
//                var point = stroke[j],
//                    next = stroke[j+1];
//                var ab = getDistance(point.x, point.y, next.x, next.y),
//                    bc = getDistance(next.x, next.y, next.x+1, next.y+1),
//                    ac = getDistance(point.x, point.y, next.x+1, next.y+1);
//                var newcosb = (Math.pow(ab,2)+Math.pow(bc,2)-Math.pow(ac,2))/(2*ab*bc);
//                if(newcosb !== 0 & !isNaN(newcosb)) {
//                    if(cosb !== undefined & newcosb/cosb < 0) {
//                        newStrokes.push(j);
//                    }
//                    cosb = newcosb;
//                }
//            }
//            if(newStrokes.length !== 0) {
//                newStrokes.push(stroke.length-1);
//                //at each breaking point, create new stroke
//                for(var k=0; k<newStrokes.length-1; k++) {
//                    var begin = newStrokes[k];
//                    var end = newStrokes[k+1];
//                    var newVertices = [];
//                    var newVisual;
//                    for(var h=begin; h<=end; h++)
//                        newVertices.push(jQuery.extend(true,{},stroke[h]));
//                    newVisual = jQuery.extend(true,{},visual);
//                    newVisual.vertices = newVertices;
//                    json.visuals.push(newVisual);
//                }
//                stroke = stroke.slice(0,newStrokes[0]+1);
//            }
//        }
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
        $('#zoomslider').slider({min: minZoom});
        resizeVisuals();
        numStrokes=json.visuals.length;
        
        
        
        return json;
    }
    
    // updates lines and dataPoints with new file
    function getData(file) {
        console.log(JSON.parse(file.responseText));
        dataArray = JSON.parse(file.responseText);
        imax = dataArray.durationInSeconds;
        xmax=dataArray.width;
        ymax=dataArray.height;
        $('#slider').slider("option","max",imax);
        slider.max=imax;
        $('#totalTime').html("0:00 / "+secondsToTimestamp(imax));
        dataArray = preProcess(dataArray);
        
        if (localStorage[datafile]!= undefined){
            var newTransform = getTransform(currentI);
            totalZoom = newTransform.m11;
            translateX = newTransform.tx;
            translateY = newTransform.ty;
            $('#zoomslider').slider('value', totalZoom);
            $('#zoomlabel').html(parseInt(totalZoom*10)/10);
            clearFrame();
            changeSlider(currentI);
            oneFrame(currentI);
            if (isAudio) audio.currentTime=currentI;
        }

    }

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
    function selectStroke(x,y){
        x=x/xscale;
        y=y/yscale;
        var minDistance=10; //if the point is further than this then ignore it
        var closestPoint={stroke:-1,point:-1,distance:minDistance,time:0};
        for(var i=0; i<numStrokes; i++){
            var currentStroke=dataArray.visuals[i];
            for(var j=0;j<currentStroke.vertices.length; j++){
                var deletedYet=false;
                if (currentStroke.doesItGetDeleted){
                    if (currentStroke.tDeletion<currentI) deletedYet=true;
                }
                if (currentStroke.vertices[j].t<currentI & !deletedYet){
                    //check closeness of x,y to this current point
                    var dist = getDistance(x,y,currentStroke.vertices[j].x,
                                           currentStroke.vertices[j].y)
                    if (dist<closestPoint.distance){
                        closestPoint.distance=dist;
                        closestPoint.stroke=i;
                        closestPoint.point=j;
                        closestPoint.time=currentStroke.vertices[j].t;
                    }
                }
            }
        }
        
        console.log(closestPoint);
        if (closestPoint.stroke!= -1){ //it found a close enough point
            var time=parseFloat(dataArray.visuals[closestPoint.stroke].vertices[0].t);
            console.log(time);
            offsetTime=time*1000;
            setTime=true;
            currentI = time;
            
            if(paused) {
                var newTransform = getTransform(currentI);
                animateToPos(Date.now(), 200, newTransform.tx, newTransform.ty, newTransform.m11, function(){
                    $('#zoomslider').slider('value', totalZoom);
                    $('#zoomlabel').html(parseInt(totalZoom*10)/10);
                    changeSlider(time);
                    if (isAudio) audio.currentTime=time;
                });
            }
            //animate to pos with new transform, put draw-one-frame-stuff in callback function
        }
        if(!paused){ // if it wasn't paused, keep playing
            paused=true; //it only starts if it was previously paused.
            var next = getTransform(currentI);
            animateToPos(Date.now(), 200, next.tx, next.ty, next.m11, start);
        }
    }
    
    function drawScrollBars(tx, ty, z) {
        context.beginPath();
        context.strokeStyle = 'rgba(0,0,0,0.3)';
        context.lineCap = 'round';
        context.lineWidth = 8;
        scrollBarWidth = xmax/boundingRect.width/z*c.width-20;
        scrollBarLeft = (-tx-boundingRect.xmin*xscale)/boundingRect.width/xscale/z*c.width+10;
        context.moveTo(scrollBarLeft, c.height-10);
        context.lineTo(scrollBarLeft+scrollBarWidth, c.height-10);
        scrollBarHeight = ymax/boundingRect.height/z*c.height-20;
        scrollBarTop = (-ty-boundingRect.ymin*yscale)/boundingRect.height/yscale/z*c.height+10;
        context.moveTo(c.width-10, scrollBarTop);
        context.lineTo(c.width-10, scrollBarTop+scrollBarHeight);
        context.stroke();
    }
    
    function clearFrame() {
        // Use the identity matrix while clearing the canvas
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, c.width, c.height);
        
        translateX = Math.min(Math.max(translateX,c.width-boundingRect.xmax*xscale*totalZoom),-boundingRect.xmin*xscale);
        translateY = Math.min(Math.max(translateY,c.height-boundingRect.ymax*yscale*totalZoom),-boundingRect.ymin*yscale);
        totalZoom = Math.min(maxZoom, Math.max(totalZoom, minZoom));
        
        if(paused) {
            drawScrollBars(translateX, translateY, totalZoom);
        }
        
        // Restore the transform
        context.setTransform(totalZoom,0,0,totalZoom,
                             translateX,translateY);
    }
    
    function getDistance(x1,y1,x2,y2){
        return Math.sqrt( (x2-x1)*(x2-x1) + (y2-y1)*(y2-y1));
    }
    
    function getTransform(time) {
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
            newTransform = jQuery.extend(true,{},previousTransform);
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
    
    function graphData(){
		currentTime=Date.now(); //gets current time
		currentI=(currentTime/1000.0)-(initialTime/1000.0) //converts to seconds passed
		changeSlider(currentI);
        if (currentI > furthestpoint){
            furthestpoint=currentI;
        }
        
        var local = { 'currentTime': parseFloat(currentI), 
                     'furthestPoint': parseFloat(furthestpoint)};
        
        localStorage[datafile]=JSON.stringify(local);
        
        var newTransform = getTransform(currentI);
        totalZoom = newTransform.m11;
        translateX = newTransform.tx;
        translateY = newTransform.ty;
        $('#zoomslider').slider('value', totalZoom);
        $('#zoomlabel').html(parseInt(totalZoom*10)/10);
        clearFrame();
        oneFrame(currentI);
        
        if (currentI>imax) {
            stop();
        }
	}
    
    //draw polygon for each stroke
    //TODO: break stroke into portions
    function calligraphize(startIndex, path) {
        context.beginPath();
        var point = path[startIndex];
        var endIndex = path.length-1;
        context.moveTo(point[0],point[1]);
        for(var i=startIndex+1; i<path.length-1; i++) {
            point = path[i];
            context.lineTo(point[0]+point[2],point[1]-point[2]);
        }
        for(var i=endIndex; i>=startIndex; i--) {
            point = path[i];
            context.lineTo(point[0]-point[2],point[1]+point[2]);
        }
        context.lineTo(point[0],point[1]);
        context.stroke();
        context.fill();
    }
    
    //displays one frame
    function oneFrame(current){
        
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
                            var r=parseFloat(property.redFill) * 255;
                            var g=parseFloat(property.greenFill) * 255;
                            var b=parseFloat(property.blueFill) * 255;
                            context.fillStyle="rgba("+r+","+g+
                                              ","+b+","+(property.alphaFill*fadeIndex)+")";
                            
                            r=parseFloat(property.red) * 255;
                            g=parseFloat(property.green) * 255;
                            b=parseFloat(property.blue) * 255;
                            context.strokeStyle="rgba("+r+","+g+
                                              ","+b+","+(property.alpha*fadeIndex)+")";
                            
                            context.lineWidth = property.thickness*xscale/50;
                            
                            if(tmin > current) {
                                context.fillStyle = "rgba(100,100,100,0.1)";
                                context.strokeStyle = "rgba(50,50,50,0.1)";
                                if(currentStroke.tDeletion < furthestpoint)
                                    deleted = true;
                            }
                        }
                    }
                }
                
                //draw the stroke
                if (!deleted || !currentStroke.doesItGetDeleted){
                    for (var j = 0; j < data.length; j++) { //for all verticies
                        var x=data[j].x*xscale;
                        var y=data[j].y*yscale;
                        var pressure = data[j].pressure;
                        if (data[j].t < current | tmin > current & data[j].t < furthestpoint){
                            path.push([x,y,pressure*context.lineWidth*16]);
                        }
                        else if(currentStroke.tEndEdit < current & data[j].t > current)
                            graypath.push([x,y,pressure*context.lineWidth*16]);
                    }
                    if(path.length > 0)
                        calligraphize(0, path);
                    if(graypath.length > 0) {
                        context.fillStyle = "rgba(100,100,100,0.1)";
                        context.strokeStyle = "rgba(50,50,50,0.1)";
                        calligraphize(0, graypath);
                    }
                }
            }
        }
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
    
    function changeSlider(current){
        if (current<=imax){ 
            $('#slider').slider('value',current);
            var secondsPassed=parseFloat(current);
            root.find('.time').html(secondsToTimestamp(secondsPassed));
            //root.find('.time').append(secondsToTimestamp(imax));
            
            root.find('#totalTime').html(secondsToTimestamp(secondsPassed)+" / ");
            root.find('#totalTime').append(secondsToTimestamp(imax));
            
            //update tick
            var percentage = (furthestpoint)/imax * 100;
            $('.tick').css('width',percentage+'%');
            $('.tick').css('left', '0%');//percentage + '%');
            
        }
    }
    
    //triggered on every mouse move
    function sliderTime(){
        var val=$('#slider').slider('value');
        var pausedTime=val*1000;
        setTime=true;
        offsetTime=pausedTime;
        currentI=val;
        
        var newTransform = getTransform(currentI);
        totalZoom = newTransform.m11;
        translateX = newTransform.tx;
        translateY = newTransform.ty;
        $('#zoomslider').slider('value', totalZoom);
        $('#zoomlabel').html(parseInt(totalZoom*10)/10);
        clearFrame();
        oneFrame(val);
        changeSlider(val);
        if (isAudio) audio.currentTime=val;
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
    
    //triggered when zoom slider is clicked
    function zoomStart() {
        wasDragging = true;
        previousX = translateX;
        previousY = translateY;
        previousZoom = totalZoom;
    }
    
    //triggered when zoom slider is changed
    function zooming(event, ui) {
        totalZoom = Math.max(minZoom, Math.min(ui.value, maxZoom));
        $('#zoomlabel').html(parseInt(totalZoom*10)/10);
        //zoom in on center of visible portion achieved by extra translations
        translateX = previousX + (1-totalZoom/previousZoom)*(c.width/2-previousX);
        translateY = previousY + (1-totalZoom/previousZoom)*(c.height/2-previousY);
        clearFrame();
        oneFrame(currentI);
    }
    
    function pan(dx, dy) {
        translateX += dx;
        translateY += dy;
        clearFrame();
        oneFrame(currentI);
    }
    
    //triggered when mouse pressed on canvas
    function dragStart(e) {
        isDragging = true;
        previousX = e.pageX;
        previousY = e.pageY;
        if(!wasDragging)
            initialPause=paused;
            pause(); // only pauses the first time
        wasDragging = false;
    }
    
    //triggered when mouse dragged across canvas
    function dragging(e) {
        if(isDragging) {
            wasDragging = true;
            if(dragToPan) {
                var newTx = (e.pageX-previousX);
                var newTy = (e.pageY-previousY);
                pan(newTx, newTy);
                previousX = e.pageX;
                previousY = e.pageY;
            }
            else {
                zoomRectW = Math.max(offset.left, Math.min(e.pageX, offset.left+c.width))-previousX;
                zoomRectH = Math.max(offset.top, Math.min(e.pageY, offset.top+c.height))-previousY;
                if(zoomRectW/zoomRectH > c.width/c.height) //maintains aspect ratio of zoom region
                    zoomRectH = c.height/c.width*zoomRectW;
                else
                    zoomRectW = c.width/c.height*zoomRectH;
                clearFrame();
                oneFrame(currentI);
                if(c.width/Math.abs(zoomRectW/totalZoom) < maxZoom)
                    context.fillStyle = 'rgba(0,255,0,0.1)';
                else
                    context.fillStyle = 'rgba(255,0,0,0.1)';
                context.fillRect((previousX-offset.left-translateX)/totalZoom,
                                 (previousY-offset.top-translateY)/totalZoom,
                                 zoomRectW/totalZoom, zoomRectH/totalZoom);
            }
        }
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
                    nx = Math.min(Math.max(nx,c.width-boundingRect.xmax*xscale*nz),-boundingRect.xmin);
                    ny = Math.min(Math.max(ny,c.height-boundingRect.ymax*yscale*nz),-boundingRect.ymin);
                    animateToPos(Date.now(), 200, nx, ny, nz);
                }
                else {
                    clearFrame();
                    oneFrame(currentI);
                }
                zoomRectW = 0;
                zoomRectH = 0;
            }
            
            if(!wasDragging) { // click
                paused = initialPause;
                previousX=Math.round((previousX-offset.left-translateX)/totalZoom);
                previousY=Math.round((previousY-offset.top-translateY)/totalZoom);
                selectStroke(previousX,previousY);
            }
        }
    }
    
    //animates back to playing position before playing
    function animateToPos(startTime, duration, nx, ny, nz, callback) {
        nx = Math.min(Math.max(nx,c.width-boundingRect.xmax*xscale*nz),-boundingRect.xmin*xscale);
        ny = Math.min(Math.max(ny,c.height-boundingRect.ymax*yscale*nz),-boundingRect.ymin*yscale);
        
        var interpolatedTime = (Date.now() - startTime)/duration;
        
        if(interpolatedTime > 1 | (translateX === nx & translateY === ny & totalZoom === nz)) {
            translateX = nx, translateY = ny, totalZoom = nz;
            $('#zoomslider').slider('value', nz);
            $('#zoomlabel').html(parseInt(nz*10)/10);
            callback();
        }
        else {
            // Use the identity matrix while clearing the canvas
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.clearRect(0, 0, c.width, c.height);
            
            var newZoom = totalZoom + (nz - totalZoom)*interpolatedTime;
            var newX = translateX + (nx - translateX)*interpolatedTime;
            var newY = translateY + (ny - translateY)*interpolatedTime;
            
            drawScrollBars(newX, newY, newZoom);
            
            context.setTransform(newZoom,0,0,newZoom,
                                 newX,newY);
            oneFrame(currentI);
            
            setTimeout(function() {
                animateToPos(startTime, duration, nx, ny, nz, callback);
            }, 10);
        }
    }
    
    function start(){
        if(paused){
            $('#zoomslider').slider({disabled:true});
            wasDragging = false;
            root.find('.start').css('background-image',
                "url('http://web.mit.edu/lilis/www/videolec/pause.png')");
            $('#slider .ui-slider-handle').css('background','#0b0');
            root.find('.video').css('border','1px solid #eee');
            $('.onScreenStatus').css('visibility',"hidden");
            
            paused=false;
            setTime=false;
            initialTime=Date.now()-offsetTime;
            draw=setInterval(graphData,50);
            if (isAudio) audio.currentTime=currentI;
            audio.play();
        }
    }
    
    function pause(){
        $('#zoomslider').slider({disabled:false});
        root.find('.start').css('background-image',
            "url('http://web.mit.edu/lilis/www/videolec/play.png')");
        $('#slider .ui-slider-handle').css('background','#f55');
        root.find('.video').css('border','1px solid #f88');
        
        if (!paused){
            $('.onScreenStatus').css('visibility',"visible");
            fadePauseSign();
        }
        
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
        
        var local = { 'currentTime': undefined, 
                     'furthestPoint': undefined};
        
        localStorage[datafile]=JSON.stringify(local);
        
        
        root.find('.start').css('background-image',
            "url('http://web.mit.edu/lilis/www/videolec/play.png')");
        $('#slider .ui-slider-handle').css('background','#f55');
        root.find('.video').css('border','1px solid #f88');
        
        furthestpoint=0;
        
        oneFrame(imax);
        
        audio.pause();
        if (isAudio) audio.currentTime=0;
        offsetTime=0;
    }
    
    function fadePauseSign(){
        $('.onScreenStatus').animate({
            opacity: 0
        },1000,function(){
            $('.onScreenStatus').css('visibility',"hidden");
            $('.onScreenStatus').css('opacity',".5");
        });
    }
    
    function jumpForward(){
        jump(10);
    }
    
    function jumpBack(){
        jump(-10);
    }
    
    function jump(val){
        var initialpause=paused;
        pause();
        paused=initialpause;
        var time=currentI+val;
        if (time > imax) time = parseInt(imax);
        if (time < 0) time=0;
        currentI=time;
        offsetTime=time*1000;
        setTime=true;
            
        var newTransform = getTransform(currentI);
        totalZoom = newTransform.m11;
        translateX = newTransform.tx;
        translateY = newTransform.ty;
        $('#zoomslider').slider('value', totalZoom);
        $('#zoomlabel').html(parseInt(totalZoom*10)/10);
        
        clearFrame();
        oneFrame(time);
        changeSlider(time);
        if (isAudio) audio.currentTime=time;
        
        if(!paused){ // if it wasn't paused, keep playing
            paused=true; //it only starts if it was previously paused.
            start();
        }
    }
    
    function resizeControls(vidWidth){
        
        $('.controls').css('width', vidWidth);
        
        var buttonWidths=parseInt(vidWidth* 50 / 575);
        if (buttonWidths > 50 ) buttonWidths=50;
        $('.buttons').css('width', buttonWidths+5);
        $('.start').css('width',buttonWidths);
        $('.start').css('background-size',buttonWidths);
        $('.jumpForward').css('width',buttonWidths/2-2);
        $('.jumpBack').css('width',buttonWidths/2-2);
        
        var timeControlWidth=parseInt(vidWidth)-buttonWidths-25;
        $('.timeControls').css('width',timeControlWidth);
        $('#slider').css('width',timeControlWidth-150);
        $('#slider').css('margin-top',buttonWidths/2-5);
        $('.time').css('margin-top',buttonWidths/2-5);
        $('#totalTime').css('margin-top',buttonWidths/2-5);
        
        
        $('.sidecontrols').css('height',2*vidWidth/3);
        
        clearFrame();
        oneFrame(currentI);
    }
    
    
    function resizeVisuals(){
        var c=$('.pentimento').find('.video')[0];
        var windowWidth=$(window).width();
        var windowHeight=$(window).height();
        var videoDim;
        //fit canvas to window width
        if (windowWidth>(windowHeight+150)) { //take smaller of the two
            videoDim=(windowHeight-200);
            if (videoDim<100) {
                videoDim=100;
            }
            var scaleFactor=ymax;
        }
        else {
            videoDim=windowWidth-125;
            var scaleFactor=xmax;
        }
        c.height=ymax * videoDim/scaleFactor;
        c.width=xmax * videoDim/scaleFactor;
        yscale=(c.height)/ymax;
        xscale=(c.width)/xmax;
        offset = root.find('.video').offset();
        resizeControls(c.width);
        $('.sidecontrols').css({position: 'absolute',
                                top: ($('.video').offset().top+'px'),
                                left: (($('.video').offset().left+$('.video').width()+10)+'px')});
        $('.controls').css({position: 'absolute',
                            top: (($('.video').offset().top+$('.video').height()+10)+'px'),
                            left: ($('.video').offset().left+'px')})
        
        var onScreenStatusWidth=c.width * 80/575;
        $('.onScreenStatus').css('margin-top', -c.height/2-onScreenStatusWidth/2);
        $('.onScreenStatus').css('margin-left',c.width/2-onScreenStatusWidth/2);
        $('#pauseIcon').css('width',onScreenStatusWidth+"px");
        $('#pauseIcon').css('height',onScreenStatusWidth+"px");
        $('.onScreenStatus').css('opacity',".5");
        if (paused && currentTime != 0){ //paused but has been started at some point
            $('.onScreenStatus').css('visibility',"visible");
        }else {
            $('.onScreenStatus').css('visibility',"hidden");
        }
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
        function onTouch() {
            element.on('touchend', listenTouch);
            element.on('touchstart', function(e) {down(e.originalEvent.touches[0]);});
            element.on('touchmove', function(e) {move(e.originalEvent.touches[0]);});
        }
        function onClick() {
            element.on('mouseup', listenClick);
            element.on('mousedown', down);
            element.on('mousemove', move);
        }
        function listenTouch(e) {
            element.off('touchend touchstart touchmove');
            doubled = false;
            var click = setTimeout(function() {
                if(!doubled)
                    up();
                doubled = false;
                element.off('touchend');
                onTouch();
            },tolerance);
            element.on('touchend', function() {
                clearTimeout(click);
                double();
                doubled = true;
                element.off('touchend');
                onTouch();
            });
        }
        function listenClick(e) {
            element.off('mouseup mousedown mousemove');
            doubled = false;
            var click = setTimeout(function() {
                if(!doubled)
                    up();
                doubled = false;
                element.off('mouseup');
                onClick();
            },tolerance);
            element.on('mouseup', function() {
                clearTimeout(click);
                double(e);
                doubled = true;
                element.off('mouseup');
                onClick();
            });
        }
        if(!input.touch) onClick();
        else onTouch();
    }
    
    var template="<a href='index.html'>back to menu</a><br><div class='lecture'>"
        + "<canvas class='video'></canvas>"
        + "<div class='onScreenStatus'> <img src='http://web.mit.edu/lilis/www/videolec/pause_big.png' id='pauseIcon' width='0px' height='0px'> </div>"
        + "<div class='sidecontrols'>"
        + "+<div id='zoomslider'></div>-"
        + "<div id='zoomlabel'>1</div>"
        + "Drag to Pan<div id='toggleDrag'></div>Drag to Zoom"
        + "</div>"
        + "<br> <div class='controls'>"
        + "<div class='buttons'>"
        + "<input class='start' type='button'/>"
        + "</div>"
        + "<div class='timeControls'>"
        + "<div id='slider'></div>"
        + "<div id='totalTime'></div>"
        + "</div>"
        + "<audio class='audio' preload='metadata'>"
        + "     <source id='lectureAudio' type='audio/mpeg'>"
        + "</audio>"
        + "</div>"
        + "</div>";
    exports.initialize = function() {
        //root = $("<div class='pentimento'></div>").appendTo($('body'));
        //root.append(template);
        root=$('.pentimento');
        root.append(template);
        
        audio=root.find('.audio')[0];
        var source=root.find('#lectureAudio');
        source.attr('src',audioSource).appendTo(source.parent());
        if (audioSource == '' ) isAudio=false;
        
        $('.buttons').append('<button class="jumpBack"> < </button>');
        $('.buttons').append('<button class="jumpForward"> > </button>');
        
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
        
        $('#slider').append('<div class="tick ui-widget-content"></div>');
        $('#slider').find('.ui-slider-range').removeClass('ui-corner-all');
        
        $('#zoomslider').slider({
            disabled: true,
            orientation: 'vertical',
            range: 'min',
            min: minZoom,
            max: maxZoom,
            step: 0.1,
            value: 1,
            start: zoomStart,
            slide: zooming
        });
        
        c=root.find('.video')[0];
        
        context=c.getContext('2d');
		context.strokeStyle='black';
		context.lineCap='round';
        
        doubleClickHandler({
            element: $(window),
            down: function(e) {
                if(e.target === c)
                    dragStart(e);
            },
            move: dragging,
            up: dragStop,
            double: function(e) {
                if(e.target === c) {
                    isDragging = false;
                    var zoom = totalZoom===1?2:1;
                    function animateZoom() {
                        zoomStart();
                        zooming('trash', {value: totalZoom<zoom?
                                          parseInt(totalZoom*10+1)/10:
                                          parseInt(totalZoom*10-1)/10});
                        $('#zoomslider').slider('value', totalZoom);
                        if(totalZoom !== zoom)
                            setTimeout(animateZoom, 10);
                    }
                    animateZoom();
                }
            },
            touch: false,
            tolerance: 200
        });
        
        c.addEventListener('mousewheel', function(e){
            e.preventDefault();
            e.stopPropagation();
            if(!wasDragging)
                pause();
            if(!dragToPan) {
                var scroll = e.wheelDeltaY;
                if(e.shiftKey)
                    scroll = e.wheelDeltaX;
                if(scroll !== 0) {
                    zoomStart();
                    zooming('trash', {value: totalZoom+0.1*scroll/Math.abs(scroll)});
                    $('#zoomslider').slider('value', totalZoom);
                }
            }
            else
                pan(e.wheelDeltaX, e.wheelDeltaY);
            wasDragging = true;
        });
        
        readFile(datafile,getData); //dataPoints now filled with data
        
        root.find('.jumpForward').on('click',jumpForward);
        root.find('.jumpBack').on('click',jumpBack);
        root.find('#toggleDrag').slider({
            orientation: 'vertical',
            min: -1, max: 1, step: 2, value: 1,
            slide: function(e, ui) {
                dragToPan = ui.value > 0;
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
        
        $('.sidecontrols').append('<br><button id="revertPos">Revert</button>');
        $('.sidecontrols').append('<br><button id="seeAll">See All</button>');
        $('.sidecontrols').css('position', 'absolute');
        
        $('#revertPos').on('click', function () {
            if(!paused) pause();
            var next = getTransform(currentI);
            animateToPos(Date.now(), 200, next.tx, next.ty, next.m11);
        });
        $('#seeAll').on('click', function() {
            if(!paused) pause();
            animateToPos(Date.now(), 200, 0, 0, minZoom);
        });
                
        root.find('.start').on('click',function() {
            if(paused) {
                var next = getTransform(currentI);
                animateToPos(Date.now(), 200, next.tx, next.ty, next.m11, start);
            }
            else {
                pause();
            }
        });
        
        $('body').on('keypress',function(event){
            if (event.keyCode==32){ // space was pressed
                //trigger button click
                root.find('.start').click();
            }
        });
        
        
        console.log(localStorage);
        
        if (localStorage[datafile]!=undefined){
            var local=JSON.parse(localStorage[datafile]);
            currentI=local.currentTime;
            furthestpoint=local.furthestPoint;
            offsetTime=currentI*1000;
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
