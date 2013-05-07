function Sphere(radius, pos) {
    this.type = ko.observable('sphere');
    this.material = ko.observable({
        name: ko.observable('green')
    });
    this.radius = ko.observable(radius || 1);
    this.position = ko.observable(pos || '[0,0,0]');
    this.validRadius = ko.computed(function() {
        return this.radius() > 0;
    }, this);
    this.validPosition = ko.computed(function() {
        try {
            var array = JSON.parse(this.position());
            return array.length == 3;
        } catch (e) {
            return false;
        }
    }, this);
}

function ImageDetails() {
    var self = this;
    self.width = ko.observable(500);
    self.height = ko.observable(500);
    self.samples = ko.observable(1);
}

function App() {
    var self = this;
    self.objectList = ko.observableArray([
    new Sphere(1.1), new Sphere(0.7, '[0.2,0.5,0.5]')]);
    self.render = 1;
    self.clientCount = ko.observable(0);
    self.imageDetails = new ImageDetails();
    self.getConfig = function() {
        var objects = [];
        var ol = self.objectList();
        for (var i in ol) {
            var o = ol[i];
            switch (o.type()) {
                case 'sphere':
                    objects.push({
                        type: 'sphere',
                        position: JSON.parse(o.position()),
                        radius: o.radius(),
                        material: o.material().name(),
                    });
            }
        }
        var materials = [{
            name: 'green',
            ambient: [.1, .1, .1],
            diffuse: [0, 1, 0],
            specular: [1, 1, 1],
            shine: 100,
            reflective: false,
            refractive: false,
            IOR: 1,
        }];
        return {
            objects: objects,
            materials: materials,
            imageDetails: {
                width: self.imageDetails.width(),
                height: self.imageDetails.height(),
                samples: self.imageDetails.samples(),
            }
        };
    }
}

var app = new App();
ko.applyBindings(app);
var socket = io.connect('http://localhost:1128');
socket.on('client:status', function(data) {
    app.clientCount(data.clients);
    //console.log(data);
});

var w = new Worker('/static/js/worker.js');
w.addEventListener('message', function(data) {
    var c =  app.getConfig().imageDetails;
    console.log(data.data);
    if (data.data.type === 'render') {
        var ctx = document.getElementById('canvas').getContext('2d');
        var d = ctx.getImageData(0, 0, c.width, c.height);
        for (var i = 0; i < c.width * c.height * 4; i++) {
            d.data[i] = data.data.result.result[i];
            //console.log(i, i%4, d.data[i]);
        }
        ctx.putImageData(d, 0, 0);
    }
});
w.postMessage({
    method: 'setConfig',
    args: [app.getConfig()]
});
w.postMessage({
    method: 'render',
    args: [0, 0, app.getConfig().imageDetails.width, app.getConfig().imageDetails.width]
});
var oldConfig;
setInterval(function() {
    var currentConfig = JSON.stringify(app.getConfig());
    if (currentConfig == oldConfig) return;
    oldConfig = currentConfig;
    w.postMessage({
        method: 'setConfig',
        args: [app.getConfig()]
    });
    w.postMessage({
        method: 'render',
        args: [0, 0, app.getConfig().imageDetails.width, app.getConfig().imageDetails.width]
    });
}, 500)
