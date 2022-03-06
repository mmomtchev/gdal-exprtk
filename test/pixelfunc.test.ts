import * as gdal from 'gdal-async';
import { Float64 as Float64Expression, Float32 as Float32Expression } from 'exprtk.js';
import { toPixelFunc } from '..';

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);
const assert = chai.assert;

describe('toPixelFunc', () => {
    it('should create a native binary pixel function suitable for GDAL', () => {
        const sum2 = new Float64Expression('a + b');
        gdal.addPixelFunc('sum2', toPixelFunc(sum2));

        const vrt = `<VRTDataset rasterXSize="20" rasterYSize="20">
  <VRTRasterBand dataType="Float64" band="1" subClass="VRTDerivedRasterBand">
    <Description>CustomPixelFn</Description>
    <PixelFunctionType>sum2</PixelFunctionType>
    <SimpleSource>
      <SourceFilename relativeToVRT="0">test/data/AROME_T2m_10.tiff</SourceFilename>
    </SimpleSource>
    <SimpleSource>
      <SourceFilename relativeToVRT="0">test/data/AROME_D2m_10.tiff</SourceFilename>
    </SimpleSource>
  </VRTRasterBand>
</VRTDataset>
`;
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

        const vrt = `<VRTDataset rasterXSize="20" rasterYSize="20">
  <VRTRasterBand dataType="Float64" band="1" subClass="VRTDerivedRasterBand">
    <Description>CustomPixelFn</Description>
    <PixelFunctionType>sum3</PixelFunctionType>
    <SimpleSource>
      <SourceFilename relativeToVRT="0">test/data/AROME_T2m_10.tiff</SourceFilename>
    </SimpleSource>
    <SimpleSource>
      <SourceFilename relativeToVRT="0">test/data/AROME_D2m_10.tiff</SourceFilename>
    </SimpleSource>
  </VRTRasterBand>
</VRTDataset>
`;
        const ds = gdal.open(vrt);
        assert.equal(ds.bands.count(), 1);
        assert.throws(() => {
            ds.bands.get(1).pixels.read(0, 0, ds.rasterSize.x, ds.rasterSize.y);
        }, /wrong number of inputs for Expression/);
    });

    it('should support data type conversion', () => {
        const sum2int = new Float32Expression('round(a + b)');
        gdal.addPixelFunc('sum2int', toPixelFunc(sum2int));

        const vrt = `<VRTDataset rasterXSize="20" rasterYSize="20">
  <VRTRasterBand dataType="Int32" band="1" subClass="VRTDerivedRasterBand">
    <Description>CustomPixelFn</Description>
    <PixelFunctionType>sum2int</PixelFunctionType>
    <SourceTransferType>Float64</SourceTransferType>
    <SimpleSource>
      <SourceFilename relativeToVRT="0">test/data/AROME_T2m_10.tiff</SourceFilename>
    </SimpleSource>
    <SimpleSource>
      <SourceFilename relativeToVRT="0">test/data/AROME_D2m_10.tiff</SourceFilename>
    </SimpleSource>
  </VRTRasterBand>
</VRTDataset>
`;

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
});
