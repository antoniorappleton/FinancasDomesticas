const fs = require('fs');
const content = fs.readFileSync('public/src/lib/guide.js');
const fixedStr = Buffer.from(content.toString('binary'), 'binary').toString('utf8');
fs.writeFileSync('public/src/lib/guide.js', fixedStr, 'utf8');
console.log('Fixed guide.js');
