# WhatsApp AI Bot

Bot de WhatsApp que usa la API oficial de Meta y OpenAI para responder mensajes automáticamente. Configurable para cualquier tipo de negocio (restaurante, barbería, hotel, inmobiliaria, etc.) cambiando un solo archivo JSON.

## Cómo funciona

1. Un cliente escribe por WhatsApp
2. Meta envía el mensaje a tu servidor vía webhook
3. El bot carga la configuración del negocio activo
4. Envía el mensaje + historial a OpenAI para generar una respuesta
5. Responde al cliente por WhatsApp

## Requisitos previos

- **Node.js** v18+
- **Cuenta de Meta Business** con WhatsApp Business API configurada
- **API Key de OpenAI**
- **URL pública** para el webhook (puedes usar [ngrok](https://ngrok.com) para pruebas locales)

---

## Setup paso a paso

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Copia el archivo de ejemplo y llena los valores:

```bash
cp .env.example .env
```

Edita `.env`:

```env
WHATSAPP_TOKEN=tu_token_de_meta
WHATSAPP_PHONE_ID=tu_phone_number_id
WEBHOOK_VERIFY_TOKEN=un_token_secreto_que_tu_elijas
OPENAI_API_KEY=tu_api_key_de_openai
ACTIVE_CONFIG=restaurante
PORT=3000
```

### 3. Iniciar el servidor

**Desarrollo:**
```bash
npm run dev
```

**Producción:**
```bash
npm run build
npm start
```

---

## Cómo obtener las credenciales de Meta

### Paso 1: Crear app en Meta Developers

1. Ve a [developers.facebook.com](https://developers.facebook.com)
2. Crea una nueva app → Selecciona "Business" como tipo
3. En el dashboard, agrega el producto "WhatsApp"

### Paso 2: Obtener el Token y Phone ID

1. En el panel de WhatsApp → API Setup
2. Copia el **Temporary access token** (o genera uno permanente) → este es tu `WHATSAPP_TOKEN`
3. Copia el **Phone number ID** → este es tu `WHATSAPP_PHONE_ID`

### Paso 3: Configurar el Webhook

1. En WhatsApp → Configuration → Webhook
2. Primero inicia tu servidor y expón la URL con ngrok:
   ```bash
   ngrok http 3000
   ```
3. En Meta, configura:
   - **Callback URL:** `https://tu-url-ngrok.ngrok-free.app/webhook`
   - **Verify token:** el mismo valor que pusiste en `WEBHOOK_VERIFY_TOKEN`
4. Suscríbete al campo **messages**

---

## Cómo obtener la API Key de OpenAI

1. Ve a [platform.openai.com](https://platform.openai.com)
2. Ve a API Keys → Create new secret key
3. Copia la key → este es tu `OPENAI_API_KEY`

---

## Configuración del negocio

Los archivos de configuración están en la carpeta `configs/`. Cada archivo define el comportamiento del bot para un tipo de negocio.

**Configs incluidas:**
- `restaurante.json` - Reservaciones, menú, horarios
- `barberia.json` - Citas, servicios, precios
- `hotel.json` - Reservas de habitación, amenidades
- `inmobiliaria.json` - Propiedades, visitas, zonas

Para cambiar el negocio activo, modifica `ACTIVE_CONFIG` en tu `.env`:

```env
ACTIVE_CONFIG=barberia
```

### Crear tu propia configuración

Crea un archivo JSON en `configs/` con esta estructura:

```json
{
  "businessName": "Nombre de tu negocio",
  "systemPrompt": "Instrucciones para el bot. Usa {businessName} y {businessInfo} como placeholders.",
  "welcomeMessage": "Mensaje de bienvenida para el cliente.",
  "businessInfo": {
    "Horario": "...",
    "Dirección": "...",
    "Teléfono": "..."
  },
  "model": "gpt-4o-mini",
  "maxHistoryMessages": 20
}
```

- `{businessName}` se reemplaza con el valor de `businessName`
- `{businessInfo}` se reemplaza con toda la info del negocio formateada

---

## Probar localmente

### 1. Inicia el servidor
```bash
npm run dev
```

### 2. Expón tu servidor con ngrok
```bash
ngrok http 3000
```

### 3. Configura el webhook en Meta (ver sección arriba)

### 4. Envía un mensaje al número de WhatsApp Business desde tu celular

### Probar sin WhatsApp (simular un mensaje)

Puedes probar el webhook localmente con curl:

```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "5215551234567",
            "type": "text",
            "text": { "body": "Hola, quiero hacer una reservación" }
          }]
        }
      }]
    }]
  }'
```

Esto procesará el mensaje con OpenAI (necesitas la API key configurada). La respuesta de WhatsApp fallará si no tienes el token configurado, pero verás la respuesta del bot en la consola.

---

## Estructura del proyecto

```
AIBot/
├── src/
│   ├── index.ts                 # Servidor Express + webhook routes
│   ├── services/
│   │   ├── whatsapp.ts          # Envío de mensajes via Meta API
│   │   └── openai.ts            # Generación de respuestas con OpenAI
│   ├── config/
│   │   └── business-config.ts   # Loader de configuración de negocio
│   └── store/
│       └── conversation.ts      # Memoria de conversaciones (in-memory)
├── configs/
│   ├── restaurante.json
│   ├── barberia.json
│   ├── hotel.json
│   └── inmobiliaria.json
├── .env.example
├── package.json
└── tsconfig.json
```
