'use strict';

const FORM_FIELD_TYPES = ['text', 'textarea', 'email', 'number', 'select', 'checkbox'];
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function cleanText(value, name, max, required = false) {
  const text = String(value == null ? '' : value).trim();
  if (required && !text) throw new Error(`${name} es obligatorio.`);
  if (text.length > max) throw new Error(`${name} supera el máximo de ${max} caracteres.`);
  return text;
}

function normalizeField(field, position) {
  if (!field || !FORM_FIELD_TYPES.includes(field.type)) {
    throw new Error('Tipo de campo no permitido.');
  }
  const label = cleanText(field.label, 'La etiqueta', 120, true);
  const description = cleanText(field.description, 'La descripción', 240);
  const options = Array.isArray(field.options)
    ? [...new Set(field.options.map(option => String(option).trim()).filter(Boolean))].slice(0, 20)
    : [];
  if (field.type === 'select' && options.length < 1) {
    throw new Error('Un selector necesita al menos una opción.');
  }
  return {
    id: field.id || undefined,
    type: field.type,
    label,
    description,
    required: Boolean(field.required),
    position,
    options
  };
}

function normalizeFormPayload(payload = {}) {
  const title = cleanText(payload.title, 'El título', 120, true);
  const description = cleanText(payload.description, 'La descripción', 500);
  const slug = cleanText(payload.slug, 'El slug', 80, true).toLowerCase();
  if (!SLUG_PATTERN.test(slug)) throw new Error('El slug solo admite minúsculas, números y guiones.');
  if (!Array.isArray(payload.fields) || payload.fields.length > 30) {
    throw new Error('El formulario debe tener entre 0 y 30 campos.');
  }
  return {
    title,
    description,
    slug,
    fields: payload.fields.map(normalizeField)
  };
}

function normalizeAnswers(fields, answers = {}) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    throw new Error('Las respuestas no tienen un formato válido.');
  }
  const result = {};
  for (const field of fields) {
    const raw = answers[field.id];
    const empty = raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0);
    if (field.required && empty) throw new Error(`El campo “${field.label}” es obligatorio.`);
    if (empty) continue;
    if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw))) {
      throw new Error(`Introduce un correo válido en “${field.label}”.`);
    }
    if (field.type === 'number' && !Number.isFinite(Number(raw))) {
      throw new Error(`Introduce un número válido en “${field.label}”.`);
    }
    if (field.type === 'select' && !field.options.includes(String(raw))) {
      throw new Error(`La opción elegida en “${field.label}” no es válida.`);
    }
    if (field.type === 'checkbox' && typeof raw !== 'boolean') {
      throw new Error(`La respuesta de “${field.label}” no es válida.`);
    }
    result[field.id] = field.type === 'number' ? Number(raw) : raw;
  }
  return result;
}

module.exports = { FORM_FIELD_TYPES, normalizeField, normalizeFormPayload, normalizeAnswers };
