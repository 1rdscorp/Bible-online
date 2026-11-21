#!/usr/bin/env node
/**
 * Rebuild the map data in data/geo/ (see tools/research-sources.json):
 *
 *   places.json   every place OpenBible.info locates (CC BY 4.0):
 *     { "formatVersion": 1, "places": { "a15257a": { "name": "Jerusalem",
 *       "type": "settlement", "lon": 35.2342, "lat": 31.7767, "score": 500,
 *       "slug": "jerusalem", "verses": ["JOS 10:1", …], "ru": "Иерусалим" }, … } }
 *     "score" is OpenBible.info's confidence in the identification (500 or
 *     more: high). "verses": where the Bible names the place.
 *
 *   basemap.json  coastlines, lakes and rivers from Natural Earth (public
 *     domain), clipped to the Bible lands and simplified. basemap-wide.json
 *     is the same, coarser, from Spain to the Indus (for maps of empires):
 *     { "formatVersion": 1, "bounds": [w, s, e, n], "land": [[lon, lat, lon, lat, …], …],
 *       "lakes": [{ "name": "Dead Sea", "rings": [[…]] }], "rivers": [{ "name": "Jordan", "lines": [[…]] }] }
 *
 *   node tools/build-geo.mjs
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clipLine, clipRing, flatten, geometryParts, ringArea, simplify } from './lib/geometry.mjs';
import { download } from './lib/download.mjs';
import { updateResearchManifest } from './lib/research-manifest.mjs';
import { contentVersion } from './lib/translation-file.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Islands smaller than this (square degrees, about 3 km²) are left out; Patmos and Cauda stay.
const MIN_ISLAND = 0.0003;

const tolerance = (source) => {
  if (!source.detailBox) return () => source.tolerance;
  const [w, s, e, n] = source.detailBox;
  return ([lon, lat]) => (lon >= w && lon <= e && lat >= s && lat <= n ? source.detailTolerance : source.tolerance);
};

/** One OpenBible.info record → the site's place, or null if it has no location. */
export function convertPlace(record, { en, ru } = {}) {
  const identification = record.identifications?.[0];
  const lonlat = identification?.resolutions?.[0]?.lonlat;
  if (!lonlat) return null;
  const [lon, lat] = lonlat.split(',').map(Number);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const verses = [...(record.verses ?? [])]
    .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0))
    .map((verse) => verse.usx)
    .filter((usx, i, list) => /^[1-3A-Z]{3} \d+:\d+$/.test(usx) && list.indexOf(usx) === i);
  const place = {
    // "Bethlehem 1" / "Bethlehem 2": OpenBible.info numbers places that share a name.
    name: en ?? record.friendly_id.replace(/ \d+$/, ''),
    type: record.types?.[0] ?? 'place',
    lon: Math.round(lon * 10000) / 10000,
    lat: Math.round(lat * 10000) / 10000,
    score: identification.score?.vote_total ?? 0,
    slug: record.url_slug,
    verses,
  };
  if (ru) place.ru = ru;
  return place;
}

/** Land rings inside the bounds, simplified; tiny islands dropped. */
export function landRings(features, source) {
  const rings = [];
  for (const feature of features) {
    for (const ring of geometryParts(feature.geometry)) {
      const clipped = clipRing(ring, source.bounds);
      if (clipped.length < 3 || ringArea(clipped) < (source.minIsland ?? MIN_ISLAND)) continue;
      const simple = simplify([...clipped, clipped[0]], tolerance(source)).slice(0, -1);
      if (simple.length >= 3) rings.push(flatten(simple));
    }
  }
  return rings;
}

