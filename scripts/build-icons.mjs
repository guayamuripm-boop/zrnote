// Generates every ZRNote icon from one vector source.
//
// The ZR monogram is NOT redrawn by hand: the paths below are lifted verbatim
// from the official ZR Mecademy isotype
// (C:\Proyectos\Marcas\ZR Mecademy\SVG\Recurso 1.svg) so the brand shape stays
// pixel-faithful. Only the container, the colour and the spacing are adapted
// to what an app icon needs.
//
//   node scripts/build-icons.mjs
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

// Official palette (manual de identidad ZR Mecademy 2025).
const NAVY = '#21284F';
const BLUE = '#1E4D96';
const BLUE_MID = '#3869B1';

// --- The ZR monogram, straight from the brand file -------------------------
// Native bounding box of the letters: x 22.52→220.9, y 36.92→141.58
const MONOGRAM = `
  <polygon points="65.65 36.93 47.91 61.62 45.13 65.49 22.52 65.49 22.52 36.93 65.65 36.93"/>
  <polygon points="111.56 36.93 111.56 48.25 99.76 65.49 67.23 113.02 67.22 113.02 66.65 113.86 47.61 141.58 22.52 141.58 22.52 125.06 30.79 113.02 51.97 82.16 63.43 65.49 83.06 36.93 111.56 36.93"/>
  <path d="M111.57,113v28.56s-30.41-.25-46.4-.36l17.4-24.51L85.2,113Z"/>
  <rect x="124.36" y="36.93" width="28.56" height="104.65"/>
  <path d="M203.17,105.05c-1.25.69-2.55,1.28-2.55,1.28a35.62,35.62,0,0,1-4.76,1.75q12.55,16.76,25.12,33.49H185.26L167.47,118V79.76h17.85a7.17,7.17,0,0,0,7.1-6.18,6.37,6.37,0,0,0,.07-1v-.07a6.37,6.37,0,0,0-.07-1,7.18,7.18,0,0,0-7.1-6.18H167.47V36.92l20.1.07a36.06,36.06,0,0,1,17.7,5.61c11.84,7.64,14.91,19.85,15.53,22.62a37,37,0,0,1,.12,15.33,35.81,35.81,0,0,1-6.71,15A40.37,40.37,0,0,1,203.17,105.05Z"/>
`;

const MONO_BBOX = { x: 22.52, y: 36.92, w: 198.38, h: 104.66 };

/**
 * Place the monogram inside a square canvas.
 * @param size    canvas edge
 * @param widthPct how much of the edge the letters should span
 * @param dy      optional vertical nudge (used when something sits below)
 */
function placeMonogram(size, widthPct, dy = 0) {
  const targetW = size * widthPct;
  const scale = targetW / MONO_BBOX.w;
  const cx = MONO_BBOX.x + MONO_BBOX.w / 2;
  const cy = MONO_BBOX.y + MONO_BBOX.h / 2;
  const tx = size / 2 - cx * scale;
  const ty = size / 2 - cy * scale + dy;
  return `<g fill="#fff" transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">${MONOGRAM}</g>`;
}

/**
 * The app icon.
 *
 * `padding` reserves the safe zone Android's adaptive-icon mask needs: it crops
 * to roughly the middle 80%, so a full-bleed monogram would get its corners
 * shaved off.
 */
function iconSvg({ size = 512, radiusPct = 0.22, widthPct = 0.62, padding = 0 } = {}) {
  const inner = size * (1 - padding * 2);
  const offset = size * padding;
  const r = inner * radiusPct;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${BLUE}"/>
      <stop offset="100%" stop-color="${BLUE_MID}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="none"/>
  <g transform="translate(${offset} ${offset})">
    <rect width="${inner}" height="${inner}" rx="${r.toFixed(1)}" fill="url(#g)"/>
    <g transform="translate(${(-offset).toFixed(2)} ${(-offset).toFixed(2)}) scale(${(1 - padding * 2).toFixed(4)})">
      ${placeMonogram(size, widthPct)}
    </g>
  </g>
</svg>`;
}

/** Flat navy on transparent — for contexts that supply their own background. */
function monoSvg(size = 512) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g fill="${NAVY}">${placeMonogram(size, 0.82).replace('fill="#fff"', '')}</g>
</svg>`.replace('<g fill="#fff"', '<g');
}

/** Minimal PNG-based .ico writer (every current browser and Windows reads it). */
function buildIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + count * 16;

  for (const { size, data } of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

const render = (svg, size) =>
  sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

async function main() {
  const publicDir = join(ROOT, 'public');
  const extDir = join(ROOT, 'extension', 'icons');
  await mkdir(publicDir, { recursive: true });
  await mkdir(extDir, { recursive: true });

  // Small sizes get a tighter radius and a slightly larger monogram: at 16px a
  // generous corner radius eats the mark and the letters turn to mush.
  const large = iconSvg({ size: 512, radiusPct: 0.22, widthPct: 0.62 });
  const small = iconSvg({ size: 512, radiusPct: 0.16, widthPct: 0.72 });
  // Android adaptive icons crop to ~80%; keep the mark inside that.
  const maskable = iconSvg({ size: 512, radiusPct: 0.5, widthPct: 0.5, padding: 0 });

  const written = [];
  const write = async (path, buf) => {
    await writeFile(path, buf);
    written.push(`${path.replace(ROOT + '\\', '').replace(ROOT + '/', '')} (${(buf.length / 1024).toFixed(1)} KB)`);
  };

  // Vector source — crisp at any size, used as the modern favicon.
  await write(join(publicDir, 'icon.svg'), Buffer.from(large));
  await write(join(publicDir, 'logo-mono.svg'), Buffer.from(monoSvg(512)));

  // PWA + web
  await write(join(publicDir, 'icon-192.png'), await render(large, 192));
  await write(join(publicDir, 'icon-512.png'), await render(large, 512));
  await write(join(publicDir, 'icon-maskable-512.png'), await render(maskable, 512));
  await write(join(publicDir, 'apple-touch-icon.png'), await render(small, 180));

  // favicon.ico with the three sizes Windows and browsers actually pick from
  const icoPngs = await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, data: await render(small, size) })),
  );
  await write(join(publicDir, 'favicon.ico'), buildIco(icoPngs));

  // Chrome extension
  await write(join(extDir, 'icon-16.png'), await render(small, 16));
  await write(join(extDir, 'icon-48.png'), await render(small, 48));
  await write(join(extDir, 'icon-128.png'), await render(large, 128));

  console.log('Iconos generados:\n' + written.map((w) => '  ' + w).join('\n'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
