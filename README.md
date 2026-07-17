# Finanzas personales

Aplicación web estática para registrar gastos por periodo de tarjeta de crédito.

## Funcionalidades

- Periodos automáticos del día 14 al día 13 del mes siguiente.
- Historial progresivo: inicia con el periodo actual y agrega uno nuevo cada día 14.
- Navegación entre los periodos disponibles.
- Resumen del gasto por categoría para el periodo seleccionado.
- Indicadores por categoría con monto, porcentaje y participación visual.
- Presupuestos por categoría, con disponible y alertas de excedente.
- Alta, edición y eliminación de gastos.
- Clasificación de movimientos por categoría y tipo.
- Asignación automática del periodo según la fecha del gasto.
- Persistencia local mediante `localStorage`.
- Compatibilidad con los datos guardados por la primera versión.

## Ejecutar

Abre `index.html` en el navegador o usa una extensión como Live Server.

## Publicar

GitHub Pages puede desplegar directamente la rama `main` desde la carpeta raíz.
