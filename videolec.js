var Grapher = function() {
    exports = {};
    var c;
    var context;
    var contextHeight=600;
    
    var root, sidecontrols, controls;
    
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
    var freePosition = false;
    var animating = false;
    
    //LIMITS ON THINGS
    var boundingRect = {xmin: 0, xmax: 0, ymin: 0, ymax: 0, width: 0, height: 0};
    var maxZoom = 4, minZoom = 1;
    
    var audio;
    var isAudio=true;
    
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
//        var totalReduction = 0;
        for(k in json.visuals) {
            var stroke = json.visuals[k].vertices;
            for(j in stroke) {
                var point = stroke[j];
                point.y = json.height-point.y;
                if(point.x < boundingRect.xmin) boundingRect.xmin = point.x;
                if(point.x > boundingRect.xmax) boundingRect.xmax = point.x;
                if(point.y < boundingRect.ymin) boundingRect.ymin = point.y;
                if(point.y > boundingRect.ymax) boundingRect.ymax = point.y;
            }
            
//            var orig = stroke.length;
//            //simplify strokes
//            var j=0;
//            var step=5;
//            while(j<stroke.length-step) {
//                var sumDist = 0;
//                var a = stroke[j];
//                var c = stroke[j+step];
//                var bx = c.x-a.x;
//                var by = c.y-a.y;
//                for(var i=j+1; i<j+step; i++) {
//                    var b = stroke[i];
//                    var ax = b.x-a.x;
//                    var ay = b.y-a.y;
//                    var dot = (ax*bx+ay*by)/(bx*bx+by*by);
//                    var cx = ax-dot*bx;
//                    var cy = ay-dot*by;
//                    sumDist += Math.sqrt(cx*cx+cy*cy);
//                }
//                if(sumDist < 0.2) {
//                    stroke.splice(j+1,step);
//                    j--;
//                }
//                j++;
//            }
//            totalReduction += orig-stroke.length;
        }
//        console.log(totalReduction);
//        //divide into similar-direction polygons
//        var totnews = 0;
//        for(var i=0; i<json.visuals.length; i++) {
//            var visual = json.visuals[i],
//                stroke = visual.vertices,
//                newStrokes = [];
//            //find all breaking points
//            var cosb;
//            var j=10;
//            
//            while(j<stroke.length-10) {
//                var point = stroke[j],
//                    next = stroke[j+1];
//                var ab = getDistance(parseInt(point.x), parseInt(point.y), parseInt(next.x), parseInt(next.y)),
//                    bc = getDistance(parseInt(next.x), parseInt(next.y), parseInt(next.x+1), parseInt(next.y+1)),
//                    ac = getDistance(parseInt(point.x), parseInt(point.y), parseInt(next.x+1), parseInt(next.y+1));
//                if(ab !== 0 & bc !== 0) {
//                    var newcosb = (Math.pow(ab,2)+Math.pow(bc,2)-Math.pow(ac,2))/(2*ab*bc);
//                    newcosb = parseInt(newcosb*1000)/1000;
//                    if(Math.abs(newcosb) !== 0.316 & Math.abs(newcosb) !== 0.707 & !isNaN(newcosb)) {
//                        if(cosb !== undefined & newcosb/cosb < 0) {
//                            newStrokes.push(j);
//                            totnews++;
//                        }
//                        cosb = newcosb;
//                    }
//                }
//                j++;
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
//        console.log(totnews);
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
            displayZoom(totalZoom);
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
                    if (currentStroke.tDeletion<furthestpoint) deletedYet=true;
                }
                if (currentStroke.vertices[j].t<furthestpoint & !deletedYet){
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
        
        console.log(closestPoint, initialPause);
        if (closestPoint.stroke!= -1){ //it found a close enough point
            var time=parseFloat(dataArray.visuals[closestPoint.stroke].vertices[0].t);
            currentI = time;
            audio.currentTime = time;
            
            if(!freePosition) {
                var newTransform = getTransform(currentI);
                freePosition = true;
                animateToPos(Date.now(), 200, translateX, translateY, totalZoom, newTransform.tx, newTransform.ty, newTransform.m11, function(){
                    $('#zoomslider').slider('value', totalZoom);
                    displayZoom(totalZoom);
                    changeSlider(time);
                    freePosition = false;
                });
            }
        }
    }
    
    function drawScrollBars(tx, ty, z) {
        context.beginPath();
        context.strokeStyle = 'rgba(0,0,0,0.3)';
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
    
    function drawBox(tx, ty, z) {
        context.beginPath();
        context.strokeStyle = 'rgba(0,0,255,0.2)';
        context.lineWidth = 5/z;
        context.setLineDash([5,2]);
        var width = xmax*xscale/z;
        var height = ymax*yscale/z;
        context.moveTo(-tx, -ty);
        context.lineTo(-tx+width, -ty);
        context.lineTo(-tx+width, -ty+height);
        context.lineTo(-tx, -ty+height);
        context.lineTo(-tx, -ty);
        context.stroke();
        context.setLineDash([0]);
    }
    
    function clearFrame() {
        // Use the identity matrix while clearing the canvas
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, c.width, c.height);
        
        translateX = Math.min(Math.max(translateX,c.width-boundingRect.xmax*xscale*totalZoom),-boundingRect.xmin*xscale);
        translateY = Math.min(Math.max(translateY,c.height-boundingRect.ymax*yscale*totalZoom),-boundingRect.ymin*yscale);
        totalZoom = Math.min(maxZoom, Math.max(totalZoom, minZoom));
        
        if((audio.paused | freePosition) & totalZoom !== minZoom & !isScreenshot) {
            drawScrollBars(translateX, translateY, totalZoom);
        }
        
        // Restore the transform
        context.setTransform(totalZoom,0,0,totalZoom,
                             translateX,translateY);
        
        //draw indicator box
        if(freePosition & !animating) {
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
        else
            return {tx: translateX, ty: translateY, m11: totalZoom};
    }
    
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
            $('#zoomslider').slider('value', totalZoom);
            displayZoom(totalZoom);
        }
        clearFrame();
        oneFrame(currentI);
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
                        else if(data[j].t < furthestpoint & data[j].t > current)
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
    
    function changeSlider(current){
        if (current<=imax){ 
            $('#slider').slider('value',current);
            var secondsPassed=parseFloat(current);
            root.find('.time').html(secondsToTimestamp(secondsPassed));
            
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
        currentI=val;
        
        var newTransform = getTransform(currentI);
        totalZoom = newTransform.m11;
        translateX = newTransform.tx;
        translateY = newTransform.ty;
        $('#zoomslider').slider('value', totalZoom);
        displayZoom(totalZoom);
        clearFrame();
        oneFrame(val);
        changeSlider(val);
        if (isAudio) audio.currentTime=val;
    }
    
    //triggered after a user stops sliding
    function sliderStop(event, ui){
        if (initialPause){ //if it was paused, don't do anything
            return;
        }
        audio.play();
    }
    
    //triggered when user starts sliding
    function sliderStart(event, ui){
        initialPause=audio.paused;
        audio.pause();
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
        setTimeout(function(){
            $('#zoomlabel').html(parseInt(totalZoom*10)/10).position({
                my: 'left center',
                at: 'right center',
                of: $('#zoomslider .ui-slider-handle'),
                offset: '0,10'
            });
            $('#zoomlabel').css('padding-left','5px');
        },5);
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
            //NOT VISIBLE AND MOUSED OVER - SHOW
            if(!controlsVisible & (y > $(window).height()-15 | x > $(window).width()-15))
                animateControls(true);
            //VISIBLE AND NOT MOUSED OVER - HIDE
            if(controlsVisible & 
               (y < $(window).height()-controls.outerHeight(true) & 
                x < $(window).width()-sidecontrols.outerWidth(true)))
                animateControls(false);
        }
    }
    
    function animateControls(show) {
        if(show) {
            console.log('show');
            controls.css('visibility','visible');
            controls.animate({opacity: 1},200);
            sidecontrols.css('visibility','visible');
            sidecontrols.animate({opacity: 1},200);
            controlsVisible = true;
        }
        else {
            console.log('hide');
            controls.animate({opacity: 0},200);
            setTimeout(function(){controls.css('visibility','hidden');},200);
            sidecontrols.animate({opacity: 0},200);
            setTimeout(function(){sidecontrols.css('visibility','hidden');},200);
            controlsVisible = false;
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
                    animateToPos(Date.now(), 200, translateX, translateY, totalZoom, nx, ny, nz);
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
        animating = true;
        nx = Math.min(Math.max(nx,c.width-boundingRect.xmax*xscale*nz),-boundingRect.xmin*xscale);
        ny = Math.min(Math.max(ny,c.height-boundingRect.ymax*yscale*nz),-boundingRect.ymin*yscale);
        
        var interpolatedTime = (Date.now() - startTime)/duration;
        
        if(interpolatedTime > 1 | (tx === nx & ty === ny & tz === nz)) {
            animating = false;
            translateX = nx, translateY = ny, totalZoom = nz;
            $('#zoomslider').slider('value',nz);
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
            
            setTimeout(function() {
                animateToPos(startTime, duration, tx, ty, tz, nx, ny, nz, callback);
            }, 50);
        }
    }
    
    function start(){
        $('#zoomslider').slider({disabled:true});
        wasDragging = false;
        root.find('.start').css('background-image',
            "url('http://web.mit.edu/lilis/www/videolec/pause.png')");
        $('#slider .ui-slider-handle').css('background','#0b0');
        root.find('.video').css('border','1px solid #eee');
        
        $('#pauseIcon').attr("src",'play_big.png');
        fadeSign('pause_big.png');
        
        draw=clearInterval(draw);
        draw=setInterval(graphData,50);
    }
    
    function pause(){
        $('#zoomslider').slider({disabled:false});
        $('#timeStampURL').attr("disabled",false);
        $('#screenshotURL').attr("disabled",false);
        root.find('.start').css('background-image',
            "url('play.png')");
        $('#slider .ui-slider-handle').css('background','#f55');
        root.find('.video').css('border','1px solid #f88');
        
        $('#pauseIcon').attr("src",'pause_big.png');
        fadeSign('play_big.png');
        
        draw=clearInterval(draw);
    }
    
    function stop(){
        draw=clearInterval(draw);
        
        localStorage[datafile]=undefined;
        
        root.find('.start').css('background-image',
            "url('play.png')");
        $('#slider .ui-slider-handle').css('background','#f55');
        root.find('.video').css('border','1px solid #f88');
        
        furthestpoint=0;
        
        oneFrame(imax);
    }
    
    function fadeSign(nextImg){
        $('.onScreenStatus').stop();
        $('.onScreenStatus').css('visibility',"visible");
        $('.onScreenStatus').css('opacity',".5");
        $('.onScreenStatus').animate({
            opacity: 0
        },750,function(){
            $('.onScreenStatus').css('visibility',"hidden");
            $('.onScreenStatus').css('opacity',".5");
            $('#pauseIcon').attr('src',nextImg);
        });
    }
    
    function resizeControls(vidWidth){
        if(fullscreenMode)
            vidWidth = $(window).width();
        controls.css('width', vidWidth);
        
        var bigButtonWidths=parseInt(vidWidth* 50 / 575);
        var smallButtonWidths=parseInt(vidWidth* 30/575);
        if (bigButtonWidths > 50 ) {
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
        
        var volWidth= vidWidth * 30/575;
        if (volWidth > 30) volWidth=30;
        $('.volume').css('width',volWidth);
        $('.volume').css('height',volWidth);
        $('.volume').css('background-size',volWidth);
        $('.volume').css('margin-top',bigButtonWidths/2 - volWidth/2);
        $('.volumeSlider').position({
            my: 'center bottom',
            at: 'center top-10',
            of: $('.volume'),
        });
        
        var timeControlWidth=parseInt(vidWidth)-totalButtonWidth-volWidth-5;
        $('.timeControls').css('width',timeControlWidth);
        $('.timeControls').css('margin-left',totalButtonWidth);
        $('#slider').css('width',timeControlWidth-150);
        $('#slider').css('margin-top',bigButtonWidths/2-5);
        $('#totalTime').css('margin-top',bigButtonWidths/2-5);
        
        if(fullscreenMode)
            sidecontrols.css('height', $(window).height());
        else
            sidecontrols.css('height',2*vidWidth/3);
        $('#zoomslider').css('height','100%');
        displayZoom(totalZoom);
        
        clearFrame();
        oneFrame(currentI);
    }
    
    function resizeVisuals(){
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
            videoDim=windowWidth-185;
            var scaleFactor=xmax;
        }
        
        if(fullscreenMode) {
            root.find('.menulink').hide();
            c.height = windowHeight;
            c.width = xmax/ymax*c.height;
            if(c.width > windowWidth) {
                c.width = windowWidth;
                c.height = ymax/xmax*c.width;
            }
            $('.lecture').css({height: c.height,
                               width: c.width,
                               margin: 'auto auto'});
            sidecontrols.css({position: 'absolute',
                                    top: 0,
                                    left: ((windowWidth-
                                            sidecontrols.outerWidth(true))+'px'),
                                    'background-color':'rgba(235,235,235,0.9)'});
            controls.css({position: 'absolute',
                                top: ((windowHeight-controls.outerHeight(true))+'px'),
                                left: 0,
                                'background-color':'rgba(235,235,235,0.9)'});
        }
        else {
            root.find('.menulink').show();
            c.height=ymax * videoDim/scaleFactor;
            c.width=xmax * videoDim/scaleFactor;
            $('.lecture').css({height: 'auto',
                               width: 'auto'});
            sidecontrols.css({position: 'absolute',
                                    top: ($('.video').offset().top+'px'),
                                    left: (($('.video').offset().left+
                                            $('.video').width()+10)+'px'),
                                    'background-color':'rgba(255,255,255,0)',
                                    visibility: 'visible',opacity: 1});
            controls.css({position: 'absolute',
                                top: (($('.video').offset().top+
                                       $('.video').height()+10)+'px'),
                                left: ($('.video').offset().left+'px'),
                                'background-color':'rgba(255,255,255,0)',
                                visibility: 'visible',opacity: 1});
        }
        
        $('.captions').css('width',c.width);
        $('.captions').css('top',$('.controls').offset().top - 50 + 'px');
        $('.speedDisplay').css('top', -45 + 'px');
        var fontsize = c.width * 30/575;
        if (fontsize > 30 ) fontsize=30;
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
        
        $('#revertPos').css({top: offset.top+10,
                             left: (offset.left+c.width-100*xscale-20),
                             height:(100*yscale),
                             width:(100*xscale)});
    }
    
    //custom handler to distinguish between single- and double-click events
    //TODO: test on actual touch device
    function doubleClickHandler(input) {
        var element = input.element;
        var down = input.down;
        var move = input.move;
        var up = input.up;
        var double = input.double;
        var tolerance = input.tolerance;
        var doubled = false;
        function onClick() {
            element.on('mouseup', listenClick);
            element.on('mousedown', down);
            element.on('mousemove', move);
        }
        function listenClick(e) {
            element.off('mouseup mousedown mousemove');
            doubled = false;
            var click = setTimeout(function() {
                console.log('click');
                if(!doubled)
                    up();
                doubled = false;
                element.off('mouseup');
                onClick();
            },tolerance);
            element.on('mouseup', function() {
                console.log('doubleclick');
                clearTimeout(click);
                double(e, e.target);
                doubled = true;
                element.off('mouseup');
                onClick();
            });
        }
        onClick();
    }
    
    function fullscreen(yes) {
        fullscreenMode = yes;
        if(yes) {
            try {root[0].mozRequestFullScreen();}
            catch(e) {root[0].webkitRequestFullScreen();}
        }
        else {
            try {document.mozCancelFullScreen();}
            catch(e) {document.webkitCancelFullScreen();}
        }
        root.find('#fullscreen').html(fullscreenMode?"Exit Fullscreen":"Fullscreen");
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
        $('#revertPos').css('visibility', free?'visible':'hidden');
    }
    
    var template="<a class='menulink' href='index.html'>back to menu</a><div class='lecture'>"
        + "<canvas class='video'></canvas>"
        + "<div class='onScreenStatus'> <img src='pause_big.png' id='pauseIcon' width='0px' height='0px'> </div>"
        + "<div class='sidecontrols'>"
        + " <div class='zoomControls'><span class='zoomlabel'>+</span>"
        + "     <div id='zoomslider'></div>"
        + "     <span class='zoomlabel' style='margin-top: -20px;'>-</span>"
        + "     <div id='zoomlabel'>1</div> </div>"
        + " <div class='toggleControls'>"
        + "     <div class='left'>drag: </div>"
        + "     <div class='right'>"
        + "         <div class='labels' id='pan'>pan</div>"
        + "         <div class='labels' id='zoom'>zoom</div>"
        + "         <div id='toggleDrag'></div></div>"
        + " </div>"
        + "</div>"
        + "<br> <div class='captions'>test captions</div>"
        + "<div class='controls'>"
        + " <div class='buttons'>"
        + "     <input class='start' type='button'/>"
        + " </div>"
        + " <div class='timeControls'>"
        + "     <div id='slider'></div>"
        + "     <div id='totalTime'></div>"
        + " </div>"
        + " <button class='volume'></button>"
        + "<audio class='audio' preload='metadata'>"
        + "     <source id='lectureAudio' type='audio/mpeg'>"
        + "</audio>"
        + "</div>"
        + "</div>"
        + "<div class='zoomRect'></div>";
    exports.initialize = function() {
        root=$('.pentimento');
        root.append(template);
        zoomRect = root.find('.zoomRect');
        sidecontrols = root.find('.sidecontrols');
        controls = root.find('.controls');
        
        var filename=getURLParameter('n',location.search);
        var t=getURLParameter('t',location.search);
        var end=getURLParameter('end',location.search);
        console.log(filename,t,end);
        
        datafile="lectures/"+filename+".lec";
        audioSource="lectures/"+filename+".mp3";
        
        if (!urlExists(audioSource)) {
            audioSource='';
            isAudio=false;
        }
        
        audio=root.find('.audio')[0];
        var source=root.find('#lectureAudio');
        source.attr('src',audioSource).appendTo(source.parent());
        root.append('<div class="volumeSlider"></div>');
        audio.volume=.5;
        
        $('.volumeSlider').slider({
            max:1,
            min:0,
            step:.1,
            value:audio.volume,
            orientation: 'vertical',
            range: "min",
            slide: function(event, ui){
                audio.volume=ui.value;},
        });
        
        $('.volume').on('click',function(){
            if ( $('.volumeSlider').css('visibility') == 'visible')
                $('.volumeSlider').css('visibility','hidden');
            else 
                $('.volumeSlider').css('visibility','visible');
        });
        
        $('.buttons').append('<button class="jumpBack"></button>');
        $('.buttons').append('<button class="jumpForward"></button>');
        $('.controls').append('<div class="speedDisplay"></div>');
        
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
                    isDragging = false;
                    var nz = totalZoom===1?2:1;
                    //zoom in on center of visible portion achieved by extra translations
                    var nx = translateX + (1-nz/totalZoom)*(c.width/2 + (e.pageX-offset.left-c.width/2)-translateX);
                    var ny = translateY + (1-nz/totalZoom)*(c.height/2 + (e.pageY-offset.top-c.height/2)-translateY);
                    animateToPos(Date.now(), 200, translateX, translateY, totalZoom, nx, ny, nz);
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
                    $('#zoomslider').slider('value', totalZoom);
                }
            }
            else
                pan(e.wheelDeltaX, e.wheelDeltaY);
            wasDragging = true;
        });
        
        function checkForAudio() {
            if(audio.readyState === 4 | !isAudio)
                readFile(datafile,getData);
            else
                setTimeout(checkForAudio, 50);
        }
        checkForAudio();
        
        root.find('.jumpForward').on('click', function() {
            audio.playbackRate += 0.1;
            speedIndicators();
        });
        root.find('.jumpBack').on('click', function() {
            audio.playbackRate -= 0.1;
            speedIndicators();
        });
        
        root.find('#toggleDrag').slider({
            orientation: 'vertical',
            min: -1, max: 1, step: 2, value: 1,
            slide: function(e, ui) {
                dragToPan = ui.value > 0;
                //true if dragging to pan
                if (dragToPan) {
                    $('.labels#pan').css('color','#000');
                    $('.labels#zoom').css('color','#aaa');
                } else{
                    $('.labels#pan').css('color','#aaa');
                    $('.labels#zoom').css('color','#000');
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
        
        root.append('<button id="revertPos" style="visibility:hidden;"><img src="revert.png"></img></button>');
        sidecontrols.append('<br><button id="seeAll">See All</button>');
        sidecontrols.append('<br><button id="fullscreen">Fullscreen</button>');
        sidecontrols.append('<br><button id="touch">Touch</button>');
        sidecontrols.append('<br><br><textarea id="URLs" ' +
                                  'readonly="readonly" rows="3" '+
                                  'cols="8" wrap="soft"></textarea>');
        sidecontrols.append('<br><button id="timeStampURL">current URL</button>');
        sidecontrols.append('<br><button id="screenshotURL">screenshot</button>');
        sidecontrols.append('<br><br><input type="checkbox" name="captionsOption" value="captionsChoice" class="captionsOption">captions</input>');
        
        sidecontrols.css('position', 'absolute');
        
        $('#revertPos').on('click', function () {
            setFreePosition(false);
            var next = getTransform(audio.currentTime+0.5);
            freePosition = true;
            animateToPos(Date.now(), 200, translateX, translateY, totalZoom, next.tx, next.ty, next.m11, function() {
                freePosition = false;
            });
        });
        $('#seeAll').on('click', function() {
            setFreePosition(true);
            animateToPos(Date.now(), 200, translateX, translateY, totalZoom, 0, 0, minZoom);
        });
        $('#fullscreen').on('click', function() {
            fullscreenMode = !fullscreenMode;
            fullscreen(fullscreenMode);
        });
        
        audio.addEventListener('play', start);
        audio.addEventListener('pause', pause);
        audio.addEventListener('ended', stop);
        
        $('#touch').on('click', function() {
            $(this).html($(this).html()==="Touch"?"Mouse":"Touch");
            doubleClick.toggle();
        });
        
        $('#timeStampURL').on('click',function(){
            var url = window.location.origin + window.location.pathname
            url = url + '?n='+ getURLParameter('n',location.search);
            $('#URLs').val(url+'&t='+currentI);
        });
        
        $('#screenshotURL').on('click',function(){
            isScreenshot=true;
            clearFrame();
            oneFrame(currentI);
            isScreenshot=false;
            var dataURL=c.toDataURL("image/png");
            window.open(dataURL);
        });
        
        $('.captionsOption').on('click',function(){
            if ($(this).is(':checked'))
                $('.captions').css('visibility','visible');
            else $('.captions').css('visibility','hidden');
        });
                
        root.find('.start').on('click',function() {
            if(audio.paused) {
                var next = getTransform(audio.currentTime);
                animateToPos(Date.now(), 200, translateX, translateY, totalZoom, next.tx, next.ty, next.m11, function() {
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
        });
        
        console.log(localStorage);
        
        if (localStorage[datafile]!='undefined'){
            var local=JSON.parse(localStorage[datafile]);
            currentI=local.currentTime;
            furthestpoint=local.furthestPoint;
        }
        if (t != -100) {
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
