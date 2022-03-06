import * as gdal from 'gdal-async';
import { Float64 as Float64Expression, Float32 as Float32Expression } from 'exprtk.js';
import { toPixelFunc } from '..';

import * as path from 'path';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);
const assert = chai.assert;

describe('toPixelFunc', () => {
    let band1: gdal.RasterBand, band2: gdal.RasterBand;

    before(() => {
      band1 = gdal.open(path.join('test', 'data', 'AROME_T2m_10.tiff')).bands.get(1);
      band2 = gdal.open(path.join('test', 'data', 'AROME_D2m_10.tiff')).bands.get(1);
    });

    it('should create a native binary pixel function suitable for GDAL', () => {
        const sum2 = new Float64Expression('a + b');
        gdal.addPixelFunc('sum2', toPixelFunc(sum2));

        const vrt = gdal.wrapVRT({
          bands: [
            {
              sources: [band1, band2],
              pixelFunc: 'sum2'
            }
          ]
        });

        const ds = gdal.open(vrt);
        assert.equal(ds.bands.count(), 1);
        const input1 = gdal.open('test/data/AROME_T2m_10.tiff')
            .bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        const input2 = gdal.open('test/data/AROME_D2m_10.tiff')
            .bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        const result = ds.bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        for (let i = 0; i < ds.rasterSize.x * ds.rasterSize.y; i += 256)
            assert.closeTo(result[i], input1[i] + input2[i], 1e-6);
    });

    it('should throw with invalid expressions', () => {
        const sumv = new Float64Expression('a + b', ['a'], { 'b': 2 });
        assert.throws(() => {
            toPixelFunc(sumv);
        }, /vector arguments are still not supported/);
    });

    it('should propagate exceptions through node-gdal', () => {
        const sum3 = new Float64Expression('a + b + c');
        gdal.addPixelFunc('sum3', toPixelFunc(sum3));

        const vrt = gdal.wrapVRT({
          bands: [
            {
              sources: [band1, band2],
              pixelFunc: 'sum3'
            }
          ]
        });

        const ds = gdal.open(vrt);
        assert.equal(ds.bands.count(), 1);
        assert.throws(() => {
            ds.bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        }, /gdal-exprtk pixel function can not handle that many inputs/);
    });

    it('should support data type conversion', () => {
        const sum2int = new Float32Expression('round(a + b)');
        gdal.addPixelFunc('sum2int', toPixelFunc(sum2int));

        const vrt = gdal.wrapVRT({
          bands: [
            {
              sources: [band1, band2],
              dataType: gdal.GDT_Int32,
              pixelFunc: 'sum2int',
              sourceTransferType: gdal.GDT_Float64
            }
          ]
        });

        const ds = gdal.open(vrt);
        assert.equal(ds.bands.count(), 1);
        const input1 = gdal.open('test/data/AROME_T2m_10.tiff')
            .bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        const input2 = gdal.open('test/data/AROME_D2m_10.tiff')
            .bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        const result = ds.bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        for (let i = 0; i < ds.rasterSize.x * ds.rasterSize.y; i += 16)
            assert.closeTo(result[i], input1[i] + input2[i], 0.5);
    });

    it('should support external arguments', () => {
        const sum2 = new Float64Expression('a + b + k + t');
        gdal.addPixelFunc('sumWithArgs', toPixelFunc(sum2));

        const vrt = gdal.wrapVRT({
          bands: [
            {
              sources: [band1, band2],
              pixelFunc: 'sumWithArgs',
              pixelFuncArgs: { k: '12', t: 4 }
            }
          ]
        });

        const ds = gdal.open(vrt);
        assert.equal(ds.bands.count(), 1);
        const input1 = gdal.open('test/data/AROME_T2m_10.tiff')
            .bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        const input2 = gdal.open('test/data/AROME_D2m_10.tiff')
            .bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        const result = ds.bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        for (let i = 0; i < ds.rasterSize.x * ds.rasterSize.y; i += 256)
            assert.closeTo(result[i], input1[i] + input2[i] + 12 + 4, 1e-6);
    });

    it('should throw on invalid external arguments', () => {
        const sum2 = new Float64Expression('a + b + k + t');
        gdal.addPixelFunc('sumWithInvalidArgs', toPixelFunc(sum2));

        const vrt = gdal.wrapVRT({
          bands: [
            {
              sources: [band1, band2],
              pixelFunc: 'sumWithInvalidArgs',
              pixelFuncArgs: { k: 'text', t: 'string' }
            }
          ]
        });

        const ds = gdal.open(vrt);
        assert.throws(() => {
          ds.bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        }, /gdal-exprtk does not support string arguments/);
    });
});
