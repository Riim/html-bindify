
var htmlparser = require('htmlparser2');

/**
 * @param {string} re
 * @returns {string}
 */
function escapeRegExp(re) {
	return re.replace(/([?(){}[+\-\]^|$\.\/\\*])/g, '\\$1');
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
					(
						item.children.length ?
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
 * @param {Function} cb
 */
function processAST(ast, cb) {
	ast.forEach(function(item) {
		cb(item);

		switch (item.type) {
			case 'script':
			case 'style':
			case 'tag': {
				if (item.children.length) {
					processAST(item.children, cb);
				}
			}
		}
	});
}

/**
 * @param {Object} item
 * @param {string} type
 * @param {string} [attrName]
 * @param {Array<string>} data
 * @param {Array<string>} doTemplateDelimiters
 */
function pushBinding(item, type, attrName, data, doTemplateDelimiters) {
	var attrs = (type == 'text' ? item.prev || item.parent || item.next : item).attribs;
	var attrDataBind = (attrs['data-bind'] || '').trim();

	if (attrDataBind) {
		attrDataBind += attrDataBind[attrDataBind.length - 1] == ',' ? ' ' : ', ';
	}

	var js = [];
	var text = [];

	data.forEach(function(item, index) {
		if (index % 2) {
			js.push('this.' + item + '()');
			text.push(doTemplateDelimiters[0] + 'this.' + item + '()' + doTemplateDelimiters[1]);
		} else {
			if (item) {
				js.push(
					'\'' + item
						.split('"').join('&quot;')
						.split('\\').join('\\\\')
						.split('\'').join('\\\'')
						.split('\r').join('\\r')
						.split('\n').join('\\n')
						.split(',').join('\\x2c') + '\''
				);

				text.push(item);
			} else {
				if (index == 0) {
					js.push('\'\'');
				}
			}
		}
	});

	js = js.join(' + ');
	text = text.join('');

	if (type == 'text') {
		attrs['data-bind'] = attrDataBind +
			'text(' + (item.prev ? 'next' : (item.parent ? 'first' : 'prev')) + '): ' +
			js;

		item.data = text;
	} else {
		attrs['data-bind'] = attrDataBind +
			(attrName == 'value' ? 'value: ' : (attrName == 'style' ? 'css: ' : 'attr(' + attrName + '): ')) +
			js;

		attrs[attrName] = text;
	}
}

var defaults = {
	xhtmlMode: false,
	templateDelimiters: [['{{', '}}'], ['<%', '%>']],
	bindingDelimiters: ['{', '}'],
	doTemplateDelimiters: ['{{', '}}'],
	skipAttributes: ['data-bind', 'data-options']
};

/**
 * @param {string} html
 * @param {Object} [options]
 * @param {boolean} [options.xhtmlMode=false]
 * @param {Array<Array<string>>} [options.templateDelimiters=[['{{', '}}'], ['<%', '%>']]]
 * @param {Array<string>} [options.bindingDelimiters=['{', '}']]
 * @param {Array<string>} [options.doTemplateDelimiters=['{{', '}}']]
 * @param {Array<string>} [options.skipAttributes=['data-bind', 'data-options']]
 * @returns {string}
 */
function htmlBindify(html, options) {
	if (!options) {
		options = {};
	}
	options.__proto__ = defaults;

	var doTemplateDelimiters = options.doTemplateDelimiters;
	var skipAttributes = options.skipAttributes;

	var fragments = [];
	var idCounter = 0;

	var reTemplateInsert = options.templateDelimiters
		.map(function(templateDelimiters) {
			return escapeRegExp(templateDelimiters[0]) + '[\\s\\S]*?' + escapeRegExp(templateDelimiters[1]);
		})
		.join('|');

	html = html.replace(new RegExp(reTemplateInsert, 'g'), function(match) {
		var mark;

		do {
			mark = 'bind' + (++idCounter) + 'ify';
		} while (html.indexOf(mark) != -1);

		fragments.push({ mark: mark, text: match });

		return mark;
	});

	var ast = htmlToAST(html);

	var reBindingInsert = new RegExp(
		escapeRegExp(options.bindingDelimiters[0]) + '\\s*([$_a-zA-Z][$\\w]*(?:\\.[$_a-zA-Z][$\\w]*)*)\\s*' +
			escapeRegExp(options.bindingDelimiters[1])
	);

	processAST(ast, function(item) {
		if (item.type == 'text') {
			var text = item.data.split(reBindingInsert);

			if (text.length > 1) {
				pushBinding(item, 'text', undefined, text, doTemplateDelimiters);
			}
		} else if (item.type == 'tag') {
			var attrs = item.attribs;

			Object.keys(attrs).forEach(function(name) {
				if (skipAttributes.indexOf(name) == -1) {
					var value = attrs[name].split(reBindingInsert);

					if (value.length > 1) {
						pushBinding(item, 'attr', name, value, doTemplateDelimiters);
					}
				}
			});
		}
	});

	html = astToHTML(ast, options.xhtmlMode);

	var i = fragments.length;

	while (i) {
		html = html.split(fragments[--i].mark).join(fragments[i].text);
	}

	return html;
}

module.exports = htmlBindify;
