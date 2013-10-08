(function() {
    /**
     * Gömb osztály modellje
     */
    function Sphere(radius, pos, mat) {
        var self = this;
        this.type = ko.observable('sphere');
        this.material = ko.observable(mat);
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
        this.selectMaterial = function(mat) {
            self.material(mat);
        }
    }

    /**
     * Anyag osztály modellje
     */
    function Material(obj) {
        for (var i in obj) {
            this[i] = ko.observable(obj[i]);
        }
    }

    /**
     * Kép tulajdonságok modellje
     */
    function ImageDetails() {
        var self = this;
        self.width = ko.observable(500);
        self.height = ko.observable(500);
        self.samples = ko.observable(1);
    }

    /**
     * Központi alkalmazás modell
     */
    function App() {
        var self = this;
        self.removeObject = function(obj) {
            self.objectList.remove(obj);
        }
        self.removeMaterial = function(mat) {
            self.materials.remove(mat);
        }
        self.addObject = function() {
            self.objectList.push(new Sphere(1, null, self.materials()[0]));
        }
        self.addMaterial = function() {
            self.materials.push(new Material({
                name: Math.random(),
                ambient: [.1, .1, .1],
                diffuse: [1, 0, 0],
                specular: [1, 1, 1],
                shine: 20,
                reflective: false,
                refractive: false,
                IOR: 1,
            }));
        }
        self.materials = ko.observableArray([
        new Material({
            name: 'green',
            ambient: '[0.1, 0.1, 0.1]',
            diffuse: '[0, 1, 0]',
            specular: '[1, 1, 1]',
            shine: 100,
            reflective: false,
            refractive: false,
            IOR: 1,
        }),
        new Material({
            name: 'red',
            ambient: [.1, .1, .1],
            diffuse: [1, 0, 0],
            specular: [1, 1, 1],
            shine: 20,
            reflective: false,
            refractive: false,
            IOR: 1,
        })]);
        self.objectList = ko.observableArray([
        new Sphere(1.1, null, self.materials()[0]), new Sphere(0.7, '[0.2,0.5,0.5]', self.materials()[0])]);
        self.render = 1;
        self.clientCount = ko.observable(0);
        self.workerCount = ko.observable(0);
        self.imageDetails = new ImageDetails();
        self.localWorkers = ko.observable(3);
        self.localWorkers.subscribe(function(val) {
            workPool.ensureWorkers(val);
        });
        workPool.ensureWorkers(3);
        self.id = ko.observable();
        self.workers = workPool.workers;
        self.clients = ko.observableArray();
        /**
         * JOSN konfig előállítása
         */
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
            var materials = self.materials().map(function(mat) {
                var ret = {};
                for (var i in mat) {
                    ret[i] = mat[i]();
                    if (typeof ret[i] == 'string' && ret[i].charAt(0) == '[') {
                        ret[i] = JSON.parse(ret[i]);
                    }
                }
                return ret;
            });
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

    /**
     * Adott szegmens kirenderelése (helyben, vagy a távoli workereken), rajzolásban itt csak satíroz
     */
    function renderRegion(x_, y_, w, h) {
        var c = app.getConfig().imageDetails;
        var ctx = document.getElementById('canvas').getContext('2d');
        var d = ctx.getImageData(x_, y_, w, h);
        for (var x = 0; x < w; x++) {
            for (var y = 0; y < h; y++) {
                if ((x ^ y) % 2 == 0) {
                    d.data[(y * w + x) * 4 + 0] = 255 - d.data[(y * w + x) * 4 + 0];
                    d.data[(y * w + x) * 4 + 1] = 255 - d.data[(y * w + x) * 4 + 1];
                    d.data[(y * w + x) * 4 + 2] = 255 - d.data[(y * w + x) * 4 + 2];
                    d.data[(y * w + x) * 4 + 3] = 255;
                }
            }
        }
        ctx.putImageData(d, x_, y_);
        workPool.queueMessage([{
            method: 'setConfig',
            args: [app.getConfig()]
        }, {
            method: 'render',
            args: [x_, y_, w, h]
        }]);
    }

    /**
     * Tényleges rajzolás
     */
    function drawRegion(data) {
        var ctx = document.getElementById('canvas').getContext('2d');
        var d = ctx.getImageData(data.x, data.y, data.w, data.h);
        for (var x = 0; x < data.w; x++) {
            for (var y = 0; y < data.h; y++) {
                d.data[(y * data.w + x) * 4 + 0] = data.result[(y * data.w + x) * 4 + 0];
                d.data[(y * data.w + x) * 4 + 1] = data.result[(y * data.w + x) * 4 + 1];
                d.data[(y * data.w + x) * 4 + 2] = data.result[(y * data.w + x) * 4 + 2];
                d.data[(y * data.w + x) * 4 + 3] = data.result[(y * data.w + x) * 4 + 3];
            }
        }
        ctx.putImageData(d, data.x, data.y);
    }

    /**
     * Csatlakozás a szerverhez socket.io-val
     */
    var socket = io.connect('http://213.222.155.120:1128');
    socket.on('client:status', function(data) {
        var sum = 0;
        var sum2 = 0;
        var cls = [];
        for (var i in data.clients) {
            sum2++;
            sum += data.clients[i].length;
            cls.push({
                id: i,
                workers: data.clients[i]
            });
        }
        app.clientCount(sum2);
        app.workerCount(sum);
        if (data.id) {
            app.id(data.id);
        }
        app.clients(cls);
        workPool.process();
    });
    socket.on('render', function(data) {
        drawRegion(data);
    });
    socket.on('doJob', function(data) {
        var workers = workPool.workers();
        for (var i in workers)
        if (workers[i].id == data.worker) for (var j in data.job)
        workers[i].postMessage(data.job[j]);
    })
    var app;
    /**
     * Workpool objektum a workerek számontartására
     */
    var workPool = (function() {
        var workerID = 1;

        //Worker létrehozása
        function createWorker() {
            var worker = new Worker('/static/js/worker.js');
            try {
                worker.id = workerID++;
                worker.ready = ko.observable(true);
                worker.latecy = ko.observable(0);
                worker.addEventListener('message', function(data) {
                    var c = app.getConfig().imageDetails;
                    if (data.data.type === 'ping') {
                        worker.latecy(new Date().getTime() - data.data.result.old);
                    }
                    if (data.data.type === 'render') {
                        var r = data.data.result;
                        drawRegion(r);
                        worker.ready(true);
                        socket.emit('render', r);
                        process();
                    }
                    report();
                });

            } catch (ex) {
                console.log(ex, ex.stack);
            }
            return worker;
        }

        // 1 üzenet feldolgozása
        function process() {
            var workersArray = workers();
            for (var i in workersArray) {
                var worker = workersArray[i];
                if (worker.ready()) {
                    var msg = queue.shift();
                    for (var j in msg) {
                        worker.postMessage(msg[j]);
                    }
                    if (msg && msg.length) worker.ready(false);
                    return;
                }
            }
            var clientsArray = app.clients();
            for (var i in clientsArray) {
                if (clientsArray[i].id == app.id() || !app.id()) continue;
                for (var j in clientsArray[i].workers) {
                    var worker = clientsArray[i].workers[j];
                    if (worker.ready) {
                        var msg = queue.shift();
                        if (msg && msg.length) {
                            socket.emit('doJob', {
                                id: {
                                    client: clientsArray[i].id,
                                    worker: worker.id,
                                },
                                job: msg,
                            });
                            worker.ready = false;
                            return;
                        }
                    }
                }
            }
        }
        var workers = ko.observableArray([]);
        var queue = [];
        // válaszidők mérése
        setInterval(function() {
            var workersArray = workers();
            for (var i in workersArray) {
                workersArray[i].postMessage({
                    method: 'ping',
                    args: [new Date().getTime()]
                })
            }
        }, 5000);
        setInterval(function() {
            process();
        }, 1000);

        // szervernek visszajelzés a workerek állapotáról
        function report() {
            var d = workers().map(function(worker) {
                return {
                    id: worker.id,
                    ready: worker.ready(),
                    latecy: worker.latecy(),
                }
            });
            socket.emit('workers', d);
        }

        return {
            queueMessage: function(msg) {
                if (!msg.length) queue.push([msg]);
                else queue.push(msg);
                process();
            },
            ensureWorkers: function(num) {
                if (num < workers().length) {
                    workers.removeAll();
                }
                while (workers().length < num) {
                    workers.push(createWorker());
                }
                report();
            },
            clear: function() {
                queue = [];
            },
            workers: workers,
            process: process,
        }
    })();
    var oldConfig;
    // Vizsgáljuk a konfiguráció változását, nem kell külön render gomb
    setInterval(function() {
        var currentConfig = JSON.stringify(app.getConfig());
        if (currentConfig == oldConfig) return;
        oldConfig = currentConfig;
        workPool.clear();
        for (var x = 0; x < app.getConfig().imageDetails.width; x += 100) {
            for (var y = 0; y < app.getConfig().imageDetails.height; y += 100) {
                setTimeout(function(x, y) {
                    return function() {
                        renderRegion(x, y, 100, 100);
                    }
                }(x, y), y);
            }
        }
    }, 500);

    var app = new App();
    ko.applyBindings(app);
})();
