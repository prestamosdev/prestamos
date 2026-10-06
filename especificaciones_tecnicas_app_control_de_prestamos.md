# Documento de Especificaciones Técnicas (PRD & Tech Specs)
**Proyecto:** Aplicación Móvil Multi-tenant para Control de Préstamos
**Destinatario:** Equipo de Desarrollo / Agente Antigravity
**Fecha de actualización:** 5 de Octubre, 2026

---

## 1. Visión General del Proyecto
Desarrollo de una aplicación móvil orientada a prestamistas independientes para llevar el control, trazabilidad y gestión de préstamos de dinero y abonos. El sistema debe operar bajo un modelo "Multi-tenant", permitiendo que múltiples prestamistas utilicen la aplicación de manera independiente, con aislamiento estricto de datos. Además, la aplicación debe tener la capacidad de operar y generar reportes PDF de manera offline (en el dispositivo).

## 2. Arquitectura del Sistema
*   **Modelo de Datos:** Multi-tenant a nivel de base de datos utilizando *Row-Level Security* (RLS). Cada registro (cliente, préstamo, pago) estará vinculado al ID del prestamista autenticado.
*   **Enfoque de Red:** *Offline-First*. La aplicación debe mantener una base de datos local sincronizada con la nube. Esto permite la operación fluida en zonas sin cobertura y la generación de reportes locales.
*   **Procesamiento:** La carga computacional pesada (como la generación de documentos PDF y cálculos de amortización) recaerá sobre el dispositivo móvil del cliente (Client-side).

## 3. Requerimientos Funcionales (Core Features)

### 3.1. Autenticación y Multi-Tenancy
*   Registro e inicio de sesión de Prestamistas (Email/Contraseña o SSO).
*   Aislamiento absoluto: Un prestamista no puede consultar, modificar ni visualizar datos de clientes, préstamos o pagos de otro prestamista.

### 3.2. Gestión de Clientes (Prestatarios)
*   CRUD de clientes (Nombre, Teléfono, Documento de Identidad, Dirección).
*   Panel individual por cliente que consolide: Total prestado, saldo pendiente actual, historial de puntualidad y préstamos activos/inactivos.

### 3.3. Gestión y Trazabilidad de Préstamos
*   Creación de contratos de préstamo: Monto, tasa de interés, modalidad de pago (diario, semanal, quincenal, mensual), fecha de inicio.
*   Trazabilidad completa: Estado del préstamo (Activo, Al día, En mora, Finalizado).
*   Desglose de cuotas: Cálculo automático de amortización a capital e intereses.

### 3.4. Registro de Pagos (Abonos)
*   Registro de transacciones con marca de tiempo (timestamp).
*   Recálculo automático del saldo pendiente tras cada abono.
*   Capacidad de revertir o editar un abono en caso de error (dejando un log de auditoría interno).

### 3.5. Módulo de Reportes y Generación PDF (Local)
*   **Filtros de Búsqueda:** Generación de reportes filtrables por Persona (Cliente) y por Fecha (Año, Mes, Día, o rango de fechas).
*   **Generación Offline:** El motor de renderizado PDF debe estar incrustado en la aplicación móvil. El documento se arma con los datos de la base local (SQLite/NoSQL del móvil) sin necesidad de hacer peticiones a un servidor (AWS/GCP/etc).
*   **Tipos de Reportes:**
    *   *Recibo de pago individual* (Para enviar por WhatsApp en el momento del cobro).
    *   *Estado de cuenta por cliente* (Historial de abonos y saldo restante).
    *   *Cierre de caja del prestamista* (Filtro por día/mes de todo lo recaudado).
*   **Compartir:** Integración con la API nativa de "Compartir" del SO (Android/iOS) para enviar el PDF generado vía WhatsApp, Email, etc.

## 4. Requerimientos No Funcionales

*   **Seguridad:** Toda regla de lectura/escritura debe ser validada en el backend mediante RLS verificando el `auth.uid()` contra el `lender_id`.
*   **Rendimiento:** La generación del PDF en el teléfono debe tomar menos de 2 segundos.
*   **Disponibilidad:** Si el dispositivo pierde conexión a Internet, la app debe permitir registrar abonos y generar recibos PDF locales, encolando las transacciones para sincronizarse con la nube cuando retorne la conexión.

## 5. Modelo de Datos Relacional Base

Todas las tablas requieren RLS habilitado. El campo `lender_id` es obligatorio y funciona como la clave de partición lógica.

*   **Lenders**
    *   `id` (UUID, PK)
    *   `email` (String)
    *   `created_at` (Timestamp)
*   **Clients**
    *   `id` (UUID, PK)
    *   `lender_id` (UUID, FK -> Lenders.id, Indexado)
    *   `name`, `document_id`, `phone`
*   **Loans**
    *   `id` (UUID, PK)
    *   `lender_id` (UUID, FK -> Lenders.id, Indexado)
    *   `client_id` (UUID, FK -> Clients.id)
    *   `amount`, `interest_rate`, `frequency`, `status`, `start_date`
*   **Payments**
    *   `id` (UUID, PK)
    *   `lender_id` (UUID, FK -> Lenders.id, Indexado)
    *   `loan_id` (UUID, FK -> Loans.id)
    *   `amount_paid`, `capital_portion`, `interest_portion`, `remaining_balance`
    *   `payment_date` (Timestamp)

## 6. Stack Tecnológico Recomendado para Antigravity

Dado el enfoque *Offline-first* y la generación de *PDF Local*, se sugiere el siguiente stack:

*   **Frontend Móvil:** **Flutter** o **React Native**.
*   **Base de Datos Local (Sincronización):** 
    *   Si es React Native: `WatermelonDB` (optimizado para offline y millones de registros).
    *   Si es Flutter: `Isar Database` o `Drift`.
*   **Backend / DB en la Nube:** **Supabase** (PostgreSQL). Provee autenticación y RLS nativo de forma inmediata, siendo perfecto para el multi-tenancy.
*   **Generación de PDF (Librerías locales):**
    *   Si es Flutter: Paquete `pdf` y `printing`.
    *   Si es React Native: Paquete `react-native-html-to-pdf` o librerías Canvas-to-PDF, evitando dependencias externas.