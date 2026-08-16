#!/usr/bin/env node
/**
 * sync-flickr.js
 *
 * Syncs all public photos from the Flickr account into config/photos.json
 * and downloads images into images/. Overwrites photos.json on every run
 * so activity stats (faves, views) stay current. Image files are skipped
 * if already downloaded.
 *
 * Usage:
 *   FLICKR_API_KEY=your_key node scripts/sync-flickr.js
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const FLICKR_USERNAME = process.env.FLICKR_USERNAME || 'dcaminosastre';
const PHOTOS_PATH = path.join(ROOT, 'config/photos.json');
const IMAGES_DIR = path.join(ROOT, 'images');

// ---------------------------------------------------------------------------
// Slug — photo-level slug computed at import time from title + photo ID
// ---------------------------------------------------------------------------
const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---------------------------------------------------------------------------
// Filename — each non-alphanumeric character → '_', then append _PHOTOID.jpg
// ---------------------------------------------------------------------------
function buildFilename(title, photoId) {
  const sanitized = title.split('').map(c => /[A-Za-z0-9]/.test(c) ? c : '_').join('');
  return `${sanitized}_${photoId}.jpg`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
function flickrRequest(method, params = {}) {
  const apiKey = process.env.FLICKR_API_KEY;
  if (!apiKey) throw new Error('FLICKR_API_KEY env var is not set');

  const query = new URLSearchParams({
    method,
    api_key: apiKey,
    format: 'json',
    nojsoncallback: '1',
    ...params,
  }).toString();

  return new Promise((resolve, reject) => {
    https.get(
      { hostname: 'api.flickr.com', path: `/services/rest/?${query}` },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.stat === 'fail') {
              reject(new Error(`Flickr [${method}]: ${data.message} (code ${data.code})`));
            } else {
              resolve(data);
            }
          } catch {
            reject(new Error(`JSON parse error for ${method}: ${body.slice(0, 300)}`));
          }
        });
      }
    ).on('error', reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) { resolve(false); return; }

    const tmp = dest + '.tmp';
    const file = fs.createWriteStream(tmp);

    const get = (u) => https.get(u, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.destroy();
        return get(res.headers.location);
      }
      if (res.statusCode !== 200) {
        file.destroy();
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
        return reject(new Error(`HTTP ${res.statusCode} downloading ${u}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        fs.renameSync(tmp, dest);
        resolve(true);
      });
    }).on('error', (err) => {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      reject(err);
    });

    get(url);
  });
}

// ---------------------------------------------------------------------------
// Flickr API helpers
// ---------------------------------------------------------------------------
async function resolveUserId(username) {
  const res = await flickrRequest('flickr.urls.lookupUser', { url: `https://www.flickr.com/photos/${username}/` });
  return res.user.id;
}

async function fetchAllPublicPhotos(userId) {
  const photos = [];
  let page = 1;
  let totalPages = 1;

  do {
    const res = await flickrRequest('flickr.people.getPublicPhotos', {
      user_id: userId,
      per_page: '500',
      page: String(page),
      extras: 'tags,media,count_faves,views,url_l,width_l,height_l,date_taken,geo',
    });
    totalPages = res.photos.pages;
    for (const p of res.photos.photo) {
      if (!p.media || p.media === 'photo') photos.push(p);
    }
    page++;
  } while (page <= totalPages);

  return photos;
}

// Returns description and comment count — both come from the same getInfo call
async function fetchInfo(photoId) {
  const res = await flickrRequest('flickr.photos.getInfo', { photo_id: photoId });
  return {
    description: res.photo.description?._content || null,
    numComments: parseInt(res.photo.comments?._content || 0, 10),
  };
}

async function fetchExif(photoId) {
  const res = await flickrRequest('flickr.photos.getExif', { photo_id: photoId });
  const tags = res.photo.exif || [];
  const get = (tag) => tags.find(t => t.tag === tag)?.raw?._content || null;
  return {
    make:         get('Make'),
    model:        get('Model'),
    lens:         get('LensModel'),
    fNumber:      get('FNumber'),
    exposureTime: get('ExposureTime'),
    iso:          get('ISOSpeedRatings'),
    focalLength:  get('FocalLength'),
  };
}

async function fetchGeoLocation(photoId) {
  const res = await flickrRequest('flickr.photos.geo.getLocation', { photo_id: photoId });
  const loc = res.photo.location;
  return {
    locality: loc.locality?._content || null,
    county:   loc.county?._content   || null,
    region:   loc.region?._content   || null,
    country:  loc.country?._content  || null,
    lat: parseFloat(loc.latitude),
    lon: parseFloat(loc.longitude),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!process.env.FLICKR_API_KEY) {
    console.error('Error: FLICKR_API_KEY environment variable is required.');
    process.exit(1);
  }

  const userId = await resolveUserId(FLICKR_USERNAME);
  const allPhotos = await fetchAllPublicPhotos(userId);
  console.log(`${allPhotos.length} public photos found.`);

  let completed = 0;

  async function processPhoto(photo) {
    const title = photo.title || `Photo ${photo.id}`;
    const faves = parseInt(photo.count_faves || 0, 10);
    const views = parseInt(photo.views || 0, 10);
    const tags = photo.tags ? photo.tags.split(' ').filter(Boolean) : [];
    const flickrUrl = `https://live.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_b.jpg`;
    const width  = parseInt(photo.width_l  || 0, 10);
    const height = parseInt(photo.height_l || 0, 10);
    const filename = buildFilename(title, photo.id);
    const destPath = path.join(IMAGES_DIR, filename);

    const rawLat = parseFloat(photo.latitude);
    const rawLon = parseFloat(photo.longitude);
    const hasGeo = rawLat !== 0 && rawLon !== 0 && !isNaN(rawLat) && !isNaN(rawLon);

    const [downloaded, location, info, exif] = await Promise.all([
      downloadFile(flickrUrl, destPath),
      hasGeo
        ? fetchGeoLocation(photo.id).catch(() => ({ locality: null, county: null, region: null, country: null, lat: rawLat, lon: rawLon }))
        : Promise.resolve({ locality: null, county: null, region: null, country: null, lat: null, lon: null }),
      fetchInfo(photo.id).catch(() => ({ description: null, numComments: 0 })),
      fetchExif(photo.id).catch(() => null),
    ]);

    const status = downloaded ? 'downloaded' : 'exists';
    const geoLabel = location.region || location.country || 'no geo';
    console.log(`[${++completed}/${allPhotos.length}] ${title} (${faves} faves, ${views} views) — ${status}, ${geoLabel}`);

    return {
      flickr_id: photo.id,
      slug: slugify(title),
      image: `images/${filename}`,
      alt: title,
      caption: title,
      description: info.description,
      location,
      ...(width && height ? { width, height } : {}),
      url: flickrUrl,
      dateTaken: photo.datetaken || null,
      tags,
      activity: { faves, views, numComments: info.numComments },
      exif,
    };
  }

  const CONCURRENCY = 20;
  const results = [];
  for (let i = 0; i < allPhotos.length; i += CONCURRENCY) {
    const batch = await Promise.allSettled(allPhotos.slice(i, i + CONCURRENCY).map(p => processPhoto(p)));
    results.push(...batch);
  }
  const entries = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);
  results
    .filter(r => r.status === 'rejected')
    .forEach(r => console.warn(`Warning: skipped — ${r.reason?.message}`));

  entries.sort((a, b) => (a.dateTaken ?? '').localeCompare(b.dateTaken ?? ''));
  fs.writeFileSync(PHOTOS_PATH, JSON.stringify(entries, null, 2), 'utf-8');
  console.log(`\nDone. ${entries.length} photos written to config/photos.json.`);
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
