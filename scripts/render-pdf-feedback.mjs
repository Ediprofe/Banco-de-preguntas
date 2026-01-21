import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';

/**
 * render-pdf-feedback.mjs
 * 
 * Genera un PDF de RETROALIMENTACIÓN con:
 * - Enunciado resaltado en amarillo
 * - Opción correcta en verde con ✅
 * - Opciones incorrectas tachadas en rojo con ❌
 * - Explicación visible después de cada ítem
 */

export async function renderPDFFeedback(taller, outputDir) {
    const htmlPath = join(outputDir, 'retroalimentacion_temp.html');
    const pdfPath = join(outputDir, `${taller.id}_retroalimentacion.pdf`);

    const html = generateFeedbackHTML(taller);
    writeFileSync(htmlPath, html);

    try {
        const browser = await chromium.launch();
        const page = await browser.newPage();
        await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        await page.pdf({
            path: pdfPath,
            format: 'Letter',
            printBackground: true,
            margin: { top: '1.5cm', right: '1.5cm', bottom: '1.5cm', left: '1.5cm' },
            displayHeaderFooter: true,
            headerTemplate: '<div style="font-size:10px; margin-left:1.5cm; color:#666;">' + taller.titulo + ' - RETROALIMENTACIÓN</div>',
            footerTemplate: '<div style="font-size:10px; margin-left:1.5cm; width:100%; text-align:center;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></div>'
        });

        await browser.close();
        return pdfPath;
    } catch (e) {
        console.error('Error generando PDF de retroalimentación:', e);
        return null;
    } finally {
        const { execSync } = await import('child_process');
        if (existsSync(htmlPath)) {
            try { execSync(`rm "${htmlPath}"`); } catch { }
        }
    }
}

function processMarkdown(text, isFeedbackMode = false) {
    if (!text) return '';
    let html = text
        // Imágenes
        .replace(/!\[(.*?)\]\((.*?)\)/g, (match, alt, src) => {
            const filename = src.split('/').pop();
            return `<div class="img-container"><img src="img/${filename}" alt="${alt}"></div>`;
        })
        // ==resaltado== → Solo en modo retroalimentación
        .replace(/==(.*?)==/g, (match, content) => {
            return isFeedbackMode ? `<mark class="highlight">${content}</mark>` : content;
        })
        // ~~tachado~~ → Solo en modo retroalimentación
        .replace(/~~(.*?)~~/g, (match, content) => {
            return isFeedbackMode ? `<del class="strikethrough">${content}</del>` : content;
        })
        // Negritas
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
        .split(/(<div.*?<\/div>|<table.*?<\/table>)/gs).map(part => {
            if (part.startsWith('<div') || part.startsWith('<table')) return part;
            return part
                .replace(/\r?\n\s*\r?\n/g, '<div class="paragraph-break"></div>')
                .replace(/\r?\n/g, '<br>');
        })
        .join('')
        .replace(/<details>[\s\S]*?<\/details>/g, '');
    return html;
}


