# Depuración de Errores Asíncronos en React

## Proceso de Depuración para Errores "Uncaught (in promise)"

### Síntomas del Problema

- El formulario se queda "colgado" en estado de carga
- Error en consola: `Uncaught (in promise) null` o similar
- La función asíncrona no continúa después de un `await`

### Proceso de Depuración

#### 1. Identificar el Punto de Falla

Cuando tienes un error asíncrono que no se maneja correctamente, usa `console.log` numerados secuencialmente para identificar dónde se detiene el flujo:

```typescript
const handleSubmit = async () => {
  try {
    console.log('1'); // Inicio

    if (condition) {
      console.log('2'); // Antes de operación async
      await someAsyncOperation();
      console.log('3'); // Después de operación async - ¿SE EJECUTA?
    }

    console.log('4'); // Continuación del flujo

    // Más operaciones...
    console.log('5');
  } catch (error) {
    console.log('ERROR:', error);
  } finally {
    console.log('FINAL');
  }
};
```

#### 2. Identificar la Línea Problemática

Si los logs se detienen en un número específico (ej: aparece "2" pero nunca "3"), entonces la línea entre esos números es la problemática.

#### 3. Casos Comunes de Error

**reCAPTCHA sin site key válido:**

```typescript
// ❌ PROBLEMÁTICO
await recaptchaRef.current.executeAsync(); // Falla silenciosamente si no hay site key

// ✅ SOLUCIONADO
if (RECAPTCHA_SITE_KEY && recaptchaRef.current) {
  try {
    await recaptchaRef.current.executeAsync();
  } catch (error) {
    // Manejar error graciosamente
  }
}
```

**Fetch a endpoints inexistentes:**

```typescript
// ❌ PROBLEMÁTICO
const response = await fetch('/api/endpoint'); // Se cuelga si no existe

// ✅ SOLUCIONADO
try {
  const response = await fetch('/api/endpoint');
  // Manejar respuesta...
} catch (networkError) {
  // Manejar error de red
}
```

#### 4. Herramientas de Depuración

1. **Console.log numerados**: Para rastrear flujo de ejecución
2. **Try-catch específicos**: Para capturar errores en operaciones individuales
3. **Chrome DevTools**: Network tab para ver requests fallidos
4. **React DevTools**: Para ver cambios de estado

#### 5. Limpieza Post-Depuración

Una vez identificado y corregido el problema:

1. Remover todos los `console.log` de depuración
2. Mantener solo `console.warn` y `console.error` para errores reales
3. Verificar que el linter pase
4. Probar el flujo completo nuevamente

### Ejemplo Completo: Caso reCAPTCHA

```typescript
// ANTES (problemático)
const handleSubmit = async () => {
  setLoading(true);

  const token = await recaptchaRef.current.executeAsync(); // ❌ Se cuelga aquí

  // Este código nunca se ejecuta...
  const response = await fetch('/api/submit', { body: { token } });
  setLoading(false);
};

// DESPUÉS (solucionado)
const handleSubmit = async () => {
  setLoading(true);

  try {
    let token = null;

    // Solo ejecutar reCAPTCHA si está disponible
    if (RECAPTCHA_SITE_KEY && recaptchaRef.current) {
      try {
        token = await recaptchaRef.current.executeAsync();
      } catch (recaptchaError) {
        console.warn('reCAPTCHA error:', recaptchaError);
        // Continuar sin token si falla
      }
    }

    const response = await fetch('/api/submit', {
      body: new URLSearchParams({
        ...(token && { recaptchaToken: token }),
      }),
    });

    // Manejar respuesta...
    setLoading(false);
    setSuccess(true);
  } catch (error) {
    console.error('Submit error:', error);
    setLoading(false);
    setError(error.message);
  }
};
```

### Prevención

- **Siempre envolver await en try-catch** cuando la operación puede fallar
- **Verificar condiciones** antes de operaciones asíncronas (refs, site keys, etc.)
- **Usar manejo gracioso de errores** en lugar de fallar silenciosamente
- **Probar con datos/configuraciones incompletas** en desarrollo
