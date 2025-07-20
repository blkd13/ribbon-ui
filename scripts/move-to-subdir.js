const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');

const source = path.resolve('dist/ribbon-ui/browser');
const target = path.resolve('dist/ai/ribbon-ui');

// Clean target first
fse.removeSync(target);
fse.ensureDirSync(target);

// Copy browser build output to desired subdir
fse.copySync(source, target);

// Optional: create _redirects file for SPA routing
const redirectsPath = path.join(target, '_redirects');
fs.writeFileSync(redirectsPath, '/ai/ribbon-ui/* /ai/ribbon-ui/index.html 200\n');

console.log('✅ Build artifacts moved to dist/ai/ribbon-ui/');
