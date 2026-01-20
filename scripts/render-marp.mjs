import { writeFileSync, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';

const IMG_DIR = join(process.cwd(), 'img');

/**
 * Convierte un taller parseado a formato Marp Markdown
 */
export function renderMarp(taller, outputDir) {
    const tallerOutputDir = join(outputDir, taller.id);
    mkdirSync(join(tallerOutputDir, 'img'), { recursive: true });

    let md = `---
marp: true
theme: default
paginate: true
backgroundColor: #fff
style: |
  section {
    font-family: 'Helvetica Neue', 'Arial', sans-serif;
    padding: 40px;
    font-size: 28px;
  }
  h1 { color: #1e3a8a; font-size: 60px; }
  h2 { color: #1e3a8a; font-size: 40px; margin-bottom: 20px; }
  p { line-height: 1.5; color: #374151; }
  strong { color: #047857; }
  table { width: 100%; font-size: 24px; }
  th { background: #e0f2fe; color: #1e3a8a; }
  .pregunta { font-size: 26px; }
  .opcion { 
    background: #f3f4f6; 
    border: 1px solid #d1d5db; 
    padding: 15px; 
    margin: 10px 0; 
    border-radius: 8px;
  }
  .respuesta { background: #ecfdf5; color: #065f46; padding: 20px; border-radius: 10px; margin-top: 20px; }
---

<!-- _class: lead -->
<!-- _backgroundColor: #1e3a8a -->
<!-- _color: white -->

# ${taller.titulo}
${taller.meta?.area?.toUpperCase() || 'TALLER'} • ${taller.totalItems} Preguntas

---
`;

    // Procesar bloques
    taller.bloques.forEach(bloque => {
        // Contexto
        if (bloque.contexto) {
            let contextoTexto = bloque.contexto;
            let imgMd = '';

            // Extraer imagen
            const imgMatch = contextoTexto.match(/!\[.*?\]\(([^)]+)\)/);
            if (imgMatch) {
                const imgSrc = imgMatch[1];
                const imgName = basename(imgSrc);
                const srcPath = join(IMG_DIR, imgName);

                if (existsSync(srcPath)) {
                    copyFileSync(srcPath, join(tallerOutputDir, 'img', imgName));
                    imgMd = `![bg right:35% fit](img/${imgName})`;
                    contextoTexto = contextoTexto.replace(imgMatch[0], '');
                }
            }

            md += `
<!-- _class: context -->
## 📖 Contexto

${contextoTexto}

${imgMd}

---
`;
        }

        // Preguntas
        if (bloque.preguntas) {
            bloque.preguntas.forEach(pregunta => {
                let preguntaTexto = pregunta.texto || '';
                let imgMd = '';

                // Extraer imagen de pregunta
                const imgMatch = preguntaTexto.match(/!\[.*?\]\(([^)]+)\)/);
                if (imgMatch) {
                    const imgSrc = imgMatch[1];
                    const imgName = basename(imgSrc);
                    const srcPath = join(IMG_DIR, imgName);

                    if (existsSync(srcPath)) {
                        copyFileSync(srcPath, join(tallerOutputDir, 'img', imgName));
                        imgMd = `\n![center h:300](img/${imgName})`;
                        preguntaTexto = preguntaTexto.replace(imgMatch[0], '');
                    }
                }

                // Slide Pregunta
                md += `
## ❓ Pregunta ${pregunta.numeroGlobal}

<div class="pregunta">
${preguntaTexto}
</div>

${imgMd}

---

## 🔤 Opciones

`;
                // Opciones
                Object.entries(pregunta.opciones || {}).forEach(([letra, texto]) => {
                    md += `<div class="opcion"><strong>${letra}.</strong> ${texto}</div>\n`;
                });

                md += `\n---\n`;

                // Slide Respuesta (si existe)
                if (pregunta.respuestaCorrecta) {
                    md += `
<!-- _backgroundColor: #ecfdf5 -->

## ✅ Respuesta Correcta

<div style="font-size: 40px; color: #047857; font-weight: bold; margin-bottom: 30px;">
${pregunta.respuestaCorrecta}. ${pregunta.opciones[pregunta.respuestaCorrecta]}
</div>

**💡 Explicación:**

${pregunta.explicacion}

---\n`;
                }
            });
        }
    });

    md += `
<!-- _class: lead -->
<!-- _backgroundColor: #1e3a8a -->
<!-- _color: white -->

# 🎉 ¡Fin del Taller!
Has completado todas las preguntas.
`;

    const mdPath = join(tallerOutputDir, 'presentacion.md');
    writeFileSync(mdPath, md);

    return { path: tallerOutputDir, mdPath };
}
