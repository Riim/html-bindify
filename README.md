html-bindify
============

Преобразует шаблоны из вида:
```html
<div style="color: {color}">Hello, {name}!</div>
```
в:
```html
<div data-bind="css: 'color: ' + this.color(); text(first): 'Hello, ' + this.name() + '!';"></div>
```

Дружит с конструкциями шаблонизаторов:
```html
<div style="color: {<%= color %>}"><%= greating %>, {name}!</div>
```
преобразуется в:
```html
<div data-bind="css: 'color: ' + this.<%= color %>(); text(first): '<%= greating %>, ' + this.name() + '!';"></div>
```
