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
            const absPath = imgPath.startsWith('/') ? join(BANCO_ROOT, imgPath) : join(outputFolder, 'img', imgPath.replace(/^img\//, ''));
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
        } else {
            // Ajustar rutas relativas para Pandoc (buscar en el output/img que ya creamos)
            const filename = basename(imgPath);
            const absPath = join(outputFolder, 'img', filename);
            if (existsSync(absPath)) {
                processed = processed.replace(match[1], absPath);
            }
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

    const PAGE_BREAK = '\n\n```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```\n\n';
    let isFirstGlobal = true;

    for (const bloque of taller.bloques) {
        let hasContext = false;

        // Si hay contexto, iniciamos página (salvo si es el puro inicio global)
        if (bloque.contexto && bloque.contexto.trim()) {
            if (!isFirstGlobal) md += PAGE_BREAK;
            md += `::: {custom-style="Contexto"}\n${bloque.contexto.trim()}\n:::\n\n`;
            hasContext = true;
            isFirstGlobal = false;
        }

        for (let i = 0; i < bloque.preguntas.length; i++) {
            const p = bloque.preguntas[i];

            // Salto de página si:
            // 1. NO es el primer elemento global.
            // 2. Y (No hay contexto previo O NO es la primera pregunta de este contexto)
            //    Es decir: Si hay contexto y es la pregunta 0, se queda pegada al contexto.
            if (!isFirstGlobal) {
                if (hasContext && i === 0) {
                    // Se queda con el contexto, no salto
                } else {
                    md += PAGE_BREAK;
                }
            }

            md += `### ${p.numeroGlobal}.\n\n`;
            md += `${p.texto.trim()}\n\n`;

            Object.entries(p.opciones).forEach(([letra, texto]) => {
                md += `*   **${letra}.** ${texto}\n`;
            });
            md += `\n`;

            isFirstGlobal = false;
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
    } finally {
        // Limpieza de archivos temporales
        if (existsSync(tempMdPath)) {
            execSync(`rm "${tempMdPath}"`);
        }
        const tempImagesDir = join(outputFolder, 'temp_images');
        if (existsSync(tempImagesDir)) {
            execSync(`rm -rf "${tempImagesDir}"`);
        }
    }
}

export default exportExamenWord;
