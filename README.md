html-bindify
============

Преобразует шаблоны из вида:
```html
<div style="color: {color};">Hello, {name}!<br>{message}</div>
```
в:
```html
<div style="color: {{this.color()}};"
		data-bind="css: 'color: ' + this.color() + ';', text(first): 'Hello, ' + this.name() + '!'">
	Hello, {{this.name()}}!
	<br data-bind="text(next): '' + this.message()">
	{{this.message()}}
</div>
```

Дружит с конструкциями шаблонизаторов:
```html
<div style="color: {<%= colorPropName %>}"><%= greeting %>, {name}!</div>
```
преобразуется в:
```html
<div style="color: {{this.<%= colorPropName %>()}}"
		data-bind="css: 'color: ' + this.<%= colorPropName %>(), text(first): '<%= greeting %>, ' + this.name() + '!'">
	<%= greeting %>, {{this.name()}}!
</div>
```

Все скобки настраиваются.
