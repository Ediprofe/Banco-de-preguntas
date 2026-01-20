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
 * Obtiene las áreas disponibles (carpetas con talleres .md)
 */
function getAreas() {
    const areas = [];
    const entries = readdirSync(TALLERES_DIR, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const areaPath = join(TALLERES_DIR, entry.name);
            const talleres = readdirSync(areaPath).filter(f => f.endsWith('.md'));
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
 * Obtiene talleres de un área
 */
function getTalleres(area) {
    const areaPath = join(TALLERES_DIR, area);
    return readdirSync(areaPath).filter(f => f.endsWith('.md'));
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
        name: t,
        value: t
    }));

    const selectedTaller = await select({
        message: 'Selecciona el taller (↑↓):',
        choices: tallerChoices
    });

    const tallerPath = join(TALLERES_DIR, selectedArea, selectedTaller);
    const tallerName = basename(selectedTaller, '.md');

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

        // 1. Generar Lección Interactiva Premium (Web)
        log('🌐 Generando Lección Interactiva Premium...', 'cyan');
        const { renderInteractive } = await import('./render-interactive.mjs');
        const result = renderInteractive(taller, OUTPUT_DIR);
        log(`   ✅ Lección generada: leccion_interactiva.html`, 'green');

        // 2. Generar PDF Imprimible
        log('📄 Generando PDF de Alta Calidad...', 'cyan');
        const { renderPDF } = await import('./render-pdf.mjs');
        const pdfPath = await renderPDF(taller, result.path);

        // 3. Generar Word examen (Editable)
        log('📝 Generando Word (Editable)...', 'cyan');
        const { exportExamenWord } = await import('./render-word.mjs');
        const wordPath = await exportExamenWord(taller, result.path);

        log('\n━'.repeat(50), 'cyan');
        log('✅ ¡Todo el Material Generado!', 'green');
        log('━'.repeat(50), 'cyan');
        log(`📂 Carpeta: ${result.path}`, 'dim');
        log(`🌐 Web Interactiva: leccion_interactiva.html`, 'dim');
        if (pdfPath) log(`📄 PDF Imprimible: ${basename(pdfPath)}`, 'dim');
        if (wordPath) log(`📝 Word Editable: ${basename(wordPath)}`, 'dim');
        console.log();

        // Abrir automáticamente la lección interactiva y la carpeta
        execSync(`open "${result.htmlPath}"`);
        execSync(`open "${result.path}"`);

    } catch (error) {
        log(`❌ Error: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    }
}

main().catch(console.error);

