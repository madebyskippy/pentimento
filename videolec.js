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
    var dragToPan = false; //true if dragging to pan, false if dragging to zoom
    var zoomRectW, zoomRectH;
    
    var audio;
    var isAudio=true;
    
    var furthestpoint=0; // furthest point in seconds
    
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
    
    var imax;	// maximum time value
    
    var initialTime; //initial time of start of video
    var currentI=0; //current index of time (in seconds)
    var currentTime; //current time, as given by date.now();
    var offsetTime=0; //for use with pause
    var paused=true;
    var setTime=false; //true if time was set by slider or strokeFinding
    var draw;
    
    var numStrokes=0;
    var dataArray;
    
    function preProcess(json) {
        //invert y transforms
        for(i in json.cameraTransforms) {
            json.cameraTransforms[i].ty = -json.cameraTransforms[i].ty;
        }
        //simplify strokes, divide into similar-direction polygons
        //get bounding box
        return json;
    }
    
    // updates lines and dataPoints with new file
    function getData(file) {
        console.log(JSON.parse(file.responseText));
        dataArray = preProcess(JSON.parse(file.responseText));
        imax = dataArray.durationInSeconds;
        xmax=dataArray.width;
        ymax=dataArray.height;
        resizeVisuals();
        console.log("imax: "+imax);
        $('#slider').slider("option","max",imax);
        slider.max=imax;
        numStrokes=dataArray.visuals.length;
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
        y=(c.height-y)/yscale;
        var minDistance=5; //if the point is further than this then ignore it
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
            offsetTime=time*1000;
            setTime=true;
//            currentI = time;
//            clearFrame();
//            oneFrame(time);
            changeSlider(time);
            if (isAudio) audio.currentTime=time;
        }
        if(!paused){ // if it wasn't paused, keep playing
            paused=true; //it only starts if it was previously paused.
            start();
        }
    }
    
    function clearFrame() {
        // Use the identity matrix while clearing the canvas
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, c.width, c.height);
        
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
                newTransform.tx = newTransform.tx/newTransform.m11;
                newTransform.ty = newTransform.ty/newTransform.m11;
            }
        }
        
        return newTransform;
    }
    
    function graphData(){
		currentTime=Date.now(); //gets current time
		currentI=(currentTime/1000.0)-(initialTime/1000.0) //converts to seconds passed
		changeSlider(currentI);
        
        var newTransform = getTransform(currentI);
        totalZoom = newTransform.m11;
        translateX = newTransform.tx;
        translateY = newTransform.ty;
        $('#slider-vertical').slider('value', totalZoom);
        $('#zoomlabel').html(parseInt(totalZoom*10)/10);
        clearFrame();
        oneFrame(currentI);
        if (currentI>imax) stop();
	}
    
    //draw a parallelogram for each pair of points
    function calligraphize(x, y, pressure) {
        var penWidth = 32*pressure*context.lineWidth;
        context.lineTo(x-penWidth/2,y+penWidth/2);
        context.lineTo(x+penWidth/2,y-penWidth/2);
        context.closePath();
        context.moveTo(x+penWidth/2,y-penWidth/2);
        context.lineTo(x-penWidth/2,y+penWidth/2);
    }
    
    //TESTING - entire stroke is one polygon
    //PROBLEM - split ends when stroke changes directions
    var path;
    function test(startIndex) {
        context.beginPath();
        var point = path[startIndex];
        var endIndex = path.length-1;
        context.moveTo(point[0],point[1]);
        for(var i=startIndex+1; i<=endIndex; i++) {
            point = path[i];
            context.lineTo(point[0]+point[2],point[1]-point[2]);
        }
        for(var i=endIndex; i>=startIndex; i--) {
            point = path[i];
            context.lineTo(point[0]-point[2],point[1]+point[2]);
        }
        context.lineTo(point[0],point[1]);
        context.fill();
        context.stroke();
    }
    
    //displays one frame
    function oneFrame(current){
        
        for(var i=0; i<numStrokes; i++){ //for all strokes
            var currentStroke = dataArray.visuals[i];
            var tmin = currentStroke.tMin;
            var deleted=false;
            
            if(tmin < current){
                var data = currentStroke.vertices;
             
//                context.beginPath();
                //TESTING
                path = [];
                
                //process the properties
                var properties= currentStroke.properties;
                for(var k=0; k< properties.length; k++){ //for all properties of the stroke
                    var property=properties[k];
                    if (property.time < current) { //if property is to be shown
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
                        }
                    }
                }
                
                //draw the stroke
                if (!deleted || !currentStroke.doesItGetDeleted){
                    for (var j = 0; j < data.length; j++) { //for all verticies
                        if (data[j].t < current){
                            var x=data[j].x*xscale;
                            var y=data[j].y*yscale;
                            var pressure = data[j].pressure;
//                            calligraphize(x,ymax*yscale-y,pressure);
                            //TESTING
                            path.push([x,ymax*yscale-y,pressure*context.lineWidth*16]);
                        }
                    }
                    
//                    context.fill();
//                    context.stroke();
                    test(0);
                }
            }
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
            
            //update ticks
            if (current > furthestpoint){
                furthestpoint=current;
                var percentage = (furthestpoint)/imax * 100;
                $('.tick').css('left', percentage + '%');
            }
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
        $('#slider-vertical').slider('value', totalZoom);
        $('#zoomlabel').html(totalZoom);
        
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
        totalZoom = ui.value;
        $('#zoomlabel').html(parseInt(totalZoom*10)/10);
        //zoom in on center of visible portion achieved by extra translations
        translateX = previousX + (1-totalZoom/previousZoom)*(c.width/2-previousX);
        translateY = previousY + (1-totalZoom/previousZoom)*(c.height/2-previousY);
        clearFrame();
        oneFrame(currentI);
    }
    
    //triggered when mouse pressed on canvas
    function dragStart(e) {
        isDragging = true;
        previousX = e.x;
        previousY = e.y;
        if(!wasDragging)
            pause(); // only pauses the first time
        wasDragging = false;
        
        if(!dragToPan) { //tracking zoom region
            zoomRectW = 0;
            zoomRectH = 0;
        }
    }
    
    //triggered when mouse dragged across canvas
    function dragging(e) {
        if(isDragging) {
            wasDragging = true;
            if(dragToPan) {
                var newTx = (e.x-previousX);
                var newTy = (e.y-previousY);
                translateX += newTx;
                translateY += newTy;
                clearFrame();
                oneFrame(currentI);
                previousX = e.x;
                previousY = e.y;
            }
            else {
                var offset=root.find('.video').offset(); //array of left and top
                zoomRectW = Math.max(offset.left, Math.min(e.x, offset.left+c.width))-previousX;
                zoomRectH = Math.max(offset.top, Math.min(e.y, offset.top+c.height))-previousY;
                if(zoomRectW/zoomRectH > c.width/c.height) //maintains aspect ratio of zoom region
                    zoomRectW = c.width/c.height*zoomRectH;
                else
                    zoomRectH = c.height/c.width*zoomRectW;
                clearFrame();
                oneFrame(currentI);
                context.fillStyle = 'rgba(0,0,255,0.1)';
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
            var offset=root.find('.video').offset(); //array of left and top
            
            if(!dragToPan & wasDragging) { //zoom in on region
                var nz = c.width/Math.abs(zoomRectW/totalZoom);
                if(zoomRectW < 0)   previousX += zoomRectW; // upper left hand corner
                if(zoomRectH < 0)   previousY += zoomRectH;
                var nx = -(previousX - offset.left - translateX)/totalZoom*nz;
                var ny = -(previousY - offset.top - translateY)/totalZoom*nz;
                animateToPos(Date.now(), 200, nx, ny, nz, function() {
                    translateX = nx;
                    translateY = ny;
                    totalZoom = nz;
                    $('#slider-vertical').slider('value', totalZoom);
                    $('#zoomlabel').html(parseInt(totalZoom*10)/10);
                });
            }
            
            if(!wasDragging) { // click
                paused = false;
                previousX=Math.round((previousX-offset.left-translateX)/totalZoom);
                previousY=Math.round((previousY-offset.top-translateY)/totalZoom);
                selectStroke(previousX,previousY);
            }
        }
    }
    
    //animates back to playing position before playing
    function animateToPos(startTime, duration, nx, ny, nz, callback) {
        var interpolatedTime = (Date.now() - startTime)/duration;
        
        if(interpolatedTime > 1 | (translateX === nx & translateY === ny & totalZoom === nz)) {
            $('#slider-vertical').slider('value', totalZoom);
            $('#zoomlabel').html(parseInt(totalZoom*10)/10);
            callback();
        }
        else {
            c.width = c.width;
            var newZoom = totalZoom + (nz - totalZoom)*interpolatedTime;
            var newX = (translateX + (nx - translateX)*interpolatedTime);
            var newY = (translateY + (ny - translateY)*interpolatedTime);
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
            $('#slider-vertical').slider({disabled:true});
            wasDragging = false;
            
            var next = getTransform(currentI);
            animateToPos(Date.now(), 200, next.tx, next.ty, next.m11, function() {
                paused=false;
                setTime=false;
                initialTime=Date.now()-offsetTime;
                draw=setInterval(graphData,50);
                audio.play();
            });
        }
    }
    
    function pause(){
        $('#slider-vertical').slider({disabled:false});
        
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
        
        furthestpoint=0;
        translateX = 0;
        translateY = 0;
        totalZoom = 1;
        clearFrame();
        $('#slider-vertical').slider({disabled:true,value:1});
        $('#zoomlabel').html(1);
        $('#slider').slider('value', 0);
        root.find('.time').html('0');
        
        audio.pause();
        if (isAudio) audio.currentTime=0;
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
        //I MADE CHANGES 7/25
        $('.zoomslider').css('height',vidWidth/3);
        
        $('.time').css('margin-top',buttonWidths/2);
        
        oneFrame(currentI);
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
        $('#slider-vertical').slider('value', totalZoom);
        $('#zoomlabel').html(totalZoom);
        
        clearFrame();
        oneFrame(time);
        changeSlider(time);
        if (isAudio) audio.currentTime=time;
        
        if(!paused){ // if it wasn't paused, keep playing
            paused=true; //it only starts if it was previously paused.
            start();
        }
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
        $('.timeControls').css('width','375px');
        $('#slider').css('width','300px');
        $('#slider').css('margin-top','20px');
        $('.zoomslider').css('height', '190px');
        $('.time').css('margin-top','20px');
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
        if (c.width<575) {
            resizeControls(c.width);
        }
        else { resetControlSize(); }
    }
    
    var template="<a href='index.html'>index</a><br><div class='lecture'>"
        + "<canvas class='video' style='cursor:crosshair;'></canvas>"
        + "<div class='zoomslider' style='display:inline-block;position:absolute;margin-left:10px;'>"
        + "+<div id='slider-vertical' style='height:75%;'></div>-"
        + "<div id='zoomlabel'>1</div>"
        + "</div>"
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
        //root = $("<div class='pentimento'></div>").appendTo($('body'));
        //root.append(template);
        root=$('.pentimento');
        root.append(template);
        
        audio=root.find('.audio')[0];
        var source=root.find('#lectureAudio');
        source.attr('src',audioSource).appendTo(source.parent());
        if (audioSource == '' ) isAudio=false;
        
        $('.buttons').append('<button class="jumpBack"> < 10s </button>');
        $('.buttons').append('<button class="jumpForward"> 10s > </button>');
        $('.buttons').append('<button class="toggleDrag"> Drag to Pan </button>');
        
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
        
        $('#slider-vertical').slider({
            disabled: true,
            orientation: 'vertical',
            range: 'min',
            min: 0.5,
            max: 2,
            step: 0.1,
            value: 1,
            start: zoomStart,
            slide: zooming
        });
        
        c=root.find('.video')[0];
        resizeVisuals();
        
        context=c.getContext('2d');
		context.strokeStyle='black';
		context.lineCap='round';
        
//        c.addEventListener('mousedown', dragStart);
//        c.addEventListener('mousemove', dragging);
//        c.addEventListener('mouseup', dragStop);
        window.addEventListener('mousedown', function(e) {
            var offset = root.find('.video').offset();
            if(e.x > offset.left & e.x < offset.left + c.width &
               e.y > offset.top & e.y < offset.top + c.height)
                dragStart(e);
        });
        window.addEventListener('mousemove', dragging);
        window.addEventListener('mouseup', dragStop);
        c.addEventListener('mousewheel', function(e){
            if(!wasDragging)
                pause();
            wasDragging = true;
            console.log(e.wheelDeltaX, e.wheelDeltaY);
            translateX += e.wheelDeltaX;
            translateY += e.wheelDeltaY;
            clearFrame();
            oneFrame(currentI);
        });
        
        readFile(datafile,getData); //dataPoints now filled with data
        
        root.find('.jumpForward').on('click',jumpForward);
        root.find('.jumpBack').on('click',jumpBack);
        root.find('.toggleDrag').on('click', function() {
            dragToPan = !dragToPan;
            this.innerHTML = dragToPan?"Drag to Zoom":"Drag to Pan";
        });
        
        root.find('.pause').on('click',pause);
        root.find('.start').on('click',start);
        root.find('.stop').on('click',stop);
        
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
