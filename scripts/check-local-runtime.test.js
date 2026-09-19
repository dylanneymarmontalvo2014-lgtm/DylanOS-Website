const assert = require('assert');
const { findViolations } = require('./check-local-runtime');

assert.deepStrictEqual(findViolations('<img src="https://cdn.example/image.png">'), [
  { line: 1, value: 'https://cdn.example/image.png', reason: 'recurso remoto' }
]);

assert.deepStrictEqual(findViolations('<a href="https://github.com/example/project">GitHub</a>'), []);
assert.deepStrictEqual(findViolations('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), []);
assert.deepStrictEqual(findViolations("fetch('https://api.example.test/data')"), [
  { line: 1, value: 'https://api.example.test/data', reason: 'llamada de red' }
]);

console.log('check-local-runtime: tests passed');