function generateFeedbackHTML(taller) {
    let content = '';

    // Resumen de conceptos si existe
    if (taller.resumen) {
        content += `<div class="resumen-container">
            <div class="resumen-titulo">📋 Resumen de Conceptos</div>
            <div class="resumen-body">${processMarkdown(taller.resumen.replace(/^##\s+Resumen[^\n]*\n/, ''), true)}</div>
        </div>
        <div class="page-break"></div>`;
    }

    // Generar cada bloque con retroalimentación
    taller.bloques.forEach((bloque) => {
        // Contexto del bloque (si existe)
        if (bloque.contexto && bloque.contexto.trim()) {
            content += `<div class="contexto-container">
                <div class="contexto-body">${processMarkdown(bloque.contexto, true)}</div>
            </div>`;
        }

        bloque.preguntas.forEach((pregunta) => {
            // ═══════════════════════════════════════════════════════
            // SECCIÓN 1: PREGUNTA NORMAL (sin resaltados)
            // ═══════════════════════════════════════════════════════
            content += `<div class="pregunta-container">
                <div class="pregunta-num">Pregunta ${pregunta.numeroGlobal}</div>
                
                <!-- Contexto de la pregunta (sin marcadores) -->
                ${pregunta.contexto ? `<div class="pregunta-contexto">${processMarkdown(pregunta.contexto, false)}</div>` : ''}
                
                <!-- Enunciado (sin marcadores) -->
                <div class="pregunta-enunciado">${processMarkdown(pregunta.enunciado, false)}</div>
                
                <!-- Opciones normales -->
                <div class="opciones-grid opciones-normales">
                    ${Object.entries(pregunta.opciones).map(([letra, texto]) => {
                return `<div class="opcion-item opcion-normal">
                            <span class="opcion-letra">${letra}</span>
                            <span class="opcion-texto">${processMarkdown(texto, false)}</span>
                        </div>`;
            }).join('')}
                </div>
            </div>`;

            // ═══════════════════════════════════════════════════════
            // SECCIÓN 2: RETROALIMENTACIÓN (con resaltados ==, ~~)
            // ═══════════════════════════════════════════════════════
            content += `<div class="retroalimentacion-section">
                <div class="retro-titulo">🎯 Análisis de la Pregunta ${pregunta.numeroGlobal}</div>
                
                ${pregunta.retroalimentacion ? `
                <!-- Versión con marcadores (del <details>) -->
                <div class="retro-contenido">${processMarkdown(pregunta.retroalimentacion, true)}</div>
                ` : `
                <!-- Sin retroalimentación especial, mostrar opciones marcadas -->
                <div class="opciones-grid">
                    ${Object.entries(pregunta.opciones).map(([letra, texto]) => {
                const isCorrect = letra === pregunta.respuestaCorrecta;
                return `<div class="opcion-item ${isCorrect ? 'opcion-correcta' : 'opcion-incorrecta'}">
                            <span class="opcion-marca">${isCorrect ? '✅' : '❌'}</span>
                            <span class="opcion-letra">${letra}</span>
                            <span class="opcion-texto">${processMarkdown(texto, true)}</span>
                        </div>`;
            }).join('')}
                </div>
                `}
                
                <!-- Respuesta correcta -->
                <div class="respuesta-correcta">
                    <strong>Respuesta: ${pregunta.respuestaCorrecta}</strong>
                </div>
                
                <!-- Explicación -->
                ${pregunta.explicacion ? `<div class="explicacion-container">
                    <div class="explicacion-titulo">💡 Explicación</div>
                    <div class="explicacion-body">${processMarkdown(pregunta.explicacion, true)}</div>
                </div>` : ''}
            </div>
            <div class="page-break"></div>`;
        });
    });

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>${taller.titulo} - Retroalimentación</title>
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

        .page-break { page-break-before: always; }
        .paragraph-break { height: 8px; }
        
        /* Header */
        .header-doc { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
        .titulo-doc { font-family: 'Open Sans', sans-serif; font-size: 18pt; font-weight: 700; text-transform: uppercase; color: #1e40af; }
        .sub-doc { font-family: 'Open Sans', sans-serif; font-size: 10pt; text-transform: uppercase; letter-spacing: 1px; margin-top: 5px; color: #666; }

        /* Resumen */
        .resumen-container { 
            border: 2px solid #2563eb; 
            background-color: #eff6ff; 
            padding: 15px;
            border-radius: 8px; 
            margin-bottom: 25px;
        }
        .resumen-titulo { font-family: 'Open Sans', sans-serif; font-weight: 700; font-size: 14pt; color: #1e40af; margin-bottom: 10px; }
        .resumen-body { font-size: 11pt; }
        .resumen-body img { width: 100%; max-height: none; height: auto; margin: 10px 0; }

        /* Contexto de bloque */
        .contexto-container { 
            border: 1px solid #333; 
            background-color: #f9f9f9; 
            padding: 15px;
            border-radius: 4px; 
            margin-bottom: 20px;
        }
        .contexto-body { font-size: 11pt; text-align: justify; }

        /* Preguntas */
        .pregunta-container { margin-bottom: 20px; }
        .pregunta-num { 
            font-family: 'Open Sans', sans-serif; 
            font-weight: 700; 
            font-size: 16pt; 
            color: #1e40af; 
            margin-bottom: 10px;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 5px;
        }
        
        /* Contexto de pregunta individual */
        .pregunta-contexto { 
            font-size: 11pt; 
            margin-bottom: 15px; 
            text-align: justify;
        }
        
        /* Enunciado (sin fondo automático, usa ==marcadores==) */
        .pregunta-enunciado { 
            font-size: 12pt; 
            margin-bottom: 15px;
            padding: 10px 15px;
            border-left: 3px solid #2563eb;
            background-color: #f8fafc;
        }

        /* MARCADORES DE RETROALIMENTACIÓN */
        .highlight {
            background-color: #fef08a; /* Amarillo resaltado */
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: 600;
        }
        .strikethrough {
            text-decoration: line-through;
            color: #dc2626; /* Rojo */
            background-color: #fecaca;
            padding: 1px 3px;
            border-radius: 2px;
        }

        /* Opciones */
        .opciones-grid { 
            display: flex; 
            flex-direction: column; 
            gap: 8px; 
            margin-bottom: 20px;
        }
        .opcion-item { 
            display: flex; 
            gap: 10px; 
            padding: 10px 15px; 
            border-radius: 4px; 
            align-items: flex-start;
        }
        .opcion-correcta {
            background-color: #dcfce7; /* Verde claro */
            border: 2px solid #16a34a;
        }
        .opcion-incorrecta {
            background-color: #fee2e2; /* Rojo claro */
            border: 1px solid #dc2626;
        }
        .opcion-normal {
            background-color: #f8fafc;
            border: 1px solid #e2e8f0;
        }
        .opcion-marca { font-size: 14pt; min-width: 25px; }
        .opcion-letra { 
            font-family: 'Open Sans', sans-serif; 
            font-weight: 700; 
            min-width: 25px; 
        }
        .opcion-texto { font-family: 'Open Sans', sans-serif; font-size: 11pt; }

        /* SECCIÓN DE RETROALIMENTACIÓN */
        .retroalimentacion-section {
            background-color: #fefce8; /* Amarillo muy claro */
            border: 2px solid #eab308;
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
            margin-bottom: 20px;
        }
        .retro-titulo {
            font-family: 'Open Sans', sans-serif;
            font-weight: 700;
            font-size: 14pt;
            color: #a16207;
            margin-bottom: 15px;
            border-bottom: 2px solid #eab308;
            padding-bottom: 8px;
        }
        .retro-contenido {
            font-size: 11pt;
            line-height: 1.7;
        }
        .respuesta-correcta {
            font-family: 'Open Sans', sans-serif;
            font-size: 12pt;
            color: #16a34a;
            margin: 15px 0;
            padding: 10px;
            background-color: #dcfce7;
            border-radius: 6px;
            text-align: center;
        }

        /* Explicación */
        .explicacion-container {
            background-color: #e0f2fe; /* Azul claro */
            border: 1px solid #0ea5e9;
            border-radius: 8px;
            padding: 15px;
            margin-top: 15px;
        }
        .explicacion-titulo {
            font-family: 'Open Sans', sans-serif;
            font-weight: 700;
            font-size: 12pt;
            color: #0369a1;
            margin-bottom: 8px;
        }
        .explicacion-body { font-size: 11pt; }

        /* Tablas */
        .data-table { 
            width: 100%; 
            border-collapse: collapse; 
            margin: 10px 0;
            font-family: 'Open Sans', sans-serif; 
            font-size: 10pt; 
        }
        .data-table th { background: #eee; border: 1px solid #333; padding: 8px; font-weight: 700; text-align: center; }
        .data-table td { border: 1px solid #333; padding: 8px; text-align: center; }

        /* Imágenes */
        img { 
            max-width: 100%; 
            max-height: 350px;
            object-fit: contain;
            height: auto; 
            display: block; 
            margin: 5px auto;
        }
        .img-container { text-align: center; }
    </style>
</head>
<body>

    <div class="header-doc">
        <div class="titulo-doc">${taller.titulo}</div>
        <div class="sub-doc">📝 Guía de Retroalimentación • ${taller.meta.area || 'Material Educativo'}</div>
    </div>

    ${content}

</body>
</html>`;
}

export default renderPDFFeedback;
