module.exports = {
  header: `
import * as stream from 'stream';
import * as gdal from 'gdal-async';
import { Expression, TypedArray } from 'exprtk.js';
`,
  include: [ 'lib/*.js', 'src/*.cc' ],
  output: 'index.d.ts',
  filter: (name) => !name.match(/options\./g)
};
