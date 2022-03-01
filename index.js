const path = require('path');
const binary = require('@mapbox/node-pre-gyp');
const binding_path = binary.find(path.resolve(path.join(__dirname, 'package.json')));

module.exports = {
    RasterTransform: require('./lib/transform.js'),
    calcAsync: require('./lib/calc.js'),
    toPixelFunc: require(binding_path).toPixelFunc
};
