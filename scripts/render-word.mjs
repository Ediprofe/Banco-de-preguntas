import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname, resolve, basename } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BANCO_ROOT = resolve(__dirname, '..');
const TEMPLATES_DIR = join(BANCO_ROOT, 'templates');
const WORD_TEMPLATE = join(TEMPLATES_DIR, 'examen-template.docx');

/**
 * Procesa el contenido Markdown para que Pandoc lo renderice mejor en Word.
 */
function preprocessMarkdown(content, outputFolder) {
    let processed = content;

    // 1. Detectar SVGs y convertirlos a PNG usando Playwright (vía script externo)
    const imgRegex = /!\[.*?\]\((.*?)\)/g;
    let match;
    const tempImagesDir = join(outputFolder, 'temp_images');
    if (!existsSync(tempImagesDir)) mkdirSync(tempImagesDir, { recursive: true });

    while ((match = imgRegex.exec(content)) !== null) {
        let imgPath = match[1];
        if (imgPath.endsWith('.svg')) {
            const absPath = imgPath.startsWith('/') ? join(BANCO_ROOT, imgPath) : join(outputFolder, 'public', imgPath);
            const pngName = basename(imgPath, '.svg') + '.png';
            const pngPath = join(tempImagesDir, pngName);

            if (existsSync(absPath)) {
                try {
                    console.log(`🖼️  Convirtiendo SVG a PNG: ${basename(absPath)}`);
                    execSync(`node scripts/svg-to-png.mjs "${absPath}" "${pngPath}" 1.5`);
                    processed = processed.replace(match[1], pngPath);
                } catch (e) {
                    console.error(`❌ Error convirtiendo SVG: ${e.message}`);
                }
            }
        } else if (imgPath.startsWith('/img/')) {
            // Ajustar rutas relativas para Pandoc
            const absPath = join(outputFolder, 'public', imgPath);
            processed = processed.replace(match[1], absPath);
        }
    }

    // 2. Truco de experto: Line Blocks para listas con LaTeX
    // Asegura que las fórmulas no se rompan en Word dentro de listas
    processed = processed.replace(
        /^(\s*-\s+.*\$.*\$.*)$/gm,
        (match) => {
            const content = match.replace(/^\s*-\s+/, '').trim();
            return `| • ${content}`;
        }
    );

    return processed;
}

/**
 * Genera el archivo Markdown final que será procesado por Pandoc.
 */
function generateExamenMarkdown(taller, outputFolder) {
    let md = `---\ntitle: "EVALUACIÓN: ${taller.titulo}"\n---\n\n`;

    // Encabezado institucional (simulado o via plantilla)
    md += `**Asignatura:** ${taller.meta.area.toUpperCase()}  \n`;
    md += `**Tema:** ${taller.meta.unidad}  \n`;
    md += `**Nombre:** __________________________________  **Grado:** _________  **Fecha:** _________  \n\n`;

    md += `**Instrucciones:** Selecciona la única opción correcta. Tiempo sugerido: ${taller.meta.tiempo_sugerido || 30} min.\n\n`;
    md += `---\n\n`;

    for (const bloque of taller.bloques) {
        if (bloque.contexto && bloque.contexto.trim()) {
            md += `::: {custom-style="Contexto"}\n${bloque.contexto.trim()}\n:::\n\n`;
        }

        for (const p of bloque.preguntas) {
            md += `### ${p.numeroGlobal}.\n\n`;
            md += `${p.texto.trim()}\n\n`;

            Object.entries(p.opciones).forEach(([letra, texto]) => {
                md += `*   **${letra}.** ${texto}\n`;
            });
            md += `\n`;
        }
    }

    return preprocessMarkdown(md, outputFolder);
}

/**
 * Exporta el taller a Word usando Pandoc.
 */
export async function exportExamenWord(taller, outputFolder) {
    const tallerId = taller.id;
    const docxName = `${tallerId}.docx`;
    const docxPath = join(outputFolder, docxName);
    const tempMdPath = join(outputFolder, 'temp_examen.md');

    console.log(`📋 Generando Word examen: ${docxName}...`);

    try {
        // 1. Generar Markdown intermedio
        const mdContent = generateExamenMarkdown(taller, outputFolder);
        writeFileSync(tempMdPath, mdContent);

        // 2. Construir comando Pandoc
        let pandocCmd = `pandoc "${tempMdPath}" --from markdown+tex_math_dollars --to docx --standalone`;

        if (existsSync(WORD_TEMPLATE)) {
            pandocCmd += ` --reference-doc="${WORD_TEMPLATE}"`;
        }

        pandocCmd += ` -o "${docxPath}"`;

        // 3. Ejecutar Pandoc
        execSync(pandocCmd);

        // 4. Corrección Quirúrgica de Tablas (Python Solution)
        try {
            execSync(`python3 scripts/fix-docx-tables.py "${docxPath}"`);
        } catch (pyError) {
            console.warn(`⚠️  Aviso: No se pudieron corregir las tablas automáticamente: ${pyError.message}`);
        }

        console.log(`   ✅ Word generado con éxito: ${docxPath}`);

        return docxPath;
    } catch (error) {
        console.error('❌ Error generando Word:', error.message);
        throw error;
    }
}

export default exportExamenWord;