function namedShapes(features, keep, source, kind) {
  const byName = new Map();
  for (const feature of features) {
    const name = keep[feature.properties?.name];
    if (!name) continue;
    for (const part of geometryParts(feature.geometry)) {
      const pieces = kind === 'rings' ? [clipRing(part, source.bounds)].filter((r) => r.length >= 3) : clipLine(part, source.bounds);
      for (const piece of pieces) {
        const simple = simplify(piece, tolerance(source));
        if (simple.length >= 2) {
          if (!byName.has(name)) byName.set(name, []);
          byName.get(name).push(flatten(simple));
        }
      }
    }
  }
  return [...byName].map(([name, shapes]) => ({ name, [kind]: shapes }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { geo: source } = JSON.parse(await readFile(join(ROOT, 'tools', 'research-sources.json'), 'utf8'));
  const names = JSON.parse(await readFile(join(ROOT, 'tools', 'place-names.json'), 'utf8'));
  await mkdir(join(ROOT, 'data', 'geo'), { recursive: true });
  console.log('Places (OpenBible.info) and basemap (Natural Earth)');

  const records = (await download(source.places)).toString('utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  const places = {};
  for (const record of records) {
    const place = convertPlace(record, { en: names.en[record.id], ru: names.ru[record.id] });
    if (place) places[record.id] = place;
  }
  const unknown = [...Object.keys(names.en), ...Object.keys(names.ru)].filter((id) => !places[id]);
  if (unknown.length) throw new Error(`place-names.json lists unknown places: ${unknown.join(', ')}`);
  const placesText = `{"formatVersion":1,"places":{\n${Object.entries(places)
    .map(([id, place]) => `${JSON.stringify(id)}:${JSON.stringify(place)}`)
    .join(',\n')}\n}}\n`;

  const geojson = async (url) => JSON.parse((await download(url)).toString('utf8')).features;
  const basemap = {
    formatVersion: 1,
    bounds: source.bounds,
    land: landRings(await geojson(source.land), source),
    lakes: namedShapes(await geojson(source.lakes), source.lakes_keep, source, 'rings'),
    rivers: namedShapes(await geojson(source.rivers), source.rivers_keep, source, 'lines'),
  };
  const basemapText = `${JSON.stringify(basemap)}\n`;

  const wideSource = source.wide;
  const wide = {
    formatVersion: 1,
    bounds: wideSource.bounds,
    land: landRings(await geojson(source.land), wideSource),
    lakes: namedShapes(await geojson(source.lakes), wideSource.lakes_keep, wideSource, 'rings'),
    rivers: namedShapes(await geojson(source.rivers), wideSource.rivers_keep, wideSource, 'lines'),
  };
  const wideText = `${JSON.stringify(wide)}\n`;
  await writeFile(join(ROOT, wideSource.file), wideText);

  await writeFile(join(ROOT, 'data', 'geo', 'places.json'), placesText);
  await writeFile(join(ROOT, 'data', 'geo', 'basemap.json'), basemapText);
  await updateResearchManifest('geo', {
    places: { url: 'data/geo/places.json', version: contentVersion(placesText), count: Object.keys(places).length },
    basemap: { url: 'data/geo/basemap.json', version: contentVersion(basemapText) },
    basemapWide: { url: wideSource.file, version: contentVersion(wideText) },
    license: 'CC BY 4.0 (places); public domain (basemap)',
    source: { name: 'OpenBible.info', url: 'https://www.openbible.info/geo/' },
    basemapSource: { name: 'Natural Earth', url: 'https://www.naturalearthdata.com/' },
  });
  const points = basemap.land.reduce((sum, ring) => sum + ring.length / 2, 0);
  console.log(`  ${Object.keys(places).length} places (${(Buffer.byteLength(placesText) / 1e3).toFixed(0)} kB)`);
  console.log(`  basemap: ${basemap.land.length} land rings, ${points} points; ${basemap.lakes.length} lakes, ${basemap.rivers.length} rivers (${(Buffer.byteLength(basemapText) / 1e3).toFixed(0)} kB)`);
  const widePoints = wide.land.reduce((sum, ring) => sum + ring.length / 2, 0);
  console.log(`  wide basemap: ${wide.land.length} land rings, ${widePoints} points; ${wide.lakes.length} lakes, ${wide.rivers.length} rivers (${(Buffer.byteLength(wideText) / 1e3).toFixed(0)} kB)`);
}
