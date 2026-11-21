# Amigo invisible familiar

Web para sortear un amigo invisible en familia, evitando que salgan parejas del mismo hogar.
Funciona con un pequeño servidor en Cloudflare (Worker + base de datos D1), gratis para este uso.

## Cómo usarlo

**Organizador**

1. Crea el evento, las familias y añade a cada persona.
2. Pulsa **Compartir** junto a cada persona para enviarle su **enlace personal**. Solo una vez.
3. Ve en el panel quién ha escrito ya su lista (se actualiza sola, no hay que importar nada).
4. Pulsa **Sortear nombres**. El sorteo lo hace el servidor: tú tampoco ves quién regala a quién.
5. Para gestionar el evento desde otro móvil u ordenador, usa **Abrir en otro dispositivo** (copia tu enlace de organizador; no lo compartas).

**Participante**

1. Abre tu enlace personal.
2. Escribe tu lista de deseos, añade fotos o enlaces de productos. Se guarda en el servidor.
3. Cuando se haga el sorteo, en ese mismo enlace verás a quién le regalas y su lista, siempre al día.

Si tenías un evento de la versión anterior guardado en el navegador, la página de inicio ofrece
**Pasar al servidor** (se conserva el sorteo). Los enlaces antiguos de revelación siguen abriéndose.

## Desarrollo en local

```bash
npm install
npm run dev:api   # API + base de datos local en http://localhost:8787
npm run dev       # web con recarga en caliente (otra terminal), usa la API anterior
```

O todo junto, como en producción: `npm run preview`.

## Publicar

Cada push a `main` despliega automáticamente con GitHub Actions
(`.github/workflows/deploy-cloudflare.yml`): compila la web, crea la base de datos D1 si no existe,
aplica las migraciones de `migrations/` y publica el Worker.

Configuración necesaria una sola vez (en GitHub → Settings → Secrets and variables → Actions):

- `CLOUDFLARE_API_TOKEN`: token con la plantilla «Edit Cloudflare Workers» + permiso «Account · D1 · Edit».
- `CLOUDFLARE_ACCOUNT_ID`: el Account ID de tu cuenta de Cloudflare.

La web queda en `https://amigo-invisible.<tu-subdominio>.workers.dev`.

## Estructura

- `src/`: la web (Vite, JavaScript sin framework).
- `worker/index.js`: la API.
- `migrations/`: esquema de la base de datos D1.
- `src/algorithm.js`: el sorteo (lo usa el servidor).
