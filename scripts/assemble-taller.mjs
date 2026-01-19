#!/usr/bin/env node
/**
 * assemble-taller.mjs
 * 
 * Lee un archivo de taller YAML, carga los ItemSets referenciados,
 * renumera las preguntas globalmente, y genera un JSON intermedio.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseItemSet } from './parse-itemset.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BANCO_ROOT = join(__dirname, '..');
const ITEMS_DIR = join(BANCO_ROOT, 'items');

/**
 * Parsea un archivo YAML simple (sin dependencias externas)
 */
function parseYAML(content) {
    const result = {
        seleccion: [],
        outputs: {},
        meta: {}
    };

    const lines = content.split('\n');
    let currentSection = null;
    let currentSubSection = null;

    for (const line of lines) {
        // Ignorar comentarios y líneas vacías
        if (line.trim().startsWith('#') || !line.trim()) continue;

        // Detectar secciones principales
        if (line.match(/^(\w+):$/)) {
            currentSection = line.replace(':', '').trim();
            currentSubSection = null;
            continue;
        }

        // Detectar key: value en raíz
        const rootKV = line.match(/^(\w+):\s*(.+)$/);
        if (rootKV && !currentSection) {
            const key = rootKV[1];
            let value = rootKV[2].trim().replace(/^["']|["']$/g, '');
            if (/^\d+$/.test(value)) value = parseInt(value);
            if (value === 'true') value = true;
            if (value === 'false') value = false;
            result[key] = value;
            continue;
        }

        // Detectar items de lista en selección
        if (currentSection === 'seleccion' && line.match(/^\s+-\s+/)) {
            const item = line.replace(/^\s+-\s+/, '').split('#')[0].trim();
            result.seleccion.push(item);
            continue;
        }

        // Detectar subsecciones de outputs
        if (currentSection === 'outputs') {
            const subMatch = line.match(/^\s+(\w+):(.*)$/);
            if (subMatch) {
                const key = subMatch[1];
                const value = subMatch[2].trim();

                if (!value) {
                    // Es una subsección con propiedades anidadas
                    currentSubSection = key;
                    result.outputs[key] = {};
                } else {
                    // Es un key: value simple
                    let parsedValue = value.replace(/^["']|["']$/g, '');
                    if (/^\d+$/.test(parsedValue)) parsedValue = parseInt(parsedValue);
                    if (parsedValue === 'true') parsedValue = true;
                    if (parsedValue === 'false') parsedValue = false;

                    if (currentSubSection) {
                        result.outputs[currentSubSection][key] = parsedValue;
                    } else {
                        result.outputs[key] = parsedValue;
                    }
                }
                continue;
            }

            // Propiedades anidadas dentro de una subsección
            const nestedMatch = line.match(/^\s{4,}(\w+):\s*(.+)$/);
            if (nestedMatch && currentSubSection) {
                const key = nestedMatch[1];
                let value = nestedMatch[2].trim();
                if (/^\d+$/.test(value)) value = parseInt(value);
                if (value === 'true') value = true;
                if (value === 'false') value = false;
                result.outputs[currentSubSection][key] = value;
            }
        }

        // Detectar propiedades de meta
        if (currentSection === 'meta') {
            const metaMatch = line.match(/^\s+(\w+):\s*(.+)$/);
            if (metaMatch) {
                const key = metaMatch[1];
                let value = metaMatch[2].trim();
                if (/^\d+$/.test(value)) value = parseInt(value);
                result.meta[key] = value;
            }
        }
    }

    return result;
}

/**
 * Renumera el texto del contexto
 * "PREGUNTAS 1 A 3" → "PREGUNTAS 7 A 9"
 */
function renumerarContexto(contexto, inicioGlobal, totalItems) {
    const finGlobal = inicioGlobal + totalItems - 1;

    let resultado = contexto;

    // Patrones a buscar y reemplazar
    const patrones = [
        { regex: /PREGUNTAS?\s+\d+\s+A\s+\d+/gi, reemplazo: `PREGUNTAS ${inicioGlobal} A ${finGlobal}` },
        { regex: /PREGUNTAS?\s+\d+\s+AL\s+\d+/gi, reemplazo: `PREGUNTAS ${inicioGlobal} AL ${finGlobal}` },
        { regex: /PREGUNTAS?\s+\d+-\d+/gi, reemplazo: `PREGUNTAS ${inicioGlobal}-${finGlobal}` },
        { regex: /PREGUNTAS?\s+\d+\s+Y\s+\d+/gi, reemplazo: `PREGUNTAS ${inicioGlobal} Y ${finGlobal}` },
    ];

    for (const { regex, reemplazo } of patrones) {
        resultado = resultado.replace(regex, reemplazo);
    }

    return resultado;
}

/**
 * Ensambla un taller a partir de su archivo YAML
 * @param {string} tallerPath - Ruta al archivo .yml del taller
 * @returns {Object} Taller ensamblado con preguntas renumeradas
 */
export function assembleTaller(tallerPath) {
    // Leer y parsear YAML
    const yamlContent = readFileSync(tallerPath, 'utf-8');
    const config = parseYAML(yamlContent);

    // Validar que hay selección
    if (!config.seleccion || config.seleccion.length === 0) {
        throw new Error(`El taller no tiene ItemSets seleccionados`);
    }

    // Verificar duplicados
    const idsVistos = new Set();
    for (const itemsetId of config.seleccion) {
        if (idsVistos.has(itemsetId)) {
            throw new Error(`ItemSet duplicado: ${itemsetId}`);
        }
        idsVistos.add(itemsetId);
    }

    // Cargar y procesar cada ItemSet
    const bloques = [];
    let numeroGlobal = 1;

    for (const itemsetId of config.seleccion) {
        const itemsetPath = join(ITEMS_DIR, itemsetId + '.md');

        if (!existsSync(itemsetPath)) {
            throw new Error(`ItemSet no encontrado: ${itemsetPath}`);
        }

        // Parsear ItemSet
        const itemset = parseItemSet(itemsetPath);

        // Renumerar contexto
        const contextoRenumerado = renumerarContexto(
            itemset.contexto,
            numeroGlobal,
            itemset.preguntas.length
        );

        // Renumerar preguntas
        const preguntasRenumeradas = itemset.preguntas.map(p => ({
            ...p,
            numeroGlobal: numeroGlobal++
        }));

        bloques.push({
            id: itemset.id,
            contexto: contextoRenumerado,
            preguntas: preguntasRenumeradas
        });
    }

    // Calcular total de ítems
    const totalItems = bloques.reduce((sum, b) => sum + b.preguntas.length, 0);

    // Validar objetivo
    if (config.meta.objetivo_items && totalItems !== config.meta.objetivo_items) {
        console.warn(`⚠️  Advertencia: objetivo_items es ${config.meta.objetivo_items} pero hay ${totalItems} ítems`);
    }

    return {
        id: config.id,
        titulo: config.titulo,
        descripcion: config.descripcion || '',
        meta: config.meta,
        outputs: config.outputs,
        totalItems,
        bloques
    };
}

/**
 * Aplana los bloques en una lista simple de ítems
 */
export function flattenItems(taller) {
    const items = [];

    for (const bloque of taller.bloques) {
        for (const pregunta of bloque.preguntas) {
            items.push({
                numero: pregunta.numeroGlobal,
                contexto: bloque.contexto,
                texto: pregunta.texto,
                opciones: pregunta.opciones,
                respuestaCorrecta: pregunta.respuestaCorrecta,
                explicacion: pregunta.explicacion
            });
        }
    }

    return items;
}

// CLI para testing
if (process.argv[1].endsWith('assemble-taller.mjs') && process.argv[2]) {
    const tallerPath = process.argv[2];
    const taller = assembleTaller(tallerPath);
    console.log(JSON.stringify(taller, null, 2));
}

export default assembleTaller;
