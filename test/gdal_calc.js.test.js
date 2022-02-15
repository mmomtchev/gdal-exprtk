const gdal = require('gdal-async');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { assert } = require('chai');

describe('CLI tool', () => {
    const d2m = path.resolve(__dirname, 'data', `AROME_D2m_10.tiff`);
    const t2m = path.resolve(__dirname, 'data', `AROME_T2m_10.tiff`);

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
            '125*(t-d)',
            '-j'
        ];
        execFileSync('node', [
            path.resolve(__dirname, '..', 'src', 'gdal_calc.js'),
            ...args,
        ]);
        const ds = gdal.open(output);
        assert.equal(gdal.checksumImage(ds.bands.get(1)), 13701);
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
        execFileSync('node', [
            path.resolve(__dirname, '..', 'src', 'gdal_calc.js'),
            ...args,
            '-e'
        ]);
        const ds = gdal.open(output);
        assert.equal(gdal.checksumImage(ds.bands.get(1)), 38300);
        assert.equal(ds.bands.get(1).dataType, gdal.GDT_Float64);
        assert.isNull(ds.bands.get(1).noDataValue);
        ds.close();
        fs.unlinkSync(output);
    });

    it('should set noData value', () => {
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
            '-e',
            '-n',
            '-1e38'
        ];
        execFileSync('node', [
            path.resolve(__dirname, '..', 'src', 'gdal_calc.js'),
            ...args,
            '-e'
        ]);
        const ds = gdal.open(output);
        assert.equal(gdal.checksumImage(ds.bands.get(1)), 38300);
        assert.equal(ds.bands.get(1).dataType, gdal.GDT_Float64);
        assert.closeTo(ds.bands.get(1).noDataValue, -1e38, 1);
        ds.close();
        fs.unlinkSync(output);
    });
});