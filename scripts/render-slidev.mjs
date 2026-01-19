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
 * Limpia texto de markdown (imágenes, negrita)
 */
function cleanText(texto) {
    return (texto || '')
        .replace(/!\[.*?\]\(.*?\)/g, '')  // Quitar imágenes
        .replace(/\*\*(.+?)\*\*/g, '$1')  // Quitar negrita markdown
        .replace(/---\s*$/gm, '')
        .trim();
}

/**
 * Procesa ruta de imagen para Slidev
 * Las imágenes deben estar en /public para que Slidev las encuentre
 */
function processImagePath(imgUrl, publicDir) {
    if (!imgUrl) return null;

    // Si es URL absoluta (CDN), usar directamente
    if (imgUrl.startsWith('http')) {
        return imgUrl;
    }

    // Si es file:// o ruta local, copiar a public
    let localPath = imgUrl;
    if (imgUrl.startsWith('file://')) {
        localPath = imgUrl.replace('file://', '');
    }

    // Buscar la imagen
    const possiblePaths = [
        localPath,
        join(BANCO_ROOT, localPath),
        join(BANCO_ROOT, 'inbox', basename(localPath))
    ];

    for (const path of possiblePaths) {
        if (existsSync(path)) {
            const imgName = basename(path);
            const destPath = join(publicDir, 'images', imgName);
            mkdirSync(dirname(destPath), { recursive: true });
            copyFileSync(path, destPath);
            return `/images/${imgName}`;
        }
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
    const texto = cleanText(contexto);
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
function generateQuestionSlides(pregunta, publicDir) {
    const num = pregunta.numeroGlobal;
    const texto = cleanText(pregunta.texto);
    const imgUrl = extractImage(pregunta.texto);
    const opciones = pregunta.opciones || {};
    const respuestaCorrecta = pregunta.respuestaCorrecta;
    const explicacion = cleanText(pregunta.explicacion);

    let slides = '';

    // Si hay imagen, mostrar primero
    if (imgUrl) {
        const processedImg = processImagePath(imgUrl, publicDir);
        slides += `

---
layout: default
---

# Pregunta ${num}

${texto}

<div class="flex justify-center mt-4">
  <img src="${processedImg}" class="h-70 rounded-xl shadow-2xl" />
</div>`;
    } else {
        slides += `

---
layout: default
---

# Pregunta ${num}

<div class="text-xl mt-8 leading-relaxed">
${texto}
</div>`;
    }

    // Slide de opciones con mejor estilo y alto contraste
    const opcionesHTML = Object.entries(opciones).map(([letra, opcionTexto]) => `
  <div class="p-5 bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl border-2 border-slate-600 hover:border-blue-400 hover:from-blue-900/50 hover:to-slate-700 transition-all duration-300 cursor-pointer group flex items-start">
    <span class="inline-block flex-shrink-0 w-10 h-10 bg-blue-500 text-white rounded-full text-center leading-10 font-bold mr-4 group-hover:bg-blue-400 shadow-md">${letra}</span>
    <span class="text-xl text-white font-medium leading-relaxed">${opcionTexto}</span>
  </div>`).join('\n');

    slides += `

---
layout: default
---

# Pregunta ${num} - Opciones

<div class="space-y-4 mt-6">
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

    // Copiar imágenes del inbox si existen
    const inboxDir = join(BANCO_ROOT, 'inbox');
    if (existsSync(inboxDir)) {
        const images = readdirSync(inboxDir).filter(f =>
            f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp')
        );
        for (const img of images) {
            const src = join(inboxDir, img);
            const dest = join(publicDir, 'inbox', img);
            mkdirSync(dirname(dest), { recursive: true });
            copyFileSync(src, dest);
        }
        if (images.length > 0) {
            console.log(`   📷 ${images.length} imágenes copiadas a public/inbox/`);
        }
    }

    return {
        tipo: 'slidev',
        path: tallerDir,
        slidesPath: slidesPath
    };
}

export default renderSlidev;
