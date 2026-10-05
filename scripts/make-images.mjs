// One-off: makes the resized hero pictures and app icons in public/.
// Run with:  npm i --no-save sharp  &&  node scripts/make-images.mjs
import sharp from 'sharp';

const hero = sharp('public/hero.jpg');
await hero.clone().resize(640).webp({ quality: 72 }).toFile('public/hero-640.webp');
await hero.clone().resize(1200).webp({ quality: 72 }).toFile('public/hero-1200.webp');

for (const [size, name] of [[192, 'icon-192.png'], [512, 'icon-512.png'], [180, 'apple-touch-icon.png']]) {
  await sharp('public/favicon.svg', { density: 384 }).resize(size, size).png().toFile(`public/${name}`);
}
console.log('done');
