/**
 * Main JS for Node Server
 * Copyright (c)2023 Blueprint
 *
 * Updates
 *              
                29.06.2023 - v2.1.0
                  Version node 18.0
                  
                23.02.2021 - v2.0.0
                  Version Node 15.8
                  
                03.04.2018 - v1.0.0
 *                Creation
 *
 * @category  Javacsript Nodejs
 * @package   Node
 * @author    Fred <mapleberry.net@gmail.com>
 * @licence   MIT
 * @version   v2.10 | 29.06.2023
 *
 */
 
// Lancer le server: node app.js
// Home : 
// Ouvrir la page: http://localhost:8080/
// http://tis-web.swatchgroup.net:8080/
// Chemin de module :
// http://localhost:8080/test/index/ping
// http://localhost:8080/test/index/getparams?a=987

// http://localhost:8080/public/app.html

console.log('-------------------')
console.log('# Node Server 2.10')
console.log('# Socket.IO/Express')
console.log('-------------------')
console.log('# starting @'+(new Date()).toISOString().slice(0,-5)+'Z')

const yaml = require('js-yaml')
const fs   = require('fs')
const url = require('url')
const path = require('path')

const appConfig = require('./appconfig.json') // Load config

// Http
var http = require('http')
var globals = []
globals.executeJs = executeJs

//Express.js
var express = require('express')
var app = express()

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*") // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
    next()
})

//Create a route for the first http connection
app.get('*', function (request, response) {
    resolveRoute(request, response)
})

app.post('*', function(request, response, next) {
    resolveRoute(request, response)
})

/**
 * Création du server http
 */
var server = http.createServer(app)

//Socket.io
var io = require('socket.io')(server, {
    cors: {
        origin: appConfig.socketio.corsorigin,
        credentials: true
    }
})
var gsocket = null // Pour la reference dans les modules

// IO ON connection event
io.on('connection', (socket) => {
    console.log("# client connected!");
    gsocket = socket
    socket.username = "usr_" + Math.ceil(Math.random() * 1000)
    
    // Event disconnect
    socket.on('disconnect', (socket) => {
        console.log("# client disconnected!")
    })
    
    // Ecouteur sur un GETC (get command) depuis le client
    socket.on('GETC', (data)  => {
        //console.log("#GETC received: "+data);
        // Executer le GETC depuis le client eg. socket.emit('GETC', 'events/index@loadEvents');
        if (data.length > 0) {
            executeJs('logs/index@log', {msg: 'GETC '+data}) // Logguer l'entrée
            
            var addr = data
            var args = {}
            var q = url.parse(data, true);
            // Décomposer dans le cas de passage de args ?t1=18&t2=13
            
            var queryData = q.query
            if (Object.keys(queryData).length === 0) {}
            else args = queryData
            
            let res = executeJs(addr, args)
            io.emit('RESP', res) // Retour
        }
    })
    
    // Ecouteur sur un GETD (get data) pour transmettre
    socket.on('GETD', (data)  => {
        io.emit('GETD', data)
    })
    
    // Ecouteur sur un SETD (set data) pour transmettre
    socket.on('SETD', (data)  => {
        io.emit('SETD', data)
    })
    
    // Ecouteur sur un RESP (response) pour transmettre
    socket.on('RESP', (data)  => {
        io.emit('RESP', data)
    })
})

/**
 * Port du server dans la config
 */
var port = 8000 // Default port
if (appConfig != undefined) port = appConfig.port

// Process les arguments
process.argv.forEach(function (val, index, array) {
    //console.log(index + ': ' + val)
    if (index == 2) { // Changer le port -> node app.js 8081
        port = val
    }
});

/**
 * Démarrer le server
 */
server.listen(port, console.log("# listening to port "+port))
executeJs('logs/index@log', {msg: 'Server Started'})
// Lancer le module start
//executeJs('start/index@run', {})
// Lancer le module events
//executeJs('events/index@loadEvents', {})

/**
 * Decoder les diferentes parties de l'url
 * Le chemin est : /path/file/function
 */
