# gdal-exprtk

This is a plugin that adds support for [ExprTk.js](https://github.com/mmomtchev/exprtk.js) expressions to [gdal-async](https://github.com/mmomtchev/node-gdal-async).

It allows for truly asynchronous background processing without soliciting the V8 main thread. Multiple operations run in parallel and never block the event loop.

Requires `gdal-async@3.4` and `ExprTk.js@2.0`.

# Installation

When it is released

# Usage

## As a Node.js Streams-compatible Transform

```ts
import * as gdal from 'gdal-async';
import { Expression, Float64 as Float64Expression, TypedArray } from 'exprtk.js';
import { RasterTransform } from 'gdal-exprtk';

import { finished as _finished } from 'stream';
import { promisify } from 'util';
const finished = promisify(_finished);

// Espy's estimation for cloud base height (lifted condensation level)
// LCL = 125 * (T2m - Td2m)
// where T2m is the temperature at 2m and Td2m is the dew point at 2m
const expr = new Float64Expression('125 * (T2m - D2m)');

const dsT2m = gdal.open('AROME_T2m_10.tiff'));
const dsD2m = gdal.open('AROME_D2m_10.tiff'));

const output = `/vsimem/AROME_CLOUDBASE.tiff`;
const dsCloudBase = gdal.open(filename, 'w', 'GTiff', dsT2m.rasterSize.x, dsT2m.rasterSize.y, 1, gdal.GDT_Float64);

// Mapping to ExprTk.js variables is by (case-insensitive) names
// and does not depend on the order
const mux = new gdal.RasterMuxStream({
    T2m: dsT2m.bands.get(1).pixels.createReadStream(),
    D2m: dsD2m.bands.get(1).pixels.createReadStream()
});

const ws = dsCloudBase.bands.get(1).pixels.createWriteStream();

const espyEstimation = new RasterTransform({ type: Float64Array, expr });

mux.pipe(espyEstimation).pipe(ws);
await finished(ws);
dsCloudBase.close();
```
