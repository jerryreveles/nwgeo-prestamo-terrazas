# nwgeo Muestreo — copia de PRÉSTAMO (Minera Terrazas / Río Tinto)

**Esta es una copia temporal de préstamo** de la herramienta "nwgeo Muestreo" de
**Wulfenita LLC / Níwami Resources**, entregada a Minera Terrazas, S.A. de C.V. (Río Tinto)
para usarse durante el periodo de evaluación acordado. No es un producto de venta libre:
al vencer el periodo de préstamo hay que contactar a Wulfenita LLC / Níwami Resources para
recontratar el servicio.

PWA (app web instalable) autocontenida, sin servidor ni internet, para iPhone. Sirve para
marcar puntos directo sobre el plano del nivel (o sobre un plano de superficie) y sacar su
coordenada UTM al instante, en campo, sin señal.

Captura cinco capas de mapeo, elegibles con los chips de color arriba del plano:

- **Muestreo geoquímico** (dorado) — canal, esquirlas, grab, rezaga; longitud de canal
- **Alteración** (morado) — tipo (propilítica, argílica, sericítica/fílica, potásica,
  silicificación, limonita in situ/halo/exótica) e intensidad
- **Litológico** (azul) — unidad litológica y textura/fábrica de roca
- **Estructural** (rojo) — tipo de estructura (falla, veta, vetilla, contacto, fractura),
  rumbo, echado y bloque del alto/bajo
- **Superficie** (verde) — tipo de afloramiento y descripción general, para mapeo en
  superficie con el mismo plano/calibración

Cada punto guarda su capa; el pin en el plano y la lista de puntos se colorean según la capa.
El CSV y el GeoJSON exportados traen todas las columnas de todas las capas (vacías las que no
aplican a cada punto).

Trae precargados **todos los niveles digitalizados de Congreso-León** (02, 03, 04, 05, 06, 07,
08 y 09) más un plano de **Superficie** con el ortomosaico del dron, todos ya calibrados
pixel↔UTM (no hace falta marcar puntos de control en ninguno). También acepta cualquier otra
foto o captura de plano, calibrándola a mano con 2 puntos de control.

## Candado de licencia de esta copia

Esta copia trae **dos candados independientes** (`license.js`), que no existen en la
herramienta de trabajo interna de la casa:

1. **Candado local (offline)**: 30 días desde la primera vez que se abre. Avisa 5 días antes
   de vencer. Al vencer, bloquea la captura y el plano (deja exportar un último CSV/GeoJSON de
   rescate) hasta reactivarla con un código `NW-AAAAMMDD-XXXXXXXXXX` que solo genera Wulfenita
   LLC / Níwami Resources. El reloj del teléfono no sirve para hacer trampa: la app recuerda la
   última fecha vista y nunca retrocede.
2. **Candado remoto (en línea)**: revisa el archivo `licencia.json` de este mismo repo cada
   vez que hay conexión (al abrir, al reconectar, al volver a la app y cada 5 minutos). Si
   Wulfenita LLC / Níwami Resources edita ese archivo y lo sube (`bloqueado: true`, o una
   `expiry` ya vencida), la exportación se bloquea remotamente sin tocar el teléfono del
   cliente ni reinstalar nada.

Este repo es público (requisito de GitHub Pages gratis) pero no depende de ninguna cuenta ni
de claude.ai: es una página web independiente, instalable igual que cualquier otra PWA.

## Qué es cada archivo

- `index.html` — la app (toda la interfaz)
- `app.js` — toda la lógica (cálculo de coordenadas, guardado, exportación)
- `license.js` — candado de licencia de esta copia de préstamo (ver arriba)
- `licencia.json` — estado del candado remoto; lo edita Wulfenita LLC / Níwami Resources
- `manifest.json`, `sw.js` — lo que la hace instalable y funcionar sin internet
- `icon-192.png`, `icon-512.png` — ícono de la app
- `assets/` — planos y calibración de todos los niveles precargados

## Cómo instalarla en el iPhone

1. Abre la liga del sitio (GitHub Pages) en **Safari** del iPhone — no en Chrome ni otro
   navegador, tiene que ser Safari para que se pueda instalar.
2. Botón de compartir (cuadrito con flecha hacia arriba, abajo de la pantalla).
3. "Agregar a pantalla de inicio" → Agregar.
4. Ábrela desde el ícono nuevo: ya queda instalada y funciona sin internet (el service worker
   guarda todo en el teléfono la primera vez que abre con señal).

## Cómo se usa en campo

1. Pestaña **Proyecto** → elige el nivel o tramo que vas a muestrear. Si es otro plano:
   "Cargar plano" con una foto o captura, y calibrar 2 puntos de la grilla con su coordenada
   UTM conocida.
2. Pestaña **Plano**: elige primero el chip de color de la capa que vas a mapear. Luego toca
   el punto exacto → se abre la ficha con la coordenada UTM ya calculada. Llena clave y datos.
   Guardar.
3. Pestaña **Puntos**: lista completa; tocar una fila la abre para editar o borrar.
4. Botón **Exportar CSV + GeoJSON** cuando termines la jornada: usa el botón de compartir de
   iOS para mandarlo por AirDrop, correo o guardarlo en Archivos.

## Lista de verificación antes de salir a campo

- [ ] Batería del iPhone cargada
- [ ] App abierta una vez con señal (para que el service worker guarde todo offline)
- [ ] Tramo del nivel correcto seleccionado en Proyecto
- [ ] Espacio libre en el teléfono para fotos/exportaciones

## Material necesario

- iPhone con Safari (iOS 16 o más reciente recomendado)
- Libreta de campo como respaldo físico de la clave de cada muestra

## Límites conocidos (es PWA, no app nativa de App Store)

- No lee GPS ni RTK por Bluetooth: Safari iOS no tiene Web Bluetooth. La coordenada sale de
  la posición tocada sobre el plano calibrado, no de un receptor.
- Un plano cargado = un tramo.
- No corre en segundo plano. Si se usa otra app mucho rato, reabrir desde el ícono.

---
© Wulfenita LLC / Níwami Resources. Copia de préstamo temporal — uso exclusivo de Minera
Terrazas, S.A. de C.V. durante el periodo acordado.
