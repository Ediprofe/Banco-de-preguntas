#!/usr/bin/env node
/**
 * parse-itemset.mjs
 * 
 * Parsea un archivo ItemSet (Markdown) y extrae:
 * - Frontmatter (total_items)
 * - Contexto (texto antes del primer ## N.)
 * - Preguntas con opciones y respuestas
 */

import { readFileSync } from 'fs';
import { basename, dirname } from 'path';

/**
 * Parsea un archivo ItemSet y retorna un objeto estructurado
 * @param {string} filePath - Ruta absoluta al archivo .md
 * @returns {Object} ItemSet parseado
 */
export function parseItemSet(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  // 1. Extraer frontmatter
  const frontmatter = extractFrontmatter(content);
  
  // 2. Extraer contenido sin frontmatter
  const contentWithoutFrontmatter = removeFrontmatter(content);
  
  // 3. Separar contexto y preguntas
  const { contexto, preguntasRaw } = separateContextAndQuestions(contentWithoutFrontmatter);
  
  // 4. Parsear cada pregunta
  const preguntas = parsePreguntas(preguntasRaw);
  
  // 5. Inferir ID de la ruta
  const id = inferIdFromPath(filePath);
  
  return {
    id,
    path: filePath,
    totalItems: frontmatter.total_items || preguntas.length,
    contexto: contexto.trim(),
    preguntas
  };
}

/**
 * Extrae el frontmatter YAML del contenido
 */
function extractFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) return {};
  
  const yaml = frontmatterMatch[1];
  const result = {};
  
  // Parseo simple de YAML (solo key: value)
  yaml.split('\n').forEach(line => {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      // Convertir números
      if (/^\d+$/.test(value)) value = parseInt(value);
      result[key] = value;
    }
  });
  
  return result;
}

/**
 * Remueve el frontmatter del contenido
 */
function removeFrontmatter(content) {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
}

/**
 * Separa el contexto (antes de la primera pregunta) de las preguntas
 */
function separateContextAndQuestions(content) {
  // Buscar la primera pregunta (## 1. o ## N.)
  const firstQuestionMatch = content.match(/\n## \d+\./);
  
  if (!firstQuestionMatch) {
    return { contexto: content, preguntasRaw: '' };
  }
  
  const splitIndex = content.indexOf(firstQuestionMatch[0]);
  const contexto = content.substring(0, splitIndex);
  const preguntasRaw = content.substring(splitIndex);
  
  return { contexto, preguntasRaw };
}

/**
 * Parsea el bloque de preguntas
 */
function parsePreguntas(preguntasRaw) {
  if (!preguntasRaw.trim()) return [];
  
  // Dividir por ## N.
  const bloques = preguntasRaw.split(/\n(?=## \d+\.)/).filter(b => b.trim());
  
  return bloques.map(bloque => {
    // Extraer número de pregunta
    const numeroMatch = bloque.match(/^## (\d+)\./);
    const numeroLocal = numeroMatch ? parseInt(numeroMatch[1]) : 0;
    
    // Extraer texto de la pregunta (después de ## N. hasta las opciones)
    const preguntaMatch = bloque.match(/^## \d+\.\s*\n+([\s\S]*?)(?=\n- [A-D]\.)/);
    const textoPregunta = preguntaMatch ? preguntaMatch[1].trim() : '';
    
    // Extraer opciones
    const opciones = {};
    const opcionesMatch = bloque.matchAll(/- ([A-D])\.\s*(.+)/g);
    for (const match of opcionesMatch) {
      opciones[match[1]] = match[2].trim();
    }
    
    // Extraer respuesta del details
    const respuestaMatch = bloque.match(/\*\*Respuesta:\s*([A-D])\*\*/i) ||
                           bloque.match(/\*\*Respuesta correcta:\s*([A-D])\*\*/i);
    const respuestaCorrecta = respuestaMatch ? respuestaMatch[1] : '';
    
    // Extraer explicación (todo lo que está después de **Respuesta: X** hasta </details>)
    const explicacionMatch = bloque.match(/\*\*Respuesta[^*]*\*\*\s*\n+([\s\S]*?)(?=<\/details>)/i);
    const explicacion = explicacionMatch ? explicacionMatch[1].trim() : '';
    
    return {
      numeroLocal,
      texto: textoPregunta,
      opciones,
      respuestaCorrecta,
      explicacion
    };
  });
}

/**
 * Infiere el ID del ItemSet a partir de su ruta
 * Ejemplo: /path/to/items/ciencias/celula/icfes-2023/01-osmosis.md
 * ID: ciencias/celula/icfes-2023/01-osmosis
 */
function inferIdFromPath(filePath) {
  // Buscar "items/" en la ruta y tomar todo lo que viene después
  const itemsIndex = filePath.indexOf('/items/');
  if (itemsIndex === -1) {
    // Fallback: usar nombre de archivo sin extensión
    return basename(filePath, '.md');
  }
  
  const relativePath = filePath.substring(itemsIndex + 7); // +7 para saltar "/items/"
  return relativePath.replace(/\.md$/, '');
}

// CLI para testing
if (process.argv[1].endsWith('parse-itemset.mjs') && process.argv[2]) {
  const result = parseItemSet(process.argv[2]);
  console.log(JSON.stringify(result, null, 2));
}

export default parseItemSet;
