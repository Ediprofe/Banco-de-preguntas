#!/usr/bin/env node
/**
 * render-slidev.mjs
 * 
 * Genera una presentación Slidev desde un taller ensamblado.
 * 
 * Output:
 *   - slides.md (presentación Slidev)
 *   - public/inbox/* (imágenes copiadas)
 */

import { writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BANCO_ROOT = join(__dirname, '..');

/**
 * Extrae URL de imagen del texto markdown
 */
function extractImage(texto) {
    const match = (texto || '').match(/!\[.*?\]\((.+?)\)/);
    return match ? match[1] : null;
}

/**
 * Renderiza markdown básico a HTML para Slidev
 * Principalmente convierte tablas Markdown a HTML con estilos Tailwind.
 * Deja el resto del texto (LaTeX, negritas) intacto para que Slidev lo procese.
 */
function renderMarkdown(texto) {
    if (!texto) return '';

    let md = texto;

    // 1. Tablas Markdown -> HTML Tailwind
    // Es vital dejar líneas en blanco antes y después del HTML para que Slidev siga procesando MD
    const tableRegex = /\|(.+)\|\n\|([-:| ]+)\|\n((?:\|.+\|\n?)+)/g;

    if (md.match(tableRegex)) {
        md = md.replace(tableRegex, (match, header, separator, body) => {
            const headers = header.split('|').map(s => s.trim()).filter(s => s);
            const rows = body.trim().split('\n').map(row =>
                row.split('|').map(s => s.trim()).filter(s => s)
            );

            let tableHtml = '\n\n<div class="overflow-x-auto my-4"><table class="min-w-full border border-gray-500 bg-white text-gray-900 text-sm">';
            tableHtml += '<thead class="bg-blue-100"><tr>';
            headers.forEach(h => { tableHtml += `<th class="px-4 py-2 border border-gray-400 font-bold">${h}</th>`; });
            tableHtml += '</tr></thead><tbody>';
            rows.forEach(row => {
                tableHtml += '<tr>';
                row.forEach(cell => { tableHtml += `<td class="px-4 py-2 border border-gray-400">${cell}</td>`; });
                tableHtml += '</tr>';
            });
            tableHtml += '</tbody></table></div>\n\n';
            return tableHtml;
        });
    }

    // 2. Imágenes: Eliminarlas si están inline (se manejan aparte)
    md = md.replace(/!\[.*?\]\(.*?\)/g, '');

    // NO reemplazamos \n por <br>. Dejamos que Slidev maneje los párrafos.
    // NO tocamos LaTeX ($$ o $).

    return md;
}

/**
 * Procesa ruta de imagen para Slidev
 */
function processImagePath(imgUrl, publicDir) {
    if (!imgUrl) return null;

    // Si es URL web, dejarla igual
    if (imgUrl.startsWith('http')) return imgUrl;

    let imgName = basename(imgUrl);
    let srcPath = null;

    // Buscar en:
    // 1. img/ (carpeta raíz de imágenes optimizadas)
    // 2. inbox/ (legacy)
    const possiblePaths = [
        join(BANCO_ROOT, 'img', imgName),
        join(BANCO_ROOT, 'inbox', imgName)
    ];

    for (const p of possiblePaths) {
        if (existsSync(p)) {
            srcPath = p;
            break;
        }
    }

    if (srcPath) {
        // Copiar a public/img/ en el output
        const destPath = join(publicDir, 'img', imgName);
        mkdirSync(dirname(destPath), { recursive: true });
        copyFileSync(srcPath, destPath);

        // Retornar ruta relativa para Slidev y PDF
        return `/img/${imgName}`;
    }

    console.warn(`  ⚠️  Imagen no encontrada: ${imgUrl}`);
    return imgUrl;
}

/**
 * Genera el frontmatter de Slidev
 */
function generateFrontmatter(taller) {
    return `---
theme: seriph
background: https://cover.sli.dev
title: ${taller.titulo}
info: |
  ${taller.meta.area} / ${taller.meta.unidad}
  ${taller.totalItems} preguntas
class: text-center
highlighter: shiki
drawings:
  persist: false
transition: slide-left
mdc: true
---`;
}

/**
 * Genera slide de título
 */
function generateTitleSlide(taller) {
    return `
# ${taller.titulo}

${taller.meta.area} / ${taller.meta.unidad}

🧪 ${taller.totalItems} preguntas

<div class="abs-br m-6 flex gap-2">
  <span class="text-sm opacity-50">Presiona → para continuar</span>
</div>`;
}

/**
 * Genera slide de contexto
 */
function generateContextSlide(contexto, publicDir) {
    const texto = renderMarkdown(contexto);
    const imgUrl = extractImage(contexto);

    let slide = `
---
layout: default
---

# 📖 Contexto

<div class="p-6 bg-blue-900/20 rounded-xl border-l-4 border-blue-400 text-left">

${texto.slice(0, 600)}${texto.length > 600 ? '...' : ''}

</div>`;

    // Si hay imagen, agregar slide separado
    if (imgUrl) {
        const processedImg = processImagePath(imgUrl, publicDir);
        slide += `

---
layout: center
---

# Modelo / Diagrama

<div class="flex justify-center">
  <img src="${processedImg}" class="h-100 rounded-xl shadow-2xl" />
</div>`;
    }

    return slide;
}

/**
 * Genera slides de pregunta (pregunta + opciones + respuesta)
 */
/**
 * Genera slides de pregunta (pregunta + opciones + respuesta)
 */
function generateQuestionSlides(pregunta, publicDir) {
    const num = pregunta.numeroGlobal;
    const texto = renderMarkdown(pregunta.texto);
    const imgUrl = extractImage(pregunta.texto);
    const opciones = pregunta.opciones || {};
    const respuestaCorrecta = pregunta.respuestaCorrecta;
    const explicacion = renderMarkdown(pregunta.explicacion);

    let slides = '';

    // Si hay imagen, mostrar primero
    if (imgUrl) {
        const processedImg = processImagePath(imgUrl, publicDir);
        slides += `

---
layout: default
class: text-lg
---

# Pregunta ${num}

${texto}

<div class="flex justify-center mt-4">
  <img src="${processedImg}" class="h-60 rounded-lg shadow-md border border-gray-200" />
</div>`;
    } else {
        slides += `

---
layout: default
class: text-lg
---

# Pregunta ${num}

<br>

${texto}`;
    }

    // Slide de opciones (Estilo Examen: sobrio, letra negrita)
    const opcionesHTML = Object.entries(opciones).map(([letra, opcionTexto]) => `
  <div class="flex items-start p-3 hover:bg-gray-100 rounded-lg transition-colors duration-200">
    <span class="font-bold text-blue-900 mr-3 text-lg">${letra}.</span>
    <span class="text-gray-800 text-lg leading-snug">${opcionTexto}</span>
  </div>`).join('\n');

    slides += `

---
layout: default
---

# Pregunta ${num} - Opciones

<div class="space-y-2 mt-6 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
${opcionesHTML}
</div>`;

    // Slide de respuesta
    slides += `

---
layout: center
class: bg-gradient-to-br from-green-900 to-slate-900
---

# ✅ Respuesta ${num}: ${respuestaCorrecta}

<div class="text-2xl mb-6 font-semibold text-green-300">
${opciones[respuestaCorrecta] || ''}
</div>

<div class="p-6 bg-green-800/30 rounded-xl max-w-3xl border border-green-700">

${explicacion || 'Es la opción correcta según el contexto proporcionado.'}

</div>`;

    return slides;
}

/**
 * Genera slide final
 */
function generateFinalSlide(taller) {
    return `

---
layout: center
class: text-center
---

# 🎉 ¡Fin del Quiz!

<div class="text-xl opacity-80 mb-8">
Has completado las ${taller.totalItems} preguntas
</div>

<div class="flex justify-center gap-4 mt-8">
  <div class="px-6 py-3 bg-blue-600 rounded-lg">
    <kbd>Esc</kbd> Ver todas las slides
  </div>
  <div class="px-6 py-3 bg-green-600 rounded-lg">
    <kbd>P</kbd> Modo presentador
  </div>
</div>`;
}

/**
 * Genera archivo Slidev completo
 */
export function renderSlidev(taller, outputPath) {
    // Carpeta del taller: output/{taller-id}/
    const tallerDir = join(outputPath, taller.id);
    const publicDir = join(tallerDir, 'public');

    mkdirSync(tallerDir, { recursive: true });
    mkdirSync(publicDir, { recursive: true });
    mkdirSync(join(publicDir, 'images'), { recursive: true });

    console.log('🎨 Generando presentación Slidev...');

    let markdown = generateFrontmatter(taller);
    markdown += generateTitleSlide(taller);

    for (const bloque of taller.bloques) {
        // Contexto
        if (bloque.contexto && bloque.contexto.trim()) {
            markdown += generateContextSlide(bloque.contexto, publicDir);
        }

        // Preguntas
        for (const pregunta of bloque.preguntas) {
            markdown += generateQuestionSlides(pregunta, publicDir);
        }
    }

    markdown += generateFinalSlide(taller);

    // Guardar slides.md
    const slidesPath = join(tallerDir, 'slides.md');
    writeFileSync(slidesPath, markdown);
    console.log(`   ✅ ${slidesPath}`);



    return {
        tipo: 'slidev',
        path: tallerDir,
        slidesPath: slidesPath
    };
}

export default renderSlidev;
