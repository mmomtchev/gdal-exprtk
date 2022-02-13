
import * as stream from 'stream';
import * as gdal from 'gdal-async'
import { TypedArray, Expression } from 'exprtk.js';

export interface RasterTransformOptions extends stream.TransformOptions {
    expr: Expression<TypedArray>;
}

export interface CalcOptions {
    convertNoData?: boolean;
}

export class RasterTransform extends stream.Transform {
    constructor(opts: RasterTransformOptions);
}

export function calcAsync(inputs: Record<string, gdal.RasterBand>,
        output: gdal.RasterBand,
        expr: Expression<TypedArray>,
        options?: CalcOptions): Promise<void>;
