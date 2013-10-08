var http = require('http');
var fs = require('fs');

var app = http.createServer(function(req, res) {
    if(req.url == '/') req.url = '/index2.html';
    if(req.url == '/admin') req.url = '/index.html';
    fs.readFile('.' + req.url, {
        encoding: 'utf-8'
    }, function(err, data) {
        if (err) {
            res.writeHead(404);
            return res.end(err.toString());
        }
        res.writeHead(200);
        res.end(data);
    })
});

app.listen(1127);

var io = require('socket.io').listen(1128, {
    log: false
});
var clientID = 1;
var clients = {};
var sockets = {};

io.sockets.on('connection', function(socket) {
    var id = clientID++;
    clients[id] = [];
    sockets[id] = socket;
    socket.broadcast.emit('client:status', {
        clients: clients
    });
    setTimeout(function() {
        socket.emit('client:status', {
            clients: clients,
            id: id,
        });
    }, 1000);
    socket.on('disconnect', function() {
        delete clients[id];
        delete sockets[id];
        socket.broadcast.emit('client:status', {
            clients: clients
        });
    });
    socket.on('workers', function(data) {
        clients[id] = data;
        console.log(data);
        socket.broadcast.emit('client:status', {
            clients: clients
        });
        socket.emit('client:status', {
            clients: clients,
        });
    });
    socket.on('doJob', function(data) {
        try {
            console.log(data, data.id, data.job.length);
            sockets[data.id.client].emit('doJob', {
                worker: data.id.worker,
                job: data.job
            });
        } catch (ex) {

        }
    });
    socket.on('render', function(data) {
        socket.broadcast.emit('render', data);
    })
});
