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

import { existsSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { select } from '@inquirer/prompts';
import { renderSlidev } from './render-slidev.mjs';
import { parseTallerMarkdown } from './parse-taller.mjs';
import { assembleTaller } from './assemble-taller.mjs';

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

        // Generar Slidev
        const result = renderSlidev(taller, OUTPUT_DIR);
        console.log();

        // Generar Word examen (Sustituye al PDF)
        const { exportExamenWord } = await import('./render-word.mjs');
        await exportExamenWord(taller, result.path);
        console.log();

        log('━'.repeat(50), 'cyan');
        log('✅ ¡Taller generado!', 'green');
        log('━'.repeat(50), 'cyan');
        console.log();

        log(`📂 Carpeta: ${result.path}`, 'cyan');
        log(`🎬 Presentación: slides.md`, 'dim');
        log(`📋 Word examen: ${taller.id}.docx`, 'dim');
        console.log();

        log('🚀 Para ver la presentación:', 'yellow');
        log(`   cd ${result.path} && npx slidev`, 'cyan');
        console.log();

        // Iniciar servidor automáticamente
        log('🌐 Iniciando servidor Slidev...', 'yellow');
        execSync('npx -y @slidev/cli@latest --open', {
            cwd: result.path,
            stdio: 'inherit'
        });

    } catch (error) {
        log(`❌ Error: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    }
}

main().catch(console.error);
