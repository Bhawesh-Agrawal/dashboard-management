const sharp = require('sharp');
const path = require('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const publicDir = path.join(__dirname, '..', 'public');
const sourceIcon = path.join(publicDir, 'CodexDash Abstract Dashboard Icon.png');

async function generateIcons() {
  for (const size of sizes) {
    const filename = `icon-${size}x${size}.png`;
    const filepath = path.join(publicDir, filename);

    await sharp(sourceIcon)
      .resize(size, size)
      .png()
      .toFile(filepath);

    console.log(`Generated ${filename}`);
  }

  // Generate favicon.ico (16x16, 32x32, 48x48 multi-resolution)
  const faviconPath = path.join(publicDir, 'favicon.ico');
  const faviconSizes = [16, 32, 48];
  const faviconBuffers = await Promise.all(
    faviconSizes.map(async (size) => {
      const buf = await sharp(sourceIcon).resize(size).png().toBuffer();
      return buf;
    })
  );

  // ICO format: write PNG buffers directly (modern browsers accept PNG-based ICO)
  // For simplicity, use the 32x32 version as the favicon
  await sharp(sourceIcon).resize(32, 32).png().toFile(faviconPath.replace('.ico', '-32.png'));
  const { execSync } = require('child_process');
  // Use sharp to create a proper .ico by writing the 32px PNG with .ico extension
  // Most modern browsers accept PNGs with .ico extension
  const ico32 = await sharp(sourceIcon).resize(32, 32).png().toBuffer();
  require('fs').writeFileSync(faviconPath, ico32);
  console.log('Generated favicon.ico');

  // Clean up temp file
  try { require('fs').unlinkSync(faviconPath.replace('.ico', '-32.png')); } catch {}
}

generateIcons().catch(console.error);
