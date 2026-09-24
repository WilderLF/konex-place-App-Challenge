# konex/place

Un lienzo colaborativo de 100 × 100 píxeles para pintar entre todos en Nerdearla 2026.
Cada persona pinta un píxel cada 15 segundos, en tiempo real, desde el celular.

Hecho para el App Challenge de Webflow Cloud en Nerdearla 2026.

## Qué tiene

- Lienzo en `<canvas>` con zoom (pellizco, rueda o botones) y arrastre para moverse.
- Actualización en vivo de los píxeles de todos, con un destello en cada píxel nuevo.
- Cooldown de 15 s aplicado en el servidor con una reserva atómica en SQLite.
- Info de cada píxel: quién lo pintó, cuándo y cuántas veces cambió.
- Feed en vivo, ranking de quienes más pintaron y contador de personas activas.
- Timelapse que reproduce todo el historial del lienzo desde el primer píxel.
- Modo proyector (`/?tv`) con QR para sumarse y timelapse automático cada 4 minutos.
- Descarga del lienzo como PNG en alta resolución.
- Teclado: flechas para moverse, Enter para pintar, +/− para zoom.

## Stack

- Next.js 16 (App Router) sobre Cloudflare Workers, desplegado en Webflow Cloud.
- SQLite (D1) de Webflow Cloud con tres tablas: `pixels` (estado actual),
  `events` (historial append-only que alimenta el feed y el timelapse) y `users`.
- Migraciones en `migrations/`, que Webflow Cloud aplica en cada deploy.

## Correr localmente

```bash
npm install
npm run db:setup
npx opennextjs-cloudflare build && npx wrangler dev
```

## API

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/api/board` | Lienzo completo (1 carácter hex por píxel) y cooldown propio |
| GET | `/api/updates?after=ID` | Píxeles nuevos desde un id y personas activas |
| POST | `/api/paint` | Pinta `{ x, y, c, name }` respetando el cooldown |
| GET | `/api/pixel?i=IDX` | Quién pintó un píxel y cuántas veces cambió |
| GET | `/api/stats` | Totales y ranking |
| GET | `/api/history?after=ID` | Historial compacto paginado para el timelapse |
