# Alejandrino

Biblioteca personal de técnicas de grappling, pensada principalmente para
usarse desde el teléfono Android.

## Funciones actuales

- Guardar rápidamente enlaces de TikTok, Instagram y YouTube.
- Clasificar las técnicas después de guardarlas.
- Editar nombre, disciplina, posición y categoría.
- Buscar técnicas y filtrar las pendientes de clasificación.
- Detectar enlaces repetidos.
- Eliminar técnicas.
- Conservar la biblioteca en el navegador mediante localStorage.

La aplicación guarda enlaces, no descarga los videos.

## Desarrollo local

Instalar las dependencias:

```bash
npm install
```

Iniciar el servidor:

```bash
npm run dev
```

Abrir http://localhost:3000 en el navegador.

Para probar desde Android, conectar el teléfono a la misma red Wi-Fi
del computador y abrir la dirección Network que muestra la terminal.
El servidor debe permanecer encendido.

## Estructura principal

- `app/page.tsx`: guardado rápido, búsqueda y almacenamiento local.
- `app/components/TechniqueCard.tsx`: visualización, edición y eliminación.
- `app/types/technique.ts`: modelo de datos y clasificación pendiente.

## Tecnologías

Next.js, React, TypeScript y Tailwind CSS.

## Almacenamiento actual

Los datos pertenecen al navegador y a la dirección desde la que se abre
la aplicación. Todavía no se sincronizan entre el computador y el teléfono.
Borrar los datos del sitio puede eliminar la biblioteca local.

## Próximas etapas

- Inicio de sesión.
- Biblioteca sincronizada entre dispositivos.
- Importación de enlaces guardados anteriormente.
- Integración con el menú Compartir de Android.

## Licencia

Consultar el archivo LICENSE.
