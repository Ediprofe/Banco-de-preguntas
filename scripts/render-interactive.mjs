import { writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'fs';
import { join, basename, extname } from 'path';
import sharp from 'sharp';

const GLOBAL_IMG_DIR = join(process.cwd(), 'img');

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

        // Buscar en global
        const globalPath = join(GLOBAL_IMG_DIR, fileName);
        if (existsSync(globalPath)) {
            const optimizedName = await optimizeAndCopyImage(GLOBAL_IMG_DIR, outputImgDir, fileName);
            imageMap.set(fileName, optimizedName);
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
function processMarkdown(text, imageMap) {
    if (!text) return '';

    let html = text;

    // 1. Manejo de tablas Markdown (Mejorado para detectar variaciones de espacios y nuevas líneas)
    const tableRegex = /\|(.+)\|\s*\n\s*\|([-:| ]+)\|\s*\n\s*((?:\|.+\|\s*\n?)+)/g;
    html = html.replace(tableRegex, (match, header, separator, body) => {
        const headers = header.split('|').map(s => s.trim()).filter(s => s !== '');
        const rows = body.trim().split(/\r?\n/).map(row =>
            row.split('|').map(s => s.trim()).filter(s => s !== '')
        );

        if (headers.length === 0) return match;

        let tableHtml = '<div class="overflow-x-auto my-8 bg-white rounded-xl border border-gray-200 shadow-sm"> <table class="min-w-full divide-y divide-gray-200"> <thead class="bg-gray-100"> <tr>';
        headers.forEach(h => { tableHtml += `<th class="px-6 py-4 text-left text-sm font-bold text-gray-700 uppercase tracking-wider">${h}</th>`; });
        tableHtml += '</tr></thead><tbody class="bg-white divide-y divide-gray-100">';
        rows.forEach(row => {
            if (row.length === 0) return;
            tableHtml += '<tr>';
            row.forEach(cell => { tableHtml += `<td class="px-6 py-4 text-sm text-gray-600 font-medium">${cell}</td>`; });
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
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-gray-900">$1</strong>');

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
            <h2 class="text-5xl sm:text-7xl font-black text-gray-900 leading-tight tracking-tighter">
                ${taller.titulo}
            </h2>
            <div class="w-24 h-2 bg-blue-600 mx-auto rounded-full"></div>
        </section>

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
                            <div class="text-2xl sm:text-4xl font-bold text-gray-800 leading-tight pt-2">
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
                                ${processMarkdown(pregunta.explicacion, imageMap)}
                            </div>
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
