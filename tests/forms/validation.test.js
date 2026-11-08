const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FORM_FIELD_TYPES,
  normalizeFormPayload,
  normalizeAnswers
} = require('../../lib/forms/validation');

test('normalizes a form title, slug and ordered fields', () => {
  const result = normalizeFormPayload({
    title: '  Encuesta Crimson  ',
    description: '  Cuéntanos qué mejorar. ',
    slug: 'encuesta-crimson',
    fields: [
      { type: 'text', label: '  Nombre ', required: true },
      { type: 'select', label: 'Edición', options: ['Beta', 'Estable'] }
    ]
  });

  assert.equal(result.title, 'Encuesta Crimson');
  assert.equal(result.description, 'Cuéntanos qué mejorar.');
  assert.equal(result.slug, 'encuesta-crimson');
  assert.deepEqual(result.fields.map(field => field.position), [0, 1]);
  assert.deepEqual(result.fields[1].options, ['Beta', 'Estable']);
});

test('rejects unsupported field types and malformed slugs', () => {
  assert.ok(FORM_FIELD_TYPES.includes('textarea'));
  assert.throws(
    () => normalizeFormPayload({ title: 'Formulario', slug: 'No válido', fields: [] }),
    /slug/i
  );
  assert.throws(
    () => normalizeFormPayload({ title: 'Formulario', slug: 'formulario', fields: [{ type: 'slider', label: 'Edad' }] }),
    /tipo de campo/i
  );
});

test('validates answers against the published form fields', () => {
  const fields = [
    { id: 'name', type: 'text', label: 'Nombre', required: true },
    { id: 'edition', type: 'select', label: 'Edición', required: true, options: ['Beta', 'Estable'] },
    { id: 'notes', type: 'textarea', label: 'Notas', required: false }
  ];

  assert.deepEqual(normalizeAnswers(fields, { name: 'Dylan', edition: 'Beta' }), {
    name: 'Dylan', edition: 'Beta'
  });
  assert.throws(() => normalizeAnswers(fields, { edition: 'Experimental' }), /obligatorio|válida/i);
});
