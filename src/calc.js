const { Expression } = require('exprtk.js');
const gdal = require('gdal-async');
const RasterTransform = require('./transform.js');

/**
 * @callback ProgressCb
 * @param {number} complete
 * @typedef {( complete: number ) => void} ProgressCb
 */

/**
 * @typedef {object} CalcOptions
 * @property {boolean} [convertNoData]
 * @property {ProgressCb} [progress_cb]
 */

/**
 * Compute a new output band as a pixel-wise function of given input bands
 *
 * This is an alternative implementation of `gdal_calc.py`.
 * 
 * It is identical to the one in gdal-async except that it accepts an ExprTK.js
 * expression as function instead of a JS function.
 * 
 * It's main advantage is that it does not solicit the V8's main thread for any
 * operation that is not O(1) - all computation is performed in background
 * async threads. The only exception is the `convertNoData` option with `gdal-async@3.4`
 * which is implemented in JS. `gdal-async@3.5` supports C++ conversion of NoData
 * to NaN.
 *
 * It internally uses a {@link RasterTransform} which can also be used directly for
 * a finer-grained control over the transformation.
 *
 * There is no sync version.
 *
 * @function calcAsync
 * @param {Record<string, gdal.RasterBand>} inputs An object containing all the input bands
 * @param {gdal.RasterBand} output Output raster band
 * @param {Expression} expr ExprTk.js expression
 * @param {CalcOptions} [options] Options
 * @param {boolean} [options.convertNoData=false] Input bands will have their
 * NoData pixels converted toNaN and a NaN output value of the given function
 * will be converted to a NoData pixel, provided that the output raster band
 * has its `RasterBand.noDataValue` set
 * @param {ProgressCb} [options.progress_cb=undefined] Progress callback
 * @return {Promise<void>}
 * @static
 *
 * @example
 *
 * const T2m = await gdal.openAsync('TEMP_2M.tiff'));
 * const D2m = await gdal.openAsync('DEWPOINT_2M.tiff'));
 * const size = await T2m.rasterSizeAsync
 * const cloudBase = await gdal.openAsync('CLOUDBASE.tiff', 'w', 'GTiff',
 *    size.x, size.y, 1, gdal.GDT_Float64);
 *
 * (await cloudBase.bands.getAsync(1)).noDataValue = -1e38
 * // Espy's estimation for cloud base height
 * const espyFn = (t, td) => 125 * (t - td);
 *
 * await calcAsync({
 *  t: await T2m.bands.getAsync(1),
 *  td: await D2m.bands.getAsync(1)
 * }, cloudBase.bands.getAsync(1), espyFn, { convertNoData: true });
 */

function calcAsync(inputs, output, expr, options) {
    const convertNoData = (options || {}).convertNoData;
    const progress = (options || {}).progress_cb;

    for (const inp of Object.keys(inputs)) {
        if (!(inputs[inp] instanceof gdal.RasterBand)) {
            return Promise.reject(new TypeError('All inputs must be instances of gdal.RasterBand'));
        }
    }
    if (!(output instanceof gdal.RasterBand))
        return Promise.reject(new TypeError('output must be an instance of gdal.RasterBand'));
    if (typeof expr != 'object' || !(expr instanceof Expression))
        return Promise.reject(new TypeError('expr must be an instance of Exprtk.js Expression'));

    const inSizesQ = Object.keys(inputs).map((inp) => inputs[inp].sizeAsync);
    const outSizeQ = output.sizeAsync;
    const outTypeQ = output.dataTypeAsync;

    return Promise.all([outTypeQ, outSizeQ, ...inSizesQ]).then((values) => {
        const outType = values[0];
        if (gdal.fromDataType(outType) !== expr.allocator) {
            throw new TypeError('Expression type must match the output raster data type');
        }

        for (let i = 2; i < values.length; i++) {
            if (values[1].x != values[i].x || values[1].y != values[i].y) {
                throw new RangeError('All raster bands dimensions must match');
            }
        }
        const length = values[1].x * values[1].y;

        const streams = Object.keys(inputs)
            .map((inp) => ({ id: inp, stream: inputs[inp].pixels.createReadStream({ convertNoData }) }))
            .reduce((obj, stream) => {
                obj[stream.id] = stream.stream;
                return obj;
            }, {});
        const mux = new gdal.RasterMuxStream(streams);

        const ws = output.pixels.createWriteStream({ convertNoData });

        const xform = new RasterTransform({ expr });

        return new Promise((resolve, reject) => {
            mux.on('error', reject);
            ws.on('error', reject);
            if (progress) {
                let processed = 0;
                mux.on('data', (chunk) => {
                    processed += chunk[Object.keys(chunk)[0]].length;
                    const done = processed / length;
                    progress(done);
                });
            }

            mux.pipe(xform).pipe(ws);

            ws.on('finish', resolve);
        });
    });
}

module.exports = calcAsync;
