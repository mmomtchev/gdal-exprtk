#!/usr/bin/env node
'use strict';

const gdal = require('gdal-async');
const exprtk = require('exprtk.js');
const { calcAsync } = require('..');
const fs = require('fs');
const { program } = require('commander');

program
    .requiredOption('-i <input>',
        'input dataset, dataset[@band]=var, may be present multiple times for multiple inputs', collect)
    .requiredOption('-o <output>', 'ouput dataset')
    .requiredOption('-c <transform>',
        'expression to be applied, may be present multiple times for multiple bands in the output file,' +
        ' use =file[@function] to read from file', collect)
    .requiredOption('-f <format>', 'output data format')
    .option('-j', 'JS mode (default)')
    .option('-e', 'ExprTk mode')
    .option('-q', 'quiet mode')
    .option('-t <type>', 'output data type: {Byte/Int16/UInt16/UInt32/Int32/Float32/Float64}')
    .option('-n <NoData>',
        'NoData value to use for the output dataset, may be present multiple times for each output band', collect)
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

let symbols = {};

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
        [fileName, band] = dsName.split('@');
        if (varName === undefined) {
            do {
                lastVar = nextVar(lastVar);
            } while (symbols[lastVar] !== undefined);
            varName = lastVar;
        }
    } catch (e) {
        console.error('Failed decoding input band selector:', inp, 'must have dataset[@band]=var');
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

const output = gdal.open(opts.o, 'w', opts.f, rasterSize.x, rasterSize.y, opts.c.length, outputType);

console.log('Using: ');
for (const name of Object.keys(symbols)) {
    const s = symbols[name];
    console.log(`\t${name} = ${s.description || s.ds.description}${s.id !== undefined ? `:${s.id}` : ''}`);
}

let nextMark = 0.1;
const bandComplete = {};
function progress(band, complete) {
    bandComplete[band] = complete;
    const total = Object.keys(bandComplete).reduce((a, b) => a + bandComplete[b], 0) / opts.c.length;
    if (total > nextMark) {
        if (!opts.q)
            process.stdout.write(` ${Math.round(nextMark * 100)}% `);
        nextMark += 0.1;
    }
}

const q = [];
for (const b in opts.c) {
    const band = +b + 1;

    let op, opText;
    const calc = opts.c[b];
    try {
        if (opts.e) {
            let eType;
            for (const t of Object.keys(exprtk))
                if (exprtk[t].allocator === gdal.fromDataType(outputType))
                    eType = exprtk[t];
            if (calc.startsWith('=')) {
                op = new eType(fs.readFileSync(calc.substring(1), 'utf-8'));
            } else {
                op = new eType(calc);
            }
            opText = op.toString();
        } else {
            if (calc.startsWith('=')) {
                const [file, name] = calc.split('@');
                op = name ? require(file.substring(1))[name] : require(file.substring(1));
                if (typeof op !== 'function') {
                    console.error(calc, 'is not a function');
                    return 1;
                }
                if (!(op.args instanceof Array)) {
                    console.error(calc, 'does not have an args array');
                    return 1;
                }
                const reorderedSymbols = {};
                for (const a of op.args)
                    reorderedSymbols[a] = symbols[a];
                symbols = reorderedSymbols;
                opText = op.toString();
            } else {
                op = new Function(...Object.keys(symbols), calc);
                opText = op.toString().replace(/\n/g, '');
            }
        }
    } catch (err) {
        console.error('Failed interpreting', calc, err.message);
        return 1;
    }

    console.log(`Band ${band}: ${opText} => ${outputType}`);

    let noData;
    if (opts.n) {
        noData = opts.n[b] !== undefined ? +opts.n[b] : + opts.n[0];
        console.log('NoData: ', noData);
        output.bands.get(band).noDataValue = noData;
        if (outputType !== gdal.GDT_Float32 && outputType !== gdal.GDT_Float64) {
            console.warn('NoData/NaN conversion does not work with integer types');
        }
    }

    if (opts.e) {
        q.push(calcAsync(symbols, output.bands.get(band), op, {
            convertNoData: noData !== undefined,
            progress_cb: progress.bind(null, band)
        }));
    } else {
        q.push(gdal.calcAsync(symbols, output.bands.get(band), op, {
            convertNoData: noData !== undefined,
            convertInput: noData !== undefined,
            progress_cb: progress.bind(null, band)
        }));
    }

}

Promise.all(q).then(() => {
    output.close();
    console.log('\nDone');
    process.exit(0);
}).catch((e) => {
    console.error(e.message);
    process.exit(1);
});
