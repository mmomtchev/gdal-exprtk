#!/usr/bin/env node

const gdal = require('gdal-async');
const exprtk = require('exprtk.js');
const { calcAsync } = require('..');
const { program } = require('commander');

program
    .requiredOption('-i <input>', 'input dataset, dataset[:band]=var', collect)
    .requiredOption('-o <output>', 'ouput dataset')
    .requiredOption('-c <transform>', 'expression to be applied')
    .requiredOption('-f <format>', 'output data format')
    .option('-j', 'JS mode (default)')
    .option('-e', 'ExprTk mode')
    .option('-q', 'quiet mode')
    .option('-t <type>', 'output data type: {Byte/Int16/UInt16/UInt32/Int32/Float32/Float64}')
    .option('-n <NoData>', 'NoData value to use for the output dataset')
    .parse();

function collect(val, memo) {
    memo = memo || [];
    memo.push(val);
    return memo;
}

function nextVar(prev) {
    if (prev === undefined || prev.length == 0) return 'a';
    let p = prev.length;
    while (p > 0) {
        if (prev[p - 1] === 'z') {
            prev = prev.substring(0, p - 1) + 'a' + prev.substring(p);
            p--;
            continue;
        }
        prev = prev.substring(0, p - 1) + String.fromCharCode(prev.charCodeAt(p - 1) + 1) + prev.substring(p);
        return prev;
    }
    return 'a' + prev;
}

const opts = program.opts();

if (opts.q) console.log = () => undefined;

const symbols = {};

let lastVar, rasterSize, outputType;
if (opts.t) {
    try {
        gdal.fromDataType(opts.t);
        outputType = opts.t;
    } catch (e) {
        console.error('Invalid data type', opts.t);
        return 1;
    }
}

for (const inp of opts.i) {
    let varName, dsName, fileName, band, ds;
    try {
        [dsName, varName] = inp.split('=');
        [fileName, band] = dsName.split(':');
        if (varName === undefined) {
            do {
                lastVar = nextVar(lastVar);
            } while (symbols[lastVar] !== undefined);
            varName = lastVar;
        }
    } catch (e) {
        console.error('Failed decoding input band selector:', inp, 'must have dataset[:band]=var');
        return -1;
    }
    try {
        ds = gdal.open(fileName);
        symbols[varName] = ds.bands.get(band !== undefined ? +band : 1);
        if (!rasterSize)
            rasterSize = ds.rasterSize;
        if (!outputType)
            outputType = symbols[varName].dataType;
        else if (rasterSize.x != ds.rasterSize.x || rasterSize.y != ds.rasterSize.y) {
            console.error(`Datasets must have identical size, ${fileName} does not match: `,
                rasterSize, ds.rasterSize);
            return -1;
        }
    } catch (e) {
        console.error('Failed reading inputs', e.message);
        return -1;
    }
}

let op;
if (opts.e) {
    let eType;
    for (const t of Object.keys(exprtk))
        if (exprtk[t].allocator === gdal.fromDataType(outputType))
            eType = exprtk[t];
    op = new eType(opts.c);
} else {
    op = new Function(...Object.keys(symbols), opts.c);
}

const output = gdal.open(opts.o, 'w', opts.f, rasterSize.x, rasterSize.y, 1, outputType);

console.log('Using: ');
for (const name of Object.keys(symbols)) {
    const s = symbols[name];
    console.log(`\t${name} = ${s.description || s.ds.description}${s.id !== undefined ? `:${s.id}` : ''}`);
}
console.log(`${op.toString().replace(/\n/g, '')} => ${outputType}`);

let noData;
if (opts.n) {
    noData = +opts.n;
    console.log('NoData: ', noData);
    output.bands.get(1).noDataValue = noData;
    if (outputType !== gdal.GDT_Float32 && outputType !== gdal.GDT_Float64) {
        console.warn('NoData/NaN conversion does not work with integer types');
    }
}

let q;
if (opts.e) {
    q = calcAsync(symbols, output.bands.get(1), op, {
        convertNoData: noData !== undefined
    });
} else {
    q = gdal.calcAsync(symbols, output.bands.get(1), op, {
        convertNoData: noData !== undefined,
        convertInput: noData !== undefined
    });
}

q.then(() => {
    output.close();
    console.log('Done');
});
