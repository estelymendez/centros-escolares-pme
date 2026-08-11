# Centros Escolares del PME — Instrumento de consulta

Instrumento web (HTML + CSS + JavaScript, sin backend) para consultar y
visualizar la información oficial de los centros escolares del PME a partir
del listado en Google Sheets.

## Qué hace

- Descarga en vivo el listado oficial desde Google Sheets (exportación CSV
  pública de la hoja) y lo convierte a JSON en el navegador.
- Muestra un listado con buscador y filtros (departamento, municipio, zona,
  sector).
- Muestra el detalle completo de cada centro escolar (todos los campos
  disponibles en la hoja).
- Incorpora un mapa interactivo (Leaflet + OpenStreetMap) con agrupamiento de
  marcadores; al seleccionar un centro en el listado, el mapa se centra en su
  ubicación y muestra su información.
- Incluye un botón **Actualizar** que vuelve a consultar la hoja oficial y
  refresca el listado y el mapa sin recargar la página ni tocar el código.
- Si la fuente no responde en un momento dado, muestra la última copia
  guardada en el navegador (localStorage) para no dejar la pantalla en blanco.

## Archivos

- `index.html` — estructura de la página.
- `styles.css` — estilos.
- `app.js` — lógica: descarga y parseo de datos, filtros, listado, mapa y
  botón de actualización.

Todo el código es estático: no requiere servidor, base de datos ni claves de
API. Por eso se puede publicar directamente como GitHub Pages.

## Requisito de la fuente de datos

El instrumento consulta la hoja mediante su URL pública de exportación CSV:

```
https://docs.google.com/spreadsheets/d/1eGhVmPfOJcP57_LXYZZu4Z4TFWnrir8ow4zgbCSW_D4/export?format=csv&gid=1477083365
```

Para que esto siga funcionando:

1. La hoja de Google Sheets debe mantenerse compartida como **"Cualquier
   persona con el enlace puede ver"** (no requiere ser editor, solo lector).
2. Si en algún momento se reemplaza la hoja por otra (nuevo `SHEET_ID`) o se
   cambia de pestaña (`gid`), basta con actualizar esas dos constantes al
   inicio de `app.js`:

   ```js
   const SHEET_ID = "...";
   const SHEET_GID = "...";
   ```

3. Si se agregan o renombran columnas en la hoja oficial, el instrumento las
   sigue mostrando automáticamente en el panel de detalle (usa el encabezado
   original como etiqueta). Para darles una etiqueta más amigable, o para
   cambiar el orden en que aparecen, edite los objetos `FIELD_LABELS` y
   `DETAIL_ORDER` en `app.js`.

## Publicar en GitHub Pages

1. Cree un repositorio nuevo en su cuenta personal de GitHub (puede ser
   público o privado; para que la página sea accesible por cualquier
   persona con el enlace, el repositorio debe ser **público**, o bien tener
   GitHub Pages habilitado en un plan que permita Pages en repos privados).
2. Suba estos tres archivos (`index.html`, `styles.css`, `app.js`) a la raíz
   del repositorio. Por ejemplo, desde su computadora:

   ```bash
   git init
   git add index.html styles.css app.js README.md
   git commit -m "Instrumento de consulta de centros escolares del PME"
   git branch -M main
   git remote add origin https://github.com/SU_USUARIO/NOMBRE_DEL_REPO.git
   git push -u origin main
   ```

3. En GitHub, vaya a **Settings → Pages** del repositorio.
4. En "Build and deployment", seleccione **Source: Deploy from a branch**,
   escoja la rama `main` y la carpeta `/ (root)`, luego **Save**.
5. Espere uno o dos minutos. GitHub mostrará la URL pública, con este
   formato:

   ```
   https://SU_USUARIO.github.io/NOMBRE_DEL_REPO/
   ```

6. Abra esa URL: debe cargar el listado, el mapa y permitir usar el botón
   **Actualizar**.

No es necesario ningún paso adicional de compilación ni de configuración de
servidor: GitHub Pages sirve los archivos estáticos tal cual.

## Notas técnicas

- Librerías usadas (cargadas desde CDN, sin necesidad de instalar nada):
  [Leaflet](https://leafletjs.com/) para el mapa,
  [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
  para agrupar los más de 3,000 marcadores y mantener el mapa fluido, y
  [PapaParse](https://www.papaparse.com/) para leer el CSV exportado por
  Google Sheets.
- Por rendimiento, el listado visual se limita a los primeros 400 resultados
  que coincidan con la búsqueda/filtros; el mapa sí grafica todos los
  resultados filtrados. Si se necesita ver más de 400 en la lista a la vez,
  se puede ajustar la constante `LIST_RENDER_LIMIT` en `app.js`.
- El botón Actualizar deshabilita momentáneamente su propio clic mientras
  descarga los datos, y muestra el estado ("Consultando la fuente
  oficial…") en la esquina superior derecha.
