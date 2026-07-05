# Manual de onboarding de un cliente nuevo a WhatsApp Cloud API

> Proceso manual (sin Embedded Signup) para conectar el número de un cliente
> que hoy solo usa la app de WhatsApp Business en su celular, sin nada creado
> en Meta for Developers. El objetivo es que el WABA del cliente viva en **su
> propio** Business Manager (no en el tuyo), para no consumir tu cupo de 2
> números por portfolio no verificado.
>
> Reconstruido a partir de la documentación pública de Meta — la UI de Meta
> cambia nombres de botones seguido; si algún paso no coincide exactamente,
> guiate por el label más parecido.

## Punto de partida

- **Cliente**: tiene un número activo en la app de WhatsApp Business del
  celular. No tiene cuenta de Facebook Developer, ni Business Manager, ni
  nada creado en Meta.
- **Vos**: ya tenés tu App de Meta funcionando (con al menos un negocio de
  prueba conectado) y el sistema de credenciales de AIbot (`/settings/credentials`)
  listo para cargar tokens por negocio.

## Fase 0 — Explicarle al cliente qué va a pasar (antes de tocar nada)

Avisale esto ANTES de empezar, para evitar sorpresas:

- Va a necesitar (o crear) una cuenta de Facebook personal — no hace falta
  que la use para nada social, es solo la llave de acceso al panel de
  negocio de Meta.
- En este flujo **no hay coexistencia**: una vez migrado el número a la API,
  deja de funcionar en la app de WhatsApp Business del celular. Si le
  importa el historial de chats, que lo exporte antes (WhatsApp no tiene
  export masivo, es chat por chat: Ajustes → Chats → Historial de chats →
  Exportar chat).

## Fase 1 — Cliente: crear su identidad en Meta

1. Si no tiene Facebook: crear una cuenta personal básica en facebook.com
   (2 minutos, gratis).
2. Ir a **business.facebook.com** → Crear cuenta → crear su propio Business
   Portfolio (poner el nombre real del negocio, sirve para una futura
   verificación).
3. Anotar el **Business Portfolio ID**: Configuración del negocio →
   Información de la empresa. Te lo va a pasar en la Fase 4.

## Fase 2 — Cliente: liberar el número de la app de WhatsApp Business

1. Abrir WhatsApp Business App en el celular.
2. Ajustes → Cuenta → Eliminar cuenta (o "Cambiar número", según versión) —
   libera el número para poder registrarlo en otro sistema.
3. Esperar unos minutos: Meta a veces tarda en liberar el número tras el
   borrado antes de dejarlo registrar en otro lado.

## Fase 3 — Cliente: registrar el WABA en SU Business Manager

**Importante**: hacer todo este paso desde Business Manager, sin tocar
"Casos de Uso" de ninguna App todavía — mezclar los dos flujos genera
números que quedan en un estado intermedio roto.

1. En business.facebook.com, con **su** Business Portfolio seleccionado
   (arriba a la izquierda).
2. Configuración del negocio → Cuentas → Cuentas de WhatsApp → Agregar.
3. Completar nombre de la cuenta de WhatsApp, categoría y descripción del
   negocio.
4. Ingresar el número liberado en la Fase 2, elegir verificación por SMS o
   llamada, cargar el código recibido.
5. Confirmar que el WABA quedó **verificado** (no "pendiente").

## Fase 4 — Cliente: compartir el WABA con vos

1. El cliente te pasa su Business Portfolio ID (Fase 1).
2. Vos le pasás el tuyo (Configuración del negocio → Información de la
   empresa, de tu cuenta).
3. Cliente: va al WABA recién creado → "Compartir" → "Compartir con un
   socio" → pega TU Business Portfolio ID → asigna permisos de
   administración completa.

## Fase 5 — Vos: aceptar y conectar el WABA a tu App

1. En tu Business Manager → aceptar la cuenta de WhatsApp compartida (Meta
   suele pedir una confirmación de tu lado).
2. developers.facebook.com → Mis Apps → tu App → producto WhatsApp →
   Configuración / API Setup.
3. Seleccionar el WABA del cliente entre las cuentas disponibles/compartidas.
4. Confirmar que aparece el `phone_number_id` del cliente.
5. Generar un token permanente para ese número:
   - Configuración del negocio → Usuarios → Usuarios del sistema → tu
     System User con rol Admin.
   - Asignarle acceso al WABA del cliente (Añadir activos → seleccionar el
     WABA → rol completo).
   - Generar token: elegí tu App, marcá los permisos
     `whatsapp_business_messaging` y `whatsapp_business_management`, generá
     un token sin expiración.
6. Guardar ese token de forma segura — es el que vas a cargar en el paso
   siguiente.

## Fase 6 — Vos: dar de alta el negocio en AIbot

1. Panel → `/settings/credentials` → "Agregar credencial" → kind
   `whatsapp`, pegar el token generado, activarla (ver
   `docs/plan/03-provider-key-management.md`).
2. Panel → `/businesses/new` → cargar `phoneNumberId` del cliente, vincular
   la credential recién creada, completar `systemPrompt`/`businessInfo`.
3. Confirmar `isActive: true`.

## Fase 7 — Confirmar el webhook para ese número

1. developers.facebook.com → tu App → WhatsApp → Configuración → Webhook:
   la URL (`https://tu-dominio/api/webhook`) y el Verify Token son a nivel
   App, no por número — si ya funciona con tu negocio de prueba, no hay que
   tocar nada acá.
2. Verificar que el WABA del cliente esté suscripto al campo `messages` en
   la pestaña de configuración del webhook (a veces la suscripción es por
   WABA y hay que confirmarla individualmente).

## Fase 8 — Prueba end-to-end

1. Desde un celular externo, mandar un WhatsApp al número del cliente.
2. Confirmar en `/conversations` que el mensaje aparece en tiempo real.
3. Responder (bot o manual) y confirmar que llega al celular externo.
4. Revisar `/settings/events` por si quedó algún error logueado.

## Qué NO hacer

- No uses "Casos de Uso" de tu App para dar de alta números de clientes —
  esa vía crea el WABA bajo **tu** portfolio, no el del cliente, y es lo que
  genera el problema de fondo (consumís tu propio cupo de 2).
- No crees Business Managers "de mentira" bajo tu propia identidad para
  simular clientes distintos — es evasión de un control anti-abuso de Meta
  y arriesga la suspensión de todo tu ecosistema (App + WABAs).
- No actives esto sin avisarle antes al cliente que pierde el número en la
  app del celular (no hay coexistencia en este flujo manual).

## Cuándo esto deja de alcanzar

- Si tenés muchos clientes que se niegan a crear una cuenta de Facebook:
  la única salida es verificar **tu propio** negocio (sube tu cupo de 2 a
  20) para poder alojarlos directamente bajo tu portfolio.
- Si querés dejar de hacer este proceso a mano por cada cliente: el paso
  siguiente es implementar **Embedded Signup** (requiere Advanced Access a
  `whatsapp_business_management` vía App Review + verificación de negocio) —
  automatiza las Fases 1 a 5 en un popup dentro de tu propio frontend.
