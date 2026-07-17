# Finanzas personales

Aplicación estática para capturar y consultar gastos del periodo activo de una tarjeta de crédito.

## Funcionalidades actuales

- Captura de fecha, concepto, tipo y costo.
- Tipos disponibles: Comida, Transporte, Suscripciones, Salud, Compras, Yuki y MSI.
- Cálculo automático del periodo activo usando el día 13 como fecha de corte.
- Validación para evitar fechas fuera del periodo.
- Tabla de gastos del periodo actual.
- Total acumulado del periodo.
- Edición y eliminación de gastos.
- Persistencia local con `localStorage`.
- Diseño responsive.

## Ejecutar localmente

Puedes abrir `index.html` directamente en el navegador o usar un servidor local:

```bash
python3 -m http.server 8080
```

Después visita `http://localhost:8080`.

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub.
2. Sube `index.html`, `styles.css`, `app.js` y `README.md` a la raíz.
3. Ve a **Settings → Pages**.
4. Selecciona **Deploy from a branch**.
5. Elige la rama principal y la carpeta `/root`.

## Persistencia

Los datos se guardan únicamente en el navegador y dispositivo donde se capturan. No se suben al repositorio ni se sincronizan entre dispositivos.
