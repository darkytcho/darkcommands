const fs = require('fs');
const JavaScriptObfuscator = require('javascript-obfuscator');

async function main() {
    const src = fs.readFileSync('Dark Commands.user.js', 'utf8');

    const metaMatch = src.match(/^(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\n?)/);
    const code = metaMatch ? src.slice(metaMatch[1].length) : src;
    const meta = metaMatch ? metaMatch[1] : '';

    const result = JavaScriptObfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 1,
        deadCodeInjection: false,
        identifierNamesGenerator: 'mangled-shuffled',
        log: false,
        numbersToExpressions: true,
        renameGlobals: false,
        selfDefending: false,
        simplify: true,
        splitStrings: true,
        splitStringsChunkLength: 3,
        stringArray: true,
        stringArrayCallsTransform: true,
        stringArrayCallsTransformThreshold: 1,
        stringArrayEncoding: ['rc4'],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        stringArrayWrappersCount: 5,
        stringArrayWrappersChainedCalls: true,
        stringArrayWrappersParametersMaxCount: 5,
        stringArrayWrappersType: 'function',
        stringArrayThreshold: 1,
        target: 'browser',
        transformObjectKeys: true
    });

    const obfCode = result.getObfuscatedCode();
    fs.writeFileSync('Dark Commands.obf.user.js', meta + '\n' + obfCode);
    const kb = (fs.statSync('Dark Commands.obf.user.js').size / 1024).toFixed(1);
    console.log(`✓ Obfuscated: ${kb} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
