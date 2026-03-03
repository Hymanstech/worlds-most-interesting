import fs from "node:fs";
import pngToIco from "png-to-ico";

const ico = await pngToIco([
  "public/favicon-16x16.png",
  "public/favicon-32x32.png",
]);

fs.writeFileSync("public/favicon.ico", ico);
console.log("favicon.ico generated ✅");