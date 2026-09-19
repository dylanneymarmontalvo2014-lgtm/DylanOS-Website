const assert = require('assert');
const { toggleMenu } = require('./app');

function createClassList(...initialClasses) {
  const classes = new Set(initialClasses);
  return {
    contains: className => classes.has(className),
    add: (...names) => names.forEach(name => classes.add(name)),
    remove: (...names) => names.forEach(name => classes.delete(name)),
    values: () => [...classes]
  };
}

const menu = { classList: createClassList('hidden') };
const button = {
  expanded: null,
  setAttribute(name, value) {
    if (name === 'aria-expanded') this.expanded = value;
  }
};

toggleMenu(menu, button);
assert.strictEqual(menu.classList.contains('hidden'), false);
assert.strictEqual(button.expanded, 'true');

toggleMenu(menu, button);
assert.strictEqual(menu.classList.contains('hidden'), true);
assert.strictEqual(button.expanded, 'false');

console.log('app: tests passed');
