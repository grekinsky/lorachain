Por favor, analiza y ejecuta el plan definido en $ARGUMENTS.

Sigue los siguientes pasos:

**IMPORTANTE** En este script debes de realizar las acciones de gh para crear branch y hacer commits cuando se especifique.

# PLANEA

1. Entiende el problema descrito en el plan.
2. Realiza preguntas si necesitas clarificar algún detalle.
3. Entiende el contexto y la historia detrás de este requerimiento.
    - Busca PRs y Commits para ver si puedes encontrar algo de historia acerca de este requerimiento.
    - Busca archivos relevantes en el codebase.
4. Think harder - Cómo dividir los requerimientos en una serie de tareas pequeñas y más fáciles de manejar.

# CREA EL CODIGO

- Crea un nuevo branch para la tarea.
- Resuelve la tarea en pasos pequeños y manejables de acuerdo al plan.
- Ejecuta typecheck, corrige si hay algo roto.
- Formatea el codigo con Prettier (`pnpm format`) y ejecuta ESLint con auto-fix `pnpm lint:fix`.
- Haz commit de los cambios después de cada paso.

# PRUEBA

- Usa Playwright via MCP para probar los cambios en la interfaz de usuario.
- Crea pruebas unitarias para las características desarrolladas en los componentes o librerías de utilidades.
- Corre todo el suite de pruebas para asegurar que no hayas roto algo.
- Si las pruebas fallan, corrígelas.
- Ejecuta typecheck, corrige si hay algo roto.
- Formatea el codigo con Prettier (`pnpm format`) y ejecuta ESLint con auto-fix `pnpm lint:fix`.
- Asegúrate que todas las pruebas estén pasando antes de moverte al siguiente paso.

MEMORY recuerda usar el CLI de Github (`gh`) para todas las tareas relacionadas con Github.
