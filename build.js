const fs = require('fs');
const path = require('path');
const Terser = require('terser');

async function main() {
    const src = fs.readFileSync('Dark Commands.user.js', 'utf8');

    const metaMatch = src.match(/^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n?)/);
    const code = metaMatch ? src.slice(metaMatch[1].length) : src;
    const meta = metaMatch ? metaMatch[1] : '';

    const result = await Terser.minify(code, {
        compress: true,
        mangle: true
    });

    if (result.error) throw result.error;

    fs.writeFileSync('Dark Commands.min.user.js', meta + '\n' + result.code);
    const kb = (fs.statSync('Dark Commands.min.user.js').size / 1024).toFixed(1);
    console.log(`✓ Minified: ${kb} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
