import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

/**
 * Genera un PDF imprimible económico en doble columna.
 * - Sin respuestas ni retroalimentación
 * - Sin sección "Resumen de conceptos"
 * - Tipografía compacta (9pt)
 * - Márgenes estrechos
 * - Soporte para marcador <!-- imprimible: ancho-completo -->
 */
export async function renderPDFImprimible(taller, outputDir) {
    const htmlPath = join(outputDir, 'imprimible_temp.html');
    const pdfPath = join(outputDir, `${taller.id}_imprimible.pdf`);

    // 1. Generar HTML optimizado para impresión económica
    const html = generatePrintableHTML(taller);
    writeFileSync(htmlPath, html);

    // 2. Convertir a PDF usando Playwright
    try {
        const browser = await chromium.launch();
        const page = await browser.newPage();

        await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

        // Esperar que KaTeX renderice las fórmulas
        await page.waitForTimeout(2000);

        // Generar PDF con márgenes estrechos
        await page.pdf({
            path: pdfPath,
            format: 'Letter',
            printBackground: true,
            margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' }
        });

        await browser.close();
        console.log(`   ✅ PDF Imprimible generado: ${taller.id}_imprimible.pdf`);
        return pdfPath;
    } catch (e) {
        console.error('Error generando PDF Imprimible:', e);
        return null;
    } finally {
        // Limpiar HTML temporal
        if (existsSync(htmlPath)) {
            const { execSync } = await import('child_process');
            try { execSync(`rm "${htmlPath}"`); } catch (e) { }
        }
    }
}

function processMarkdown(text) {
    if (!text) return '';
    let html = text
        // Imágenes
        .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
            const filename = src.split('/').pop();
            return `<div class="img-container"><img src="img/${filename}" alt="${alt}"></div>`;
        })
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Tablas
        .replace(/\|(.+)\|\s*\n\s*\|([-:| ]+)\|\s*\n\s*((?:\|.+\|\s*\n?)+)/g, (match, header, separator, body) => {
            const headers = header.split('|').map(s => s.trim()).filter(s => s);
            const rows = body.trim().split(/\r?\n/).map(row =>
                row.split('|').map(s => s.trim()).filter(s => s)
            );

            let t = '<table class="data-table"><thead><tr>';
            headers.forEach(h => t += `<th>${h}</th>`);
            t += '</tr></thead><tbody>';
            rows.forEach(r => {
                t += '<tr>';
                r.forEach(c => t += `<td>${c}</td>`);
                t += '</tr>';
            });
            t += '</tbody></table>';
            return t;
        })
        // Saltos de línea
        .split(/(<div.*?<\/div>|<table.*?<\/table>)/gs).map(part => {
            if (part.startsWith('<div') || part.startsWith('<table')) return part;
            return part
                .replace(/\r?\n\s*\r?\n/g, '<div class="paragraph-break"></div>')
                .replace(/\r?\n/g, '<br>');
        })
        .join('')
        // Eliminar bloques <details> (respuestas)
        .replace(/<details>[\s\S]*?<\/details>/g, '')
        // Eliminar comentarios HTML (excepto el marcador de ancho-completo que ya procesamos)
        .replace(/<!--(?!.*imprimible).*?-->/gs, '');

    return html;
}

