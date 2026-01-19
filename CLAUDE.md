# Banco Saber - Sistema de Talleres

> Genera presentaciones Slidev + PDF de examen desde archivos Markdown.

---

## Estructura

```
banco-saber/
├── items/                    # Banco de preguntas
│   ├── ciencias/
│   │   ├── celula/
│   │   │   ├── 01-abel-organelos.md
│   │   │   └── 02-icfes2023-osmosis.md
│   │   └── ecosistemas/
│   │       └── 01-icfes2023-contaminacion.md
│   └── quimica/
│       └── materia/
│           └── 01-icfes2023-estados.md
├── talleres/                 # Definiciones YAML
├── output/                   # Generados
└── scripts/
```

**Convención de nombres:** `##-fuente-tema.md`
- `##` = número de orden
- `fuente` = origen (icfes2023, abel, instruimos)
- `tema` = descripción

---

## Comandos

```bash
# Menú interactivo
npm run saber

# Generar taller (Slidev + PDF)
npm run taller <nombre-taller>
npm run taller ciencias-contaminacion-prueba

# Con servidor automático
npm run taller ciencias-contaminacion-prueba
# Sin abrir navegador
npm run taller ciencias-contaminacion-prueba -- --no-open
```

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
| **Slidev** | `slides.md` | Presentación interactiva |
| **PDF Examen** | `examen.pdf` | Evaluación sin respuestas |
