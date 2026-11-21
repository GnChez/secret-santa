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
2. Pulsa **Compartir** junto a cada persona para enviarle su enlace de lista de deseos (abre el menú de compartir del móvil o WhatsApp directamente). También puedes **Copiar**.
3. Cuando te devuelvan el enlace con la lista, ábrelo en este mismo dispositivo y pulsa **Importar esta lista a mi evento**. O usa **Importar lista desde enlace** (acepta el mensaje entero de WhatsApp y tiene botón de pegar).
4. Cuando quieras, pulsa **Sortear nombres**.
5. Pulsa **Compartir** en el **enlace de revelación** de cada persona y envíaselo solo a ella.

## Cómo usarlo (participante)

1. Abre el enlace que te mandó el organizador.
2. Escribe tu lista de deseos. Opcionalmente añade hasta 4 **fotos** (se reducen para caber en el enlace) o **enlaces** de imágenes/productos. Pulsa **Guardar lista**.
3. Pulsa **Enviar al organizador**.

> No hay servidor: todo viaja dentro del enlace. Por eso las fotos se guardan como miniaturas (unos 2–5 KB cada una).

## Publicar en internet

```bash
npm run build
```

Sube la carpeta `dist` a GitHub Pages, Netlify, Vercel, etc.
