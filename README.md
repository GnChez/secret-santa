# Amigo invisible familiar

Web sencilla para sortear un amigo invisible en familia, evitando que salgan parejas del mismo hogar.

## Ejecutar en local

```bash
npm install
npm run dev
```

Abre la URL que aparece en la terminal (normalmente `http://localhost:5173`).

## Cómo usarlo (organizador)

1. Crea familias y añade a cada persona (solo nombre y familia).
2. Copia el **enlace de lista de deseos** de cada uno y envíalo por WhatsApp.
3. Cuando te devuelvan el enlace con la lista escrita, pulsa **Importar lista desde enlace**.
4. Cuando quieras, pulsa **Sortear nombres**.
5. Copia el **enlace de revelación** de cada persona y envíaselo solo a ella.

## Cómo usarlo (participante)

1. Abre el enlace que te mandó el organizador.
2. Escribe tu lista de deseos y pulsa **Guardar lista**.
3. Copia el enlace nuevo y envíaselo de vuelta al organizador.

## Publicar en internet

```bash
npm run build
```

Sube la carpeta `dist` a GitHub Pages, Netlify, Vercel, etc.
