# Desarrollo de una tarea basada en un archivo de especificaciones

## VARIABLES

ARCHIVO_SPEC: $ARGUMENTS

## Ejecución de tareas

Por favor, analiza y ejecuta el plan definido en $ARGUMENTS.

Sigue los siguientes pasos:

MEMORY **IMPORTANTE** En este script debes de realizar las acciones de gh para hacer commits y crear PR cuando se especifique.

MEMORY Recuerda usar el CLI de Github (`gh`) para todas las tareas relacionadas con Github.

### PLANEA

1. Entiende el problema descrito en el plan.
2. Realiza preguntas si necesitas clarificar algún detalle.
3. Entiende el contexto y la historia detrás de este requerimiento.
   - Busca PRs y Commits para ver si puedes encontrar algo de historia acerca de este requerimiento.
   - Busca archivos relevantes en el codebase.
4. Think harder - Cómo dividir los requerimientos en una serie de tareas pequeñas y más fáciles de manejar.

### CREA EL CODIGO

- Únicamente si el branch actual es `main`, crea un nuevo branch para la tarea.
- Resuelve la tarea en pasos pequeños y manejables de acuerdo al plan.
- Usa Playwright via MCP para probar los cambios en la interfaz de usuario.
  - Confirmar que la interfaz de usuario funciona como está planeado.
  - Si no funciona, hacer debug del código, revisar mensajes en la consola, etc.
  - Si el archivo de especificación contiene referencias a imágenes y mocks, usarlas para compararlas con el desarrollo de la interfaz de usuario.
  - Iterar modificaciones en el código de la UI hasta llegar a un resultado aproximado al deseado.
- Al finalizar de usar Playwright, cierra el browser.
- Ejecuta typecheck, corrige si hay algo roto.
- Formatea el codigo con Prettier (`pnpm format`) y ejecuta ESLint con auto-fix `pnpm lint:fix`.
- Haz commit de los cambios después de cada paso.

### PRUEBA

- Usa Playwright via MCP para:
  - Probar todos los cambios realizados en la interfaz de usuario.
  - Tomar screenshots de la implementación y compararlos con los mocks de la interfaz de usuario.
  - Realiza los ajustes necesarios para hacerlo lo más parecido a los mocks.
  - Iterar hasta llegar a un resultado aceptable.
- Al finalizar de usar Playwright, cierra el browser.
- Ejecuta typecheck, corrige si hay algo roto.
- Crea pruebas unitarias para las características desarrolladas en los componentes o librerías de utilidades.
- Corre todo el suite de pruebas para asegurar que no hayas roto algo.
- Si las pruebas fallan, corrígelas.
- Ejecuta typecheck, corrige si hay algo roto.
- Formatea el codigo con Prettier (`pnpm format`) y ejecuta ESLint con auto-fix `pnpm lint:fix`.
- Asegúrate que todas las pruebas estén pasando antes de moverte al siguiente paso.

### DEPLOY

- Abre un PR y solicita review.
- Guarda el resumen del resultado del desarrollo en el archivo RESULT.md y guardalo en la misma carpeta que el archivo $ARGUMENTS.
