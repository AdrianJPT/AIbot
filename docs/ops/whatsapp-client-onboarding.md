# Onboarding de cliente a WhatsApp Cloud API (Modelo B)

Modelo B: el WABA de cada cliente vive en **TU** Business Portfolio, con **TU**
tarjeta y **TU** App. El cliente nunca toca Meta ni ve el billing. Un WABA por
cliente; un WABA puede tener varios números del mismo negocio.

Regla de oro: los números se agregan SIEMPRE desde **WhatsApp Manager**
(business.facebook.com/wa/manage). **Nunca desde "Casos de Uso" de la App** —
ese wizard es solo para el primer número; mezclar flujos rompe el número.

## Límites que te afectan

| Estado de tu negocio en Meta | Números totales en tu portfolio |
|---|---|
| Sin verificar | 2 |
| Verificado (Centro de seguridad → Verificación) | 20 |

- La calidad y los límites de mensajería se comparten a nivel portfolio: un
  cliente con mala calidad afecta a todos. Monitoreá la calidad por número en
  WhatsApp Manager; si un cliente arruina la calidad, pausalo (`isActive`
  off en AIbot) mientras lo resolvés.

---

## Una sola vez (ya lo tenés casi todo)

- [ ] Business Portfolio propio (tenés: "Altoqueai")
- [ ] App de Meta con producto WhatsApp (tenés: "Altoque-test")
- [ ] System User admin + token permanente con `whatsapp_business_messaging`
      y `whatsapp_business_management` (tenés: "Altoque AI portal")
- [ ] Verificación del negocio completada (pendiente — banner en tu BM;
      sin esto quedás limitado a 2 números)
- [ ] App en modo Live con URL de política de privacidad
- [ ] Webhook configurado a nivel App (URL + `WEBHOOK_VERIFY_TOKEN`)

---

## 🧑 CLIENTE — lo único que hace (5 minutos)

1. Si le importa el historial: exportarlo antes (WhatsApp → Ajustes → Chats →
   Exportar chat)
2. Liberar el número: WhatsApp Business App → Ajustes → Cuenta →
   **Eliminar cuenta**. Esperar unos minutos.
3. Quedarse al lado del teléfono: le va a llegar un **código por SMS/llamada**
   que te tiene que pasar en el momento.

Avisale antes: pierde la app de WhatsApp Business del celular (no hay
coexistencia); el número pasa a responder solo por tu plataforma.

## 👨‍💻 VOS — por cada cliente nuevo

### 1. Crear el WABA del cliente

1. business.facebook.com/wa/manage con TU portfolio seleccionado
2. **Agregar cuenta de WhatsApp Business** → nombre del negocio del cliente,
   categoría, zona horaria
3. Un WABA por cliente — no mezcles números de clientes distintos en un WABA

### 2. Agregar y verificar el número

1. Dentro del WABA nuevo → **Agregar número de teléfono**
2. **Nombre para mostrar**: el nombre comercial del cliente (Meta lo revisa,
   24–48 h; debe coincidir razonablemente con el negocio)
3. Ingresar el número liberado → elegir SMS o llamada → el código llega al
   teléfono DEL CLIENTE → que te lo dicte → confirmar

### 3. Cargar TU método de pago al WABA

1. Configuración del negocio → Cuentas → **Cuentas de WhatsApp** → [WABA del
   cliente] → **Configuración de pago**
2. Cargar TU tarjeta. El billing de Meta te llega a vos; el cliente no ve nada.
3. Facturale vos al cliente por tu lado (tarifa plana o consumo + margen).

### 4. Darle acceso a tu System User

1. Configuración del negocio → Usuarios → **Usuarios del sistema** →
   "Altoque AI portal" → **Añadir activos**
2. Asignar el WABA nuevo con control total
3. **No hace falta regenerar el token**: el token existente cubre todos los
   WABAs asignados al System User. El número se elige por llamada con el
   `phone_number_id`.

### 5. Suscribir tu App al WABA

1. developers.facebook.com → tu App → WhatsApp → **API Setup**
2. Seleccionar el WABA del cliente → confirmar que está suscripto al campo
   `messages` del webhook
3. Copiar el **`phone_number_id`** del número nuevo

### 6. Alta en AIbot

1. Si usás el mismo token para todo (Modelo B estándar): reutilizá la
   credencial WhatsApp existente en `/settings/credentials`
2. `/businesses/new` → `phoneNumberId` del paso 5, vincular la credencial,
   prompt e info del negocio → `isActive: true`

### 7. Prueba real

1. Mandar un WhatsApp al número desde otro celular
2. Ver que aparece en `/conversations` en tiempo real y que el bot responde
3. Revisar `/settings/events` por errores

---

## No hacer

- ❌ Agregar números desde "Casos de Uso" de la App (solo sirve para el primero)
- ❌ Crear Business Managers falsos para saltar el límite de números (riesgo
  de suspensión de TODO tu ecosistema)
- ❌ Pedirle al cliente que cree su propio Business Manager (eso es el Modelo
  A — descartado)
- ❌ Migrar el número sin avisarle al cliente que pierde la app del celular

## Cliente con varios números

Mismo WABA del cliente → **Agregar número de teléfono** de nuevo (pasos 2, 5 y
6; el pago y el System User ya quedaron configurados a nivel WABA). Cada
número consume cupo del portfolio y necesita su propio `Business` en AIbot
(un `phoneNumberId` por negocio).

## Cuándo cambiar de modelo

- Muchos clientes y no querés tocar Meta a mano → Embedded Signup (requiere
  App Review + verificación); automatiza el alta desde tu propia UI.
- Un cliente exige ser dueño de su WABA/billing → migrarlo a su propio BM
  (Modelo A) y que te comparta el WABA como socio.
