var http = require('http');
var fs = require('fs');

var app = http.createServer(function(req, res) {
    fs.readFile('.'+req.url, {
        encoding: 'utf-8'
    }, function(err, data) {
        if(err) {
            res.writeHead(404);
            return res.end(err.toString());
        }
        res.writeHead(200);
        res.end(data);
    })
});

app.listen(1127);

var io = require('socket.io').listen(1128);
var clients = 0;

io.sockets.on('connection', function (socket) {
    clients++;
    socket.broadcast.emit('client:status', {clients:clients});
    socket.emit('client:status', {clients:clients});
    socket.on('disconnect', function(){
        clients--;
        socket.broadcast.emit('client:status', {clients:clients});
    });
    socket.on('foo', function(data) {
        console.log(data);
    });
});
