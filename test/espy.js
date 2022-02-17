module.exports = (td, t) => (125 * (t - td));
module.exports.args = [ 'td', 't' ];

module.exports.espy = (t, td) => (125 * (t - td));
module.exports.espy.args = ['t', 'td'];
