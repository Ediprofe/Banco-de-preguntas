import { writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'fs';
import { join, basename, extname, dirname } from 'path';
import sharp from 'sharp';

const GLOBAL_IMG_DIR = join(process.cwd(), 'img');

/**
 * Busca un archivo de imagen recursivamente en un directorio y sus subcarpetas
 * @returns {string|null} - Ruta completa del archivo o null si no se encuentra
 */
function findImageRecursive(dir, fileName) {
    if (!existsSync(dir)) return null;

    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile() && entry.name === fileName) {
            return fullPath;
        }
        if (entry.isDirectory()) {
            const found = findImageRecursive(fullPath, fileName);
            if (found) return found;
        }
    }
    return null;
}

/**
 * Optimiza una imagen a WebP EN LA CARPETA FUENTE (si no existe ya el WebP)
 * y la copia al directorio de salida.
 * 
 * - La imagen original (.png/.jpg) se conserva.
 * - Se crea una versión .webp junto a ella.
 * - Se copia el .webp al output.
 * 
 * @param {string} srcDir - Directorio fuente (donde está la imagen original)
 * @param {string} destDir - Directorio de salida
 * @param {string} fileName - Nombre del archivo original
 * @returns {Promise<string>} - Nombre del archivo WebP (para usar en HTML)
 */
async function optimizeAndCopyImage(srcDir, destDir, fileName) {
    const ext = extname(fileName).toLowerCase();
    const srcPath = join(srcDir, fileName);

    // SVG: copiar tal cual (no se convierte)
    if (ext === '.svg') {
        copyFileSync(srcPath, join(destDir, fileName));
        return fileName;
    }

    // Ya es WebP: copiar directamente
    if (ext === '.webp') {
        copyFileSync(srcPath, join(destDir, fileName));
        return fileName;
    }

    // PNG, JPG, JPEG -> Generar WebP en la carpeta FUENTE (si no existe)
    if (['.png', '.jpg', '.jpeg'].includes(ext)) {
        const webpName = fileName.replace(/\.(png|jpg|jpeg)$/i, '.webp');
        const webpPathInSource = join(srcDir, webpName);

        // Solo optimizar si el webp no existe aún en la fuente
        if (!existsSync(webpPathInSource)) {
            await sharp(srcPath)
                .webp({ quality: 85 })
                .toFile(webpPathInSource);
            console.log(`   🖼️  Optimizado: ${fileName} → ${webpName}`);
        }

        // Copiar el webp al output
        copyFileSync(webpPathInSource, join(destDir, webpName));
        return webpName;
    }

    // Otros formatos: copiar sin modificar
    copyFileSync(srcPath, join(destDir, fileName));
    return fileName;
}

/**
 * Prepara la lección interactiva con imágenes optimizadas
 */
