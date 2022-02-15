const gdal = require('gdal-async');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { assert } = require('chai');

const exe = path.resolve(__dirname, '..', 'bin', 'gdal_calc.js');

describe('CLI tool', () => {
    const d2m = path.resolve(__dirname, 'data', `AROME_D2m_10.tiff`);
    const t2m = path.resolve(__dirname, 'data', `AROME_T2m_10.tiff`);
    const noData = path.resolve(__dirname, 'data', `dem_azimuth50_pa.tiff`);
    const mband = path.resolve(__dirname, 'data', `multiband.tif`);

    it('should support JS functions', () => {
        const output = path.resolve(__dirname, 'temp', `tmp.jsfunc.${process.pid}.tiff`);
        const args = [
            '-i',
            d2m + '=d',
            '-i',
            t2m + '=t',
            '-o',
            output,
            '-f',
            'GTiff',
            '-t',
            'Float64',
            '-c',
            'return 125*(t-d);',
            '-j'
        ];
        execFileSync('node', [exe, ...args]);

        const ds = gdal.open(output);
        assert.equal(gdal.checksumImage(ds.bands.get(1)), 38300);
        assert.equal(ds.bands.get(1).dataType, gdal.GDT_Float64);
        assert.isNull(ds.bands.get(1).noDataValue);
        ds.close();
        fs.unlinkSync(output);
    });

    it('should support ExprTk.js expressions', () => {
        const output = path.resolve(__dirname, 'temp', `tmp.expr.${process.pid}.tiff`);
        const args = [
            '-i',
            d2m + '=d',
            '-i',
            t2m + '=t',
            '-o',
            output,
            '-f',
            'GTiff',
            '-t',
            'Float64',
            '-c',
            '125*(t-d)',
            '-e'
        ];
        execFileSync('node', [exe, ...args]);

        const ds = gdal.open(output);
        assert.equal(gdal.checksumImage(ds.bands.get(1)), 38300);
        assert.equal(ds.bands.get(1).dataType, gdal.GDT_Float64);
        assert.isNull(ds.bands.get(1).noDataValue);
        ds.close();
        fs.unlinkSync(output);
    });

    it('should support setting the noData value', () => {
        const output = path.resolve(__dirname, 'temp', `tmp.nodata1.${process.pid}.tiff`);
        const args = [
            '-i',
            noData,
            '-o',
            output,
            '-f',
            'GTiff',
            '-t',
            'Float32',
            '-c',
            'a + 1',
            '-e',
            '-n',
            '-10'
        ];
        execFileSync('node', [exe, ...args]);

        const ds = gdal.open(output);
        assert.equal(gdal.checksumImage(ds.bands.get(1)), 22455);
        assert.equal(ds.bands.get(1).dataType, gdal.GDT_Float32);
        assert.closeTo(ds.bands.get(1).noDataValue, -10, 1e-6);
        assert.closeTo(ds.bands.get(1).pixels.get(0, 0), -10, 1e-6);
        ds.close();
        fs.unlinkSync(output);
    });

    it('should support ignoring the noData value', () => {
        const output = path.resolve(__dirname, 'temp', `tmp.nodata2.${process.pid}.tiff`);
        const args = [
            '-i',
            mband + ':1=x',
            '-i',
            mband + ':2=y',
            '-o',
            output,
            '-f',
            'GTiff',
            '-t',
            'Float32',
            '-c',
            'x + y',
            '-c',
            'x - y',
            '-e'
        ];
        execFileSync('node', [exe, ...args]);

        const ds = gdal.open(output);
        assert.equal(ds.bands.count(), 2);
        assert.equal(gdal.checksumImage(ds.bands.get(1)), 31733);
        assert.equal(gdal.checksumImage(ds.bands.get(2)), 16620);
        assert.equal(ds.bands.get(1).dataType, gdal.GDT_Float32);
        assert.equal(ds.bands.get(2).dataType, gdal.GDT_Float32);
        ds.close();
        fs.unlinkSync(output);
    });

    it('should support producing multiple bands', () => {
        const output = path.resolve(__dirname, 'temp', `tmp.multiband.${process.pid}.tiff`);
        const args = [
            '-i',
            noData,
            '-o',
            output,
            '-f',
            'GTiff',
            '-t',
            'Float32',
            '-c',
            'a + 1',
            '-e'
        ];
        execFileSync('node', [exe, ...args]);
        
        const ds = gdal.open(output);
        assert.equal(gdal.checksumImage(ds.bands.get(1)), 53409);
        assert.equal(ds.bands.get(1).dataType, gdal.GDT_Float32);
        assert.isNull(ds.bands.get(1).noDataValue);
        assert.closeTo(ds.bands.get(1).pixels.get(0, 0), 1, 1e-6);
        ds.close();
        fs.unlinkSync(output);
    });
});