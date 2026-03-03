import fs from "node:fs";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const SVG_PATH = "public/brand/crown-mark.svg";
const BG = "#0b1220";     // premium navy
const GOLD = "#c9a227";   // subtle gold

const svgRaw = fs.readFileSync(SVG_PATH, "utf8");

// Inject gold color
const svg = svgRaw.replaceAll("currentColor", GOLD);

async function makePng(size, outputPath) {
  const icon = await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: BG,
    },
  })
    .composite([{ input: icon, gravity: "center" }])
    .png()
    .toFile(outputPath);
}

async function run() {
  console.log("Generating PNGs...");

  await makePng(16, "public/favicon-16x16.png");
  await makePng(32, "public/favicon-32x32.png");
  await makePng(180, "public/apple-touch-icon.png");
  await makePng(192, "public/android-chrome-192x192.png");
  await makePng(512, "public/android-chrome-512x512.png");

  console.log("Generating ICO...");

  const ico = await pngToIco([
    "public/favicon-16x16.png",
    "public/favicon-32x32.png",
  ]);

  fs.writeFileSync("public/favicon.ico", ico);

  console.log("Favicons generated successfully ✅");
}

run();