const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Simple graduation cap SVG
const iconSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" rx="128" fill="#FAF8F5"/>
  <path d="M256 128L64 224L256 320L448 224L256 128Z" fill="#1A1A1A"/>
  <path d="M128 256V352C128 352 192 416 256 416C320 416 384 352 384 352V256L256 320L128 256Z" fill="#1A1A1A"/>
  <path d="M416 224V340C416 340 368 384 256 384" stroke="#1A1A1A" stroke-width="24" stroke-linecap="round"/>
  <circle cx="416" cy="348" r="12" fill="#1A1A1A"/>
</svg>`;

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const publicDir = path.join(__dirname, '..', 'public');

async function generateIcons() {
  for (const size of sizes) {
    const filename = `icon-${size}x${size}.png`;
    const filepath = path.join(publicDir, filename);
    
    await sharp(Buffer.from(iconSvg))
      .resize(size, size)
      .png()
      .toFile(filepath);
    
    console.log(`Generated ${filename}`);
  }
}

generateIcons().catch(console.error);
