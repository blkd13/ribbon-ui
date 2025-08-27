const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');

const appName = 'ribbon-ui';

const source = path.resolve(`dist/${appName}/browser`);
const target = path.resolve(`dist/ai/${appName}`);

// Clean target first
fse.removeSync(target);
fse.ensureDirSync(target);

// Copy browser build output to desired subdir
fse.copySync(source, target);

// Optional: create _redirects file for SPA routing
const redirectsPath = path.join(target, '_redirects');
fs.writeFileSync(redirectsPath, `/ai/${appName}/* /ai/${appName}/index.html 200\n`);

console.log(`✅ Build artifacts moved to dist/ai/${appName}/`);