function resolveRoute(req, response) {
  
    if (req.url=='/favicon.ico') return true // Ignorer favicon
    var data = req.jsonBody
    var q = url.parse(req.url, true)
    //console.log('pathname', q.pathname) //returns '/default.htm'
    //console.log('search', q.search) //returns '?year=2017&month=february'
    
    // Extension = c'est un fichier
    var ext = path.extname(q.pathname)
    if (q.pathname=='/' || ext.length > 0) {
        return getFile(q, response)
    }
    // Pas d'extention dans la requete = c'est une route
    else {
        
        // Calcule la bonne route
        var res = getRoute(q.pathname)
        response.setHeader('Content-Type', 'text/html')
        
        // Query string
        if (req.method == 'POST') { // POST executer le js pour le traitement
            var bodyStr = ''
            req.on("data",function(chunk){
                bodyStr += chunk.toString()
            });
            req.on("end",function(){
                var result = executeJs(res, bodyStr)
                response.type('json')
                response.send(result)
            });
        }
        else { // GET retour du résultat du js
            
            var queryData = q.query
            if (Object.keys(queryData).length === 0) {}
            else data = queryData
        
            var result = executeJs(res, data)
            if(Number.isInteger(result)) { // C'est un int = status
                response.sendStatus(result)
            }
            else response.send(result)
        }
        
        return true
    }
}

/**
 * Decoupe la route pour retourner le nom du fichier et sa fonction
 */
function getRoute(url) {
    // Decode l'URL pour savoir quoi faire
    var aUrl = url.split("/")
    //console.log(aUrl)
    var funct = aUrl.pop() // Nom de la fonction
    //console.log(funct)
    //console.log(aUrl)

    var jsFile = aUrl.join('/') // Chemin et Nom du module JS
    //console.log(jsFile)

    return jsFile+'@'+funct
}

/**
 * Retourne le fichier demandé dans l'url
 */
function getFile(q, response) {
    
    var filename = './index.html'
    
    if (q.pathname!='/') {
        filename = "./modules" + q.pathname.replace('index/', '')
    }
    //console.log('getFile', q.pathname);
    
    // Lire le fichier demandé
    fs.readFile(filename, function(err, data) {
        
        if (err) {
            response.writeHead(404, {'Content-Type': 'text/html'})
            return response.end("404 Not Found")
        }
        
        var ext = path.extname(filename)
        var contentType = 'text/plain'

        if (ext=='.html') contentType = 'text/html'
        else if (ext=='.css') contentType = 'text/css'
        else if (ext=='.js') contentType = 'application/javascript'
        else if (ext=='.woff') contentType = 'font/woff'
        else if (ext=='.jpg') contentType = ''
        else if (ext=='.png') contentType = ''

        //res.writeHead(200, {'Content-Type': 'text/html'})
        if (contentType) {
            response.writeHead(200, {'Content-Type': contentType})
        }
        else response.writeHead(200)
        response.write(data)

        return response.end()
    });
}

/**
 * BOF ?
 */
function timeCallback() {
    setTimeout(function(){ timeCallback(); }, 1000)
}

/**
 * Execute la bonne fonction dans le bon fichier
 * eg: executeJs('test/index@ping', {})
 * peut etre appelé depuis un module avec this.get('globals').executeJs(...)
 */
function executeJs(addr, data) {
  
    //console.log('addr', addr)
    var res = addr.split("@")

    //console.log('executeJs', res)
    if (res[0]) {
        
        try {
            var jso = require("./modules/"+res[0]+".js")
        }
        catch (e) {
            if (e instanceof Error && e.code === "MODULE_NOT_FOUND") {
                let errormsg = "# Error: 404 - Module not found: "+res[0]
                console.log(e)
                executeJs('logs/index@log', {msg: errormsg})
                return 404
            }
            else
                throw e
        }
        
        // Vider le cache pour etre sur de prendre la dernière modif
        var mod = require.resolve("./modules/"+res[0]+".js")
        //console.log(mod)
        delete require.cache[mod]
    
        if (jso != undefined) {
            // Appel de la fonction
            jso.set('io', io) // Passer une référence sur IO
            jso.set('socket', gsocket) // Passer le socket
            jso.set('globals', globals) // Passer les globales 
            
            try {
                return jso[res[1]](data)
            }
            catch (e) {
                let errormsg = "# ERROR 500 - '"+res[0]+"/"+res[1]+"' is not a function"
                //let errormsg = e.stack
                console.log(e)
                executeJs('logs/index@log', {msg: errormsg})
                return 500
            }
        }
    }
    else return false
}
// EO nodeserver App