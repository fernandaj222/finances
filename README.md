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

Los registros existentes en `localStorage` se copian a Firestore al iniciar sesión. Si
el navegador conserva el usuario anónimo de la versión anterior, la aplicación intenta
vincularlo con Google para mantener sus registros. Después de vincular la cuenta y
confirmar que los gastos aparecen, se puede deshabilitar el proveedor **Anónimo**.
