
var htmlparser = require('htmlparser2');

var reEscapableChars = /([?+|$(){}[^.\-\]\/\\*])/g;

/**
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
	return str.replace(reEscapableChars, '\\$1');
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
	circle: 1,
	ellipse: 1,
	line: 1,
	path: 1,
	polygone: 1,
	polyline: 1,
	rect: 1,
	stop: 1,
	use: 1
};

/**
 * @param {string} html
 * @returns {Array}
 */
function htmlToDOM(html) {
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
 * @param {Array} dom
 * @param {boolean} [xhtmlMode=false]
 * @returns {string}
 */
function domToHTML(dom, xhtmlMode) {
	return dom.map(function(node) {
		switch (node.type) {
			case 'directive': {
				return '<' + node.data + '>';
			}
			case 'script':
			case 'style':
			case 'tag': {
				var attrs = node.attribs;
				var html = ['<' + node.name];

				for (var name in attrs) {
					html.push(' ' + name + '="' + attrs[name] + '"');
				}

				if (node.children.length) {
					html.push('>' + domToHTML(node.children, xhtmlMode) + '</' + node.name + '>');
				} else {
					if (node.name in selfClosingTags) {
						html.push(xhtmlMode ? ' />' : '>');
					} else {
						html.push('></' + node.name + '>');
					}
				}

				return html.join('');
			}
			case 'text': {
				return node.data;
			}
			case 'cdata': {
				return '<' + node.data + '>';
			}
			case 'comment': {
				return '<!--' + node.data + '-->';
			}
		}
	}).join('');
}

/**
 * @param {Array} dom
 * @param {Function} cb
 */
function processDOM(dom, cb) {
	dom.forEach(function(node, index, nodes) {
		cb(node, index, nodes);

		switch (node.type) {
			case 'script':
			case 'style':
			case 'tag': {
				processDOM(node.children, cb);
			}
		}
	});
}

/**
 * @private
 *
 * @param {Object} node
 * @param {string|undefined} attrName
 * @param {Array<string>} value
 * @param {string} attrBindName
 * @param {Array<string>} outputDelimiters
 */
function pushBinding(node, attrName, value, attrBindName, outputDelimiters) {
	var attrs = (node.type == 'tag' ? node : node.prev || node.parent || node.next).attribs;
	var attrBindValue = (attrs[attrBindName] || '').trim();

	if (attrBindValue && attrBindValue[attrBindValue.length - 1] != ',') {
		attrBindValue += ',';
	}

	var bindingExpr = [];
	var newValue = [];

	value.forEach(function(chunk, index) {
		if (index % 2) {
			bindingExpr.push('this.' + chunk + '()');
			newValue.push(outputDelimiters[0] + chunk + '()' + outputDelimiters[1]);
		} else {
			if (chunk) {
				bindingExpr.push(
					'\'' + chunk
						.split('"').join('&quot;')
						.split('\\').join('\\\\')
						.split('\'').join('\\\'')
						.split('\r').join('\\r')
						.split('\n').join('\\n')
						.split(',').join('\\x2c') + '\''
				);

				newValue.push(chunk);
			} else {
				if (index == 0) {
					bindingExpr.push('\'\'');
				}
			}
		}
	});

	bindingExpr = bindingExpr.join('+');
	newValue = newValue.join('');

	if (node.type == 'tag') {
		attrs[attrBindName] = attrBindValue +
			(attrName == 'value' ? 'value:' : (attrName == 'style' ? 'css:' : 'attr(' + attrName + '):')) +
			bindingExpr;

		attrs[attrName] = newValue;
	} else {
		attrs[attrBindName] = attrBindValue +
			'text(' + (node.prev ? 'next' : (node.parent ? 'first' : 'prev')) + '):' +
			bindingExpr;

		node.data = newValue;
	}
}

var defaults = {
	xhtmlMode: false,
	attrBindName: 'data-bind',
	skipAttributes: ['data-bind', 'data-options'],
	inputTemplateDelimiters: ['{{', '}}'],
	inputBindingDelimiters: ['{', '}'],
	outputDelimiters: ['{{', '}}']
};

/**
 * @param {string} html
 * @param {Object} [opts]
 * @param {boolean} [opts.xhtmlMode=false]
 * @param {string} [attrBindName='data-bind']
 * @param {Array<string>} [opts.skipAttributes=['data-options']]
 * @param {Array<string>} [opts.inputTemplateDelimiters=['{{', '}}']]
 * @param {Array<string>} [opts.inputBindingDelimiters=['{', '}']]
 * @param {Array<string>} [opts.outputDelimiters=['{{', '}}']]
 * @returns {string}
 */
function htmlBindify(html, opts) {
	if (!opts) {
		opts = {};
	}
	opts.__proto__ = defaults;

	var attrBindName = opts.attrBindName;
	var skipAttributes = opts.skipAttributes.indexOf(attrBindName) == -1 ?
		opts.skipAttributes.concat(attrBindName) :
		opts.skipAttributes;
	var outputDelimiters = opts.outputDelimiters;

	var reTemplateInsert = RegExp(
		escapeRegExp(opts.inputTemplateDelimiters[0]) + '[\\s\\S]*?' + escapeRegExp(opts.inputTemplateDelimiters[1]),
		'g'
	);
	var reBindingInsert = RegExp(
		escapeRegExp(opts.inputBindingDelimiters[0]) + '\\s*(\\S.*?)\\s*' + escapeRegExp(opts.inputBindingDelimiters[1])
	);

	var markIdCounter = 0;
	var reMarks = [];
	var templateInserts = [];

	html = html.replace(reTemplateInsert, function(insert) {
		var mark;

		do {
			mark = 'bind' + (++markIdCounter) + 'ify';
		} while (html.indexOf(mark) != -1);

		reMarks.push(mark);
		templateInserts.push({ mark: mark, insert: insert });

		return mark;
	});

	reMarks = RegExp(reMarks.join('|'));

	var dom = htmlToDOM(html);

	processDOM(dom, function(node, index, nodes) {
		if (node.type == 'text') {
			var value = node.data;

			if (reBindingInsert.test(value) && reMarks.test(value)) {
				value = value.replace(reBindingInsert, function(value) {
					return '<span>' + value + '</span>';
				});

				var dom = htmlToDOM(value);

				dom[0].prev = node.prev;
				dom[dom.length - 1].next = node.next;

				var parent = node.parent;

				if (parent) {
					for (var i = dom.length; i;) {
						dom[--i].parent = parent;
					}
				}

				nodes.splice.apply(nodes, [index, 1].concat(dom));
			}
		}
	});

	if (dom.length == 1 && dom[0].type == 'text' && reBindingInsert.test(html)) {
		dom = htmlToDOM('<span>' + html + '</span>');
	}

	processDOM(dom, function(node) {
		if (node.type == 'tag') {
			var attrs = node.attribs;

			for (var name in attrs) {
				if (skipAttributes.indexOf(name) != -1) {
					continue;
				}

				var value = attrs[name].split(reBindingInsert);

				if (value.length > 1) {
					pushBinding(node, name, value, attrBindName, outputDelimiters);
				}
			}
		} else if (node.type == 'text') {
			var value = node.data.split(reBindingInsert);

			if (value.length > 1) {
				pushBinding(node, undefined, value, attrBindName, outputDelimiters);
			}
		}
	});

	html = domToHTML(dom, opts.xhtmlMode);

	for (var i = templateInserts.length; i;) {
		html = html.split(templateInserts[--i].mark).join(templateInserts[i].insert);
	}

	return html;
}

module.exports = htmlBindify;
