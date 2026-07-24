const fs = require('fs');
const Terser = require('terser');

async function main() {
    const src = fs.readFileSync('Dark Commands.user.js', 'utf8');

    const metaMatch = src.match(/^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n?)/);
    const code = metaMatch ? src.slice(metaMatch[1].length) : src;
    const meta = metaMatch ? metaMatch[1] : '';

    const result = await Terser.minify(code, {
        compress: {
            passes: 2,
            drop_debugger: true,
            collapse_vars: true,
            reduce_vars: true
        },
        mangle: true,
        output: { comments: false }
    });

    if (result.error) throw result.error;

    fs.writeFileSync('Dark Commands.obf.user.js', meta + '\n' + result.code);
    const kb = (fs.statSync('Dark Commands.obf.user.js').size / 1024).toFixed(1);
    console.log(`✓ Obfuscated: ${kb} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