function generatePrintableHTML(taller) {
    let content = '';

    // NO incluir resumen de conceptos (intencional para versión imprimible)

    taller.bloques.forEach((bloque) => {
        // Contexto del bloque (si existe)
        if (bloque.contexto && bloque.contexto.trim().length > 0) {
            // Verificar si el contexto necesita ancho completo
            const needsFullWidth = bloque.contexto.includes('<!-- imprimible: ancho-completo -->');
            const cleanContext = bloque.contexto.replace(/<!--.*?-->/gs, '');

            content += `<div class="contexto-container ${needsFullWidth ? 'full-width' : ''}">
                <div class="contexto-body">${processMarkdown(cleanContext)}</div>
            </div>`;
        }

        bloque.preguntas.forEach((pregunta) => {
            // Verificar si esta pregunta necesita ancho completo (por el raw del texto)
            const rawText = pregunta.texto || '';
            const needsFullWidth = rawText.includes('<!-- imprimible: ancho-completo -->');
            const cleanText = rawText.replace(/<!--.*?-->/gs, '');

            content += `<div class="pregunta-container ${needsFullWidth ? 'full-width' : ''}">
                <div class="pregunta-content-wrapper">
                    <div class="pregunta-num">${pregunta.numeroGlobal}.</div>
                    <div class="pregunta-texto">${processMarkdown(cleanText)}</div>
                </div>
                
                <div class="opciones">
                    ${Object.entries(pregunta.opciones).map(([letra, texto]) => `
                        <div class="opcion-item">
                            <span class="opcion-letra">${letra}.</span>
                            <span class="opcion-texto">${processMarkdown(texto)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        });
    });

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>${taller.titulo} - Versión Imprimible</title>
    <!-- KaTeX para matemáticas -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
      onload="renderMathInElement(document.body, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false}
        ]
      });"></script>

    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body { 
            font-family: 'Inter', sans-serif; 
            font-size: 9pt; 
            line-height: 1.35; 
            color: #000;
            background: white;
        }

        /* HEADER COMPACTO */
        .header-doc {
            text-align: center;
            border-bottom: 1px solid #000;
            padding-bottom: 8px;
            margin-bottom: 12px;
        }
        .titulo-doc { 
            font-size: 12pt; 
            font-weight: 700; 
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        /* CONTENEDOR DE DOBLE COLUMNA */
        .columns-container {
            column-count: 2;
            column-gap: 8mm;
            column-rule: 1px solid #ddd;
            column-fill: auto; /* Evita que se balanceen las columnas en la última página */
        }

        /* CONTEXTO */
        .contexto-container {
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 4px;
            margin-bottom: 3px;
            break-inside: avoid;
        }
        .contexto-container.full-width {
            column-span: all;
        }
        .contexto-body { font-size: 8.5pt; }

        /* PREGUNTA */
        /* PREGUNTA */
        .pregunta-container {
            margin-bottom: 2px;
            padding-bottom: 2px;
            border-bottom: 1px dotted #ccc;
            break-inside: auto;
            page-break-inside: auto;
        }
        .pregunta-container.full-width {
            column-span: all;
        }
        
        /* Flex wrapper para alinear número y texto */
        .pregunta-content-wrapper {
            display: flex;
            align-items: flex-start;
            gap: 4px; 
            margin-bottom: 2px;
            break-inside: avoid; /* Evitar que se parta el enunciado */
        }

        .pregunta-num {
            font-weight: 700;
            font-size: 10pt;
            flex-shrink: 0;
            min-width: 15px;
        }
        .pregunta-texto {
            font-size: 9pt;
            flex: 1;
        }

        /* OPCIONES */
        .opciones {
            display: flex;
            flex-direction: column;
            gap: 1px;
        }
        .opcion-item {
            display: flex;
            gap: 4px;
            font-size: 8.5pt;
        }
        .opcion-letra {
            font-weight: 600;
            min-width: 14px;
        }
        .opcion-texto { flex: 1; }

        /* IMÁGENES */
        .img-container {
            text-align: center;
            margin: 2px 0;
            line-height: 0;
        }
        .img-container img {
            width: 100%;
            height: auto;
            object-fit: contain;
            border: 1px solid #ddd;
            border-radius: 4px;
            display: block;
        }
        
        /* Imágenes dentro de contexto (compensar padding) */
        .contexto-container .img-container {
            margin-left: -6px;
            margin-right: -6px;
            width: calc(100% + 12px);
        }
        .contexto-container .img-container img {
            border-left: none;
            border-right: none;
            border-radius: 0;
            width: 100%;
        }

        .full-width .img-container img {
            width: 100%;
        }

        /* TABLAS */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8pt;
            margin: 4px 0;
        }
        .data-table th, .data-table td {
            border: 1px solid #bbb;
            padding: 3px 5px;
            text-align: left;
        }
        .data-table th {
            background: #eee;
            font-weight: 600;
        }

        /* UTILIDADES */
        .paragraph-break { height: 2px; }
        
        /* No permitir que las preguntas se corten a la mitad */
        /* MODIFICACIÓN: Se permite partir la pregunta para aprovechar espacios,
           pero se protege el contenido interno crítico (imágenes, opciones, tablas) */
        .pregunta-container, .contexto-container {
            /* break-inside: avoid; <--- ELIMINADO para permitir flujo continuo */
            break-inside: auto;
            page-break-inside: auto;
        }

        /* Protegemos los elementos internos para que no se partan */
        .img-container, 
        .data-table, 
        .opciones, 
        .pregunta-header {
            break-inside: avoid;
            page-break-inside: avoid;
        }

        /* Intentar que el título de la pregunta no quede solo abajo */
        .pregunta-header {
            break-after: avoid;
        }
    </style>
</head>
<body>
    <div class="header-doc">
        <div class="titulo-doc">${taller.titulo}</div>
    </div>
    
    <div class="columns-container">
        ${content}
    </div>
</body>
</html>`;
}

export default renderPDFImprimible;
