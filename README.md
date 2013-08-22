pentimento
==========

pentimento video lectures web interface

setup
=====
Files
-----
Root folder must contain all .js, .css, and .html files  
Images must be in root/images subfolder  
Lecture and audio files (.lec, .mp3, .ogg) must be in root/lectures subfolder  
.lec and .mp3/.ogg files should have the same filename (lecture1.lec, lecture1.mp3, lecture1.ogg)  

HTML
----
index.html (or desired index page):
* Include jQuery (js) and generator.js
* generator.js will create a list of links to every lecture in root/lectures  

lecture.html (or desired video player base page) - similar to youtube.com/watch:  
* Include jQuery (js) and jQueryUI (js and css)
* Define a div with class name "pentimento"
* Include videolec.js after div.pentimento
* Every included lecture will use this HTML page  

Structures
==========
URL
---
RootPage.com/BasePage.html?n=<b>FILENAME</B>&t=<b>TIMESTAMP</b>&end=<b>ENDTIME</b>&tm=<b>TRANSFORM</b>  
* filename: name of the lecture file (lecture1 for lecture1.lec/.mp3/.ogg)
* timestamp (optional): time to seek to on load
* endtime (optional, not used yet): specify end point of lecture segment, if only a specific part needs to be watched
* transform (optional, only present if in freePosition): [tx,ty,tz]
  * tx: x-translation
  * ty: y-translation
  * tz: zoom  

More parameters can be easily added in videolec.js  

.lec Files:
-----------
{  
  * durationInSeconds: <i>number</i>,  
  * height: <i>number</i>,  
  * width: <i>number</i>,  
  * cameraTransforms: [{  
    * m11: <i>number</i>,  
    * m12: <i>number</i>,  
    * m21: <i>number</i>,  
    * m22: <i>number</i>,  
    * time: <i>number</i>,  
    * tx: <i>number</i>,  
    * ty: <i>number</i>  

  }, {...}],  
  * pageFlips: [{  
    * page: <i>number</i>,  
    * time: <i>number</i>  

  }, {...}],  
  * visuals: [{  
    * type: <i>string</i>,  
    * doesItGetDeleted: <i>boolean</i>,  
    * tDeletion: <i>number</i>,  
    * tEndEdit: <i>number</i>,  
    * tMin: <i>number</i>,  
    * properties: [{
      * type: <i>string</i>,  
      * alpha: <i>number</i>,  
      * alphaFill: <i>number</i>,  
      * blue: <i>number</i>,  
      * blueFill: <i>number</i>,  
      * green: <i>number</i>,  
      * greenFill: <i>number</i>,  
      * red: <i>number</i>,  
      * redFill: <i>number</i>,  
      * thickness: <i>number</i>,  
      * time: <i>number</i>  

    }, {...}],  
    * vertices: [{  
      * x: <i>number</i>,  
      * y: <i>number</i>,  
      * t: <i>number</i>,  
      * pressure: <i>number</i>  

  }, {...}]  

  }]  

}  

HTML (generated within div.pentimento)
--------------------------------------
link back to index page  
div.lecture  
  * canvas.video - main video window  
  * div.onScreenStatus - contains fading play/pause indicator icon  
  * div.captions - CURRENTLY UNUSED, can hold sutitles  
  * div.controls - bottom control bar  
    * div#slider - video scrubber  
      * div.tick - green bar showing furthest point watched  
    * div.buttons  
      * button.start - play/pause  
      * button.slowDown - decreases playback speed  
      * button.speedUp - increases playback speed  
      * button.help - brings up about dialog  
    * div#totalTime - current time / total time  
    * button.volume - toggles mute  
    * div.volumeSlider - volume control  
    * audio.audio - contains sources for lecture audio  
    * div.speedDisplay - displays playback speed if not 1x  
  * div.zoomRect - indicator box for shift-drag to zoom in on region  
  * div.sideButtons - side control bar  
    * button.transBtns#zoomIn - all .transBtns styled similarly  
    * button.transBtns#revertPos - re-find and follow lecture camera  
    * button.transBtns#seeAll - zooms out maximally to view everything  
    * button.transBtns#zoomOut
    * button.transBtns#fullscreen
    * button.transBtns#screenshotURL - opens screenshot in new tab  
    * button.transBtns#timeStampURL - toggles link popup  
    * div.URLinfo - popup containing state-saved URL and embedding code  
      * button#linkbutton - displays state-saved link in text box  
      * button#embedbutton - displays iframe embed code in text box  
      * textarea.URLs - text box  

Player Behavior
===============
User Interactions
-----------------
* Click - seeks nearest point within minDistance, goes to point in lecture  
* Double-Click - zooms in/out on click point  
* Drag - pan around  
  * Shift-Drag - zoom in on selected region  
* Scroll - pan around  
  * Shift-Scroll - zoom in/out on center of screen  

Playback
--------
* All strokes rendered for every frame
  * Each stroke is 1 polygon, properties determined by data  
  * Strokes beyond current time but before furthest reached point are gray  
* Animation uses quintic easing  
* Camera transform linearly interpolated from timestamped data transforms  
* Lower bound on size: 400px wide  
* Saves current timestamp and transform in localStorage  

Data Preprocessing
------------------
* Flips y coordinates  
* Obtains extrema for bounding transforms  
* Translates colors into RGB strings  
* Simplifies extremely close points  
* Amplifies low-pressure beginning/end of strokes  
* Straightens almost-linear strokes, simplifies again  
* Inserts break property for points that break the calligraphy 45-degree line  
