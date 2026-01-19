#!/usr/bin/env node
/**
 * menu.mjs
 * 
 * Menú interactivo para banco-saber.
 */

import { readdirSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BANCO_ROOT = join(__dirname, '..');
const TALLERES_DIR = join(BANCO_ROOT, 'talleres');

// Colores para console
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    bold: '\x1b[1m'
};

function log(msg, color = 'reset') {
    console.log(`${colors[color]}${msg}${colors.reset}`);
}

function question(prompt) {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(prompt, answer => {
            rl.close();
            resolve(answer);
        });
    });
}

async function main() {
    console.clear();
    log('━'.repeat(50), 'cyan');
    log('📚 BANCO SABER - Sistema de Talleres', 'bold');
    log('━'.repeat(50), 'cyan');
    console.log();

    // Listar talleres disponibles
    const talleres = readdirSync(TALLERES_DIR)
        .filter(f => f.endsWith('.yml'))
        .map(f => f.replace('.yml', ''));

    if (talleres.length === 0) {
        log('❌ No hay talleres en banco-saber/talleres/', 'red');
        process.exit(1);
    }

    log('Talleres disponibles:', 'yellow');
    talleres.forEach((t, i) => {
        log(`  ${i + 1}. ${t}`, 'cyan');
    });
    console.log();

    const choice = await question(`Selecciona un taller (1-${talleres.length}): `);
    const index = parseInt(choice) - 1;

    if (isNaN(index) || index < 0 || index >= talleres.length) {
        log('❌ Opción inválida', 'red');
        process.exit(1);
    }

    const selectedTaller = talleres[index];
    console.log();

    log(`🚀 Generando outputs para: ${selectedTaller}`, 'green');
    console.log();

    try {
        execSync(`node "${join(__dirname, 'build-slidev.mjs')}" ${selectedTaller}`, {
            stdio: 'inherit',
            cwd: BANCO_ROOT
        });
    } catch (error) {
        log(`❌ Error: ${error.message}`, 'red');
        process.exit(1);
    }
}

main();
