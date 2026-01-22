#!/usr/bin/env node
/**
 * build-slidev.mjs
 * 
 * Genera presentación Slidev + PDF desde un taller.
 * Con menú interactivo para seleccionar área y taller.
 * 
 * Uso:
 *   npm run taller
 */

import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { select } from '@inquirer/prompts';
import { parseTallerMarkdown } from './parse-taller.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BANCO_ROOT = join(__dirname, '..');
const TALLERES_DIR = join(BANCO_ROOT, 'talleres');
const OUTPUT_DIR = join(BANCO_ROOT, 'output');

// Colores
const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    bold: '\x1b[1m',
    dim: '\x1b[2m'
};

function log(msg, color = 'reset') {
    console.log(`${c[color]}${msg}${c.reset}`);
}

// Iconos por área
const areaIcons = {
    ciencias: '🌿',
    quimica: '🧪',
    fisica: '⚡',
    matematicas: '🧮'
};

/**
 * Obtiene áreas disponibles con conteo de talleres
 */
function getAreas() {
    const areas = [];
    const entries = readdirSync(TALLERES_DIR, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const areaPath = join(TALLERES_DIR, entry.name);
            const talleres = getTalleres(entry.name);
            if (talleres.length > 0) {
                areas.push({
                    name: entry.name,
                    count: talleres.length
                });
            }
        }
    }

    return areas;
}

/**
 * Obtiene talleres de un área.
 * Soporta dos formatos:
 *   1. Carpeta con taller.md (nuevo formato cápsula)
 *   2. Archivo .md suelto (legacy)
 */
function getTalleres(area) {
    const areaPath = join(TALLERES_DIR, area);
    const entries = readdirSync(areaPath, { withFileTypes: true });
    const talleres = [];

    for (const entry of entries) {
        if (entry.isDirectory()) {
            // Nuevo formato: carpeta con taller.md
            const tallerMdPath = join(areaPath, entry.name, 'taller.md');
            if (existsSync(tallerMdPath)) {
                talleres.push({
                    name: entry.name,
                    path: tallerMdPath,
                    isFolder: true
                });
            }
        } else if (entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
            // Legacy: archivo .md suelto
            talleres.push({
                name: entry.name.replace('.md', ''),
                path: join(areaPath, entry.name),
                isFolder: false
            });
        }
    }

    return talleres;
}

async function main() {
    console.clear();
    log('━'.repeat(50), 'cyan');
    log('📚 GENERADOR DE TALLERES', 'bold');
    log('━'.repeat(50), 'cyan');
    console.log();

    // Obtener áreas disponibles
    const areas = getAreas();

    if (areas.length === 0) {
        log('❌ No hay talleres disponibles.', 'red');
        log('   Crea un archivo .md en talleres/{area}/', 'dim');
        log('   Ejemplo: talleres/ciencias/mi-taller.md', 'dim');
        process.exit(1);
    }

    // Menú de áreas
    const areaChoices = areas.map(a => ({
        name: `${areaIcons[a.name] || '📁'} ${a.name.charAt(0).toUpperCase() + a.name.slice(1)} (${a.count} talleres)`,
        value: a.name
    }));

    const selectedArea = await select({
        message: 'Selecciona el área (↑↓):',
        choices: areaChoices
    });

    // Menú de talleres
    const talleres = getTalleres(selectedArea);
    const tallerChoices = talleres.map(t => ({
        name: t.name,
        value: t
    }));

    const selectedTaller = await select({
        message: 'Selecciona el taller (↑↓):',
        choices: tallerChoices
    });

    const tallerPath = selectedTaller.path;
    const tallerName = selectedTaller.name;

    console.log();
    log('━'.repeat(50), 'cyan');
    log(`📦 GENERANDO: ${tallerName}`, 'bold');
    log('━'.repeat(50), 'cyan');
    console.log();

    try {
        // Parsear taller markdown
        log('📖 Parseando taller...', 'cyan');
        const taller = parseTallerMarkdown(tallerPath);
        log(`   ✅ ${taller.titulo} (${taller.totalItems} preguntas)`, 'green');
        console.log();

        // Definir carpeta de salida DENTRO del taller
        const outputDir = join(taller.tallerDir, 'output');

        // Limpiar y recrear carpeta output
        execSync(`rm -rf "${outputDir}"`);
        mkdirSync(outputDir, { recursive: true });

        // 1. Generar Lección Interactiva Premium (Web)
        log('🌐 Generando Lección Interactiva Premium...', 'cyan');
        const { renderInteractive } = await import('./render-interactive.mjs');
        const result = await renderInteractive(taller, outputDir);
        log(`   ✅ Lección generada: leccion_interactiva.html`, 'green');

        // 2. Generar PDF Imprimible
        log('📄 Generando PDF de Alta Calidad...', 'cyan');
        const { renderPDF } = await import('./render-pdf.mjs');
        const pdfPath = await renderPDF(taller, outputDir);

        // 3. Generar Word examen (Editable)
        log('📝 Generando Word (Editable)...', 'cyan');
        const { exportExamenWord } = await import('./render-word.mjs');
        const wordPath = await exportExamenWord(taller, outputDir);

        // 4. Generar PDF de Retroalimentación
        log('📋 Generando PDF de Retroalimentación...', 'cyan');
        const { renderPDFFeedback } = await import('./render-pdf-feedback.mjs');
        const feedbackPdfPath = await renderPDFFeedback(taller, outputDir);
        if (feedbackPdfPath) log(`   ✅ PDF Retroalimentación generado`, 'green');

        // 5. Generar PDF Imprimible Económico (Doble Columna)
        log('📑 Generando PDF Imprimible Económico...', 'cyan');
        const { renderPDFImprimible } = await import('./render-pdf-imprimible.mjs');
        const imprimiblePdfPath = await renderPDFImprimible(taller, outputDir);

        log('\n━'.repeat(50), 'cyan');
        log('✅ ¡Todo el Material Generado!', 'green');
        log('━'.repeat(50), 'cyan');
        log(`📂 Carpeta: ${outputDir}`, 'dim');
        log(`🌐 Web Interactiva: leccion_interactiva.html`, 'dim');
        if (pdfPath) log(`📄 PDF Imprimible: ${basename(pdfPath)}`, 'dim');
        if (feedbackPdfPath) log(`📋 PDF Retroalimentación: ${basename(feedbackPdfPath)}`, 'dim');
        if (imprimiblePdfPath) log(`📑 PDF Económico (2 columnas): ${basename(imprimiblePdfPath)}`, 'dim');
        if (wordPath) log(`📝 Word Editable: ${basename(wordPath)}`, 'dim');
        console.log();

        // Abrir automáticamente la lección interactiva y la carpeta
        execSync(`open "${result.htmlPath}"`);
        execSync(`open "${outputDir}"`);

    } catch (error) {
        log(`❌ Error: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    }
}

main().catch(console.error);

