# Onboarding de cliente a WhatsApp Cloud API

Objetivo: el WABA del cliente queda en **su propio** Business Manager (no en
el tuyo) → no gasta tu cupo de 2 números.

Regla de oro: **Fase 3 se hace solo desde Business Manager. Nunca desde
"Casos de Uso" de tu App** — mezclar los dos rompe el número.

---

## Antes de arrancar (avisale al cliente)

- [ ] Va a necesitar una cuenta de Facebook (no la va a usar de red social, solo de login)
- [ ] Pierde el número en la app de WhatsApp Business del celular (no hay coexistencia)
- [ ] Si le importa el historial: que lo exporte antes (WhatsApp → Ajustes → Chats → Historial → Exportar chat)

---

## 🧑 CLIENTE — Fase 1: crear su cuenta

1. Crear cuenta de Facebook (si no tiene) — facebook.com
2. Ir a business.facebook.com → **Crear cuenta** → crear su Business Portfolio
3. Copiar su **Business Portfolio ID**: Configuración del negocio → Información de la empresa
4. Pasarte ese ID a vos

## 🧑 CLIENTE — Fase 2: liberar el número

1. Abrir WhatsApp Business App en el celular
2. Ajustes → Cuenta → **Eliminar cuenta**
3. Esperar unos minutos (Meta tarda en liberar el número)

## 🧑 CLIENTE — Fase 3: registrar el WABA en SU Business Manager

1. business.facebook.com, con **su** Portfolio seleccionado (arriba a la izquierda)
2. Configuración del negocio → Cuentas → **Cuentas de WhatsApp** → Agregar
3. Completar nombre, categoría, descripción del negocio
4. Ingresar el número liberado → verificar por SMS/llamada
5. Confirmar que el WABA quedó **verificado**

## 🧑 CLIENTE — Fase 4: compartirte el WABA

1. Pedirte tu Business Portfolio ID
2. Ir al WABA recién creado → **Compartir** → **Compartir con un socio**
3. Pegar TU Business Portfolio ID → permisos de administración completa

---

## 👨‍💻 VOS — Fase 5: conectar el WABA a tu App

1. Aceptar el WABA compartido en tu Business Manager
2. developers.facebook.com → tu App → WhatsApp → **API Setup**
3. Seleccionar el WABA del cliente entre las cuentas disponibles
4. Confirmar que aparece su `phone_number_id`
5. Generar token permanente:
   - Configuración del negocio → Usuarios → **Usuarios del sistema** → tu System User (Admin)
   - Añadir activos → asignarle el WABA del cliente → rol completo
   - Generar token → marcar `whatsapp_business_messaging` + `whatsapp_business_management` → sin expiración
6. Guardar el token

## 👨‍💻 VOS — Fase 6: alta en AIbot

1. `/settings/credentials` → Agregar credencial → kind `whatsapp` → pegar token → activar
2. `/businesses/new` → cargar `phoneNumberId` del cliente, vincular la credential, completar prompt/info
3. Confirmar `isActive: true`

## 👨‍💻 VOS — Fase 7: confirmar webhook

1. developers.facebook.com → tu App → WhatsApp → Configuración → Webhook (URL + verify token ya están, son a nivel App)
2. Confirmar que el WABA del cliente está suscripto al campo `messages`

## 🧑‍🤝‍🧑 AMBOS — Fase 8: prueba real

1. Mandar un WhatsApp al número del cliente desde otro celular
2. Confirmar que aparece en `/conversations` en tiempo real
3. Responder y confirmar que llega
4. Chequear `/settings/events` por si hay errores

---

## No hacer

- ❌ Dar de alta números de clientes desde "Casos de Uso" de tu App (crea el WABA en TU portfolio)
- ❌ Crear Business Managers falsos bajo tu identidad para simular clientes distintos (riesgo de suspensión)
- ❌ Migrar el número sin avisarle antes al cliente que pierde la app del celular

## Si esto no alcanza

- Cliente se niega a tener Facebook → verificá tu propio negocio (cupo 2→20) y alojalo bajo tu portfolio
- Muchos clientes, no querés hacerlo a mano → siguiente paso: Embedded Signup (requiere App Review + verificación de negocio), automatiza las Fases 1-4
