# Banco Saber - Sistema de Talleres

> Genera presentaciones Slidev + PDF de examen desde archivos Markdown.

---

## Estructura del Proyecto

El sistema soporta dos formas de trabajo. Elige la que prefieras:

### 1. Modo Rápido (Recomendado)
Escribes todo el taller en un solo archivo Markdown. Ideal para crear talleres nuevos rápidamente.

```
banco-saber/
├── talleres/                 # Tus talleres
│   ├── ciencias/
│   │   └── contaminacion.md  # ← Escribe aquí tu taller completo
│   ├── quimica/
│   └── matematicas/
├── img/                      # Tus imágenes (fuente)
├── output/                   # Archivos generados (PDFs, Slides)
└── scripts/                  # Herramientas del sistema
```

### 2. Modo Banco (Avanzado)
Creas preguntas sueltas en `items/` y las ensamblas con un archivo YAML. Útil si quieres reutilizar la misma pregunta en varios talleres.

```
banco-saber/
├── items/                    # Banco de preguntas sueltas
│   └── ciencias/celula/01-pregunta.md
├── talleres/
│   └── taller-celula.yml     # Archivo de configuración que une items
```

---

## Flujo de Trabajo (Modo Rápido)

1. **Imágenes:**
   - Guarda tus imágenes en `img/`.
   - Ejecuta `npm run img` para optimizarlas y copiar el código Markdown.

2. **Crear Taller:**
   - Crea un archivo `.md` en `talleres/{area}/` (ej: `talleres/ciencias/mi-taller.md`).
   - Estructura: `# Título` → Bloque de Contexto → `## 1. Pregunta`...

3. **Generar:**
   - Ejecuta `npm run taller`.
   - Selecciona tu área y taller del menú.
   - El sistema generará la presentación Slidev y el examen PDF en `output/`.

---

## Formato ItemSet

```markdown
---
total_items: 3
---

# Contexto

**RESPONDA LAS PREGUNTAS 1 A 3...**

[Texto + imágenes]

---

## 1.

¿Pregunta?

- A. Opción
- B. Opción
- C. Opción
- D. Opción

<details>
<summary>✅ Respuesta</summary>

**Respuesta: B**

Explicación...

</details>
```

---

## Formato Taller (.yml)

```yaml
id: nombre-taller
titulo: "Título del Taller"

meta:
  area: ciencias
  unidad: ecosistemas
  objetivo_items: 10

seleccion:
  - ciencias/ecosistemas/icfes-2023/01-contaminacion
  - ciencias/ecosistemas/icfes-2023/02-biodiversidad
```

---

## Outputs

| Output | Archivo | Uso |
|--------|---------|-----|
| **HTML Interactivo** | `leccion_interactiva.html` | Lección web con feedback |
| **PDF Imprimible** | `{nombre}.pdf` | Evaluación sin respuestas |
| **PDF Retroalimentación** | `{nombre}_retroalimentacion.pdf` | Análisis pedagógico completo |
| **Word** | `{nombre}.docx` | Editable sin retroalimentación |

---

## Workflows Disponibles

| Comando | Descripción |
|---------|-------------|
| `/crear-taller` | Crear un nuevo taller desde cero |
| `/agregar-pregunta` | Añadir una pregunta desde imagen |

---

## Formato de Retroalimentación (Referencia Rápida)

### Marcadores dentro de `<details>`
```markdown
==texto== → Resaltar información clave (amarillo)
~~texto~~ → Tachar razón de descarte (rojo)
✅        → Marcar opción correcta
```

### Estructura de pregunta con retroalimentación
```markdown
## N.
[Contexto y enunciado normal, sin marcadores]

- A. Opción
- B. Opción
- C. Opción
- D. Opción

<details>
<summary>✅ Respuesta</summary>

<!-- RETROALIMENTACIÓN CON MARCADORES -->
[Versión del contexto con ==resaltados==]
[Opciones con ~~tachados~~ y ==correctas== ✅]

**Respuesta: X**

**Explicación:**
[Justificación pedagógica]

</details>
```

> 📖 Ver workflow `/agregar-pregunta` para ejemplo completo.

