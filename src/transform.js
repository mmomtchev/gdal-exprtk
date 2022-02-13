const { Transform } = require('stream');
const exprtk = require('exprtk.js');

/**
 * @interface RasterTransformOptions
 * @extends stream.TransformOptions
 * @property {Expression} fn Function to be applied on all data
 * @property {new (len: number) => TypedArray} type Typed array constructor
 * @property {number} maxParallel number of threads to use when fn is an ExprTk.js expression
 */


/**
 * A raster Transform stream
 *
 * Applies an ExprTk.js Expression on all data elements.
 *
 * Input must be a `gdal.RasterMuxStream`
 *
 * {@link calcAsync} provides a higher-level interface for the same feature
 *
 * @example
 *  const dsT2m = gdal.open('AROME_T2m_10.tiff'));
 *  const dsD2m = gdal.open('AROME_D2m_10.tiff'));
 *
 *  const dsCloudBase = gdal.open('CLOUDBASE.tiff', 'w', 'GTiff',
 *    dsT2m.rasterSize.x, dsT2m.rasterSize.y, 1, gdal.GDT_Float64);
 *
 *  const mux = new gdal.RasterMuxStream({
 *    T2m: dsT2m.bands.get(1).pixels.createReadStream(),
 *    D2m: dsD2m.bands.get(1).pixels.createReadStream()
 *  });
 *  const ws = dsCloudBase.bands.get(1).pixels.createWriteStream();
 *
 *  // Espy's estimation for cloud base height (lifted condensation level)
 *  // LCL = 125 * (T2m - Td2m)
 *  // where T2m is the temperature at 2m and Td2m is the dew point at 2m
 *  const expr = new Float64Expression('125 * (t - td)');
 *  const espyEstimation = new RasterTransform({ type: Float64Array, expr });
 *
 *  mux.pipe(espyEstimation).pipe(ws);
 *
 * @class RasterTransform
 * @extends stream.Transform
 * @constructor
 * @param {RasterTransformOptions} [options]
 * @param {Function|Expression} options.fn Function to be applied on all data
 * @param {new (len: number) => TypedArray} options.type Typed array constructor
 */
class RasterTransform extends Transform {
  constructor(opts) {
    super({ ...opts, objectMode: true });
    this.type = opts.type;
    this.expr = opts.expr;
  }

  _transform(chunk, _, cb) {
    if (!this.xform) {
      if (!(this.expr instanceof exprtk.Expression)) {
        throw new TypeError('expr must be an ExprTk.js Expression');
      }

      this.xform = this.expr.cwiseAsync.bind(this.expr, this.expr.maxParallel);
    }

    this.xform(chunk).then((r) => cb(null, r)).catch((err) => cb(err));
  }
}

module.exports = RasterTransform;
