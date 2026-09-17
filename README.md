# Finanzas personales

Aplicación web estática para registrar gastos por periodo de tarjeta de crédito.

Los registros se guardan en Cloud Firestore y se vinculan con una cuenta de Google,
por lo que pueden consultarse desde distintos navegadores y dispositivos.

## Configuración de Firebase

1. Habilita Cloud Firestore.
2. En **Authentication > Sign-in method**, habilita el proveedor **Google**.
3. Publica `firestore.rules` en la pestaña de reglas de Firestore.
4. En **Authentication > Settings > Authorized domains**, agrega el dominio de la
   aplicación, por ejemplo `fernandaj222.github.io`.

La aplicación no conserva gastos ni colas de sincronización en `localStorage`: Firestore
es la única fuente de datos. Es necesario iniciar sesión con Google para consultar,
crear, editar o eliminar registros.
