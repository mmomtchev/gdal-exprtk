
import * as stream from 'stream';
import { TypedArray, Expression } from 'exprtk.js';

export interface RasterTransformOptions extends stream.TransformOptions {
    expr: Expression<TypedArray>;
}

export class RasterTransform extends stream.Transform {
    constructor(opts: RasterTransformOptions);
}
