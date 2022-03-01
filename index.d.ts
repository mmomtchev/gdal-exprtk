
import * as stream from 'stream';
import * as gdal from 'gdal-async';
import { Expression, TypedArray } from 'exprtk.js';


export type CalcOptions = {
	convertNoData?: boolean;
	progress_cb?: ProgressCb;
}

export type ProgressCb = ( complete: number ) => void

export interface RasterTransformOptions extends stream.TransformOptions {
	expr: Expression;
}


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
  export function calcAsync(inputs: Record<string, gdal.RasterBand>, output: gdal.RasterBand, expr: Expression, options?: CalcOptions): Promise<void>

  /**
 * Get a `gdal-async` pixel function descriptor for this `ExprTk.js` expression.
 * 
 * Every call of this function produces a permanent GDAL descriptor that cannot
 * be garbage-collected, so it must be called only once per `ExprTk.js` expression.
 *
 * @kind method
 * @name toPixelFunc
 * @param {Expression} expression
 * @static
 * @returns {Uint8Array}
 */
  export function toPixelFunc(expression: Expression): Uint8Array
export class RasterTransform extends stream.Transform {
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
 * @param {Function|Expression} options.exr Function to be applied on all data
 */
  constructor(options?: RasterTransformOptions)
}

