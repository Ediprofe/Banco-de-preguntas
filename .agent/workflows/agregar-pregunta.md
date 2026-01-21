---
description: Agregar una nueva pregunta al taller desde una imagen
---

# Agregar una Pregunta al Taller

## Cuándo usar este workflow
Cuando el usuario pega una **foto/imagen** de una pregunta ICFES y necesita que sea transcrita y añadida al taller con formato de retroalimentación.

## Flujo de trabajo

1. **Usuario pega foto** de la pregunta en el chat
2. **Agente transcribe** el texto de la imagen
3. **Agente identifica** contexto, enunciado, opciones y respuesta correcta
4. **Agente añade** la pregunta al taller.md con retroalimentación
5. **Usuario añade** las imágenes/gráficas manualmente

> ⚠️ **IMPORTANTE**: Las ilustraciones (gráficas, esquemas, tablas complejas) las añade el usuario manualmente. El agente solo transcribe el texto y deja un placeholder.

---

## Estructura de un Ítem ICFES

### Componentes
1. **Contexto**: Todo el texto informativo antes de la pregunta real (datos, tablas, gráficas, situaciones)
2. **Enunciado**: El **último párrafo** antes de las opciones que contiene la pregunta explícita (usualmente termina en `?`)
3. **Opciones**: A, B, C, D - las cuatro alternativas de respuesta
4. **Respuesta correcta**: La letra de la opción correcta
5. **Explicación**: Justificación pedagógica de por qué esa es la respuesta

---

## Formato de Retroalimentación

### Marcadores de retroalimentación (dentro del `<details>`)
- `==texto==` → **Resaltar** información clave (fondo amarillo)
- `~~texto~~` → **Tachar** razón de descarte (texto rojo con línea)
- `✅` → Marcar la opción correcta

### Qué resaltar (==)
- Información clave del contexto que lleva a la respuesta
- La pregunta específica del enunciado
- Los elementos correctos de la opción correcta
- Datos numéricos importantes

### Qué tachar (~~)
- La razón específica por la que cada opción incorrecta está mal
- Afirmaciones falsas dentro de las opciones
- Contradiciones con el contexto

---

## Ejemplo Completo

### Pregunta original (sin marcadores, visible en PDF normal):

```markdown
## 8.

<!--
fuente: ICFES
año: 2024
-->

En una práctica de laboratorio, el profesor afirma que el agua y el aceite no se mezclan y pregunta: ¿el alcohol y el aceite se mezclan? Para responder la pregunta, solicita que mezclen las dos sustancias.

Un estudiante escribe como hipótesis que estos dos líquidos se mezclan formando una solución homogénea; luego, vierte los dos líquidos en un recipiente, los agita y pasados unos minutos observa que se forman dos capas: en el fondo se encuentra el aceite y en la capa superior está el alcohol.

Al analizar los resultados, ¿será válida la hipótesis del estudiante y qué conclusión se puede dar?

- A. La hipótesis es válida y se concluye que los resultados obtenidos se dieron debido a que estas sustancias no se mezclaron.
- B. La hipótesis es válida y se concluye que el alcohol tiene enlaces que impiden que se forme una mezcla heterogénea con el aceite.
- C. La hipótesis es falsa y se concluye que la mezcla obtenida luego de agitar las dos sustancias es de carácter homogéneo.
- D. La hipótesis es falsa y se concluye que el alcohol no se disuelve en el aceite, por lo que se obtiene una mezcla heterogénea.

<details>
<summary>✅ Respuesta</summary>

<!-- RETROALIMENTACIÓN CON MARCADORES -->
Un estudiante escribe como hipótesis que estos dos líquidos se mezclan ==formando una solución homogénea==; luego, vierte los dos líquidos... observa que ==se forman dos capas==...

==¿será válida la hipótesis del estudiante y qué conclusión se puede dar?==

- A. ~~La hipótesis es válida~~ y se concluye que los resultados...
- B. ~~La hipótesis es válida~~ y se concluye que el alcohol tiene...
- C. La hipótesis es falsa y se concluye que... ~~es de carácter homogéneo~~.
- D. La hipótesis es ==falsa== y se concluye que... ==se obtiene una mezcla heterogénea==. ✅

**Respuesta: D**

**Explicación:**
Una **hipótesis** es una suposición que debe ser probada mediante la experimentación. En este caso:
1.  **Hipótesis del estudiante:** El alcohol y el aceite forman una mezcla homogénea.
2.  **Resultado experimental:** Se observan **dos capas** = mezcla **heterogénea**.

Por lo tanto, la hipótesis es **falsa** y la conclusión correcta es que las sustancias forman una mezcla heterogénea.

</details>
```

---

## Checklist del Agente

Al agregar una pregunta:

- [ ] Determinar el **número** de la pregunta (continuar la secuencia)
- [ ] Añadir **metadatos** (fuente, año) en comentario HTML
- [ ] Transcribir el **contexto** (texto antes de la pregunta)
- [ ] Transcribir el **enunciado** (párrafo con la pregunta)
- [ ] Transcribir las **opciones** A, B, C, D
- [ ] Crear el `<details>` con:
  - [ ] Sección de retroalimentación con marcadores `==` y `~~`
  - [ ] `**Respuesta: X**`
  - [ ] `**Explicación:**` detallada
- [ ] Si hay imagen/gráfica, dejar placeholder: `![Descripción](ruta-pendiente)`
- [ ] Añadir separador `---` al final

---

## Placeholder para imágenes

Cuando la pregunta tenga una imagen que el usuario debe añadir:

```markdown
![Descripción de la imagen - PENDIENTE](/img/{area}/{nombre-imagen}.webp)
```

Ejemplo:
```markdown
![Diagrama de fases del agua - PENDIENTE](/img/quimica/diagrama-de-fases.webp)
```
