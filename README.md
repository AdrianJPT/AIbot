# WhatsApp AI Bot V2

Plataforma multi-tenant: Next.js + PostgreSQL (Prisma) + Meta WhatsApp Cloud API + OpenAI. Panel admin para negocios, conversaciones, citas y traspaso a humano.

## Requisitos

- Node.js 22+
- PostgreSQL 16 (local o Docker)
- Cuenta Meta Business + WhatsApp Cloud API
- API key de OpenAI

## Variables de entorno

Copia `.env.example` a `.env`:

```env
DATABASE_URL=postgresql://bot:password@localhost:5432/whatsapp_bot
DIRECT_URL=postgresql://bot:password@localhost:5432/whatsapp_bot
OPENAI_API_KEY=sk-...
WEBHOOK_VERIFY_TOKEN=un_token_secreto_para_el_webhook
WHATSAPP_APP_SECRET=...
NEXT_PUBLIC_SITE_URL=https://tu-dominio-publico (http://localhost:3000 en local)
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_ENCRYPTION_KEY=base64_de_32_bytes
```

`NEXT_PUBLIC_SITE_URL` debe ser el dominio público real de la app (el de Railway en prod). Los redirects de auth (`/auth/callback`, `/auth/logout`, middleware) lo usan en vez de la URL del request — detrás del proxy de Railway, `req.nextUrl.origin` resuelve a la dirección interna del contenedor, no al dominio público.

Cada **negocio** guarda su propio `phoneNumberId` y `whatsappToken` en la base de datos (panel **Negocios**).

## Desarrollo local

```bash
npm install
# Crea la base y tablas
npx prisma db push
# Datos de ejemplo (opcional). Puedes poner SEED_PHONE_NUMBER_ID y SEED_WHATSAPP_TOKEN para el primer negocio
npm run db:seed
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

1. En **Negocios**, edita un negocio y pon el **Phone Number ID** y **token** reales de Meta.
2. En Meta Developers, webhook **Callback URL**: `https://tu-dominio-o-ngrok/api/webhook` y el mismo **Verify token** que `WEBHOOK_VERIFY_TOKEN`.
3. Suscríbete al campo **messages**.

## Docker local

```bash
# crea .env en la raíz con las variables de arriba
docker compose up --build
```

Ese comando levanta Postgres + app y hace `prisma db push` dentro del contenedor para dejar el schema listo.

Si querés login local real, necesitás un proyecto de Supabase para `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`; Docker sólo te resuelve la app y la base local, no el proveedor de auth.

## Panel admin

| Ruta | Uso |
|------|-----|
| `/` | Resumen: negocios activos, conversaciones hoy, citas pendientes |
| `/businesses` | CRUD negocios, prompts, `businessInfo` JSON |
| `/conversations` | Lista con filtros; detalle con historial, **pasar a humano**, envío manual a WhatsApp |
| `/appointments` | Citas/reservas: filtros, confirmar/cancelar/borrar, **Nueva cita** |

## Webhook

- `GET /api/webhook` — verificación Meta (`hub.verify_token`).
- `POST /api/webhook` — mensajes entrantes. Responde 200 al instante y procesa en segundo plano.

El negocio se resuelve por `metadata.phone_number_id` del payload.

## Tipos de mensaje

- **Texto** e **interactivo** (botones/listas): respuesta con el modelo configurado.
- **Imagen**: descripción con visión (gpt-4o-mini) y luego el chat.
- **Audio/voz**: transcripción con Whisper.
- **Ubicación**: texto con coordenadas.
- **Documento**: respuesta fija indicando que no se leen archivos.

Si la conversación está en **handed_off**, el bot no responde; el admin puede escribir desde el panel.

## API REST (admin)

- `GET/POST /api/businesses`, `GET/PATCH/DELETE /api/businesses/[id]`
- `GET /api/conversations?businessId=&status=`
- `GET /api/conversations/[id]`
- `POST /api/conversations/[id]/handoff` body `{ "status": "active" | "handed_off" | "closed" }`
- `POST /api/conversations/[id]/send` body `{ "text": "..." }`
- `GET/POST /api/appointments`, `PATCH/DELETE /api/appointments/[id]`

## Estructura principal

```
prisma/schema.prisma    # Modelos Business, Conversation, Message, Appointment
src/app/                # Rutas App Router + API
src/lib/                # db, whatsapp, openai, media, message-handler, prompt
src/components/         # Sidebar, formularios, vistas
configs/                # JSON de ejemplo (referencia; el sistema usa la BD)
```

## Scripts

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Next.js en desarrollo |
| `npm run build` | `prisma generate` + `next build` |
| `npm start` | Producción (`next start`) |
| `npm run db:push` | Sincronizar schema con la BD |
| `npm run db:seed` | Seed de negocios de ejemplo |
| `npm run db:studio` | Prisma Studio |

## Seguridad

El panel no incluye autenticación todavía; no expongas el admin a internet sin VPN, Basic Auth o similar. `NEXTAUTH_SECRET` está reservado para una futura auth.
