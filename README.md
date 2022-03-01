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
gdal_calc.js -i multiband.tif@1 -i multiband.tif@2
    -o output.tiff \
    -e -c '(a+b)/2' -f GTiff -t Float64
```

### Producing a multiband output file:

```bash
gdal_calc.js -i multiband.tif@1=x -i multiband.tif@2=y
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
    -j -c =./espy.js@espy -f GTiff -t Float64 -n -1e-38
```

### Reading an ExprTk expression from a file

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

*   [RasterTransform](#rastertransform)
    *   [Parameters](#parameters)
    *   [Examples](#examples)
*   [RasterTransformOptions](#rastertransformoptions)
    *   [Properties](#properties)
*   [CalcOptions](#calcoptions)
    *   [Properties](#properties-1)
*   [ProgressCb](#progresscb)
    *   [Parameters](#parameters-1)
*   [calcAsync](#calcasync)
    *   [Parameters](#parameters-2)
    *   [Examples](#examples-1)
*   [toPixelFunc](#topixelfunc)
    *   [Parameters](#parameters-3)
    *   [Examples](#examples-2)

## RasterTransform

**Extends stream.Transform**

A raster Transform stream

Applies an ExprTk.js Expression on all data elements.

Input must be a `gdal.RasterMuxStream`

[calcAsync](calcAsync) provides a higher-level interface for the same feature

### Parameters

*   `options` **[RasterTransformOptions](#rastertransformoptions)?**&#x20;

    *   `options.exr` **(Function | Expression)** Function to be applied on all data

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

## RasterTransformOptions

**Extends stream.TransformOptions**

### Properties

*   `expr` **Expression** Function to be applied on all data

## CalcOptions

Type: object

### Properties

*   `convertNoData` **boolean?**&#x20;
*   `progress_cb` **[ProgressCb](#progresscb)?**&#x20;

## ProgressCb

Type: Function

### Parameters

*   `complete` **number**&#x20;

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

*   `inputs` **Record\<string, gdal.RasterBand>** An object containing all the input bands
*   `output` **gdal.RasterBand** Output raster band
*   `expr` **Expression** ExprTk.js expression
*   `options` **[CalcOptions](#calcoptions)?** Options

    *   `options.convertNoData` **boolean** Input bands will have their
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

Returns **Promise\<void>**&#x20;

## toPixelFunc

Get a `gdal-async` pixel function descriptor for this `ExprTk.js` expression.

Every call of this function produces a permanent GDAL descriptor that cannot
be garbage-collected, so it must be called only once per `ExprTk.js` expression.

As of GDAL 3.4, GDAL does not allow unregistering a previously registered function.

The returned object can be used across multiple V8 instances (ie worker threads).

`gdal-async` does not support multiple V8 instances.

If the V8 instance containing the `ExprTk.js` expression is destroyed, further attempts
to read from Datasets referencing the function will produce an exception.

### Parameters

*   `expression` **Expression**&#x20;

### Examples

```javascript
// This example will register a new GDAL pixel function called sum2
// that requires a VRT dataset with 2 values per pixel

const gdal = require('gdal-async);
const Float64Expression = require('exprtk.js').Float64;
const { toPixelFunc } = require('gdal-exprtk');
const sum2 = new Float64Expression('a + b');
gdal.addPixelFunc('sum2', toPixelFunc(sum2));
```

Returns **gdal.PixelFunction**&#x20;
