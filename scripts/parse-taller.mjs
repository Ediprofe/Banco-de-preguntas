#!/usr/bin/env node
/**
 * parse-taller.mjs
 * 
 * Parsea un archivo Markdown de taller directo (sin frontmatter).
 * Extrae título del H1, área de la carpeta, preguntas del contenido.
 */

import { readFileSync } from 'fs';
import { basename, dirname } from 'path';

/**
 * Parsea un taller desde un archivo Markdown
 * @param {string} filePath - Ruta al archivo .md
 * @returns {Object} Taller estructurado
 */
export function parseTallerMarkdown(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    const fileName = basename(filePath, '.md');
    const area = basename(dirname(filePath)); // Carpeta padre = área

    // Extraer título del primer H1
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const titulo = titleMatch ? titleMatch[1].trim() : fileName;

    // Dividir por bloques de contexto (separados por ---)
    const sections = content.split(/\n---\n/).filter(s => s.trim());

    const bloques = [];
    let currentBloque = null;
    let numeroGlobal = 0;

    for (const section of sections) {
        // Verificar si la sección comienza con una pregunta
        let isQuestion = section.match(/^##\s*\d+\./m);

        if (isQuestion) {
            // Si es pregunta, puede haber MÚLTIPLES preguntas en este bloque si no usaron separadores ---
            // Dividimos por "## numero." (usando lookahead para no perder el delimitador si es posible, pero split es más fácil)

            // Estrategia: Split por `\n## ` pero conservando el delimitador es complejo en JS split.
            // Mejor: Buscar todos las posiciones de `\n## ` y cortar.

            const rawQuestions = section.split(/\n(?=##\s*\d+\.)/);

            for (const qRaw of rawQuestions) {
                // Verificar que sea realmente una pregunta (puede haber basura al inicio si el split falló)
                if (qRaw.match(/^##\s*\d+\./) || qRaw.match(/^\s*##\s*\d+\./)) {
                    numeroGlobal++;
                    // Importante: parsePregunta espera el texto crudo de esa pregunta
                    const pregunta = parsePregunta(qRaw, numeroGlobal);

                    if (!currentBloque) {
                        currentBloque = { contexto: '', preguntas: [] };
                    }
                    currentBloque.preguntas.push(pregunta);
                }
            }

        } else {
            // Es un bloque de contexto
            if (currentBloque && currentBloque.preguntas.length > 0) {
                bloques.push(currentBloque);
            }
            currentBloque = {
                contexto: section.replace(/^#\s+.+\n/, '').trim(), // Quitar título principal
                preguntas: []
            };
        }
    }

    // Agregar último bloque
    if (currentBloque && currentBloque.preguntas.length > 0) {
        bloques.push(currentBloque);
    }

    // Detectar si es estructura de carpeta (taller.md dentro de carpeta)
    // o archivo suelto (old style)
    const tallerDir = fileName === 'taller' ? dirname(filePath) : dirname(filePath);
    const tallerId = fileName === 'taller' ? basename(dirname(filePath)) : fileName;

    return {
        id: tallerId,
        titulo,
        tallerDir, // Ruta a la carpeta del taller (para imágenes locales)
        meta: {
            area,
            unidad: tallerId,
            tiempo_sugerido: Math.max(10, numeroGlobal * 3)
        },
        bloques,
        totalItems: numeroGlobal
    };
}

/**
 * Parsea una sección de pregunta
 */
function parsePregunta(section, numeroGlobal) {
    const lines = section.split('\n');

    // Extraer texto de la pregunta (después del ## número)
    let texto = '';
    let inOpciones = false;
    const opciones = {};
    let respuestaCorrecta = '';
    let explicacion = '';

    // Buscar el texto después del encabezado
    const headerIndex = lines.findIndex(l => l.match(/^##\s*\d+\./));

    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i];

        // ¿Es opción?
        const opcionMatch = line.match(/^-\s*([A-D])\.\s*(.+)$/);
        if (opcionMatch) {
            inOpciones = true;
            opciones[opcionMatch[1]] = opcionMatch[2].trim();
            continue;
        }

        // ¿Es inicio de respuesta?
        if (line.includes('<details>')) {
            // Buscar respuesta correcta
            const restContent = lines.slice(i).join('\n');
            const respMatch = restContent.match(/\*\*Respuesta:\s*([A-D])\*\*/);
            if (respMatch) {
                respuestaCorrecta = respMatch[1];
            }

            // Extraer explicación
            const explMatch = restContent.match(/<\/summary>\s*\n\n\*\*Respuesta:[^*]+\*\*\s*\n\n([\s\S]*?)<\/details>/);
            if (explMatch) {
                explicacion = explMatch[1].trim();
            }
            break;
        }

        // Es texto de la pregunta (mantener líneas vacías para Markdown/Tablas)
        if (!inOpciones) {
            texto += (texto ? '\n' : '') + line;
        }
    }

    return {
        numeroGlobal,
        texto: texto.trim(),
        opciones,
        respuestaCorrecta,
        explicacion
    };
}

export default parseTallerMarkdown;
