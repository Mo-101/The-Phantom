// scripts/convert-corridors-meta-to-geojson.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sourcePath = path.join(__dirname, '../public/data/corridors_meta.json');
const targetPath = path.join(__dirname, '../public/data/corridors_meta.geojson');

console.log(`Reading metadata from: ${sourcePath}`);

if (!fs.existsSync(sourcePath)) {
  console.error(`Error: Source file does not exist at ${sourcePath}`);
  process.exit(1);
}

try {
  const rawData = fs.readFileSync(sourcePath, 'utf-8');
  const corridors = JSON.parse(rawData);

  if (!Array.isArray(corridors)) {
    throw new Error('JSON structure must be an array of corridors.');
  }

  const features = corridors.map(c => {
    // GeoJSON coordinate order is strictly [longitude, latitude]
    const coordinates = c.center; // Already in [lng, lat] format inside corridors_meta.json
    
    return {
      type: "Feature",
      id: c.id,
      geometry: {
        type: "Point",
        coordinates: coordinates
      },
      properties: {
        id: c.id,
        name: c.name,
        risk: c.risk,
        km: c.km,
        mode: c.mode,
        zoom: c.zoom
      }
    };
  });

  const geojson = {
    type: "FeatureCollection",
    features: features
  };

  fs.writeFileSync(targetPath, JSON.stringify(geojson, null, 2), 'utf-8');
  console.log(`\n🎉 Successfully converted corridors metadata to GeoJSON!`);
  console.log(`Saved ${features.length} point features to: ${targetPath}\n`);

} catch (error) {
  console.error(`Conversion failed:`, error);
  process.exit(1);
}
