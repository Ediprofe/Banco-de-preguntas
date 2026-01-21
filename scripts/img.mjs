#!/usr/bin/env node
/**
 * img.mjs
 * 
 * Optimiza TODAS las imágenes PNG/JPG → WebP en carpetas img/ dentro de talleres/
 * 
 * Uso: npm run img
 * 
 * Busca en: talleres/ ** /img/*.png,jpg,jpeg,gif,bmp,tiff
 * Genera: mismo_nombre.webp en la misma carpeta
 */

import { readdirSync, statSync, existsSync, mkdirSync } from 'fs';
import { join, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url'
import { execSync } from 'child_process';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BANCO_ROOT = join(__dirname, '..');
const TALLERES_DIR = join(BANCO_ROOT, 'talleres');
const GLOBAL_IMG_DIR = join(BANCO_ROOT, 'img');

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

function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Busca recursivamente todas las carpetas 'img' dentro de una ruta
 */
function findImgDirectories(dir, imgDirs = []) {
    if (!existsSync(dir)) return imgDirs;

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name === 'img') {
                imgDirs.push(fullPath);
            } else if (entry.name !== 'node_modules' && entry.name !== 'output' && entry.name !== '.git') {
                findImgDirectories(fullPath, imgDirs);
            }
        }
    }

    return imgDirs;
}

/**
 * Busca TODAS las subcarpetas dentro de un directorio (para img/ global)
 * Esto permite estructuras como img/quimica/la-materia/
 */
function findAllSubdirectories(dir, subDirs = []) {
    if (!existsSync(dir)) return subDirs;

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.isDirectory()) {
            const fullPath = join(dir, entry.name);
            subDirs.push(fullPath);
            // Buscar recursivamente en subcarpetas
            findAllSubdirectories(fullPath, subDirs);
        }
    }

    return subDirs;
}

/**
 * Obtiene imágenes que NO tienen su versión .webp en una carpeta
 */
function getImagesToProcess(imgDir) {
    if (!existsSync(imgDir)) return [];

    const files = readdirSync(imgDir);
    const imagesToProcess = [];

    for (const file of files) {
        const ext = extname(file).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'].includes(ext)) {
            const nameWithoutExt = basename(file, ext);
            const webpName = `${nameWithoutExt}.webp`;

            // Solo procesar si NO existe ya el .webp
            if (!files.includes(webpName)) {
                imagesToProcess.push({
                    fileName: file,
                    filePath: join(imgDir, file),
                    webpPath: join(imgDir, webpName),
                    webpName
                });
            }
        }
    }

    return imagesToProcess;
}

/**
 * Convierte una imagen a WebP usando sharp
 */
async function convertToWebp(imgInfo) {
    const { filePath, webpPath, fileName } = imgInfo;

    try {
        const originalSize = statSync(filePath).size;

        await sharp(filePath)
            .webp({ quality: 85 })
            .toFile(webpPath);

        const newSize = statSync(webpPath).size;
        const savings = ((1 - newSize / originalSize) * 100).toFixed(0);

        return {
            success: true,
            fileName,
            originalSize,
            newSize,
            savings
        };
    } catch (error) {
        return {
            success: false,
            fileName,
            error: error.message
        };
    }
}

async function main() {
    console.clear();
    log('━'.repeat(50), 'cyan');
    log('📸 OPTIMIZADOR DE IMÁGENES - TALLERES', 'bold');
    log('━'.repeat(50), 'cyan');

    // 1. Encontrar todas las carpetas img/ en talleres/
    const imgDirectories = findImgDirectories(TALLERES_DIR);

    // 2. Incluir la carpeta img/ global Y sus subcarpetas (para estructura organizada)
    if (existsSync(GLOBAL_IMG_DIR)) {
        imgDirectories.unshift(GLOBAL_IMG_DIR);
        // Buscar subcarpetas dentro de img/ global (ej: img/quimica/la-materia/)
        findAllSubdirectories(GLOBAL_IMG_DIR, imgDirectories);
    }

    if (imgDirectories.length === 0) {
        log('\n⚠️  No se encontraron carpetas img/ en talleres/', 'yellow');
        return;
    }

    log(`\n📁 Carpetas encontradas: ${imgDirectories.length}`, 'cyan');

    let totalProcessed = 0;
    let totalErrors = 0;

    // 2. Procesar cada carpeta
    for (const imgDir of imgDirectories) {
        const relativePath = imgDir.replace(BANCO_ROOT + '/', '');
        const imagesToProcess = getImagesToProcess(imgDir);

        if (imagesToProcess.length === 0) {
            continue; // Saltar carpetas sin imágenes por procesar
        }

        log(`\n📂 ${relativePath} (${imagesToProcess.length} nuevas)`, 'yellow');

        for (const img of imagesToProcess) {
            const result = await convertToWebp(img);

            if (result.success) {
                log(`   ✓ ${result.fileName} → ${formatBytes(result.originalSize)} → ${formatBytes(result.newSize)} (-${result.savings}%)`, 'green');
                totalProcessed++;
            } else {
                log(`   ✗ ${result.fileName}: ${result.error}`, 'red');
                totalErrors++;
            }
        }
    }

    // 3. Resumen
    log('\n' + '━'.repeat(50), 'cyan');

    if (totalProcessed === 0 && totalErrors === 0) {
        log('✨ Todas las imágenes ya están optimizadas', 'green');
    } else {
        log(`✅ Procesadas: ${totalProcessed} | ❌ Errores: ${totalErrors}`, totalErrors > 0 ? 'yellow' : 'green');
    }

    log('━'.repeat(50), 'cyan');
}

main().catch(console.error);
