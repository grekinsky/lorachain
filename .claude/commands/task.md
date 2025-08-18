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
- Haz commit de los cambios después de cada paso importante.
- Leer las imágenes y mocks de diseño mencionados en ARCHIVO_SPEC.
- Resuelve la tarea en pasos pequeños y manejables de acuerdo al plan.
- Usa Playwright MCP para probar los cambios en la interfaz de usuario.
  - Iterar modificaciones en el código fuente de la UI hasta llegar a un resultado muy aproximado al deseado en los mocks de diseño:
    1. Confirmar que la interfaz de usuario funciona como está planeado.
    2. Si no funciona, hacer debug del código, estilos, revisar mensajes en la consola, llamadas de red, etc.
    3. **Repite los pasos 1-2 hasta que la interfaz de usuario funcione sin errores**
    4. Si el archivo de especificación contiene referencias a imágenes y mocks, usarlas para compararlas con el desarrollo de la interfaz de usuario mediante capturas de pantalla con Playwright MCP.
    5. Si la comparación del diseño de los mocks y las capturas de pantalla no coinciden en igual o más de un 90%, realizar ajustes en el código y los estilos para hacerlo más parecido al diseño de los mocks.
    6. **Repite los pasos 4-5 hasta que los mocks y las capturas de pantalla coincidan en igual o más de un 90%**
- Al finalizar de usar Playwright MCP, cierra el browser.
- Ejecutar pasos de la **SANITIZACION DE CODIGO**.

### SANITIZACION DE CODIGO (ejecutar únicamente cuando se indique explícitamente en algún paso)

- Ejecutar `pwd` y asegúrate de estar en el proyecto base.
- **Iteración completa hasta que NO HAYA ERRORES DE LINTING:**
  1. Ejecuta `pnpm lint:fix` para aplicar correcciones automáticas.
  2. Ejecuta `pnpm lint` para verificar si quedan problemas
  3. **Si hay errores de linting restantes, DEBES corregirlos manualmente:**
     - Corregir cualquier otro error de ESLint que no se pueda auto-corregir
  4. **Repite los pasos 2-3 hasta que `pnpm lint` pase sin errores**
- **Iteración completa hasta que NO HAYA ERRORES DE TYPECHECK:**
  1. Ejecuta `pnpm typecheck`.
  2. **Si hay errores de linting restantes, DEBES corregirlos manualmente:**
  3. **Repite los pasos 1-2 hasta que `pnpm typecheck` pase sin errores**
- Formatea el codigo con Prettier (`pnpm format`).
- **VERIFICACION FINAL:** Ejecuta `pnpm lint` y `pnpm typecheck` una vez más para confirmar que no hay problemas
- Asegúrate que todas las pruebas estén pasando antes de moverte al siguiente paso.

### PRUEBAS

- Crea pruebas unitarias para las características desarrolladas en los componentes o librerías de utilidades.
- **Iteración completa hasta que NO HAYA ERRORES DE PRUEBAS:**
  1. Corre todo el suite de pruebas para asegurar que no hayas roto algo.
  2. **Si hay errores de pruebas, DEBES corregirlos manualmente:**
  3. **Repite los pasos 1-2 hasta que la ejecución del site de pruebas pase sin errores**
- Ejecutar pasos de la **SANITIZACION DE CODIGO**.

### DEPLOY

- Abre un PR y solicita review.
- Crea el resumen del resultado del desarrollo en un archivo llamado `RESULT.md` dentro la misma carpeta en la que se encuentra el archivo ARCHIVO_SPEC.
