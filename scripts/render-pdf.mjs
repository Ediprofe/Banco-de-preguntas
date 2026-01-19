#!/usr/bin/env node
/**
 * render-pdf.mjs
 * 
 * Genera PDF de examen (sin respuestas) usando Playwright.
 * El PDF se guarda en la misma carpeta del taller: output/{taller}/examen.pdf
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BANCO_ROOT = join(__dirname, '..');
const OUTPUT_DIR = join(BANCO_ROOT, 'output');

/**
 * Convierte imagen local a base64 data URI
 */
function imageToBase64(imagePath) {
  try {
    let filePath = imagePath;
    if (imagePath.startsWith('file://')) {
      filePath = imagePath.replace('file://', '');
    }

    if (!existsSync(filePath)) {
      console.warn(`⚠️  Imagen no encontrada: ${filePath}`);
      return imagePath;
    }

    const buffer = readFileSync(filePath);
    const ext = filePath.split('.').pop().toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' :
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
        ext === 'webp' ? 'image/webp' : 'image/png';

    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.warn(`⚠️  Error leyendo imagen: ${imagePath}`, error.message);
    return imagePath;
  }
}

/**
 * Convierte Markdown básico a HTML
 */
function mdToHTML(text, outputFolder) {
  if (!text) return '';

  let html = text;

  // 1. Tablas Markdown (Misma lógica que en Slidev)
  const tableRegex = /\|(.+)\|\n\|([-:| ]+)\|\n((?:\|.+\|\n?)+)/g;
  html = html.replace(tableRegex, (match, header, separator, body) => {
    const headers = header.split('|').map(s => s.trim()).filter(s => s);
    const rows = body.trim().split('\n').map(row =>
      row.split('|').map(s => s.trim()).filter(s => s)
    );

    let tableHtml = '<div class="table-container"><table><thead><tr>';
    headers.forEach(h => { tableHtml += `<th>${h}</th>`; });
    tableHtml += '</tr></thead><tbody>';
    rows.forEach(row => {
      tableHtml += '<tr>';
      row.forEach(cell => { tableHtml += `<td>${cell}</td>`; });
      tableHtml += '</tr>';
    });
    tableHtml += '</tbody></table></div>';
    return tableHtml;
  });

  // 2. Imágenes
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    let imgSrc = url;
    if (url.startsWith('/img/')) {
      imgSrc = 'file://' + join(outputFolder, 'public', url);
    } else if (url.startsWith('/')) {
      imgSrc = 'file://' + join(BANCO_ROOT, url);
    }
    const base64Url = imageToBase64(imgSrc);
    return `<img src="${base64Url}" alt="${alt}" class="img-pregunta">`;
  });

  // 3. Formato básico (sin romper LaTeX)
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');

  // Reemplazar saltos de línea SOLO si no estamos dentro de una tabla o fórmula (simplificado)
  // Para evitar romper LaTeX, no reemplazamos \n indiscriminadamente. 
  // Usamos párrafos <p> para bloques de texto separados por \n\n

  return html.split('\n\n').map(p => {
    if (p.startsWith('<div') || p.startsWith('<table')) return p;
    return `<p>${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

/**
 * Genera HTML para PDF de examen (sin respuestas)
 */
function generateExamenHTML(taller, outputFolder) {
  let bloques = [];

  for (let b = 0; b < taller.bloques.length; b++) {
    const bloque = taller.bloques[b];
    let bloqueHTML = '';

    if (bloque.contexto && bloque.contexto.trim()) {
      const contextoClean = bloque.contexto
        .replace(/^# .*\n*/m, '')
        .replace(/---\s*$/, '');
      bloqueHTML += `<div class="contexto">${mdToHTML(contextoClean, outputFolder)}</div>`;
    }

    for (const p of bloque.preguntas) {
      const opcionesHTML = Object.entries(p.opciones)
        .map(([letra, texto]) =>
          `<div class="opcion"><span class="letra">${letra}.</span> ${mdToHTML(texto, outputFolder)}</div>`
        )
        .join('');

      const preguntaTexto = mdToHTML(p.texto || '', outputFolder);
      bloqueHTML += `
        <div class="pregunta-bloque">
          <div class="pregunta">
            <span class="numero">${p.numeroGlobal}.</span>
            ${preguntaTexto}
          </div>
          <div class="opciones">${opcionesHTML}</div>
        </div>`;
    }

    const pageBreakClass = b > 0 ? ' page-break' : '';
    bloques.push(`<div class="bloque-contexto${pageBreakClass}">${bloqueHTML}</div>`);
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>EXAMEN: ${taller.titulo}</title>
  
  <!-- KaTeX -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js"
    onload="renderMathInElement(document.body);"></script>

  <style>
    @page { size: letter; margin: 1.5cm; }
    @media print { .page-break { page-break-before: always; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.4;
      color: #000;
      padding: 20px;
    }
    /* Estilos de Tabla */
    .table-container { margin: 15px 0; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; }
    th, td { border: 1px solid #000; padding: 6px; text-align: center; }
    th { background-color: #f0f0f0; font-weight: bold; }

    .header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 15px;
      border-bottom: 2px solid #000;
    }
    .header h1 { font-size: 16pt; margin-bottom: 10px; }
    .header-data {
      display: flex;
      justify-content: space-between;
      font-size: 11pt;
    }
    .campo { border-bottom: 1px solid #000; min-width: 120px; display: inline-block; }
    .instrucciones {
      background: #f5f5f5;
      padding: 10px 12px;
      margin-bottom: 20px;
      border: 1px solid #ccc;
      font-size: 10pt;
    }
    .bloque-contexto { margin-bottom: 25px; }
    .contexto {
      background: #f9f9f9;
      padding: 12px;
      border-left: 3px solid #666;
      margin-bottom: 15px;
      font-size: 10pt;
    }
    .contexto p { margin-bottom: 10px; }
    .contexto pre {
      background: #eee;
      padding: 8px;
      font-size: 9pt;
      white-space: pre-wrap;
    }
    .pregunta-bloque {
      margin-bottom: 18px;
      page-break-inside: avoid;
      position: relative; /* Referencia para el número absoluto */
      padding-left: 30px; /* Espacio reservado para el "1." */
    }
    .pregunta { 
      margin-bottom: 8px; 
      display: block; /* VITAL: Block para que las tablas ocupen su línea */
    }
    .pregunta .numero { 
      position: absolute;
      left: 0;
      top: 0;
      font-weight: bold; 
    }
    .pregunta p { margin-bottom: 8px; } /* Separación entre párrafos */
    
    /* Asegurar tablas ancho completo */
    .table-container { 
      width: 100%; 
      overflow-x: auto; 
      margin: 15px 0;
    }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-bottom: 10px;
    }
    .opcion { padding: 3px 0; page-break-inside: avoid; }
    .opcion .letra { font-weight: bold; margin-right: 6px; }
    .opcion p { display: inline; } 
    .img-pregunta {
      max-width: 100%;
      height: auto;
      max-height: 350px;
      display: block;
      margin: 10px auto;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>EVALUACIÓN: ${taller.titulo}</h1>
    <div class="header-data">
      <div>Nombre: <span class="campo"></span></div>
      <div>Grado: <span class="campo" style="min-width:50px;"></span></div>
      <div>Fecha: <span class="campo" style="min-width:80px;"></span></div>
    </div>
  </div>
  <div class="instrucciones">
    <strong>Instrucciones:</strong> Selecciona la opción correcta para cada pregunta.
    Tiempo: ${taller.meta.tiempo_sugerido || 30} min.
  </div>
  ${bloques.join('\n')}
</body>
</html>`;
}

/**
 * Genera PDF usando Playwright
 */
async function generatePDF(html, outputPath) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();

  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  await page.pdf({
    path: outputPath,
    format: 'Letter',
    margin: { top: '0.5in', bottom: '0.5in', left: '0.6in', right: '0.6in' },
    printBackground: true
  });

  await browser.close();
}

/**
 * Exporta taller a PDF de examen
 * @param {Object} taller - Taller ensamblado
 * @param {string} outputFolder - Carpeta de salida del taller
 */
export async function exportExamenPDF(taller, outputFolder) {
  const examenPath = join(outputFolder, 'examen.pdf');

  console.log('📋 Generando PDF examen (sin respuestas)...');
  const html = generateExamenHTML(taller, outputFolder);
  await generatePDF(html, examenPath);
  console.log(`   ✅ ${examenPath}`);

  return examenPath;
}

export default exportExamenPDF;
