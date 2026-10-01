/* Endpoint serverless del Asistente Ai DylanOS (Vercel).
   Misma lógica que server.js: la API key solo vive en variables de
   entorno del servidor, nunca llega al navegador. */
const fs = require('fs');
const path = require('path');

const ASSISTANT_DIR = path.join(process.cwd(), 'asistente ai');
const ASSISTANT_MAX_MESSAGES = 20;
const ASSISTANT_MAX_CONTENT = 2000;
const ASSISTANT_RATE_LIMIT = 15;          // peticiones por minuto por IP
const ASSISTANT_TIMEOUT = 55 * 1000;
const assistantRateMap = new Map();       // ip -> [timestamps]

function readAssistantFile(name) {
  try {
    return fs.readFileSync(path.join(ASSISTANT_DIR, name), 'utf8').trim();
  } catch (error) {
    console.error(`No se pudo leer ${name} del asistente:`, error.message);
    return '';
  }
}

const assistantSystemPrompt = [
  readAssistantFile('system_prompt.md'),
  'BASE DE CONOCIMIENTO:\n' + readAssistantFile('memory_context.txt')
].join('\n\n');

function assistantRateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 60 * 1000;
  const hits = (assistantRateMap.get(ip) || []).filter(t => t > windowStart);
  if (hits.length >= ASSISTANT_RATE_LIMIT) {
    assistantRateMap.set(ip, hits);
    return true;
  }
  hits.push(now);
  assistantRateMap.set(ip, hits);
  return false;
}

function validateAssistantMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 ||
      messages.length > ASSISTANT_MAX_MESSAGES) {
    return null;
  }
  const sanitized = [];
  for (const message of messages) {
    if (!message || typeof message.content !== 'string' ||
        !['user', 'assistant'].includes(message.role)) {
      return null;
    }
    const content = message.content.trim();
    if (!content || content.length > ASSISTANT_MAX_CONTENT) return null;
    sanitized.push({ role: message.role, content });
  }
  if (sanitized[sanitized.length - 1].role !== 'user') return null;
  return sanitized;
}

async function askAssistant(messages) {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (process.env.AI_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/+$/, '');
  const model = process.env.AI_MODEL || 'meta/llama-3.2-11b-vision-instruct';

  if (!apiKey || apiKey === 'PEGAR_TU_API_KEY_AQUI') {
    throw Object.assign(new Error('El asistente no tiene configurada su API key.'), { statusCode: 503 });
  }
  if (!assistantSystemPrompt.trim()) {
    throw Object.assign(new Error('Falta la configuración del asistente (prompt/memoria).'), { statusCode: 503 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSISTANT_TIMEOUT);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: assistantSystemPrompt }, ...messages],
        temperature: 0.4,
        max_tokens: 300,
        stream: false
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw Object.assign(new Error(`La API de IA respondió ${response.status}`), { statusCode: 502 });
    }
    const parsed = await response.json();
    const reply = parsed.choices && parsed.choices[0] &&
      parsed.choices[0].message && parsed.choices[0].message.content;
    if (!reply) throw Object.assign(new Error('Respuesta de IA vacía'), { statusCode: 502 });
    return reply.trim();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw Object.assign(new Error('La API de IA tardó demasiado.'), { statusCode: 504 });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método no permitido. Usa POST.' });
    return;
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconocida';
  if (assistantRateLimited(ip)) {
    res.status(429).json({ error: 'Demasiadas preguntas seguidas. Espera un momento e inténtalo de nuevo.' });
    return;
  }

  try {
    const messages = validateAssistantMessages(req.body && req.body.messages);
    if (!messages) {
      res.status(400).json({ error: 'Formato de mensajes inválido.' });
      return;
    }
    const reply = await askAssistant(messages);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ reply });
  } catch (error) {
    console.error('Error en /api/asistente:', error.message);
    const statusCode = error.statusCode || 500;
    const publicMessage = statusCode >= 400 && statusCode < 500 && statusCode !== 503
      ? error.message
      : statusCode === 503
        ? 'El asistente no está configurado todavía. Revisa las variables de entorno.'
        : 'El asistente no pudo responder. Inténtalo de nuevo en unos segundos.';
    res.status(statusCode).json({ error: publicMessage });
  }
};