export async function renderInteractive(taller, outputDir) {
    const outputImgDir = join(outputDir, 'img');
    const localImgDir = taller.tallerDir ? join(taller.tallerDir, 'img') : null;

    mkdirSync(outputDir, { recursive: true });
    mkdirSync(outputImgDir, { recursive: true });

    // Mapa de nombres originales -> nombres optimizados (para actualizar referencias)
    const imageMap = new Map();

    // 1. Procesar TODAS las imágenes de la carpeta local
    if (localImgDir && existsSync(localImgDir)) {
        // Solo procesar archivos que NO son ya webp (para evitar duplicados)
        const files = readdirSync(localImgDir).filter(f => /\.(png|jpg|jpeg|gif|svg)$/i.test(f));
        for (const file of files) {
            const optimizedName = await optimizeAndCopyImage(localImgDir, outputImgDir, file);
            imageMap.set(file, optimizedName);
            // También mapear con ruta img/ por si el markdown lo referencia así
            imageMap.set(`img/${file}`, optimizedName);
        }

        // Copiar también los webp existentes
        const webpFiles = readdirSync(localImgDir).filter(f => /\.webp$/i.test(f));
        for (const file of webpFiles) {
            copyFileSync(join(localImgDir, file), join(outputImgDir, file));
            imageMap.set(file, file);
        }
    }

    // 2. Buscar imágenes referenciadas en el contenido del taller (fallback a global)
    const tallerStr = JSON.stringify(taller);
    const imgRegex = /!\[.*?\]\((.*?)\)/g;
    let match;
    while ((match = imgRegex.exec(tallerStr)) !== null) {
        const fullPath = match[1];
        const fileName = basename(fullPath);

        // Si ya la procesamos del local, skip
        if (imageMap.has(fileName)) continue;

        // Determinar la ruta de búsqueda
        let imgSourceDir = null;
        let imgSourcePath = null;

        // Caso 1: Ruta absoluta desde raíz (ej: /img/quimica/la-materia/archivo.webp)
        if (fullPath.startsWith('/img/')) {
            const relativePath = fullPath.slice(1); // Quitar el / inicial
            imgSourcePath = join(process.cwd(), relativePath);
            if (existsSync(imgSourcePath)) {
                imgSourceDir = dirname(imgSourcePath);
            }
        }

        // Caso 2: Buscar directamente en img/ global (compatibilidad hacia atrás)
        if (!imgSourceDir) {
            const globalPath = join(GLOBAL_IMG_DIR, fileName);
            if (existsSync(globalPath)) {
                imgSourceDir = GLOBAL_IMG_DIR;
                imgSourcePath = globalPath;
            }
        }

        // Caso 3: Buscar recursivamente en subcarpetas de img/
        if (!imgSourceDir) {
            imgSourcePath = findImageRecursive(GLOBAL_IMG_DIR, fileName);
            if (imgSourcePath) {
                imgSourceDir = dirname(imgSourcePath);
            }
        }

        if (imgSourceDir && imgSourcePath) {
            const optimizedName = await optimizeAndCopyImage(imgSourceDir, outputImgDir, fileName);
            imageMap.set(fileName, optimizedName);
            // También mapear la ruta completa por si se referencia así
            imageMap.set(fullPath, optimizedName);
        }
    }

    // Generar HTML (las imágenes se referencian con su nombre optimizado)
    const html = generateHTML(taller, imageMap);
    const htmlPath = join(outputDir, 'leccion_interactiva.html');
    writeFileSync(htmlPath, html);

    return { path: outputDir, htmlPath };
}

/**
 * Procesador de Markdown Robusto
 */
