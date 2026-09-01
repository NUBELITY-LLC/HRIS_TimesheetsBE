# HRIS_TimesheetsBE

Backend del modulo de Timesheets con workflow de aprobaciones multiples.

## Stack

| Area         | Tecnologia                              |
| ------------ | --------------------------------------- |
| Runtime      | Node.js >= 20 (ESM)                     |
| Lenguaje     | TypeScript (strict, `module: NodeNext`) |
| Framework    | Express 5                               |
| Datos / Auth | Supabase (`@supabase/supabase-js`)      |
| Validacion   | Zod                                     |
| Logging      | Pino + pino-http                        |

## Instalacion

```bash
npm install
cp .env.example .env
npm run dev
```

El servidor queda en `http://localhost:3000` y la API bajo `/api/v1`.

## Scripts

| Script              | Descripcion                              |
| ------------------- | ---------------------------------------- |
| `npm run dev`       | Servidor en watch mode con `tsx`         |
| `npm run build`     | Compila TypeScript a `dist/`             |
| `npm start`         | Ejecuta el build (`node dist/server.js`) |
| `npm run typecheck` | `tsc --noEmit`                           |
| `npm run lint`      | ESLint (`lint:fix` para autocorregir)    |
| `npm run format`    | Prettier (`format:check` solo verifica)  |
| `npm test`          | Vitest (`test:watch` en modo watch)      |

## Convenciones de la API

Respuesta exitosa:

```json
{ "data": { "...": "..." } }
```

Listados paginados:

```json
{ "data": [], "pagination": { "page": 1, "pageSize": 20, "total": 0, "totalPages": 0 } }
```

Error:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Recurso no encontrado",
    "requestId": "8f1c...",
    "details": []
  }
}
```

Toda respuesta incluye la cabecera `x-request-id`, util para rastrear una peticion en los logs.

## Endpoints actuales

| Metodo | Ruta            | Descripcion                                    |
| ------ | --------------- | ---------------------------------------------- |
| GET    | `/health`       | Liveness. No toca dependencias externas.       |
| GET    | `/health/live`  | Alias de liveness.                             |
| GET    | `/health/ready` | Readiness: verifica conectividad con Supabase. |

Tambien montados bajo `/api/v1/health` para consumo desde la app.

## Autenticacion

La plataforma **no usa Supabase Auth**: las credenciales viven en `public."USERS"`
(`password_hash`, `failed_attempts`, `locked_until`), asi que este backend valida las
credenciales y emite su propio JWT. Supabase se usa unicamente como base de datos, con la
service role key, y la autorizacion la resuelve la API — no RLS.

### Endpoints

| Metodo | Ruta                           | Auth       | Descripcion                                       |
| ------ | ------------------------------ | ---------- | ------------------------------------------------- |
| POST   | `/api/v1/auth/login`           | No         | Valida credenciales y emite el JWT de sesion.     |
| GET    | `/api/v1/auth/me`              | Bearer     | Perfil del usuario autenticado.                   |
| POST   | `/api/v1/auth/change-password` | Bearer     | Cambia la propia contrasena y renueva el token.   |
| GET    | `/api/v1/users`                | ADMIN o PM | Lista usuarios con paginacion, busqueda y filtros.|
| POST   | `/api/v1/users`                | ADMIN o PM | Crea un usuario.                                  |
| GET    | `/api/v1/users/:id`            | ADMIN o PM | Detalle de un usuario.                            |
| PATCH  | `/api/v1/users/:id`            | ADMIN o PM | Actualiza un usuario.                             |
| DELETE | `/api/v1/users/:id`            | ADMIN o PM | Baja logica (`is_active = false`).                |
| PATCH  | `/api/v1/users/me`             | Bearer     | El usuario cambia su propio nombre.               |


### Login

`POST /api/v1/auth/login` — `username` acepta indistintamente `USERS.user_name` o
`USERS.email`, sin distinguir mayusculas.

```json
{ "username": "usuario", "password": "Contraseña" }
```

**200** — acceso concedido y sesion JWT generada:

```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": 28800,
    "expiresAt": "2026-08-28T23:00:00.000Z",
    "user": {
      "id": 42,
      "fullName": "Usuario Nubelity",
      "userName": "usuarioN",
      "email": "usuarioN@nubelity.com",
      "jobTitle": "Consultant",
      "lastLoginAt": null,
      "mustChangePassword": true,
      "role": { "id": 1, "code": "CONSULTANT", "name": "Consultant" }
    }
  }
}
```

Las peticiones posteriores se autentican con `Authorization: Bearer <accessToken>`.