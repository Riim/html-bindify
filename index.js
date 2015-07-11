var path = require('path');

var through = require('through');
var htmlBindingTransform = require('html-binding-transform');

function configure(exts, opts) {
	return function(file) {
		if (exts.indexOf(path.extname(file)) == -1) {
			return through();
		}

		var input = '';

		function write(buf) {
			input += buf;
		}

		function end() {
			this.queue(htmlBindingTransform(input, opts));
			this.queue(null);
		}

		return through(write, end);
	};
}

var htmlBindify = configure(['.html']);
htmlBindify.configure = configure;

module.exports = htmlBindify;
