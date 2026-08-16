/**
 * Static HTML Build Script
 * Generates HTML files for each language from templates
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load config
const config = JSON.parse(readFileSync(resolve(ROOT, 'config/site.json'), 'utf-8'));

// Load photos, skipping any whose image file is missing on disk
const photos = JSON.parse(readFileSync(resolve(ROOT, 'config/photos.json'), 'utf-8'));
for (const p of photos) {
  if (!existsSync(resolve(ROOT, p.image)))
    throw new Error(`Missing image file: ${p.image} (id ${p.flickr_id})`);
}

// ---------------------------------------------------------------------------
// Location helpers (kept here so sync-flickr.js stays unaware of aliases)
// ---------------------------------------------------------------------------
const LOCATION_ALIASES = new Map([
  ['illes balears',   'Balearic Islands'],
  ['baleares',        'Balearic Islands'],
  ['uk',              'United Kingdom'],
  ['españa',          'Spain'],
]);
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const normalizeName = name => LOCATION_ALIASES.get(name.toLowerCase()) ?? name;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------
const LEVELS             = ['region', 'country'];
const LEVEL_ORDER        = { region: 0, country: 1 };
const MIN_FILTER_COUNT   = 10;
const MAX_REGIONS        = 6;
const SCORE_WEIGHTS      = { faves: 10, views: 0.01, comments: 15 };
const RECENT_COUNT       = 5;
const RECENT_BONUS       = 1.5;
const AGE_PENALTY_PER_YEAR = 0.05;
const displayCount = total => Math.min(total, Math.max(30, Math.ceil(total * 0.10)));


const recentIds = new Set(
  [...photos]
    .filter(p => p.dateTaken)
    .sort((a, b) => b.dateTaken.localeCompare(a.dateTaken))
    .slice(0, RECENT_COUNT)
    .map(p => p.flickr_id)
);

const now = Date.now();
const scored = photos.map(p => {
  const { faves = 0, views = 0, numComments = 0 } = p.activity ?? {};
  const ageYears = p.dateTaken
    ? (now - new Date(p.dateTaken.replace(' ', 'T'))) / (365.25 * 24 * 3600 * 1000)
    : 0;
  const ageFactor = Math.max(0.1, 1 - ageYears * AGE_PENALTY_PER_YEAR);
  let score = (faves * SCORE_WEIGHTS.faves
             + views * SCORE_WEIGHTS.views
             + numComments * SCORE_WEIGHTS.comments) * ageFactor;
  if (recentIds.has(p.flickr_id)) score *= RECENT_BONUS;
  return { ...p, _score: score };
});

// ---------------------------------------------------------------------------
// Location algorithm
// Runs on all scored photos. Location names are normalized to merge aliases.
// Deduplication: if a more-specific location shares >=90% of its photos with
// a less-specific ancestor AND those photos make up >=90% of the ancestor,
// drop the specific one and keep only the ancestor.
// Only the top MAX_REGIONS locations by total score sum get filter buttons.
// ---------------------------------------------------------------------------
// nameGroups keyed by slug (pre-computed in sync), value tracks display name,
// photo set, and most-specific hierarchy level seen.
const nameGroups = new Map(); // slug → { name, photoIds, minLevel }
for (const photo of scored) {
  const seenSlugs = new Set();
  for (const level of LEVELS) {
    const raw = photo.location?.[level];
    if (!raw) continue;
    const name = normalizeName(raw);
    const slug = slugify(name);
    if (seenSlugs.has(slug)) continue;
    seenSlugs.add(slug);
    if (!nameGroups.has(slug)) nameGroups.set(slug, { name, photoIds: new Set(), minLevel: LEVEL_ORDER[level] });
    const g = nameGroups.get(slug);
    g.photoIds.add(photo.flickr_id);
    g.minLevel = Math.min(g.minLevel, LEVEL_ORDER[level]);
  }
}

const candidates = [];
for (const [slug, { name, photoIds, minLevel }] of nameGroups) {
  if (photoIds.size >= MIN_FILTER_COUNT)
    candidates.push({ name, slug, photoIds, minLevel });
}

const allRegions = candidates.filter(specific =>
  !candidates.some(general => {
    if (general.minLevel <= specific.minLevel) return false;
    const intersection = [...specific.photoIds].filter(id => general.photoIds.has(id));
    if (intersection.length / specific.photoIds.size < 0.85) return false;
    return intersection.length / general.photoIds.size >= 0.85;
  })
);

// Assign filter slugs to every scored photo (using all regions, before top-N cut)
const photoFilterSlugs = new Map();
for (const region of allRegions) {
  for (const id of region.photoIds) {
    if (!photoFilterSlugs.has(id)) photoFilterSlugs.set(id, []);
    photoFilterSlugs.get(id).push(region.slug);
  }
}
const scoredWithSlugs = scored.map(p => ({ ...p, _filterSlugs: photoFilterSlugs.get(p.flickr_id) ?? [] }));

// Rank by total score minus the score of any more-specific sub-candidate whose
// photos largely overlap with this one. E.g. Spain's rank = Spain total - Balearic Islands total.
const regionTotalScore = new Map();
for (const region of allRegions) {
  const total = scoredWithSlugs.filter(p => p._filterSlugs.includes(region.slug)).reduce((s, p) => s + p._score, 0);
  regionTotalScore.set(region.slug, total);
}
const regionRankScore = new Map();
for (const region of allRegions) {
  const subScore = allRegions
    .filter(other => {
      if (other.minLevel >= region.minLevel) return false; // other must be more specific
      const intersection = [...other.photoIds].filter(id => region.photoIds.has(id));
      return intersection.length / other.photoIds.size >= 0.7; // other is largely inside region
    })
    .reduce((s, other) => s + (regionTotalScore.get(other.slug) ?? 0), 0);
  regionRankScore.set(region.slug, (regionTotalScore.get(region.slug) ?? 0) - subScore);
}
allRegions.sort((a, b) => (regionRankScore.get(b.slug) ?? 0) - (regionRankScore.get(a.slug) ?? 0));
const regions = allRegions.slice(0, MAX_REGIONS);

// ---------------------------------------------------------------------------
// Per-filter top-N selection (global + top MAX_REGIONS only)
// ---------------------------------------------------------------------------
const globalSorted = [...scoredWithSlugs].sort((a, b) => b._score - a._score);
const globalTopIds = new Set(globalSorted.slice(0, displayCount(globalSorted.length)).map(p => p.flickr_id));

const regionTopIds = new Map();
for (const region of regions) {
  const pool = scoredWithSlugs.filter(p => p._filterSlugs.includes(region.slug));
  regionTopIds.set(
    region.slug,
    new Set(
      [...pool].sort((a, b) => b._score - a._score)
               .slice(0, displayCount(pool.length))
               .map(p => p.flickr_id)
    )
  );
}

const visibleInMap = new Map();
for (const p of scoredWithSlugs) {
  const filters = [];
  if (globalTopIds.has(p.flickr_id)) filters.push('all');

  // Among top regions this photo belongs to, only assign it to the most specific one
  // (lowest minLevel = locality < county < region < country) so e.g. a Mallorca photo
  // doesn't also appear under Spain.
  const photoRegions = regions.filter(r => regionTopIds.get(r.slug)?.has(p.flickr_id));
  if (photoRegions.length > 0) {
    const mostSpecific = photoRegions.reduce((a, b) => a.minLevel < b.minLevel ? a : b);
    filters.push(mostSpecific.slug);
  }

  if (filters.length) visibleInMap.set(p.flickr_id, filters.join(' '));
}

// Default display order: score descending (matches the default "Activity" sort in the UI)
const displayPhotos = scoredWithSlugs
  .filter(p => visibleInMap.has(p.flickr_id))
  .sort((a, b) => b._score - a._score)
  .map(p => ({ ...p, _visibleIn: visibleInMap.get(p.flickr_id) }));

config.photos = displayPhotos;
config.regions = regions.map(r => ({ slug: r.slug, name: r.name }));

// Load translations
const translations = JSON.parse(readFileSync(resolve(ROOT, 'config/translations.json'), 'utf-8'));

// Import templates
const { indexPage } = await import('../src/templates/index.js');
const { aboutPage } = await import('../src/templates/about.js');

// Languages to generate
const languages = ['es', 'ca', 'en'];

// Output directory
const DIST = resolve(ROOT, 'dist');

// Ensure dist directory exists
mkdirSync(DIST, { recursive: true });

// Copy static assets
console.log('Copying static assets...');

// Copy CSS
mkdirSync(resolve(DIST, 'css'), { recursive: true });
cpSync(resolve(ROOT, 'css'), resolve(DIST, 'css'), { recursive: true });

// Copy JS
mkdirSync(resolve(DIST, 'js'), { recursive: true });
cpSync(resolve(ROOT, 'js/main.js'), resolve(DIST, 'js/main.js'));

// Copy images
if (existsSync(resolve(ROOT, 'images'))) {
  mkdirSync(resolve(DIST, 'images'), { recursive: true });
  cpSync(resolve(ROOT, 'images'), resolve(DIST, 'images'), { recursive: true });
}

// Generate HTML for each language
console.log('Generating HTML files...');

for (const lang of languages) {
  console.log(`  Generating ${lang}...`);

  // Determine output directory and basePath
  let outDir;
  let basePath;

  if (lang === 'es') {
    // Spanish is the default, goes in root
    outDir = DIST;
    basePath = '.';
  } else {
    // Other languages go in subdirectories
    outDir = resolve(DIST, lang);
    mkdirSync(outDir, { recursive: true });
    basePath = '..';
  }

  // Generate index page
  const indexHtml = indexPage({ lang, config, translations, basePath });
  writeFileSync(resolve(outDir, 'index.html'), indexHtml);
  console.log(`    ✓ ${lang === 'es' ? '' : lang + '/'}index.html`);

  // Generate about page
  const aboutHtml = aboutPage({ lang, config, translations, basePath });
  writeFileSync(resolve(outDir, 'about.html'), aboutHtml);
  console.log(`    ✓ ${lang === 'es' ? '' : lang + '/'}about.html`);
}

console.log('\nBuild complete! Output in dist/');
console.log('Run "npm run dev" to preview or "npm run build" to create production build.');
