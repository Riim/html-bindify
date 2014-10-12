
var htmlparser = require('htmlparser2');

/**
 * @param {string} re
 * @returns {string}
 */
function escapeRegExp(re) {
	return re.replace(/([?!\.{}[+\-\]^|$(=:)\/\\*])/g, '\\$1');
}

var selfClosingTags = {
	__proto__: null,

	area: 1,
	base: 1,
	basefont: 1,
	br: 1,
	col: 1,
	command: 1,
	embed: 1,
	frame: 1,
	hr: 1,
	img: 1,
	input: 1,
	isindex: 1,
	keygen: 1,
	link: 1,
	meta: 1,
	param: 1,
	source: 1,
	track: 1,
	wbr: 1,

	// svg tags
	path: 1,
	circle: 1,
	ellipse: 1,
	line: 1,
	rect: 1,
	use: 1,
	stop: 1,
	polyline: 1,
	polygone: 1
};

/**
 * @param {string} html
 * @returns {Array}
 */
function htmlToAST(html) {
	var handler = new htmlparser.DomHandler(function(err, dom) {}, {
		normalizeWhitespace: true
	});

	var parser = new htmlparser.Parser(handler, {
		xmlMode: false,
		recognizeSelfClosing: false,
		recognizeCDATA: false,
		decodeEntities: false,
		lowerCaseTags: false,
		lowerCaseAttributeNames: false
	});

	parser.parseComplete(html);

	return handler.dom;
}

/**
 * @param {Array} ast
 * @param {boolean} [xhtmlMode=false]
 * @returns {string}
 */
function astToHTML(ast, xhtmlMode) {
	return ast.map(function(item) {
		switch (item.type) {
			case 'directive': {
				return '<' + item.data + '>';
			}
			case 'script':
			case 'style':
			case 'tag': {
				return '<' + item.name +

					Object.keys(item.attribs)
						.map(function(name) {
							return ' ' + name + '="' + this[name] + '"';
						}, item.attribs)
						.join('') +

					(item.children.length ?
						'>' + astToHTML(item.children, xhtmlMode) + '</' + item.name + '>' :
						(item.name in selfClosingTags ? (xhtmlMode ? ' />' : '>') : '></' + item.name + '>')
					);
			}
			case 'text': {
				return item.data;
			}
			case 'cdata': {
				return '<' + item.data + '>';
			}
			case 'comment': {
				return '<!--' + item.data + '-->';
			}
		}
	}).join('');
}

/**
 * @param {Array} ast
 * @param {Function} callback
 */
function processAST(ast, callback) {
	ast.forEach(function(item) {
		callback(item);

		switch (item.type) {
			case 'script':
			case 'style':
			case 'tag': {
				if (item.children.length) {
					processAST(item.children, callback);
				}
			}
		}
	});
}

/**
 * @param {Array<string>} data
 * @returns {string}
 */
function dataToJS(data) {
	return data
		.reduce(function(js, item, index) {
			if (index % 2) {
				js.push(
					/^([$_a-zA-Z][$\w]*)(?:\.[$_a-zA-Z][$\w]*)*$/.test(item) && RegExp.$1 != 'this' ?
						'this.' + item + '()' :
						'(' + item + ')'
				);
			} else {
				if (item) {
					js.push(
						'\'' + item
							.split('\'').join('\\\'')
							.split('\r').join('\\r')
							.split('\n').join('\\n')
							.split('"').join('&quot;')
							.split(';').join('\\x3b') + '\''
					);
				} else {
					if (index == 0) {
						js.push('\'\'');
					}
				}
			}

			return js;
		}, [])
		.join(' + ');
}

/**
 * @param {Object} item
 * @param {string} type
 * @param {string} [attrName]
 * @param {Array<string>} data
 */
function pushBinding(item, type, attrName, data) {
	var attrs;

	if (type == 'text') {
		attrs = (item.prev || item.parent || item.next).attribs;

		attrs['data-bind'] = (attrs['data-bind'] ? attrs['data-bind'] + ' ' : '') +
			'text(' +
			(item.prev ? 'next' : (item.parent ? 'first' : 'prev')) +
			'): ' +
			dataToJS(data) +
			';';

		item.data = ' ';
	} else {
		attrs = item.attribs;

		attrs['data-bind'] = (attrs['data-bind'] ? attrs['data-bind'] + ' ' : '') +
			(attrName == 'value' ? 'value: ' : (attrName == 'style' ? 'css: ' : 'attr(' + attrName + '): ')) +
			dataToJS(data) +
			';';

		delete attrs[attrName];
	}
}

var defaults = {
	xhtmlMode: false,
	templateDelimiters: [['<%', '%>'], ['{{', '}}']],
	bindingDelimiters: ['{', '}']
};

/**
 * @param {string} html
 * @param {Object} [options]
 * @param {boolean} [options.xhtmlMode=false]
 * @param {Array} [options.templateDelimiters=[['<%', '%>'], ['{{', '}}']]]
 * @param {Array} [options.bindingDelimiters=['{', '}']]
 * @param {Function} [options.pushBinding]
 * @returns {string}
 */
function htmlBindify(html, options) {
	if (!options) {
		options = {};
	}
	options.__proto__ = defaults;

	var pushBinding_ = options.pushBinding || pushBinding;

	var clippings = [];
	var idCounter = 0;

	var reTemplateInsert = options.templateDelimiters
		.map(function(templateDelimiters) {
			return escapeRegExp(templateDelimiters[0]) + '[\\s\\S]*?' + escapeRegExp(templateDelimiters[1]);
		})
		.join('|');

	html = html.replace(new RegExp(reTemplateInsert), function(match) {
		var mark;

		do {
			mark = 'bind' + (++idCounter) + 'ify';
		} while (html.indexOf(mark) != -1);

		clippings.push({ mark: mark, text: match });

		return mark;
	});

	var ast = htmlToAST(html);

	var reBinding = new RegExp(
		escapeRegExp(options.bindingDelimiters[0]) + '([\\s\\S]*?)' + escapeRegExp(options.bindingDelimiters[1])
	);

	processAST(ast, function(item) {
		if (item.type == 'text') {
			var text = item.data.split(reBinding);

			if (text.length > 1) {
				pushBinding_(item, 'text', undefined, text);
			}
		} else if (item.type == 'tag') {
			var attrs = item.attribs;

			Object.keys(attrs).forEach(function(name) {
				if (name.slice(0, 5) != 'data-') {
					var value = attrs[name].split(reBinding);

					if (value.length > 1) {
						pushBinding_(item, 'attr', name, value);
					}
				}
			});
		}
	});

	html = astToHTML(ast);

	var i = clippings.length;

	while (i) {
		html = html.replace(clippings[--i].mark, clippings[i].text);
	}

	return html;
}

module.exports = htmlBindify;
