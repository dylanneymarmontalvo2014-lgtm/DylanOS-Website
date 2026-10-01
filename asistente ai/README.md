# Asistente Ai DylanOS

Chat de inteligencia artificial integrado en el sitio web de DylanOS.
Permite a los visitantes preguntar sobre el sistema operativo desde un
widget flotante (círculo rojo con icono de chat blanco, esquina inferior
derecha), siguiendo la identidad visual del sitio.

## Arquitectura

```
asistente ai/
├── asistente.md            # Requisitos originales del feature
├── README.md               # Esta documentación
├── system_prompt.md        # Cómo actúa el asistente (identidad y reglas)
├── memory_context.txt      # Base de conocimiento sobre DylanOS
├── .env                    # Credenciales (NO se sube a Git)
├── .env.example            # Plantilla de credenciales
└── widget/
    ├── asistente.css       # Estilos del widget (prefijo "da-")
    └── asistente.js        # Lógica del chat (vanilla JS, sin dependencias)
```

```
Navegador                    server.js                    API de IA
┌──────────────┐   POST /api/asistente   ┌──────────────┐   HTTPS   ┌────────┐
│ widget (js)  │ ───────────────────────▶ │  endpoint +  │ ────────▶ │ OpenAI │
│  index.html  │ ◀────── { reply } ────── │ .env + memoria│ ◀──────── │ / NIM  │
└──────────────┘                          └──────────────┘           └────────┘
```

- **Frontend**: widget autocontenido inyectado con `<link>` y `<script defer>`
  en `index.html` (mismo patrón que `github-stats.js`). Sin dependencias.
- **Backend**: endpoint `POST /api/asistente` en `server.js`. Lee el
  `.env`, compone el system prompt con la base de conocimiento y llama a
  cualquier API compatible con OpenAI (`/chat/completions`).
- La API key **nunca** llega al navegador: solo el servidor la usa.

## Configuración (2 minutos)

1. Copia la plantilla y edítala:
   ```bash
   cp "asistente ai/.env.example" "asistente ai/.env"
   ```
2. Pega tu API key en `AI_API_KEY`. Por defecto está configurado para
   **NVIDIA NIM** (https://build.nvidia.com → "Get API Key", nivel
   gratuito disponible), pero vale cualquier API compatible con OpenAI:

   | Variable      | Descripción                          | Ejemplo                              |
   | ------------- | ------------------------------------ | ------------------------------------ |
   | `AI_BASE_URL` | URL base de la API (sin `/` final)   | `https://integrate.api.nvidia.com/v1` |
   | `AI_API_KEY`  | Tu clave secreta                     | `nvapi-...`                          |
   | `AI_MODEL`    | Modelo a usar                        | `meta/llama-3.3-70b-instruct`        |

3. Reinicia el servidor:
   ```bash
   node server.js
   ```

## Uso del widget

- Clic en el círculo rojo → se abre el chat **Asistente Ai DylanOS**.
- Incluye 3 preguntas recomendadas: qué es DylanOS, en qué está basado
  y cuál es su repositorio de GitHub.
- `Esc` o la `X` cierran el panel; `Enter` envía el mensaje.

## API local

```
POST /api/asistente
Content-Type: application/json

{ "messages": [ { "role": "user", "content": "¿Qué es DylanOS?" } ] }
```

Respuesta: `{ "reply": "..." }`

| Código | Significado                                          |
| ------ | ---------------------------------------------------- |
| 200    | Respuesta generada                                   |
| 400    | Formato de mensajes inválido                         |
| 405    | Método distinto de POST                              |
| 429    | Límite de 15 peticiones/minuto por IP superado       |
| 503    | Falta configurar `AI_API_KEY` o la base de conocimiento |
| 502/504 | La API de IA falló o tardó demasiado (30 s timeout) |

## Seguridad

- `.env` está en `.gitignore` y el servidor estático **bloquea** el
  acceso web a cualquier archivo oculto y a todo `asistente ai/`
  excepto `widget/`.
- Validación de entrada: máximo 20 mensajes y 2000 caracteres por
  mensaje; solo roles `user`/`assistant`.
- Rate limiting: 15 peticiones por minuto por IP.
- El widget escapa HTML en todas las respuestas antes de renderizar
  (anti-XSS); solo permite Markdown ligero (`**negrita**`, listas,
  enlaces https).
- Protección contra path traversal en el servidor estático
  (`decodeURIComponent` + normalización dentro de la raíz).

## Personalización

- **Comportamiento del asistente** → edita `system_prompt.md`.
- **Conocimiento sobre DylanOS** → edita `memory_context.txt`.
  Ambos se cargan al arrancar el servidor (reinicia tras editarlos).
- **Apariencia del widget** → `widget/asistente.css` (clases `da-*`).

## Pruebas

```bash
node server.js &
# 1. El widget se sirve correctamente
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:5500/asistente%20ai/widget/asistente.js"
# 2. El .env NO es accesible (debe dar 404)
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:5500/asistente%20ai/.env"
# 3. El endpoint responde
curl -s -X POST http://127.0.0.1:5500/api/asistente \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"¿Qué es DylanOS?"}]}'
```
