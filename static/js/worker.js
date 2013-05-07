function map(a, f) {
    for (var i in a) {
        f(i, a[i]);
    }
}

var Vector = (function() {
    function Vector(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
    Vector.fromArray = function(a) {
        return new Vector(a[0], a[1], a[2]);
    }
    Vector.prototype = {
        add: function(v) {
            return new Vector(this.x + v.x, this.y + v.y, this.z + v.z);
        },
        sub: function(v) {
            return new Vector(this.x - v.x, this.y - v.y, this.z - v.z);
        },
        mul: function(v) {
            return new Vector(this.x * v, this.y * v, this.z * v);
        },
        dot: function(v) {
            return this.x * v.x + this.y * v.y + this.z * v.z;
        },
        cross: function(v) {
            return new Vector(this.y * v.z - this.z * v.y, this.z * v.x - this.x * v.z, this.x * v.y - this.y * v.x);
        },
        length: function() {
            return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
        },
        unit: function() {
            return this.mul(1 / this.length());
        }
    };
    return Vector;
})();
var Color = (function() {
    function Color(r, g, b) {
        this.r = r;
        this.g = g;
        this.b = b;
    }
    Color.prototype = {
        mul: function(a) {
            if (a.r !== undefined) {
                return new Color(this.r * a.r, this.g * a.g, this.b * a.b);
            }
            return new Color(this.r * a, this.g * a, this.b * a);
        },
        add: function(a) {
            return new Color(this.r + a.r, this.g + a.g, this.b + a.b);
        },
        to255: function() {
            return {
                r: Math.min(Math.max(0, this.r), 1) * 255,
                g: Math.min(Math.max(0, this.g), 1) * 255,
                b: Math.min(Math.max(0, this.b), 1) * 255,
            };
        }
    }
    return Color;
})();
var Material = (function() {
    function Material() {};
    Material.prototype = {
        reflectDir: function(v, n) {
            return v.sub(n.mul(2 * n.dot(v))).unit();
        },
        refractionDir: function(v, n) {
            var tst = n.dot(v);
            var ior = tst < 0 ? 1 / this.IOR : this.IOR;
            var n = tst < 0 ? n.mul(-1) : n;
            var cost = n.dot(v);
            var d = 1 - (1 - cost * cost) * ior * ior;
            if (d < 0) {
                return null;
            }
            return v.mul(ior).sub(n.mul(cost * ior - Math.sqrt(d))).unit();
        },
        fresnel: function(v, n) {
            var tst = n.dot(v);
            var ior = tst < 0 ? this.IOR : 1 / this.IOR;
            var n = tst < 0 ? n.mul(-1) : n;
            var refr = this.refractive ? 0 : 2;
            var f0 = ((ior - 1) * (ior - 1) + refr * refr) / ((ior + 1) * (ior + 1) + refr * refr);
            var f = f0 + (1 - f0) * Math.pow(1 - n.dot(v), 5);
            return f;
        }
    }
    return Material;
})();
var Ray = (function() {
    function Ray(start, end) {
        this.r = start;
        if (end) {
            this.v = end.sub(start).unit();
        }
    }
    Ray.prototype = {
        get: function(t) {
            return this.r.add(this.v.mul(t));
        }
    };
    return Ray;
})();
var Scene = (function() {
    function Scene() {
        this.objects = [];
        this.lights = [];
    };
    Scene.setup = function(config) {
        var scene = new Scene();
        scene.ambient = new Color(0.2, 0.2, 0.5);
        map(config.materials, function(i, m) {
            var mat = new Material();
            mat.ambient = new Color(m.ambient[0], m.ambient[1], m.ambient[2]);
            mat.diffuse = new Color(m.diffuse[0], m.diffuse[1], m.diffuse[2]);
            mat.specular = new Color(m.specular[0], m.specular[1], m.specular[2]);
            mat.shine = m.shine;
            mat.reflective = m.reflective;
            mat.refractive = m.refractive;
            mat.IOR = m.IOR;
            config.materials[m.name] = mat;
        });
        map(config.objects, function(i, o) {
            switch (o.type) {
                case 'sphere':
                    var s = new Sphere(new Vector(o.position[0], o.position[1], o.position[2]), o.radius);
                    s.material = config.materials[o.material];
                    scene.addObject(s);
                    break;
                case 'plane':
                    if (o.constructor === 'fromZ') {
                        var p = Plane.fromZ.apply(null, o.args);
                        p.material = config.materials[o.material];
                        scene.addObject(p);
                    } else if (o.constructor == 'fromX') {
                        var p = Plane.fromX.apply(null, o.args);
                        p.material = config.materials[o.material];
                        scene.addObject(p);
                    } else if (o.constructor == 'fromY') {
                        var p = Plane.fromY.apply(null, o.args);
                        p.material = config.materials[o.material];
                        scene.addObject(p);
                    }
                    break;
                default:
                    //
            }
        });
        scene.image = {
            width: config.imageDetails.width,
            height: config.imageDetails.height,
            samples: config.imageDetails.samples,
        }
        scene.addLight(new Vector(0, 0, 3));
        scene.cam = {};
        scene.cam.eye = new Vector(0, 5, 0);
        scene.cam.lookat = new Vector(0, 0, 0);
        var up = new Vector(0, 0, 1);
        var fov = 90 / 180 * 3.1415;
        var dir = scene.cam.lookat.sub(scene.cam.eye).unit();
        scene.cam.up = up.sub(dir.mul(dir.dot(up))).unit();
        scene.cam.right = scene.cam.up.cross(dir);
        scene.cam.lookat = scene.cam.eye.add(dir.mul(1 / Math.tan(fov / 2)));
        return scene;
    }
    Scene.prototype = {
        addObject: function(o) {
            this.objects.push(o);
        },
        addLight: function(l) {
            this.lights.push(l);
        },
        firstIntersect: function(ray, ignoreRefractive) {
            var threshold = 0.0001;
            var found = false;
            var best = null;
            for (var i in this.objects) {
                var o = this.objects[i];
                var intersectionData = o.intersect(ray);
                if (intersectionData.intersects && ((best === null || intersectionData.distance < best.distance) && intersectionData.distance > threshold) && (!ignoreRefractive || !o.material.refractive)) {
                    best = intersectionData;
                }
            }
            return best;
        },
        render: function(x0, y0, width, height) {
            var result = new Uint8Array(width * height * 4);
            for (var y = y0; y < y0 + height; y++) {
                for (var x = x0; x < x0 + width; x++) {
                    var samples = this.image.samples;
                    var samplingInterval = 1;
                    var sum = new Color(0, 0, 0);
                    for (var i = 0; i < samples; i++) {
                        var p = this.cam.lookat.add(this.cam.right.mul((x + (Math.random() * samplingInterval - samplingInterval / 2)) / this.image.width - 0.5).add(this.cam.up.mul(((y + (Math.random() * samplingInterval - samplingInterval / 2)) / this.image.height) - 0.5)));
                        var color = this.trace(new Ray(this.cam.eye, p), 7).mul(1 / samples);
                        sum = sum.add(color);
                    }
                    var mappedColor = sum;
                    result[(width * y + x) * 4] = mappedColor.r*255;
                    result[(width * y + x) * 4 + 1] = mappedColor.g*255;
                    result[(width * y + x) * 4 + 2] = mappedColor.b*255;
                    result[(width * y + x) * 4 + 3] = 255;
                }
            }
            return result;
        },
        trace: function(ray, n) {
            if (!n) {
                return new Color(0, 0, 0);
            }
            var data = this.firstIntersect(ray);
            if (!(data && data.intersects)) {
                return this.ambient;
            }
            var color = this.directLightSource(ray, data);
            var mat = data.object.material;
            var dir = null;
            if (mat.refractive) {
                dir = mat.refractionDir(ray.v, data.normal);
                if (dir !== null) {
                    var refraction = new Ray(data.pos, null);
                    refraction.v = dir;
                    var pow = data.normal.dot(ray.v);
                    color = color.add(this.trace(refraction, n - 1).mul((1 - mat.fresnel(ray.v, data.normal)) * 0.9));
                }
            }
            if (mat.reflective) {
                var reflect = new Ray(data.pos, null);
                reflect.v = mat.reflectDir(ray.v, data.normal);
                var coeff = dir == null ? 1 : mat.fresnel(ray.v, data.normal);
                color = color.add(this.trace(reflect, n - 1).mul(coeff * 0.9));
            }
            return color;
        },
        directLightSource: function(ray, data) {
            var color = this.ambient.mul(data.object.material.ambient);
            var mat = data.object.material;
            for (var i in this.lights) {
                var light = this.lights[i];
                /*var shadow = new Ray(data.pos, light);
                var shadowData = this.firstIntersect(shadow, true);
                if (!shadowData || shadowData.distance > light.sub(data.pos).length()) {
                    var shadowData = this.firstIntersect(shadow, false);
                    var pow = 1;
                    if (shadowData && shadowData.distance < light.sub(data.pos).length()) {
                        pow = 0.8;
                    }*/
                    var diffuse = Math.max(0, data.normal.dot(light.sub(data.pos).unit()));
                    var specular = Math.max(0, data.normal.dot(light.sub(data.pos).add(ray.v).unit()));
                    color = color.add(mat.diffuse.mul(diffuse));
                    color = color.add(mat.specular.mul(Math.pow(specular, mat.shine)));
                //}
            }
            return color;
        }
    };
    return Scene;
})();

var Sphere = (function() {
    function Sphere(center, r) {
        this.v = center;
        this.r = r;
    }
    Sphere.prototype = {
        intersect: function(ray) {
            var a = ray.v.dot(ray.v);
            var b = ray.v.dot(ray.r.sub(this.v)) * 2;
            var c = (ray.r.sub(this.v)).dot(ray.r.sub(this.v)) - this.r * this.r;
            var d = b * b - 4 * a * c;
            if (d < 0) {
                return {
                    intersects: false,
                };
            }
            var t1 = (-b + Math.sqrt(d)) / 2 / a;
            var t2 = (-b - Math.sqrt(d)) / 2 / a;
            if (t1 < 0.001 && t2 < 0.001) {
                return {
                    intersects: false
                }
            } else if (t1 < 0.001 || t2 < 0.001) {
                return {
                    intersects: true,
                    pos: ray.get(Math.max(t1, t2)),
                    normal: ray.get(Math.max(t1, t2)).sub(this.v).mul(1 / this.r),
                    object: this,
                    distance: Math.max(t1, t2)
                }
            }
            return {
                intersects: true,
                pos: ray.get(Math.min(t1, t2)),
                normal: ray.get(Math.min(t1, t2)).sub(this.v).mul(1 / this.r),
                object: this,
                distance: Math.min(t1, t2)
            }
        }
    }
    return Sphere;
})();

var Plane = (function() {
    function Plane() {};
    Plane.fromThreePoints = function(p1, p2, p3) {
        var plane = new Plane();
        p.n = p1.sub(p2).cross(p1.sub(p3)).unit();
        p.r = p1;
        return plane;
    }
    Plane.fromZ = function(h, inv) {
        var p = new Plane();
        p.n = new Vector(0, 0, inv ? -1 : 1);
        p.r = new Vector(0, 0, h);
        return p;
    }
    Plane.fromX = function(h, inv) {
        var p = new Plane();
        p.n = new Vector(inv ? -1 : 1, 0, 0);
        p.r = new Vector(h, 0, 0);
        return p;
    }
    Plane.fromY = function(h, inv) {
        var p = new Plane();
        p.n = new Vector(0, inv ? -1 : 1, 0);
        p.r = new Vector(0, h, 0);
        return p;
    }
    Plane.prototype = {
        intersect: function(ray) {
            var t = this.r.sub(ray.r).dot(this.n) / ray.v.dot(this.n);
            if (t < 0) {
                return {
                    intersects: false
                };
            }
            return {
                intersects: true,
                pos: ray.get(t),
                normal: this.n,
                object: this,
                distance: t
            };
        }
    };
    return Plane;
})();

var scene;

var methods = {
    setConfig: function(obj) {
        scene = Scene.setup(obj);
        postMessage({
            type: 'setConfig',
            message: 'Done!'
        });
    },
    render: function(x, y, w, h) {
        var result = scene.render(x, y, w, h);
        postMessage({
            type: 'render',
            message: 'Done!',
            result: {
                x: x,
                y: y,
                w: w,
                h: h,
                result: result
            }
        });
    },
    ping: function(date) {
        postMessage({
            type: 'ping',
            message: 'Pong!',
            result: {
                old: date,
                current: new Date().getTime()
            }
        })
    }
}

self.postMessage('Worker thread started!');
self.addEventListener('message', function(e) {
    try {
        methods[e.data.method].apply(null, e.data.args);
    } catch (ex) {
        postMessage({
            message: ex.message + ex.stack + JSON.stringify(e.data)
        });
    }
});
