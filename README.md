# gdal-exprtk

[![License: Apache 2.0](https://img.shields.io/github/license/mmomtchev/gdal-exprtk)](https://github.com/mmomtchev/gdal-exprtk/blob/master/LICENSE)
[![npm version](https://img.shields.io/npm/v/gdal-exprtk)](https://www.npmjs.com/package/gdal-exprtk)
[![Node.js CI](https://github.com/mmomtchev/gdal-exprtk/actions/workflows/node.js.yml/badge.svg)](https://github.com/mmomtchev/gdal-exprtk/actions/workflows/node.js.yml)
[![codecov](https://codecov.io/gh/mmomtchev/gdal-exprtk/branch/main/graph/badge.svg?token=KwCAUjdnyZ)](https://codecov.io/gh/mmomtchev/gdal-exprtk)

This is a plugin that adds support for [ExprTk.js](https://github.com/mmomtchev/exprtk.js) expressions to [gdal-async](https://github.com/mmomtchev/node-gdal-async).

It allows for truly asynchronous background processing performing only O(1) operations on the V8 main thread. Multiple operations run in parallel and never block the event loop.

Requires `gdal-async@3.4` and `ExprTk.js@2.0`.

# Installation

To use as a library in a project:

`npm install --save gdal-exprtk`

Install globally to use the command-line version:

`sudo npm install -g gdal-exprtk`

# Usage

## Command-line utility

The command-line utility supports both JS functions and ExprTk expressions. It uses parallel processing whenever possible.

### With ExprTk expression:

```bash
gdal_calc.js -i AROME_D2m_10.tiff=d -i AROME_T2m_10.tiff=t
    -o CLOUDBASE.tiff \
    -e -c '125*(t-d)' -f GTiff -t Float64
```

### With JS function:

```bash
gdal_calc.js -i AROME_D2m_10.tiff=d -i AROME_T2m_10.tiff=t
    -o CLOUDBASE.tiff \
    -j -c 'return 125*(t-d);' -f GTiff -t Float64
```

### With multiband input files and automatic variable naming:

```bash
gdal_calc.js -i multiband.tif:1 -i multiband.tif:2
    -o output.tiff \
    -e -c '(a+b)/2' -f GTiff -t Float64
```

### Producing a multiband output file:

```bash
gdal_calc.js -i multiband.tif:1=x -i multiband.tif:2=y
    -o output.tiff \
    -e -c '(x+y)/2' -c '(x-y)/2' -f GTiff -t Float64
```

### With `NoData`<->`Nan` conversion

If a `NoData` value is specified for the output file, then all input `NoData` values will be converted to `NaN` before invoking the user function and all `NaN` values returned from the user function will be written as the `NoData` value. This works only if the output data type is a floating point type. `gdal-async@3.5` supports converting integer types to `NaN`, `gdal-async@3.4` requires that all input files have a floating point type for this to work.

```bash
gdal_calc.js -i AROME_D2m_10.tiff=d -i AROME_T2m_10.tiff=t
    -o CLOUDBASE.tiff \
    -e -c '125*(t-d)' -f GTiff -t Float64 -n -1e-38
```

### Reading a JS function from a file

`gdal_calc.js` can use both a default and a named export. The arguments order must be given explicitly.

`espy.js`:
```js
module.exports = {};
module.exports.espy = (t, td) => (125 * (t - td));
module.exports.espy.args = ['t', 'td'];
```

Then:
```bash
gdal_calc.js -i AROME_D2m_10.tiff=td -i AROME_T2m_10.tiff=t
    -o CLOUDBASE.tiff \
    -j -c =./espy.js:espy -f GTiff -t Float64 -n -1e-38
```

### Reading an ExprTk expression from a file

ExprTk expressions do not have a performance penalty when reading from a file.

`espy.exprtk`:
```python
125 * (t - td)
```

Then:
```bash
gdal_calc.js -i AROME_D2m_10.tiff=td -i AROME_T2m_10.tiff=t
    -o CLOUDBASE.tiff \
    -e -c =./espy.exprtk -f GTiff -t Float64 -n -1e-38
```

## With `calcAsync`

```ts
import * as gdal from 'gdal-async';
import { Float64 as Float64Expression } from 'exprtk.js';
import { calcAsync } from 'gdal-exprtk';

const T2m = await gdal.openAsync('AROME_T2m_10.tiff'));
const D2m = await gdal.openAsync('AROME_D2m_10.tiff'));
const size = await T2m.rasterSizeAsync;

const filename = `/vsimem/AROME_CLOUDBASE.tiff`;
const dsCloudBase = gdal.open(filename, 'w', 'GTiff',
    size.x, size.y, 1, gdal.GDT_Float64);

// Espy's estimation for cloud base height
const espyExpr = new Float64Expression('125 * (T2m - D2m)');

// This is required for the automatic NoData handling
// (it will get converted from/to NaN)
(await cloudBase.bands.getAsync(1)).noDataValue = -1e38;

// Mapping to ExprTk.js variables is by (case-insensitive) name
// and does not depend on the order
await calcAsync({
    T2m: await T2m.bands.getAsync(1),
    D2m: await D2m.bands.getAsync(1)
}, await cloudBase.bands.getAsync(1), espyExpr, { convertNoData: true });
```

## As a Node.js Streams-compatible Transform

```ts
import * as gdal from 'gdal-async';
import { Float64 as Float64Expression } from 'exprtk.js';
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

const filename = `/vsimem/AROME_CLOUDBASE.tiff`;
const dsCloudBase = gdal.open(filename, 'w', 'GTiff',
    dsT2m.rasterSize.x, dsT2m.rasterSize.y, 1, gdal.GDT_Float64);

// Mapping to ExprTk.js variables is by (case-insensitive) name
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

# API

<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

### Table of Contents

*   [ProgressCb](#progresscb)
    *   [Parameters](#parameters)
*   [CalcOptions](#calcoptions)
    *   [Properties](#properties)
*   [calcAsync](#calcasync)
    *   [Parameters](#parameters-1)
    *   [Examples](#examples)
*   [RasterTransformOptions](#rastertransformoptions)
    *   [Properties](#properties-1)
*   [RasterTransform](#rastertransform)
    *   [Parameters](#parameters-2)
    *   [Examples](#examples-1)

## ProgressCb

Type: [Function](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Statements/function)

### Parameters

*   `complete` **[number](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Number)**&#x20;

## CalcOptions

Type: [object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)

### Properties

*   `convertNoData` **[boolean](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean)?**&#x20;
*   `progress_cb` **[ProgressCb](#progresscb)?**&#x20;

## calcAsync

Compute a new output band as a pixel-wise function of given input bands

This is an alternative implementation of `gdal_calc.py`.

It is identical to the one in gdal-async except that it accepts an ExprTK.js
expression as function instead of a JS function.

It's main advantage is that it does not solicit the V8's main thread for any
operation that is not O(1) - all computation is performed in background
async threads. The only exception is the `convertNoData` option with `gdal-async@3.4`
which is implemented in JS. `gdal-async@3.5` supports C++ conversion of NoData
to NaN.

It internally uses a [RasterTransform](#rastertransform) which can also be used directly for
a finer-grained control over the transformation.

There is no sync version.

### Parameters

*   `inputs` **Record<[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String), gdal.RasterBand>** An object containing all the input bands
*   `output` **gdal.RasterBand** Output raster band
*   `expr` **Expression** ExprTk.js expression
*   `options` **[CalcOptions](#calcoptions)?** Options

    *   `options.convertNoData` **[boolean](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Boolean)** Input bands will have their
        NoData pixels converted toNaN and a NaN output value of the given function
        will be converted to a NoData pixel, provided that the output raster band
        has its `RasterBand.noDataValue` set (optional, default `false`)
    *   `options.progress_cb` **[ProgressCb](#progresscb)** Progress callback (optional, default `undefined`)

### Examples

```javascript
const T2m = await gdal.openAsync('TEMP_2M.tiff'));
const D2m = await gdal.openAsync('DEWPOINT_2M.tiff'));
const size = await T2m.rasterSizeAsync
const cloudBase = await gdal.openAsync('CLOUDBASE.tiff', 'w', 'GTiff',
   size.x, size.y, 1, gdal.GDT_Float64);

(await cloudBase.bands.getAsync(1)).noDataValue = -1e38
// Espy's estimation for cloud base height
const espyFn = (t, td) => 125 * (t - td);

await calcAsync({
 t: await T2m.bands.getAsync(1),
 td: await D2m.bands.getAsync(1)
}, cloudBase.bands.getAsync(1), espyFn, { convertNoData: true });
```

Returns **[Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)\<void>**&#x20;

## RasterTransformOptions

**Extends stream.TransformOptions**

### Properties

*   `expr` **Expression** Function to be applied on all data

## RasterTransform

**Extends stream.Transform**

A raster Transform stream

Applies an ExprTk.js Expression on all data elements.

Input must be a `gdal.RasterMuxStream`

[calcAsync](calcAsync) provides a higher-level interface for the same feature

### Parameters

*   `options` **[RasterTransformOptions](#rastertransformoptions)?**&#x20;

    *   `options.exr` **([Function](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Statements/function) | Expression)** Function to be applied on all data

### Examples

```javascript
const dsT2m = gdal.open('AROME_T2m_10.tiff'));
const dsD2m = gdal.open('AROME_D2m_10.tiff'));

const dsCloudBase = gdal.open('CLOUDBASE.tiff', 'w', 'GTiff',
   dsT2m.rasterSize.x, dsT2m.rasterSize.y, 1, gdal.GDT_Float64);

const mux = new gdal.RasterMuxStream({
   T2m: dsT2m.bands.get(1).pixels.createReadStream(),
   D2m: dsD2m.bands.get(1).pixels.createReadStream()
 });
const ws = dsCloudBase.bands.get(1).pixels.createWriteStream();

// Espy's estimation for cloud base height (lifted condensation level)
// LCL = 125 * (T2m - Td2m)
// where T2m is the temperature at 2m and Td2m is the dew point at 2m
const expr = new Float64Expression('125 * (t - td)');
const espyEstimation = new RasterTransform({ type: Float64Array, expr });

mux.pipe(espyEstimation).pipe(ws);
```
