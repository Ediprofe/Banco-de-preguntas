import { readFileSync, mkdirSync, copyFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname, basename, isAbsolute } from 'path';

const TALLERES_DIR = join(process.cwd(), 'talleres');
const OUTPUT_DIR = join(process.cwd(), 'output');
const IMG_DIR = join(process.cwd(), 'img'); // Directorio central de imágenes originales
const INBOX_DIR = join(process.cwd(), 'inbox'); // Directorio legacy

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
 * Extrae URL de imagen del markdown si existe
 */
function extractImage(texto) {
  const match = texto.match(/!\[.*?\]\((.*?)\)/);
  return match ? match[1] : null;
}

/**
 * Procesa ruta de imagen, la busca en img/ o inbox/ y la copia a output
 * Retorna ruta relativa para Slidev
 */
function processImagePath(imgUrl, publicDir) {
  if (!imgUrl) return null;

  const imgName = basename(imgUrl);

  // 1. Buscar en img/ (Prioridad)
  let srcPath = join(IMG_DIR, imgName);

  if (!existsSync(srcPath)) {
    // 2. Buscar en inbox/ (Legacy)
    srcPath = join(INBOX_DIR, imgName);
  }

  // 3. Buscar relativa al taller (si es ruta absoluta o relativa compleja)
  if (!existsSync(srcPath) && !isAbsolute(imgUrl)) {
    // Difícil saber la ruta relativa exacta aquí sin pasar el path del taller,
    // pero asumimos que las imágenes están centralizadas en img/ ahora.
  }

  if (existsSync(srcPath)) {
    const destPath = join(publicDir, 'img', imgName);
    mkdirSync(dirname(destPath), { recursive: true });
    copyFileSync(srcPath, destPath);
    return `/img/${imgName}`;
  }

  return imgUrl; // Retornar original si no se encuentra (quizás es externa)
}

/**
 * Genera slide de título
 */
function generateTitleSlide(taller) {
  return `---
theme: seriph
layout: cover
background: https://images.unsplash.com/photo-1532094349884-543bc11b234d?w=1920
class: text-center
---

# ${taller.titulo}

${taller.meta.area.toUpperCase()} | ${taller.totalItems} preguntas
`;
}

/**
 * Genera slide de contexto
 */
function generateContextSlide(texto) {
  if (!texto) return '';

  // Detectar si hay imagen en el contexto
  const imgMatch = texto.match(/!\[([^\]]*)\]\(([^)]+)\)/);

  if (imgMatch) {
    // Layout de dos columnas: texto izquierda, imagen derecha
    const imgSrc = imgMatch[2];
    const textoSinImagen = texto.replace(imgMatch[0], '').trim();

    return `

---
layout: two-cols
---

# 📖 Contexto

<div class="pr-4 text-lg leading-relaxed">

${textoSinImagen}

</div>

::right::

<div class="flex items-center justify-center h-full">

![contexto](${imgSrc})

</div>`;
  } else {
    // Layout simple para contexto solo texto
    return `

---
layout: default
---

# 📖 Contexto

<div class="p-6 bg-blue-900/20 rounded-xl border-l-4 border-blue-400 text-left text-lg">

${texto}

</div>`;
  }
}

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
class: text-lg px-20
---

# ❓ Pregunta ${num}

<div class="flex flex-col justify-center h-full">

<div class="text-3xl font-serif mb-8 leading-snug">
${texto}
</div>

<div class="flex justify-center mt-4">
  <img src="${processedImg}" class="h-60 rounded-xl shadow-lg border border-gray-100" />
</div>

</div>`;
  } else {
    slides += `

---
layout: default
class: text-lg px-20
---

# ❓ Pregunta ${num}

<div class="flex flex-col justify-center h-full text-3xl font-serif leading-snug">

${texto}

</div>`;
  }

  // Slide de opciones (Diseño Limpio y Minimalista)
  const opcionesHTML = Object.entries(opciones).map(([letra, opcionTexto]) => `
  <div class="flex items-center p-5 mb-4 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/50 transition-colors cursor-default">
    <div class="flex-shrink-0 font-bold text-2xl text-blue-600 w-10">
      ${letra}.
    </div>
    <div class="text-xl text-gray-700 leading-tight">
      ${opcionTexto}
    </div>
  </div>`).join('\n');

  slides += `

---
layout: default
class: bg-white
---

# ❓ Opciones

<div class="mt-10 max-w-3xl mx-auto">
${opcionesHTML}
</div>`;

  // Slide de respuesta (Diseño Premium)
  if (respuestaCorrecta) {
    slides += `

---
layout: center
class: bg-gradient-to-br from-green-50 to-emerald-100
---

# ✅ Respuesta Correcta: ${respuestaCorrecta}

<div class="text-3xl font-bold text-green-800 mb-6 font-serif">
  ${opciones[respuestaCorrecta] || ''}
</div>

<div class="max-w-2xl mx-auto text-left bg-white/60 p-6 rounded-2xl border border-green-200 shadow-sm leading-relaxed text-lg">

💡 **Explicación:**

${explicacion || 'Es la opción correcta según el análisis del contexto y las variables presentadas.'}

</div>`;
  }

  return slides;
}

/**
 * Genera slide final
 */
function generateFinalSlide(taller) {
  return `

---
layout: center
class: text-center bg-gray-50
---

# 🎉 ¡Fin del Taller!

<div class="mt-8 text-xl text-gray-600 font-medium">
  Has completado las ${taller.totalItems} preguntas del taller de ${taller.meta.area}.
</div>

<div class="flex justify-center gap-4 mt-10">
    <div class="px-8 py-4 bg-blue-600 rounded-2xl text-white font-bold text-2xl shadow-xl transform hover:scale-105 transition-transform cursor-pointer">
        PUNTAJE: 100%
    </div>
</div>
`;
}

export function renderSlidev(taller, outputDir) {
  // Crear carpeta específica para el taller
  const tallerOutputDir = join(outputDir, taller.id);
  const slidesPath = join(tallerOutputDir, 'slides.md');
  const publicDir = join(tallerOutputDir, 'public');

  mkdirSync(publicDir, { recursive: true });

  let content = generateTitleSlide(taller);

  // Contexto global (si existe fuera de items)
  // content += generateContextSlide(taller.contexto);

  // Iterar bloques (Estructura: { contexto: string, preguntas: [] })
  taller.bloques.forEach(bloque => {
    // 1. Generar slide de contexto si existe
    if (bloque.contexto && bloque.contexto.length > 10) {
      content += generateContextSlide(bloque.contexto);
    }

    // 2. Generar slides para cada pregunta del bloque
    if (bloque.preguntas && bloque.preguntas.length > 0) {
      bloque.preguntas.forEach(pregunta => {
        content += generateQuestionSlides(pregunta, publicDir);
      });
    }
  });

  content += generateFinalSlide(taller);

  // Escribir archivo
  writeFileSync(slidesPath, content);

  // Retornar objeto con la ruta de la CARPETA, compatible con build-slidev.mjs
  return { path: tallerOutputDir };
}
