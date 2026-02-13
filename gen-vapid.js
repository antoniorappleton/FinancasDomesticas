const webPush = require('web-push');
const keys = webPush.generateVAPIDKeys();
console.log('PUBLIC_KEY: ' + keys.publicKey);
console.log('PRIVATE_KEY: ' + keys.privateKey);
