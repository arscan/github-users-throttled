var http = require('http'),
    fs = require("fs"),
    util = require('util'),
    conf = require('nconf'),   
    express = require('express'),
    request = require('request'),
    app = express(),
    webserver = http.createServer(app);

var users = {},
    lastLookup = Date.now(),
    sentLowNotice = false,
    pauseUntil = 0;

var CACHE_FILENAME = "users_cache.json",
   url = 'https://api.github.com/users/',
   userAgent = 'github.com/arscan/github-timeline-stream';

  
conf.env().argv().file({file: __dirname + "/config.json"}).defaults({
    'GITHUB_API_WAIT_FOR': 5000,
    'GITHUB_PORT': '8080'
});

if(fs.existsSync(__dirname + "/" + CACHE_FILENAME)){
    users = JSON.parse(fs.readFileSync(__dirname + "/" + CACHE_FILENAME, 'utf8'));
}

app.get("/users/:user", function(req,res){


    /* check to see if the user is in the cache */

    if(users[req.params.user]){
        console.log("Cache Hit");
        res.send(JSON.stringify(users[req.params.user]));
        return;
    }

    /* not in the cache, see if I can make the call yet */

    if(Date.now() - parseInt(conf.get("GITHUB_API_WAIT_FOR"),10) > lastLookup) {
        callApi(req.params.user, res);
        lastLookup = Date.now();
    } else {
        res.send("{}");
        console.log("too soon");
    }
});


function callApi(user, res){
    var requestOpts = {};

    if(Date.now() < pauseUntil){
        res.send({message: "Over limit"});
        return;
    }

    requestOpts.url = url + user;
    requestOpts.headers = {
        "User-Agent": userAgent,
        "Accept": "application/vnd.github.v3+json"
    };

    if(conf.get('GITHUB_TOKEN') !== undefined){
        requestOpts.auth = {
            user: conf.get('GITHUB_TOKEN'),
            pass: "x-oauth-basic",
            sendImmediately: true
        }

    } else if(conf.get('GITHUB_USERNAME') !== undefined && conf.get('GITHUB_PASSWORD') !== undefined){
        requestOpts.auth = {
            user: conf.get('GITHUB_USERNAME'),
            pass: conf.get('GITHUB_PASSWORD'),
            sendImmediately: true
        }
    }

    request(requestOpts,function(error, response, body){

        var rateRemaining = parseInt(response.headers['x-ratelimit-remaining'], 10),
        rateReset = parseInt(response.headers['x-ratelimit-reset'], 10);

        if(rateRemaining <= 60 ){
            if(!sentLowNotice){
                console.log("Github-timeline-stream: You have only " + rateRemaining + " requests remaining, you probably should authenticate.  See Readme");
                sentLowNotice = true;
            }
        } 

        if (rateRemaining < 1){
            console.log("Github-timeline-stream: You have exhausted your requests.  Consider authenticating");
            pauseUntil = parseInt(response.headers['x-ratelimit-reset'], 10);
        }

        users[user] = JSON.parse(body);
    
        res.send(body);

    });
}

function saveUsers(){
    fs.writeFile(__dirname + '/' + CACHE_FILENAME, JSON.stringify(users), function(){
        console.log("_____saved users");
    });
}

setInterval(saveUsers, 60000);

app.listen(conf.get('GITHUB_PORT'));
