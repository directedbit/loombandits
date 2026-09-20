// Renders public/icon.svg to the PNG sizes the manifest and iOS need.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const src = 'public/icon.svg';
await mkdir('public/icons', { recursive: true });

const plain = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/apple-touch-icon-180.png', 180],
];
for (const [out, size] of plain) {
  await sharp(src, { density: 384 }).resize(size, size).png().toFile(out);
  console.log('   wrote', out);
}

// Maskable icon: artwork inside the 80% safe zone on a solid background.
const size = 512;
const inner = Math.round(size * 0.8);
const art = await sharp(src, { density: 384 }).resize(inner, inner).png().toBuffer();
await sharp({ create: { width: size, height: size, channels: 4, background: '#1e1e1e' } })
  .composite([{ input: art, gravity: 'centre' }])
  .png()
  .toFile('public/icons/maskable-512.png');
console.log('   wrote public/icons/maskable-512.png');
