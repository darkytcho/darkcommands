const fs = require('fs');
const Terser = require('terser');

function xorEncode(str, key) {
    let result = '';
    for (let i = 0; i < str.length; i++) {
        result += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

async function main() {
    const src = fs.readFileSync('Dark Commands.user.js', 'utf8');

    const metaMatch = src.match(/^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n?)/);
    const code = metaMatch ? src.slice(metaMatch[1].length) : src;
    const meta = metaMatch ? metaMatch[1] : '';

    const minified = await Terser.minify(code, { compress: true, mangle: true });
    if (minified.error) throw minified.error;

    const key = 'd@rk' + Math.random().toString(36).slice(2, 6);
    const encoded = Buffer.from(xorEncode(minified.code, key)).toString('base64');

    const loader = `(function(){var k='${key}',d='',s=atob('${encoded}');for(var i=0;i<s.length;i++)d+=String.fromCharCode(s.charCodeAt(i)^k.charCodeAt(i%k.length));eval(d);})();`;

    fs.writeFileSync('Dark Commands.obf.user.js', meta + '\n' + loader);
    const kb = (fs.statSync('Dark Commands.obf.user.js').size / 1024).toFixed(1);
    console.log(`✓ Obfuscated: ${kb} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
