const path = require('path');
const { execFileSync } = require('child_process');

describe('CLI tool', () => {
    const args = [
        '-i',
        'test/data/AROME_D2m_10.tiff=d',
        '-i',
        'test/data/AROME_T2m_10.tiff=t',
        '-o',
        '/vsimem/temp.tiff',
        '-f',
        'GTiff',
        '-t',
        'Float64',
        '-c',
        '125*(t-d)'
    ];

    it('should support JS functions', () => {
        execFileSync('node', [
            path.resolve(__dirname, '..', 'src', 'gdal_calc.js'),
            ...args,
            '-j'
        ]);
    });

    it('should support ExprTk.js expressions', () => {
        execFileSync('node', [
            path.resolve(__dirname, '..', 'src', 'gdal_calc.js'),
            ...args,
            '-e'
        ]);
    });
});