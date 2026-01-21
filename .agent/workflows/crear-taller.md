---
description: Crear un nuevo taller desde cero con estructura ICFES
---

# Crear un Nuevo Taller

## Cuándo usar este workflow
Cuando necesitas crear un taller completamente nuevo para un área y tema específicos.

## Pasos

### 1. Crear la estructura de carpetas
```bash
mkdir -p talleres/{area}/{nombre-tema}
mkdir -p talleres/{area}/{nombre-tema}/output
```

Ejemplo:
```bash
mkdir -p talleres/quimica/estados-de-la-materia
```

### 2. Crear el archivo taller.md

```markdown
# Título del Taller

## Resumen de conceptos

[Imágenes de apoyo conceptual - el usuario las añade manualmente]

---

## 1.

<!-- 
fuente: ICFES
año: 2024
-->

[Contexto de la pregunta...]

[Enunciado con la pregunta]

- A. Opción A
- B. Opción B
- C. Opción C
- D. Opción D

<details>
<summary>✅ Respuesta</summary>

<!-- RETROALIMENTACIÓN CON MARCADORES -->
[Versión con ==resaltados== y ~~tachados~~]

**Respuesta: X**

**Explicación:**
[Explicación detallada]

</details>

---

## 2.
[Siguiente pregunta...]
```

### 3. Convenciones de nombres
- **Área**: minúsculas, sin espacios (`quimica`, `biologia`, `matematicas`)
- **Tema**: minúsculas, guiones para espacios (`la-materia`, `estados-de-la-materia`)
- **Imágenes**: `/img/{area}/{imagen}.webp` (optimizadas con `npm run img`)

### 4. Generar los materiales
```bash
npm run build
# Seleccionar el área y el taller
```

## Archivos de salida
- `output/leccion_interactiva.html` - Lección web
- `output/{nombre}.pdf` - PDF imprimible
- `output/{nombre}_retroalimentacion.pdf` - PDF con análisis
- `output/{nombre}.docx` - Word editable
