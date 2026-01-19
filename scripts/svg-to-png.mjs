import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Convierte un archivo SVG a PNG usando Playwright para un renderizado perfecto.
 * 
 * Uso: node scripts/svg-to-png.mjs <input.svg> <output.png> [scaleFactor]
 */
async function convert(svgPath, pngPath, scaleFactor = 1.5) {
    const browser = await chromium.launch();
    const page = await browser.newPage({
        deviceScaleFactor: parseFloat(scaleFactor)
    });

    try {
        const svgContent = readFileSync(svgPath, 'utf8');

        // Extraer dimensiones del viewBox o atributos width/height
        const viewBoxMatch = svgContent.match(/viewBox="(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/);
        let width = 800;
        let height = 600;

        if (viewBoxMatch) {
            width = parseFloat(viewBoxMatch[3]);
            height = parseFloat(viewBoxMatch[4]);
        }

        // Envolver SVG en HTML limpio
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
                    #container { display: inline-block; }
                    svg { display: block; width: ${width}px; height: ${height}px; }
                </style>
            </head>
            <body>
                <div id="container">
                    ${svgContent}
                </div>
            </body>
            </html>
        `;

        await page.setContent(htmlContent);

        const container = await page.$('#container');
        if (container) {
            await container.screenshot({
                path: pngPath,
                omitBackground: true,
                type: 'png'
            });
            console.log(`✅ SVG convertido a PNG: ${pngPath} (escala ${scaleFactor}x)`);
        } else {
            throw new Error('No se pudo encontrar el contenedor del SVG');
        }

    } catch (error) {
        console.error(`❌ Error convirtiendo SVG: ${error.message}`);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

const [, , input, output, scale] = process.argv;

if (!input || !output) {
    console.log('Uso: node scripts/svg-to-png.mjs <input.svg> <output.png> [scaleFactor]');
    process.exit(1);
}

convert(resolve(input), resolve(output), scale);
