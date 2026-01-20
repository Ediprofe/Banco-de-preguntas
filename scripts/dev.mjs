#!/usr/bin/env node
/**
 * dev.mjs
 * 
 * Modo de desarrollo con Hot Reload.
 * Lanza un servidor local y regenera la lección en cada guardado.
 * 
 * Uso:
 *   npm run dev
 */

import { existsSync, readdirSync, watch, readFileSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawn, exec } from 'child_process';
import { select } from '@inquirer/prompts';
import { parseTallerMarkdown } from './parse-taller.mjs';
import { renderInteractive } from './render-interactive.mjs';
import http from 'http';

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
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    dim: '\x1b[2m',
    bold: '\x1b[1m'
};

const log = (msg, color = 'reset') => console.log(`${c[color]}${msg}${c.reset}`);

// Banner
function showBanner() {
    console.log();
    log('━'.repeat(50), 'cyan');
    log('🔥 MODO DESARROLLO (Live Reload)', 'bold');
    log('━'.repeat(50), 'cyan');
    console.log();
}

// Obtener lista de talleres por área (soporta ambos formatos)
function getTalleresByArea() {
    const areas = readdirSync(TALLERES_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

    const talleresMap = {};
    for (const area of areas) {
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
                        path: tallerMdPath
                    });
                }
            } else if (entry.name.endsWith('.md') && !entry.name.startsWith('.')) {
                // Legacy: archivo .md suelto
                talleres.push({
                    name: entry.name.replace('.md', ''),
                    path: join(areaPath, entry.name)
                });
            }
        }

        if (talleres.length > 0) {
            talleresMap[area] = talleres;
        }
    }
    return talleresMap;
}

// Servidor HTTP simple para servir el output
function startServer(outputPath, port = 3000) {
    const server = http.createServer((req, res) => {
        let filePath = join(outputPath, req.url === '/' ? 'leccion_interactiva.html' : req.url);

        if (!existsSync(filePath)) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        const ext = filePath.split('.').pop();
        const mimeTypes = {
            'html': 'text/html',
            'css': 'text/css',
            'js': 'application/javascript',
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'webp': 'image/webp',
            'svg': 'image/svg+xml',
            'pdf': 'application/pdf'
        };

        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
        res.end(readFileSync(filePath));
    });

    server.listen(port, () => {
        log(`\n🌐 Servidor: http://localhost:${port}`, 'green');
        log(`   Abriendo navegador...`, 'dim');
        exec(`open http://localhost:${port}`);
    });

    return server;
}

// Regenerar la lección (output dentro de la carpeta del taller)
function regenerate(tallerPath) {
    try {
        const taller = parseTallerMarkdown(tallerPath);
        const outputDir = join(taller.tallerDir, 'output');
        renderInteractive(taller, outputDir);
        log(`   ✅ Regenerado: ${new Date().toLocaleTimeString()}`, 'green');
        return { success: true, outputDir };
    } catch (e) {
        log(`   ❌ Error: ${e.message}`, 'red');
        return { success: false };
    }
}

async function main() {
    showBanner();

    // 1. Selección de área y taller
    const talleresMap = getTalleresByArea();
    const areaChoices = Object.keys(talleresMap).map(area => ({
        name: `📂 ${area.charAt(0).toUpperCase() + area.slice(1)} (${talleresMap[area].length})`,
        value: area
    }));

    const selectedArea = await select({
        message: 'Selecciona el área:',
        choices: areaChoices
    });

    const tallerChoices = talleresMap[selectedArea].map(t => ({
        name: t.name,
        value: t
    }));

    const selectedTaller = await select({
        message: 'Selecciona el taller:',
        choices: tallerChoices
    });

    const tallerPath = selectedTaller.path;
    const tallerName = selectedTaller.name;

    // 2. Generación inicial
    log('\n📖 Generación inicial...', 'cyan');
    const result = regenerate(tallerPath);
    if (!result.success) {
        process.exit(1);
    }

    // 3. Iniciar servidor (en la carpeta output del taller)
    const server = startServer(result.outputDir);

    // 4. Iniciar watcher
    log(`\n👀 Observando cambios en: ${basename(tallerPath)}`, 'yellow');
    log(`   Guarda el archivo (Cmd+S) para ver los cambios al instante.`, 'dim');
    log(`   Presiona Ctrl+C para salir.\n`, 'dim');

    let debounce = null;
    watch(tallerPath, (eventType) => {
        if (eventType === 'change') {
            // Debounce para evitar múltiples regeneraciones
            if (debounce) clearTimeout(debounce);
            debounce = setTimeout(() => {
                log(`\n🔄 Cambio detectado...`, 'yellow');
                regenerate(tallerPath);
            }, 300);
        }
    });

    // Mantener el proceso vivo
    process.on('SIGINT', () => {
        log('\n👋 Cerrando servidor de desarrollo...', 'cyan');
        server.close();
        process.exit(0);
    });
}

main().catch(console.error);
