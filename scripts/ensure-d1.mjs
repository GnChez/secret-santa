// Crea la base de datos D1 si no existe y escribe su id en wrangler.jsonc.
// Lo usa el despliegue de GitHub Actions; así no hay que crear nada a mano.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const NAME = 'amigo-invisible';
const wrangler = (...args) =>
  execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

let db = JSON.parse(wrangler('d1', 'list', '--json')).find((d) => d.name === NAME);
if (!db) {
  console.log(`Creando base de datos D1 «${NAME}»…`);
  wrangler('d1', 'create', NAME, '--location', 'weur', '--update-config=false');
  db = JSON.parse(wrangler('d1', 'list', '--json')).find((d) => d.name === NAME);
}
const dbId = db?.uuid || db?.id;
if (!dbId) throw new Error('No se pudo obtener el id de la base de datos D1');

const config = readFileSync('wrangler.jsonc', 'utf8').replace(
  /"database_id":\s*"[^"]*"/,
  `"database_id": "${dbId}"`,
);
writeFileSync('wrangler.jsonc', config);
console.log(`Base de datos D1: ${dbId}`);
