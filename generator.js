//generates URLs of pages

/*

index creates URLs

parameters for URLs:
    -datafile name n
    -start time (optional) t
    -end time (optional) end 
    
    videolec/lecture.html?n=filename&t=51&end=63

index.html makes <span>filename</span>
generator.js finds each span, uses the data within to generate a url
    replaces the filename with a link to the lecture
    
    todo:
        -first, make sure videolec.js can read the url data
        -implement

*/

$(document).ready(function(){
    $('.lec').each(function(){
        var name=$(this).text();
        $(this).html("<a href='lecture.html?n="+name+"'>"+name+"</a>");
    });
});