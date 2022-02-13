import * as gdal from 'gdal-async';
import { Float64 as Float64Expression, Float32 as Float32Expression } from 'exprtk.js';
import { calcAsync } from '..';

import * as path from 'path';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);
const assert = chai.assert;

describe('calcAsync', () => {
    it('should perform the given calculation', async () => {
        const tempFile = `/vsimem/cloudbase_${String(Math.random()).substring(2)}.tiff`;
        const T2m = await gdal.openAsync(path.resolve(__dirname, 'data', 'AROME_T2m_10.tiff'));
        const D2m = await gdal.openAsync(path.resolve(__dirname, 'data', 'AROME_D2m_10.tiff'));
        const size = await T2m.rasterSizeAsync;
        const cloudBase = await gdal.openAsync(tempFile,
            'w', 'GTiff', size.x, size.y, 1, gdal.GDT_Float64);

        // Espy's estimation for cloud base height
        const espyExpr = new Float64Expression('125 * (T2m - D2m)');

        // Underground clouds are very rare
        (await cloudBase.bands.getAsync(1)).noDataValue = -1e38;

        await calcAsync({
            T2m: await T2m.bands.getAsync(1),
            D2m: await D2m.bands.getAsync(1)
        }, await cloudBase.bands.getAsync(1), espyExpr, { convertNoData: true });

        const t2mData = await (await T2m.bands.getAsync(1)).pixels.readAsync(0, 0, size.x, size.y);
        const d2mData = await (await D2m.bands.getAsync(1)).pixels.readAsync(0, 0, size.x, size.y);
        const cbData = await (await cloudBase.bands.getAsync(1)).pixels.readAsync(0, 0, size.x, size.y);

        // check every 1000th element, there are lots of them
        for (let i = 0; i < cbData.length; i += 1000) {
            assert.closeTo(cbData[i], espyExpr.eval({T2m: t2mData[i], D2m: d2mData[i]}), 1e-6);
        }
        cloudBase.close();
        gdal.vsimem.release(tempFile);
    });

    it('should reject when raster sizes do not match', () => {
        const tempFile = `/vsimem/invalid_calc_${String(Math.random()).substring(2)}.tiff`;
        const espyExpr = new Float64Expression('125 * (T2m - D2m)');
        return assert.isRejected(
            calcAsync({
                T2m: gdal.open(path.resolve(__dirname, 'data', 'AROME_T2m_10.tiff')).bands.get(1),
                D2m: gdal.open(path.resolve(__dirname, 'data', 'sample.tif')).bands.get(1)
            },
                gdal.open(tempFile, 'w', 'GTiff', 128, 128, 1, gdal.GDT_Float64).bands.get(1),
                espyExpr),
            /dimensions must match/
        );
    });

    it('should reject when data types do not match', () => {
        const tempFile = `/vsimem/invalid_calc_${String(Math.random()).substring(2)}.tiff`;
        const espyExpr = new Float32Expression('125 * (T2m - D2m)');
        return assert.isRejected(
            calcAsync({
                T2m: gdal.open(path.resolve(__dirname, 'data', 'AROME_T2m_10.tiff')).bands.get(1),
                D2m: gdal.open(path.resolve(__dirname, 'data', 'AROME_D2m_10.tiff')).bands.get(1),
            },
                gdal.open(tempFile, 'w', 'GTiff', 128, 128, 1, gdal.GDT_Float64).bands.get(1),
                espyExpr),
            /Expression type must match/
        );
    });
});
