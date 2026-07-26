# Cómo crear la página del mapa en Oracle APEX

Los mapas se dibujan con **JavaScript** dentro de una página normal de APEX. No necesitas
instalar plugins de pago ni subir archivos: solo pegar el código que está en la carpeta
[`js/`](js/).

Sigue estos pasos (son los mismos para los 3 mapas, solo cambia el archivo `.js`):

## 1. Crea una página en blanco
En el **App Builder** → tu aplicación → **Create Page** → **Blank Page**.
Ponle un nombre (por ejemplo *"Mapa"*).

## 2. Agrega una región vacía donde vivirá el mapa
- Dentro de la página, crea una **Región** de tipo *Static Content*.
- En **Advanced → Static ID**, escribe el identificador que espera el código:
  - Mapa de portafolio → `mapaHost`
  - Monitoreo en vivo → `monHost`
- Deja el contenido de la región **vacío** (el JavaScript lo llena solo).

## 3. Pega el JavaScript de la página
- Selecciona la **página** (el nodo de más arriba en el árbol, con el número de página).
- En el panel de la derecha, busca **JavaScript → Function and Global Variable Declaration**.
- Pega **todo** el contenido del archivo correspondiente:
  - [`js/mapa-portafolio.js`](js/mapa-portafolio.js)
  - [`js/monitoreo.js`](js/monitoreo.js)

## 4. Crea el "proceso AJAX" que habla con la base de datos
El mapa le pide datos a la base de datos a través de un proceso. Créalo así:
- En el árbol de la página, sección **Processing** → clic derecho en **Ajax Callback** → **Create Process**.
- **Name:** escribe exactamente `AJAX` (en mayúsculas).
- **Type:** *Execute Code (PL/SQL)*.
- **PL/SQL Code:** según el mapa:
  - Mapa de portafolio → `MAP001.AJAX;`
  - Monitoreo en vivo → `MON000.AJAX;`

## 5. (Solo monitoreo) permitir la ubicación
El navegador pedirá permiso de ubicación cuando el usuario pulse **"Compartir mi ubicación"**.
Debe aceptarlo. La página funciona por **HTTPS** (APEX en la nube ya lo es).

## 6. Guarda y ejecuta (▶ Run)
¡Listo! Deberías ver el mapa. Si aparece en blanco, revisa que:
- El **Static ID** de la región sea exactamente el indicado.
- El proceso Ajax se llame **AJAX** y apunte al paquete correcto.
- Tu conexión permita cargar `unpkg.com` y `tile.openstreetmap.org` (son gratuitos y públicos).

---

### ¿Y la geocerca (control de asistencia)?
La geocerca usa las mismas ideas pero tiene su propio conjunto de páginas más grande.
Su código de base de datos está en [`../sql/20_geocerca_tablas.sql`](../sql/20_geocerca_tablas.sql)
y [`../sql/21_geocerca_paquetes.sql`](../sql/21_geocerca_paquetes.sql). Si te interesa esa parte,
escríbeme y te paso el detalle de las páginas.

---

## Croquis y áreas (página propia)

1. **Blank Page** con una región **Static Content** vacía, Static ID = `areaHost`.
2. Dos regiones **Inline Dialog** (Modal) vacías, cada una con una sub-región Static Content:
   - Diálogo `dlgForm` → host `formHost` (datos del área)
   - Diálogo `dlgImport` → host `impHost` (importar GeoJSON)
3. Pega [`js/areas.js`](js/areas.js) en **Function and Global Variable Declaration** de la página.
4. Proceso **AJAX** (Execute Code / PL-SQL): `AREA000.AJAX;`

Usa **leaflet-geoman** (dibujo) y **turf.js** (medidas y punto-en-área), ambos por CDN gratuito.

## Rutas y navegación (página propia)

1. **Blank Page** con una región **Static Content** vacía, Static ID = `rutHost`.
2. Tres regiones **Inline Dialog** (Modal) vacías, cada una con su sub-región host:
   - `dlgPort` → `portHost` (elegir paradas del portafolio)
   - `dlgReal` → `realHost` (pegar el recorrido real a comparar)
   - `dlgGuard` → `guardHost` (guardar la ruta)
3. Pega [`js/rutas.js`](js/rutas.js) en **Function and Global Variable Declaration**.
4. Proceso **AJAX** (Execute Code / PL-SQL): `RUT000.AJAX;`

El cálculo por calle usa el servicio público **OSRM** (fetch a `router.project-osrm.org`).
No requiere clave; si no responde, la ruta cae a línea recta.
