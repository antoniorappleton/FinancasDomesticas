const webPush = require("web-push");
const keys = webPush.generateVAPIDKeys();
const fs = require("fs");
fs.writeFileSync("vapid_keys.json", JSON.stringify(keys, null, 2));
