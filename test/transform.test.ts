import * as gdal from 'gdal-async';
import { Expression, Float64 as Float64Expression, TypedArray } from 'exprtk.js';
import { RasterTransform } from '..';

import { finished as _finished } from 'stream';
import { promisify } from 'util';
import * as path from 'path';
const finished = promisify(_finished);

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);
const assert = chai.assert;

describe('RasterTransformStream', () => {
  // Espy's estimation for cloud base height (lifted condensation level)
  // LCL = 125 * (T2m - Td2m)
  // where T2m is the temperature at 2m and Td2m is the dew point at 2m
  const expr = new Float64Expression('125 * (T2m - D2m)');

  function testMux(expr: Expression<TypedArray>, blockOptimize?: boolean) {
    const dsT2m = gdal.open(path.resolve(__dirname, 'data', 'AROME_T2m_10.tiff'));
    const dsD2m = gdal.open(path.resolve(__dirname, 'data', 'AROME_D2m_10.tiff'));

    const filename = `/vsimem/ds_mux_test.${String(
      Math.random()
    ).substring(2)}.tmp.tiff`;
    const dsCloudBase = gdal.open(filename, 'w', 'GTiff', dsT2m.rasterSize.x, dsT2m.rasterSize.y, 1, gdal.GDT_Float64);

    const mux = new gdal.RasterMuxStream({
      T2m: dsT2m.bands.get(1).pixels.createReadStream(),
      D2m: dsD2m.bands.get(1).pixels.createReadStream()
    }, { blockOptimize });

    const ws = dsCloudBase.bands.get(1).pixels.createWriteStream();

    const espyEstimation = new RasterTransform({ type: Float64Array, expr });

    mux.pipe(espyEstimation).pipe(ws);
    return assert.isFulfilled(finished(ws).then(() => {
      dsCloudBase.close();

      const dataOrigT2m = dsT2m.bands.get(1).pixels.read(0, 0, dsT2m.rasterSize.x, dsT2m.rasterSize.y);
      const dataOrigD2m = dsD2m.bands.get(1).pixels.read(0, 0, dsD2m.rasterSize.x, dsD2m.rasterSize.y);
      const dataCloudBase = new Float64Array(dsD2m.rasterSize.x * dsD2m.rasterSize.y);
      for (let i = 0; i < dataOrigT2m.length; i++) {
        dataCloudBase[i] = 125 * (dataOrigT2m[i] - dataOrigD2m[i]);
      }

      const dsTest = gdal.open(filename);
      const dataTest = dsTest.bands.get(1).pixels.read(0, 0, dsTest.rasterSize.x, dsTest.rasterSize.y);
      assert.deepEqual(dataTest, dataCloudBase);
      dsTest.close();
      gdal.vsimem.release(filename);
    }));
  }

  it('w/ blockOptimize', () => testMux(expr, true));
  it('w/o blockOptimize', () => testMux(expr, false));

  it('propagates errors', (done) => {
    const dsT2m = gdal.open(path.resolve(__dirname, 'data', 'AROME_T2m_10.tiff'));
  
    const filename = `/vsimem/ds_mux_test.${String(
      Math.random()
    ).substring(2)}.tmp.tiff`;
    const dsCloudBase = gdal.open(filename, 'w', 'GTiff', dsT2m.rasterSize.x, dsT2m.rasterSize.y, 1, gdal.GDT_Float64);

    const mux = new gdal.RasterMuxStream({
      T2m: dsT2m.bands.get(1).pixels.createReadStream()
    });

    const ws = dsCloudBase.bands.get(1).pixels.createWriteStream();

    const espyEstimation = new RasterTransform({ type: Float64Array, expr });

    mux.pipe(espyEstimation).pipe(ws);
    espyEstimation.on('error', (err) => {
      assert.match(err.message, /wrong number of input arguments/);
      done();
    });
  });
});