function processMarkdown(text, imageMap, highlightMode = false, isFeedbackMode = false) {
    if (!text) return '';

    let html = text;

    // 0. Procesar marcadores de retroalimentación (solo en feedbackMode)
    if (isFeedbackMode) {
        // ==texto== → Resaltar (fondo amarillo)
        html = html.replace(/==([^=]+)==/g, '<mark class="bg-yellow-200 text-yellow-900 px-1 rounded font-semibold">$1</mark>');
        // ~~texto~~ → Tachar (rojo con línea)
        html = html.replace(/~~([^~]+)~~/g, '<del class="text-red-600 line-through bg-red-100 px-1 rounded">$1</del>');
    }

    // 1. Manejo de tablas Markdown (Mejorado para detectar variaciones de espacios y nuevas líneas)
    const tableRegex = /\|(.+)\|\s*\n\s*\|([-:| ]+)\|\s*\n\s*((?:\|.+\|\s*\n?)+)/g;
    html = html.replace(tableRegex, (match, header, separator, body) => {
        const headers = header.split('|').map(s => s.trim()).filter(s => s !== '');
        const rows = body.trim().split(/\r?\n/).map(row =>
            row.split('|').map(s => s.trim()).filter(s => s !== '')
        );

        let tableHtml = '<div class="w-full my-8 overflow-x-auto rounded-2xl border border-gray-200 shadow-sm bg-white"> <table class="min-w-full divide-y divide-gray-100">';
        tableHtml += '<thead class="bg-gray-100"> <tr>';
        headers.forEach(h => { tableHtml += `<th scope="col" class="px-6 py-5 text-left text-base font-extrabold text-black tracking-tight">${h}</th>`; });
        tableHtml += '</tr></thead><tbody class="divide-y divide-gray-100 bg-white">';
        rows.forEach((row, idx) => {
            if (row.length === 0) return;
            tableHtml += '<tr class="hover:bg-gray-50 transition-colors">';
            row.forEach(cell => { tableHtml += `<td class="px-6 py-5 whitespace-normal text-lg text-gray-800 font-medium leading-relaxed">${cell}</td>`; });
            tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table></div>';
        return tableHtml;
    });

    // 2. Imágenes: ![alt](src) -> Usar nombre optimizado del imageMap
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, (m, alt, src) => {
        const originalFileName = basename(src);
        // Buscar en imageMap o usar el original
        const optimizedName = imageMap && imageMap.has(originalFileName)
            ? imageMap.get(originalFileName)
            : originalFileName.replace(/\.(png|jpg|jpeg)$/i, '.webp');
        return `<div class="my-10 flex justify-center"><img src="img/${optimizedName}" alt="${alt}" class="rounded-3xl shadow-2xl border-4 border-white max-w-full md:max-w-2xl h-auto"></div>`;
    });

    // 3. Bold: **text**
    // 3. Bold: **text**
    html = html.replace(/\*\*(.*?)\*\*/g, (match, content) => {
        return highlightMode
            ? `<strong class="font-bold bg-yellow-300 text-yellow-900 px-1 rounded box-decoration-clone">${content}</strong>`
            : `<strong class="font-bold">${content}</strong>`;
    });

    // 3.5 Listas de opciones en retroalimentación
    if (isFeedbackMode) {
        html = html.replace(/^- ([A-D])\. (.+)$/gm, (match, letra, texto) => {
            return `<div class="flex items-start gap-3 py-2"><span class="font-bold text-gray-700 min-w-[24px]">${letra}.</span><span>${texto}</span></div>`;
        });
    }

    // 4. Saltos de línea inteligentes (no romper dentro de HTML)
    const parts = html.split(/(<div.*?<\/div>|<table.*?<\/table>)/gs);
    html = parts.map(part => {
        if (part.startsWith('<div') || part.startsWith('<table')) return part;
        return part.replace(/\r?\n/g, '<br>');
    }).join('');

    return html;
}

function generateHTML(taller, imageMap) {
    return `<!DOCTYPE html>
<html lang="es" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${taller.titulo}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" 
            onload="renderMathInElement(document.body, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]});"></script>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');
        body { font-family: 'Outfit', sans-serif; }
        [x-cloak] { display: none !important; }
        .shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
        /* Imágenes del resumen: ocupar ancho completo */
        .resumen-images img { width: 100%; max-width: 100%; height: auto; border-radius: 1rem; margin-bottom: 1rem; }
    </style>
</head>
<body class="bg-gray-100 text-gray-900 antialiased" x-data="tallerApp()">

    <!-- Header Full Width -->
    <header class="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-100">
        <div class="max-w-6xl mx-auto px-8 h-20 flex items-center justify-between">
            <div class="flex items-center gap-4">
                <div class="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white font-extrabold text-2xl">S</div>
                <div>
                    <h1 class="text-xl font-extrabold tracking-tight">${taller.meta.area || 'Taller'}</h1>
                    <p class="text-xs text-gray-400 font-bold uppercase tracking-widest leading-none">Ediprofe • Saber Digital</p>
                </div>
            </div>
            <div class="flex items-center gap-6">
                <div class="h-3 w-48 bg-gray-100 rounded-full overflow-hidden border border-gray-200">
                    <div class="h-full bg-blue-500 transition-all duration-1000" :style="'width: ' + progress + '%'"></div>
                </div>
                <div class="text-sm font-black text-blue-600" x-text="progress + '%'"></div>
            </div>
        </div>
    </header>

    <main class="max-w-6xl mx-auto px-8 py-16 space-y-20">
        
        <section class="text-center space-y-6">
            <h2 class="text-4xl sm:text-6xl font-black text-gray-900 leading-tight tracking-tighter">
                ${taller.titulo}
            </h2>
            <div class="w-24 h-2 bg-blue-600 mx-auto rounded-full"></div>
        </section>

        ${taller.resumen ? `
        <article class="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-[2.5rem] p-12 shadow-xl border border-blue-100">
            <div class="flex items-center gap-4 mb-10">
                <span class="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-xl">📋</span>
                <h3 class="text-3xl font-bold tracking-tight text-gray-800">Resumen de Conceptos</h3>
            </div>
            <div class="text-xl text-gray-700 leading-relaxed space-y-6 resumen-images">
                ${processMarkdown(taller.resumen.replace(/^##\s+Resumen[^\n]*\n/, ''), imageMap)}
            </div>
        </article>
        ` : ''}

        ${taller.bloques.map((bloque) => `
            <div class="space-y-16">
                ${bloque.contexto ? `
                <article class="bg-white rounded-[2.5rem] p-12 shadow-xl border border-gray-100">
                    <div class="flex items-center gap-4 mb-10">
                        <span class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-bold text-xl">📖</span>
                        <h3 class="text-3xl font-bold tracking-tight text-gray-800">Lectura de Contexto</h3>
                    </div>
                    <div class="text-xl text-gray-700 leading-relaxed space-y-6">
                        ${processMarkdown(bloque.contexto, imageMap)}
                    </div>
                </article>
                ` : ''}

                ${bloque.preguntas.map((pregunta) => `
                    <section x-data="{ selected: null, revealed: false }" class="space-y-10 scroll-mt-32" id="pregunta-${pregunta.numeroGlobal}">
                        <div class="flex items-start gap-6">
                            <span class="flex-shrink-0 w-16 h-16 bg-gray-900 text-white rounded-[1.25rem] flex items-center justify-center font-black text-3xl">
                                ${pregunta.numeroGlobal}
                            </span>
                            <div class="text-xl sm:text-2xl font-bold text-gray-800 leading-relaxed pt-3">
                                ${processMarkdown(pregunta.texto, imageMap)}
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            ${Object.entries(pregunta.opciones).map(([letra, texto]) => `
                                <button @click="if(!revealed) { selected = '${letra}'; revealed = true; updateProgress(); }"
                                        class="text-left p-8 border-4 rounded-3xl transition-all duration-300 transform relative overflow-hidden group"
                                        :class="{
                                            'border-blue-500 bg-blue-50/50 scale-[1.02] shadow-xl': selected === '${letra}' && !revealed,
                                            'border-green-500 bg-green-50 scale-[1.02] shadow-xl': revealed && '${letra}' === '${pregunta.respuestaCorrecta}',
                                            'border-red-500 bg-red-50 shake': revealed && selected === '${letra}' && selected !== '${pregunta.respuestaCorrecta}',
                                            'border-white bg-white hover:border-gray-200': !revealed && selected !== '${letra}'
                                        }">
                                    <div class="flex items-center gap-6 relative z-10">
                                        <span class="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl"
                                              :class="revealed && '${letra}' === '${pregunta.respuestaCorrecta}' ? 'bg-green-600 text-white' : (revealed && selected === '${letra}' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-900')">
                                            ${letra}
                                        </span>
                                        <span class="text-xl font-bold tracking-tight text-gray-800">${processMarkdown(texto, imageMap)}</span>
                                    </div>
                                </button>
                            `).join('')}
                        </div>

                        <div x-show="revealed" x-cloak x-transition
                             class="bg-blue-900 text-white p-12 rounded-[2.5rem] shadow-2xl">
                            <h4 class="text-2xl font-black mb-6 flex items-center gap-3">
                                <span class="bg-blue-500 p-2 rounded-lg">💡</span> Respuesta y Explicación
                            </h4>
                            <div class="text-xl font-medium leading-relaxed">
                                <p class="mb-6">
                                    <template x-if="selected === '${pregunta.respuestaCorrecta}'">
                                        <span class="bg-green-500 text-white px-4 py-1 rounded-full font-black uppercase text-sm">Correcto</span>
                                    </template>
                                    <template x-if="selected !== '${pregunta.respuestaCorrecta}'">
                                        <span class="bg-red-500 text-white px-4 py-1 rounded-full font-black uppercase text-sm">Incorrecto</span>
                                    </template>
                                    <span class="ml-2 font-bold">La respuesta correcta es la ${pregunta.respuestaCorrecta}.</span>
                                </p>
                                ${processMarkdown(pregunta.explicacion, imageMap, true)}
                            </div>
                            ${pregunta.retroalimentacion ? `
                            <div class="mt-8 pt-6 border-t border-blue-700">
                                <button @click="$dispatch('open-modal', { id: 'modal-${pregunta.numeroGlobal}' })"
                                        class="bg-yellow-400 hover:bg-yellow-300 text-yellow-900 px-6 py-3 rounded-xl font-bold text-lg transition-all flex items-center gap-2">
                                    🎯 Ver Análisis Detallado
                                </button>
                            </div>
                            ` : ''}
                        </div>
                    </section>
                `).join('')}
            </div>
        `).join('')}

        <footer class="text-center py-24">
            <button @click="window.scrollTo({top: 0, behavior: 'smooth'})" 
                    class="bg-blue-600 text-white px-12 py-5 rounded-2xl font-black text-xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/30">
                Finalizar Lección
            </button>
        </footer>
    </main>

    <!-- MODALES DE RETROALIMENTACIÓN DETALLADA -->
    ${taller.bloques.flatMap(bloque =>
        bloque.preguntas.filter(p => p.retroalimentacion).map(pregunta => `
        <div x-data="{ open: false }" 
             x-show="open" 
             x-cloak
             @open-modal.window="if ($event.detail.id === 'modal-${pregunta.numeroGlobal}') open = true"
             @keydown.escape.window="open = false"
             class="fixed inset-0 z-[100] overflow-y-auto">
            <!-- Overlay -->
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm" @click="open = false"></div>
            
            <!-- Modal Content -->
            <div class="relative min-h-screen flex items-center justify-center p-4">
                <div class="relative bg-white rounded-[2rem] max-w-7xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
                     x-transition:enter="transition ease-out duration-300"
                     x-transition:enter-start="opacity-0 scale-90"
                     x-transition:enter-end="opacity-100 scale-100"
                     x-transition:leave="transition ease-in duration-200"
                     x-transition:leave-start="opacity-100 scale-100"
                     x-transition:leave-end="opacity-0 scale-90">
                    
                    <!-- Header -->
                    <div class="sticky top-0 bg-gradient-to-r from-yellow-400 to-amber-500 p-6 rounded-t-[2rem]">
                        <div class="flex items-center justify-between">
                            <h3 class="text-2xl font-black text-yellow-900 flex items-center gap-3">
                                🎯 Análisis de la Pregunta ${pregunta.numeroGlobal}
                            </h3>
                            <button @click="open = false" class="w-10 h-10 bg-yellow-600/20 hover:bg-yellow-600/40 rounded-full flex items-center justify-center text-yellow-900 font-bold text-xl transition-colors">
                                ✕
                            </button>
                        </div>
                    </div>
                    
                    <!-- Body -->
                    <div class="p-8 space-y-6">
                        <div class="text-lg leading-relaxed text-gray-800">
                            ${processMarkdown(pregunta.retroalimentacion, imageMap, false, true)}
                        </div>
                        
                        <!-- Respuesta correcta -->
                        <div class="bg-green-50 border-2 border-green-500 rounded-2xl p-6 text-center">
                            <span class="text-green-700 font-black text-xl">✅ Respuesta correcta: ${pregunta.respuestaCorrecta}</span>
                        </div>
                    </div>
                    
                    <!-- Footer -->
                    <div class="p-6 border-t border-gray-100 text-center">
                        <button @click="open = false" class="bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-xl font-bold text-lg transition-all">
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `).join('')
    ).join('')}

    <script>
        function tallerApp() {
            return {
                total: ${taller.totalItems},
                done: 0,
                progress: 0,
                updateProgress() {
                    this.done++;
                    this.progress = Math.round((this.done / this.total) * 100);
                }
            }
        }
    </script>
</body>
</html>`;
}
