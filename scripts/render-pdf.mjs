import { writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { chromium } from 'playwright';

/**
 * Genera un PDF profesional con reglas de paginación estrictas.
 */
export async function renderPDF(taller, outputDir) {
    const htmlPath = join(outputDir, 'material_imprimible.html');
    const pdfPath = join(outputDir, `${taller.id}.pdf`);

    // 1. Generar HTML optimizado para imprimir
    const html = generatePrintHTML(taller);
    writeFileSync(htmlPath, html);

    // 2. Convertir a PDF usando Chrome Headless (Playwright)
    try {
        const browser = await chromium.launch();
        const page = await browser.newPage();

        // Cargar el HTML localmente
        await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

        // Generar PDF
        await page.pdf({
            path: pdfPath,
            format: 'Letter', // Carta, estándar en Latam
            printBackground: true,
            margin: { top: '2cm', right: '2cm', bottom: '2cm', left: '2cm' },
            displayHeaderFooter: true,
            headerTemplate: '<div style="font-size:10px; margin-left:2cm; color:#666;">' + taller.titulo + '</div>',
            footerTemplate: '<div style="font-size:10px; margin-left:2cm; width:100%; text-align:center;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>'
        });

        await browser.close();
        return pdfPath;
    } catch (e) {
        console.error('Error generando PDF con Playwright:', e);
        // Fallback: Si falla Playwright, al menos tenemos el HTML
        return null;
    } finally {
        // Limpiar el HTML temporal usado para el PDF
        const { execSync } = await import('child_process');
        if (existsSync(htmlPath)) {
            try {
                execSync(`rm "${htmlPath}"`);
            } catch (rmError) {
                // Silencioso si falla el rm
            }
        }
    }
}

function processMarkdown(text) {
    if (!text) return '';
    let html = text
        // Imágenes locales
        .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
            // Aseguramos ruta relativa simple a img/
            const filename = src.split('/').pop();
            return `<div class="img-container"><img src="img/${filename}" alt="${alt}"></div>`;
        })
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
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
        // Ecuaciones (KaTeX renderizado en cliente, aquí solo las protegemos)
        // Convertimos saltos de línea (cuidando no romper HTML)
        .split(/(<div.*?<\/div>|<table.*?<\/table>)/gs).map(part => {
            return (part.startsWith('<div') || part.startsWith('<table')) ? part : part.replace(/\n/g, '<br>');
        })
        .join('')
        // Eliminar bloques <details> (respuestas)
        .replace(/<details>[\s\S]*?<\/details>/g, '');

    return html;
}

