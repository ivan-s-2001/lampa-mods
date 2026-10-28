const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
fs.writeFileSync(path.join(root, 'cinemahall.js'), ['providers', 'streams', 'catalog', 'extensions'].map(name => fs.readFileSync(path.join(root, 'src', name + '.js'), 'utf8')).join('\n'));
fs.copyFileSync(path.join(root, 'src/look.js'), path.join(root, 'cinemahall-look.js'));
for (const name of ['cinemahall.js', 'cinemahall-look.js']) console.log(`${name}: ${fs.statSync(path.join(root, name)).size} bytes`);
