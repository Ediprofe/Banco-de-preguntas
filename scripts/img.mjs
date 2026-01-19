#!/usr/bin/env node
/**
 * img.mjs
 * 
 * Optimiza imágenes PNG/JPG → WebP con flujo interactivo.
 * 
 * Uso: npm run img
 */

import { readdirSync, statSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { select, confirm } from '@inquirer/prompts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BANCO_ROOT = join(__dirname, '..');
const IMG_DIR = join(BANCO_ROOT, 'img');

// Colores
const c = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    bold: '\x1b[1m',
    dim: '\x1b[2m'
};

function log(msg, color = 'reset') {
    console.log(`${c[color]}${msg}${c.reset}`);
}

function toKebabCase(str) {
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function getImageFiles() {
    if (!existsSync(IMG_DIR)) {
        mkdirSync(IMG_DIR, { recursive: true });
        return [];
    }

    return readdirSync(IMG_DIR).filter(f => {
        const ext = extname(f).toLowerCase();
        return ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'].includes(ext);
    });
}

function copyToClipboard(text) {
    try {
        execSync(`echo "${text}" | pbcopy`, { stdio: 'pipe' });
        return true;
    } catch {
        return false;
    }
}

async function processImage(fileName) {
    const filePath = join(IMG_DIR, fileName);
    const ext = extname(fileName).toLowerCase();
    const nameWithoutExt = basename(fileName, ext);
    const kebabName = toKebabCase(nameWithoutExt);
    const webpPath = join(IMG_DIR, `${kebabName}.webp`);

    const originalSize = statSync(filePath).size;

    log(`\n📦 Optimizando...`, 'cyan');

    try {
        execSync(`cwebp -q 80 "${filePath}" -o "${webpPath}" 2>/dev/null`, { stdio: 'pipe' });

        const newSize = statSync(webpPath).size;
        const savings = ((1 - newSize / originalSize) * 100).toFixed(0);

        log(`✓ ${formatBytes(originalSize)} → ${formatBytes(newSize)} (-${savings}%) [WebP]`, 'green');

        // Preguntar si eliminar original
        const deleteOriginal = await confirm({
            message: '¿Eliminar la imagen original?',
            default: true
        });

        if (deleteOriginal) {
            unlinkSync(filePath);
            log(`🗑️  Imagen original eliminada`, 'yellow');
        } else {
            log(`📁 Original conservada`, 'dim');
        }

        // Generar markdown
        const markdown = `![${kebabName}](/img/${kebabName}.webp)`;

        log(`\n📋 Copiado al clipboard:`, 'green');
        log(`   ${markdown}`, 'cyan');
        copyToClipboard(markdown);

        return kebabName;

    } catch (error) {
        log(`❌ Error: ${error.message}`, 'red');
        return null;
    }
}

async function main() {
    console.clear();
    log('━'.repeat(50), 'cyan');
    log('📸 OPTIMIZADOR DE IMÁGENES', 'bold');
    log('━'.repeat(50), 'cyan');

    let continueProcessing = true;

    while (continueProcessing) {
        const files = getImageFiles();

        if (files.length === 0) {
            log(`\n✨ No hay imágenes para procesar en img/`, 'green');

            // Mostrar WebPs existentes
            const webps = readdirSync(IMG_DIR).filter(f => f.endsWith('.webp'));
            if (webps.length > 0) {
                log(`\n📷 Imágenes disponibles (${webps.length}):`, 'yellow');
                webps.slice(0, 10).forEach(f => {
                    const name = basename(f, '.webp');
                    log(`   ![${name}](/img/${f})`, 'dim');
                });
            }
            break;
        }

        // Crear opciones para el selector
        const choices = files.map(f => {
            const size = formatBytes(statSync(join(IMG_DIR, f)).size);
            return {
                name: `${f} (${size})`,
                value: f
            };
        });

        // Selector de imagen
        const selectedFile = await select({
            message: 'Selecciona la imagen a optimizar (↑↓):',
            choices: choices
        });

        log(`\n📍 Imagen: ${selectedFile}`, 'cyan');

        // Procesar imagen
        await processImage(selectedFile);

        // Verificar si hay más imágenes
        const remainingFiles = getImageFiles();

        if (remainingFiles.length > 0) {
            console.log();
            continueProcessing = await confirm({
                message: `¿Optimizar otra imagen? (${remainingFiles.length} restantes)`,
                default: false
            });
        } else {
            continueProcessing = false;
        }
    }

    log(`\n✅ ¡Listo! Pega el markdown en tu archivo (Cmd+V)`, 'green');
    log('━'.repeat(50), 'cyan');
}

main().catch(console.error);