function generatePrintHTML(taller) {
    let content = '';
    let isFirstPage = true;

    taller.bloques.forEach((bloque, bIndex) => {
        let hasContext = (bloque.contexto && bloque.contexto.trim().length > 0);

        // Bloque con Contexto
        if (hasContext) {
            // Salto de página antes del contexto (excepto si es el inicio absoluto)
            if (!isFirstPage) content += '<div class="page-break"></div>';

            content += `<div class="contexto-container">
                <div class="contexto-body">${processMarkdown(bloque.contexto)}</div>
            </div>`;
            isFirstPage = false;
        }

        bloque.preguntas.forEach((pregunta, pIndex) => {
            // Regla de Paginación:
            // 1. Si hay contexto y es la pregunta 0, NO SALTAR (mantener con contexto).
            // 2. Si es pregunta 1+ del mismo bloque, SALTAR.
            // 3. Si no hubo contexto y no es el inicio absoluto, SALTAR.

            let shouldBreak = false;

            if (hasContext) {
                if (pIndex > 0) shouldBreak = true;
            } else {
                if (!isFirstPage) shouldBreak = true;
            }

            if (shouldBreak) content += '<div class="page-break"></div>';

            content += `<div class="pregunta-container">
                <div class="pregunta-num">Pregunta ${pregunta.numeroGlobal}</div>
                <div class="pregunta-texto">${processMarkdown(pregunta.texto)}</div>
                
                <div class="opciones-grid">
                    ${Object.entries(pregunta.opciones).map(([letra, texto]) => `
                        <div class="opcion-item">
                            <span class="opcion-letra">${letra}</span>
                            <span class="opcion-texto">${processMarkdown(texto)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;

            isFirstPage = false;
        });
    });

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>${taller.titulo}</title>
    <!-- KaTeX para renderizar matemáticas en el PDF -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body);"></script>

    <style>
        @import url('https://fonts.googleapis.com/css2?family=Merriweather:wght@300;400;700&family=Open+Sans:wght@400;600;700&display=swap');
        
        body { 
            font-family: 'Merriweather', serif; 
            font-size: 12pt; 
            line-height: 1.6; 
            color: #111;
            max-width: 100%;
            margin: 0;
            padding: 0;
            background: white;
        }

        /* Utilidades de Paginación */
        .page-break { page-break-before: always; }
        
        /* Estilos del Documento */
        .header-doc { text-align: center; border-bottom: 2px solid #000; padding-bottom: 20px; margin-bottom: 30px; }
        .titulo-doc { font-family: 'Open Sans', sans-serif; font-size: 18pt; font-weight: 700; text-transform: uppercase; }
        .sub-doc { font-family: 'Open Sans', sans-serif; font-size: 10pt; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px; }

        /* Contexto */
        .contexto-container { 
            border: 1px solid #333; 
            background-color: #f9f9f9; 
            padding: 20px; 
            border-radius: 4px; 
            margin-bottom: 30px; 
        }
        .label-contexto { 
            font-family: 'Open Sans', sans-serif; 
            font-size: 9pt; 
            font-weight: 700; 
            text-transform: uppercase; 
            color: #444; 
            margin-bottom: 10px; 
            border-bottom: 1px solid #ddd; 
            padding-bottom: 5px; 
        }
        .contexto-body { font-size: 11pt; text-align: justify; }

        /* Preguntas */
        .pregunta-container { 
            margin-bottom: 20px; 
            page-break-inside: avoid;
        }
        .pregunta-num { 
            font-family: 'Open Sans', sans-serif; 
            font-weight: 700; 
            font-size: 14pt; 
            color: #000; 
            margin-bottom: 10px; 
        }
        .pregunta-texto { font-size: 12pt; margin-bottom: 20px; }

        /* Opciones */
        .opciones-grid { display: flex; flex-direction: column; gap: 10px; }
        .opcion-item { 
            display: flex; 
            gap: 15px; 
            padding: 10px 15px; 
            border: 1px solid #eee; 
            border-radius: 4px; 
            page-break-inside: avoid;
        }
        .opcion-letra { 
            font-family: 'Open Sans', sans-serif; 
            font-weight: 700; 
            min-width: 25px; 
            color: #333; 
        }
        .opcion-texto { font-family: 'Open Sans', sans-serif; font-size: 11pt; }

        /* Tablas */
        .data-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 20px 0; 
            font-family: 'Open Sans', sans-serif; 
            font-size: 10pt; 
        }
        .data-table th { background: #eee; border: 1px solid #333; padding: 8px; font-weight: 700; text-align: center; }
        .data-table td { border: 1px solid #333; padding: 8px; text-align: center; }

        /* Imágenes */
        img { 
            max-width: 100%; 
            max-height: 400px; /* Limit height to help fit on page */
            object-fit: contain;
            height: auto; 
            display: block; 
            margin: 15px auto; 
        }
        .img-container { text-align: center; }

    </style>
</head>
<body>

    <div class="header-doc">
        <div class="titulo-doc">${taller.titulo}</div>
        <div class="sub-doc">${taller.meta.area || 'Material Educativo'} • ${taller.meta.unidad || 'Guía de Estudio'}</div>
    </div>

    ${content}

</body>
</html>`;
}
