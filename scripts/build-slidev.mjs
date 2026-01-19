#!/usr/bin/env node
/**
 * build-slidev.mjs
 * 
 * Genera una presentación Slidev desde un taller.
 * 
 * Uso:
 *   node scripts/build-slidev.mjs <nombre-taller>
 *   npm run saber:slidev <nombre-taller>
 */

import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { assembleTaller } from './assemble-taller.mjs';
import { renderSlidev } from './render-slidev.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BANCO_ROOT = join(__dirname, '..');
const TALLERES_DIR = join(BANCO_ROOT, 'talleres');
const OUTPUT_DIR = join(BANCO_ROOT, 'output');

// Colores
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    bold: '\x1b[1m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function main() {
    const tallerName = process.argv[2];
    const shouldExport = process.argv.includes('--export');
    const shouldOpen = !process.argv.includes('--no-open');

    if (!tallerName) {
        log('❌ Uso: node scripts/build-slidev.mjs <nombre-taller> [--export] [--no-open]', 'red');
        log('   --export: Exportar a PDF automáticamente', 'cyan');
        log('   --no-open: No abrir el navegador', 'cyan');
        process.exit(1);
    }

    const tallerPath = join(TALLERES_DIR, `${tallerName}.yml`);

    if (!existsSync(tallerPath)) {
        log(`❌ Taller no encontrado: ${tallerPath}`, 'red');
        process.exit(1);
    }

    log('━'.repeat(60), 'cyan');
    log(`🎨 GENERANDO PRESENTACIÓN SLIDEV: ${tallerName}`, 'bold');
    log('━'.repeat(60), 'cyan');
    console.log();

    try {
        // Ensamblar taller
        log('📦 Ensamblando taller...', 'cyan');
        const taller = assembleTaller(tallerPath);
        log(`   ✅ ${taller.totalItems} ítems`, 'green');
        console.log();

        // Generar Slidev
        const result = renderSlidev(taller, OUTPUT_DIR);
        console.log();

        // Generar PDF examen (sin respuestas) en la misma carpeta
        const { exportExamenPDF } = await import('./render-pdf.mjs');
        await exportExamenPDF(taller, result.path);
        console.log();

        log('━'.repeat(60), 'cyan');
        log('✅ ¡Taller generado!', 'green');
        log('━'.repeat(60), 'cyan');
        console.log();

        log(`📂 Carpeta: ${result.path}`, 'cyan');
        log(`🎬 Presentación: slides.md`, 'cyan');
        log(`📋 PDF examen: examen.pdf`, 'cyan');
        console.log();

        // Mostrar instrucciones
        log('🚀 Para iniciar la presentación:', 'yellow');
        log(`   cd ${result.path} && npx slidev`, 'cyan');
        console.log();

        // Si --export, exportar automáticamente
        if (shouldExport) {
            log('📄 Exportando a PDF...', 'yellow');
            try {
                execSync('npx slidev export --output presentacion.pdf', {
                    cwd: result.path,
                    stdio: 'inherit'
                });
                log(`   ✅ ${join(result.path, 'presentacion.pdf')}`, 'green');
            } catch (e) {
                log('   ⚠️  Error exportando PDF (puede requerir instalación)', 'yellow');
            }
        }

        // Si no --no-open, iniciar servidor
        if (shouldOpen && !shouldExport) {
            log('🌐 Iniciando servidor Slidev...', 'yellow');
            console.log();
            execSync('npx -y @slidev/cli@latest --open', {
                cwd: result.path,
                stdio: 'inherit'
            });
        }

    } catch (error) {
        log(`❌ Error: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    }
}

main();
