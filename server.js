// ==========================================
// TTGODMODE — TikTok Download + Meta Randomizer
// ==========================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { Downloader } = require('@tobyg74/tiktok-api-dl');
const multer = require('multer');

// Try to load fluent-ffmpeg (optional — only needed for metadata randomizer)
let ffmpeg;
try {
  ffmpeg = require('fluent-ffmpeg');
} catch (e) {
  console.warn('[WARN] fluent-ffmpeg not installed. Metadata randomizer will be disabled.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Paths
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = uuidv4();
    const sessionDir = path.join(UPLOADS_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    req.uploadSessionId = sessionId;
    req.uploadSessionDir = sessionDir;
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    // Keep original filename with sanitization
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `original_${Date.now()}_${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB max per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/x-matroska'];
    if (allowedTypes.includes(file.mimetype) || file.originalname.match(/\.(mp4|mov|avi|webm|mkv)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed (mp4, mov, avi, webm, mkv)'));
    }
  }
});

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// Store active sessions & SSE clients
// ==========================================
const sessions = {}; // sessionId -> { urls, status, files, clients[], randomizeMeta }

// ==========================================
// Metadata Randomizer — Presets from railmetas
// ==========================================

function getRandomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function randomFloat(min, max, decimals = 4) {
  return (min + Math.random() * (max - min)).toFixed(decimals);
}

function generateRandomMetadata() {
  const authors = [
    'Nova_Media', 'Frame_Studio', 'Motion_Lab', 'Digital_Wave',
    'Creative_Edge', 'Visual_Arts', 'Media_Pro', 'Content_Master',
    'Pixel_Factory', 'Stream_Creator', 'Video_Forge', 'Edit_Zone'
  ];

  const titles = [
    'Amazing_Video', 'Creative_Clip', 'Fresh_Media', 'Stunning_Content',
    'High_Quality', 'Professional', 'Enhanced_Result', 'Premium_Quality',
    'Outstanding_Media', 'Best_Video', 'Awesome_Output', 'Superb_Export'
  ];

  const descriptions = [
    'high_quality_export', 'optimized_for_sharing', 'enhanced_media',
    'professional_content', 'premium_result', 'carefully_processed'
  ];

  const keywords = [
    'clip', 'media', 'export', 'visual', 'content', 'video',
    'production', 'creative', 'premium', 'quality', 'enhanced'
  ];

  const title = getRandomElement(titles);
  const shuffledDesc = shuffleArray(descriptions).slice(0, 3).join(' ');
  const selectedKeywords = shuffleArray(keywords).slice(0, 5).join(' ');

  return {
    artist: getRandomElement(authors),
    author: getRandomElement(authors),
    title: title,
    description: shuffledDesc,
    comment: `randomized_${Math.random().toString(36).substring(2, 12)}`,
    encoder: `ttgodmode_${Math.random().toString(36).substring(2, 8)}`,
    publisher: getRandomElement(authors),
    keywords: selectedKeywords,
    handler_name: getRandomElement(['VideoHandler', 'Core Media Video', 'Mainconcept MP4 Video', 'ISO Media Video']),
    audio_handler_name: getRandomElement(['SoundHandler', 'Core Media Audio', 'Mainconcept MP4 Sound', 'ISO Media Audio']),
    language: getRandomElement(['und', 'eng'])
  };
}

// ==========================================
// Device Spoof — iPhone 11 → 17 Pro Max + Google Pixel
// ==========================================
const DEVICE_PRESETS = {
  iphone: [
    { key: 'iphone-11', brand: 'apple', name: 'iPhone 11', model: 'iPhone 11', osMin: 13, osMax: 26 },
    { key: 'iphone-11-pro', brand: 'apple', name: 'iPhone 11 Pro', model: 'iPhone 11 Pro', osMin: 13, osMax: 26 },
    { key: 'iphone-11-pro-max', brand: 'apple', name: 'iPhone 11 Pro Max', model: 'iPhone 11 Pro Max', osMin: 13, osMax: 26 },
    { key: 'iphone-12-mini', brand: 'apple', name: 'iPhone 12 mini', model: 'iPhone 12 mini', osMin: 14, osMax: 26 },
    { key: 'iphone-12', brand: 'apple', name: 'iPhone 12', model: 'iPhone 12', osMin: 14, osMax: 26 },
    { key: 'iphone-12-pro', brand: 'apple', name: 'iPhone 12 Pro', model: 'iPhone 12 Pro', osMin: 14, osMax: 26 },
    { key: 'iphone-12-pro-max', brand: 'apple', name: 'iPhone 12 Pro Max', model: 'iPhone 12 Pro Max', osMin: 14, osMax: 26 },
    { key: 'iphone-13-mini', brand: 'apple', name: 'iPhone 13 mini', model: 'iPhone 13 mini', osMin: 15, osMax: 26 },
    { key: 'iphone-13', brand: 'apple', name: 'iPhone 13', model: 'iPhone 13', osMin: 15, osMax: 26 },
    { key: 'iphone-13-pro', brand: 'apple', name: 'iPhone 13 Pro', model: 'iPhone 13 Pro', osMin: 15, osMax: 26 },
    { key: 'iphone-13-pro-max', brand: 'apple', name: 'iPhone 13 Pro Max', model: 'iPhone 13 Pro Max', osMin: 15, osMax: 26 },
    { key: 'iphone-14', brand: 'apple', name: 'iPhone 14', model: 'iPhone 14', osMin: 16, osMax: 26 },
    { key: 'iphone-14-plus', brand: 'apple', name: 'iPhone 14 Plus', model: 'iPhone 14 Plus', osMin: 16, osMax: 26 },
    { key: 'iphone-14-pro', brand: 'apple', name: 'iPhone 14 Pro', model: 'iPhone 14 Pro', osMin: 16, osMax: 26 },
    { key: 'iphone-14-pro-max', brand: 'apple', name: 'iPhone 14 Pro Max', model: 'iPhone 14 Pro Max', osMin: 16, osMax: 26 },
    { key: 'iphone-15', brand: 'apple', name: 'iPhone 15', model: 'iPhone 15', osMin: 17, osMax: 26 },
    { key: 'iphone-15-plus', brand: 'apple', name: 'iPhone 15 Plus', model: 'iPhone 15 Plus', osMin: 17, osMax: 26 },
    { key: 'iphone-15-pro', brand: 'apple', name: 'iPhone 15 Pro', model: 'iPhone 15 Pro', osMin: 17, osMax: 26 },
    { key: 'iphone-15-pro-max', brand: 'apple', name: 'iPhone 15 Pro Max', model: 'iPhone 15 Pro Max', osMin: 17, osMax: 26 },
    { key: 'iphone-16', brand: 'apple', name: 'iPhone 16', model: 'iPhone 16', osMin: 18, osMax: 26 },
    { key: 'iphone-16-plus', brand: 'apple', name: 'iPhone 16 Plus', model: 'iPhone 16 Plus', osMin: 18, osMax: 26 },
    { key: 'iphone-16-pro', brand: 'apple', name: 'iPhone 16 Pro', model: 'iPhone 16 Pro', osMin: 18, osMax: 26 },
    { key: 'iphone-16-pro-max', brand: 'apple', name: 'iPhone 16 Pro Max', model: 'iPhone 16 Pro Max', osMin: 18, osMax: 26 },
    { key: 'iphone-17', brand: 'apple', name: 'iPhone 17', model: 'iPhone 17', osMin: 26, osMax: 26 },
    { key: 'iphone-17-air', brand: 'apple', name: 'iPhone 17 Air', model: 'iPhone 17 Air', osMin: 26, osMax: 26 },
    { key: 'iphone-17-pro', brand: 'apple', name: 'iPhone 17 Pro', model: 'iPhone 17 Pro', osMin: 26, osMax: 26 },
    { key: 'iphone-17-pro-max', brand: 'apple', name: 'iPhone 17 Pro Max', model: 'iPhone 17 Pro Max', osMin: 26, osMax: 26 }
  ],
  pixel: [
    { key: 'pixel-6', brand: 'google', name: 'Google Pixel 6', model: 'Pixel 6', osMin: 12, osMax: 15 },
    { key: 'pixel-6-pro', brand: 'google', name: 'Google Pixel 6 Pro', model: 'Pixel 6 Pro', osMin: 12, osMax: 15 },
    { key: 'pixel-6a', brand: 'google', name: 'Google Pixel 6a', model: 'Pixel 6a', osMin: 12, osMax: 15 },
    { key: 'pixel-7', brand: 'google', name: 'Google Pixel 7', model: 'Pixel 7', osMin: 13, osMax: 16 },
    { key: 'pixel-7-pro', brand: 'google', name: 'Google Pixel 7 Pro', model: 'Pixel 7 Pro', osMin: 13, osMax: 16 },
    { key: 'pixel-7a', brand: 'google', name: 'Google Pixel 7a', model: 'Pixel 7a', osMin: 13, osMax: 16 },
    { key: 'pixel-8', brand: 'google', name: 'Google Pixel 8', model: 'Pixel 8', osMin: 14, osMax: 16 },
    { key: 'pixel-8-pro', brand: 'google', name: 'Google Pixel 8 Pro', model: 'Pixel 8 Pro', osMin: 14, osMax: 16 },
    { key: 'pixel-8a', brand: 'google', name: 'Google Pixel 8a', model: 'Pixel 8a', osMin: 14, osMax: 16 },
    { key: 'pixel-9', brand: 'google', name: 'Google Pixel 9', model: 'Pixel 9', osMin: 14, osMax: 16 },
    { key: 'pixel-9-pro', brand: 'google', name: 'Google Pixel 9 Pro', model: 'Pixel 9 Pro', osMin: 14, osMax: 16 },
    { key: 'pixel-9-pro-xl', brand: 'google', name: 'Google Pixel 9 Pro XL', model: 'Pixel 9 Pro XL', osMin: 14, osMax: 16 },
    { key: 'pixel-9-pro-fold', brand: 'google', name: 'Google Pixel 9 Pro Fold', model: 'Pixel 9 Pro Fold', osMin: 14, osMax: 16 },
    { key: 'pixel-9a', brand: 'google', name: 'Google Pixel 9a', model: 'Pixel 9a', osMin: 15, osMax: 16 },
    { key: 'pixel-10', brand: 'google', name: 'Google Pixel 10', model: 'Pixel 10', osMin: 16, osMax: 16 },
    { key: 'pixel-10-pro', brand: 'google', name: 'Google Pixel 10 Pro', model: 'Pixel 10 Pro', osMin: 16, osMax: 16 },
    { key: 'pixel-10-pro-xl', brand: 'google', name: 'Google Pixel 10 Pro XL', model: 'Pixel 10 Pro XL', osMin: 16, osMax: 16 },
    { key: 'pixel-10-pro-fold', brand: 'google', name: 'Google Pixel 10 Pro Fold', model: 'Pixel 10 Pro Fold', osMin: 16, osMax: 16 }
  ]
};

// Realistic GPS coordinates used for the ©xyz location tag
const SPOOF_LOCATIONS = [
  { name: 'Jakarta', lat: -6.2088, lon: 106.8456 },
  { name: 'Bandung', lat: -6.9175, lon: 107.6191 },
  { name: 'Surabaya', lat: -7.2575, lon: 112.7521 },
  { name: 'Yogyakarta', lat: -7.7956, lon: 110.3695 },
  { name: 'Bali', lat: -8.6705, lon: 115.2126 },
  { name: 'Medan', lat: 3.5952, lon: 98.6722 },
  { name: 'Singapore', lat: 1.3521, lon: 103.8198 },
  { name: 'Kuala Lumpur', lat: 3.1390, lon: 101.6869 },
  { name: 'Bangkok', lat: 13.7563, lon: 100.5018 },
  { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { name: 'Seoul', lat: 37.5665, lon: 126.9780 },
  { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
  { name: 'Dubai', lat: 25.2048, lon: 55.2708 },
  { name: 'London', lat: 51.5074, lon: -0.1278 },
  { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  { name: 'New York', lat: 40.7128, lon: -74.0060 },
  { name: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
  { name: 'San Francisco', lat: 37.7749, lon: -122.4194 }
];

function randomOsVersion(minMajor, maxMajor) {
  const span = maxMajor - minMajor;
  const major = minMajor + Math.floor(Math.pow(Math.random(), 0.6) * (span + 1));
  const minor = Math.floor(Math.random() * 5);
  if (Math.random() < 0.35) {
    return `${major}.${minor}.${Math.floor(Math.random() * 3)}`;
  }
  return `${major}.${minor}`;
}

function randomAndroidVersion(minMajor, maxMajor) {
  const span = maxMajor - minMajor;
  return String(minMajor + Math.floor(Math.pow(Math.random(), 0.6) * (span + 1)));
}

function randomCreationDate() {
  const now = Date.now();
  const offset = Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000);
  const d = new Date(now - offset);
  return d.toISOString().replace(/\.\d{3}Z$/, '.000000Z');
}

function formatIso6709(lat, lon) {
  const fmtLat = `${lat >= 0 ? '+' : '-'}${Math.abs(lat).toFixed(4).padStart(7, '0')}`;
  const fmtLon = `${lon >= 0 ? '+' : '-'}${Math.abs(lon).toFixed(4).padStart(8, '0')}`;
  return `${fmtLat}${fmtLon}/`;
}

function resolveDevicePreset(key) {
  const all = [...DEVICE_PRESETS.iphone, ...DEVICE_PRESETS.pixel];
  if (key === 'random' || key === 'random-all') return getRandomElement(all);
  if (key === 'random-iphone') return getRandomElement(DEVICE_PRESETS.iphone);
  if (key === 'random-pixel') return getRandomElement(DEVICE_PRESETS.pixel);
  return all.find(d => d.key === key) || getRandomElement(all);
}

function generateDeviceMetadata(preset, options = {}) {
  const isApple = preset.brand === 'apple';
  const meta = {
    deviceName: preset.name,
    make: isApple ? 'Apple' : 'Google',
    model: preset.model,
    software: isApple
      ? randomOsVersion(preset.osMin, preset.osMax)
      : `Android ${randomAndroidVersion(preset.osMin, preset.osMax)}`,
    handler: isApple ? 'Core Media Video' : 'VideoHandle',
    audioHandler: isApple ? 'Core Media Audio' : 'SoundHandle'
  };

  if (options.randomDate !== false) {
    meta.creationTime = randomCreationDate();
  }
  if (options.randomLocation !== false) {
    const loc = getRandomElement(SPOOF_LOCATIONS);
    meta.location = formatIso6709(loc.lat, loc.lon);
    meta.locationName = loc.name;
  }
  return meta;
}

// ==========================================
// FFmpeg Video Processor — 10 Uniqueness Techniques
// ==========================================

async function processVideoWithFFmpeg(inputPath, outputPath) {
  if (!ffmpeg) {
    throw new Error('FFmpeg not available. Install fluent-ffmpeg and ensure ffmpeg is in PATH.');
  }

  return new Promise((resolve, reject) => {
    const metadata = generateRandomMetadata();

    // Natural-looking jitter without changing the original 9:16 dimensions.
    const pitchFactor = 1 + (Math.random() * 0.012 - 0.006);
    const tempoFactor = 1 / pitchFactor;
    const brightness = randomFloat(-0.01, 0.01);
    const contrast = randomFloat(0.98, 1.02);
    const saturation = randomFloat(0.98, 1.03);
    const noiseStrength = randomFloat(0.3, 1.1, 2);

    const audioBitrates = ['128k', '144k', '160k', '176k', '192k'];
    const audioBitrate = getRandomElement(audioBitrates);

    const crfValues = [22, 23, 24, 25];
    const crf = getRandomElement(crfValues);
    const preset = getRandomElement(['veryfast', 'faster', 'fast']);

    let command = ffmpeg(inputPath)
      .outputOptions(['-y'])
      .outputOptions(['-map_metadata', '-1'])

      // Keep the original 9:16 frame size; apply only subtle color/noise changes.
      .videoFilters([
        `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
        `noise=alls=${noiseStrength}:allf=t+u`
      ])

      // Audio filters: pitch shift
      .audioFilters([
        `asetrate=44100*${pitchFactor.toFixed(4)}`,
        'aresample=44100',
        `atempo=${tempoFactor.toFixed(4)}`
      ])

      // Video codec
      .videoCodec('libx264')
      .outputOptions(['-crf', crf.toString()])
      .outputOptions(['-preset', preset])
      .outputOptions(['-movflags', '+faststart'])
      .outputOptions(['-color_primaries', 'bt709'])
      .outputOptions(['-color_trc', 'bt709'])
      .outputOptions(['-colorspace', 'bt709'])

      // Audio codec
      .audioCodec('aac')
      .audioBitrate(audioBitrate)

      // Rebuild metadata from scratch and intentionally leave date fields empty.
      .outputOptions([
        '-metadata', `title=${metadata.title}`,
        '-metadata', `artist=${metadata.artist}`,
        '-metadata', `author=${metadata.author}`,
        '-metadata', `comment=${metadata.comment}`,
        '-metadata', `description=${metadata.description}`,
        '-metadata', `encoder=${metadata.encoder}`,
        '-metadata', `publisher=${metadata.publisher}`,
        '-metadata', `keywords=${metadata.keywords}`,
        '-metadata:s:v:0', `handler_name=${metadata.handler_name}`,
        '-metadata:s:a:0', `handler_name=${metadata.audio_handler_name}`,
        '-metadata:s:v:0', `language=${metadata.language}`,
        '-metadata:s:a:0', `language=${metadata.language}`
      ])
      .output(outputPath);

    command
      .on('start', (commandLine) => {
        console.log('[FFmpeg] Command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`[FFmpeg] Processing: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log('[FFmpeg] Processing finished successfully');
        resolve(metadata);
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[FFmpeg] Error:', err.message);
        if (stderr) console.error('[FFmpeg] stderr:', stderr);
        reject(err);
      })
      .run();
  });
}

// ==========================================
// FFmpeg Device Spoof Processor
// ==========================================
function cameraDescription(model) {
  if (/Pro Max|Pro XL|Pro Fold/i.test(model)) {
    return `${model} back triple camera 5.1mm f/1.5`;
  }
  if (/Pro/i.test(model)) {
    return `${model} back triple camera 4.9mm f/1.6`;
  }
  if (/mini|a$|\d{2}a/i.test(model)) {
    return `${model} back dual camera 4.2mm f/1.8`;
  }
  return `${model} back dual camera 6.1mm f/1.6`;
}

async function processVideoWithDeviceSpoof(inputPath, outputPath, deviceMeta) {
  if (!ffmpeg) {
    throw new Error('FFmpeg not available. Install fluent-ffmpeg and ensure ffmpeg is in PATH.');
  }

  return new Promise((resolve, reject) => {
    const isApple = deviceMeta.make === 'Apple';

    // Subtle noise so the file hash changes without visible quality loss
    const noiseStrength = randomFloat(0.2, 0.8, 2);
    const crf = getRandomElement([19, 20, 21]);

    const encoderTag = isApple
      ? cameraDescription(deviceMeta.model)
      : `Google ${deviceMeta.model}`;

    const metadataArgs = [
      '-metadata', `make=${deviceMeta.make}`,
      '-metadata', `model=${deviceMeta.model}`,
      '-metadata', `software=${deviceMeta.software}`,
      '-metadata', `encoder=${encoderTag}`,
      '-metadata:s:v:0', `handler_name=${deviceMeta.handler}`,
      '-metadata:s:a:0', `handler_name=${deviceMeta.audioHandler}`,
      '-metadata:s:v:0', 'language=und',
      '-metadata:s:a:0', 'language=und'
    ];

    if (deviceMeta.creationTime) {
      metadataArgs.push('-metadata', `creation_time=${deviceMeta.creationTime}`);
    }
    if (deviceMeta.location) {
      metadataArgs.push('-metadata', `location=${deviceMeta.location}`);
    }

    let command = ffmpeg(inputPath)
      .outputOptions(['-y'])
      .outputOptions(['-map_metadata', '-1'])
      .videoFilters([`noise=alls=${noiseStrength}:allf=t+u`])
      .videoCodec('libx264')
      .outputOptions(['-crf', crf.toString()])
      .outputOptions(['-preset', 'veryfast'])
      .outputOptions(['-movflags', '+faststart'])
      .outputOptions(['-color_primaries', 'bt709'])
      .outputOptions(['-color_trc', 'bt709'])
      .outputOptions(['-colorspace', 'bt709'])
      .audioCodec('aac')
      .audioBitrate('192k')
      .outputOptions(metadataArgs)
      .output(outputPath);

    command
      .on('start', (commandLine) => {
        console.log('[FFmpeg DeviceSpoof] Command:', commandLine);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`[FFmpeg DeviceSpoof] Processing: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        console.log('[FFmpeg DeviceSpoof] Processing finished successfully');
        resolve({ ...deviceMeta, encoder: encoderTag });
      })
      .on('error', (err, stdout, stderr) => {
        console.error('[FFmpeg DeviceSpoof] Error:', err.message);
        if (stderr) console.error('[FFmpeg DeviceSpoof] stderr:', stderr);
        reject(err);
      })
      .run();
  });
}

// ==========================================
// API: Device Spoof — list presets
// ==========================================
app.get('/api/device-presets', (req, res) => {
  res.json({
    success: true,
    presets: {
      iphone: DEVICE_PRESETS.iphone.map(d => ({ key: d.key, name: d.name })),
      pixel: DEVICE_PRESETS.pixel.map(d => ({ key: d.key, name: d.name }))
    }
  });
});

// ==========================================
// API: Device Spoof — upload & process
// ==========================================
const spoofSessions = {}; // sessionId -> { files, status, clients[], outputFiles, deviceKey }

app.post('/api/device-spoof', upload.array('videos', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.json({ success: false, error: 'No files uploaded' });
  }

  const sessionId = req.uploadSessionId;
  const sessionDir = req.uploadSessionDir;
  const deviceKey = req.body.device || 'random';
  const randomDate = req.body.randomDate !== 'false';
  const randomLocation = req.body.randomLocation !== 'false';

  spoofSessions[sessionId] = {
    files: req.files.map((f) => ({
      originalName: f.originalname,
      path: f.path,
      size: f.size
    })),
    sessionDir,
    deviceKey,
    randomDate,
    randomLocation,
    status: req.files.map(() => 'waiting'),
    outputFiles: {},
    clients: []
  };

  processSpoofQueue(sessionId);

  res.json({
    success: true,
    sessionId,
    fileCount: req.files.length,
    device: deviceKey
  });
});

// ==========================================
// API: SSE Progress for Device Spoof Sessions
// ==========================================
app.get('/api/device-spoof-progress', (req, res) => {
  const { sessionId } = req.query;
  const session = spoofSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('\n');
  session.clients.push(res);

  req.on('close', () => {
    session.clients = session.clients.filter(c => c !== res);
  });
});

// ==========================================
// Device Spoof Queue Processor
// ==========================================
async function processSpoofQueue(sessionId) {
  const session = spoofSessions[sessionId];
  if (!session) return;

  for (let i = 0; i < session.files.length; i++) {
    await processSpoofedVideo(sessionId, i);
  }

  sendSpoofSSE(sessionId, { type: 'all_done' });
}

async function processSpoofedVideo(sessionId, index) {
  const session = spoofSessions[sessionId];
  if (!session) return;

  const file = session.files[index];
  session.status[index] = 'processing';

  sendSpoofSSE(sessionId, { index, type: 'start', filename: file.originalName });

  try {
    if (!ffmpeg) {
      throw new Error('FFmpeg not available');
    }

    // Each file gets its own randomized device identity
    const preset = resolveDevicePreset(session.deviceKey);
    const deviceMeta = generateDeviceMetadata(preset, {
      randomDate: session.randomDate,
      randomLocation: session.randomLocation
    });

    sendSpoofSSE(sessionId, {
      index,
      type: 'progress',
      percent: 10,
      detail: `Spoofing as ${deviceMeta.deviceName}...`
    });

    const baseName = path.basename(file.originalName, path.extname(file.originalName));
    const safeName = baseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 50) || 'video';
    const deviceSlug = deviceMeta.model.replace(/[^a-zA-Z0-9]/g, '');
    const outputFilename = `spoof_${deviceSlug}_${safeName}_${Date.now()}.mp4`;
    const outputPath = path.join(session.sessionDir, outputFilename);

    const metaResult = await processVideoWithDeviceSpoof(file.path, outputPath, deviceMeta);

    // Remove original uploaded file
    fs.unlinkSync(file.path);

    session.status[index] = 'complete';
    session.outputFiles[index] = outputFilename;

    sendSpoofSSE(sessionId, {
      index,
      type: 'complete',
      filename: outputFilename,
      deviceInfo: metaResult
    });

  } catch (err) {
    console.error(`[Device Spoof Error #${index}]:`, err.message);
    session.status[index] = 'error';
    sendSpoofSSE(sessionId, { index, type: 'error', detail: err.message });
  }
}

function sendSpoofSSE(sessionId, data) {
  const session = spoofSessions[sessionId];
  if (!session) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  session.clients.forEach(client => {
    try {
      client.write(message);
    } catch (e) {
      // Client disconnected
    }
  });
}

// ==========================================
// API: Download single device-spoofed file
// ==========================================
app.get('/api/device-spoof-file/:filename', (req, res) => {
  const { sessionId } = req.query;
  const { filename } = req.params;
  const session = spoofSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const decodedFilename = decodeURIComponent(filename);
  const filePath = path.join(session.sessionDir, decodedFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${decodedFilename}"`);
  res.setHeader('Content-Type', 'video/mp4');
  res.download(filePath, decodedFilename);
});

// ==========================================
// API: Download all device-spoofed files as ZIP
// ==========================================
app.get('/api/device-spoof-all', (req, res) => {
  const { sessionId } = req.query;
  const session = spoofSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const files = Object.values(session.outputFiles).filter(f => f);
  if (files.length === 0) {
    return res.status(404).json({ error: 'No files to download' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="ttgodmode-device-spoof.zip"');

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  archive.pipe(res);

  files.forEach(filename => {
    const filePath = path.join(session.sessionDir, filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: filename });
    }
  });

  archive.finalize();
});

// ==========================================
// API: Check Video Metadata
// ==========================================
const metadataUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      cb(null, `meta_${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`);
    }
  }),
  limits: { fileSize: 500 * 1024 * 1024 }
});

app.post('/api/check-metadata', metadataUpload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.json({ success: false, error: 'No file uploaded' });
  }

  const filePath = req.file.path;

  try {
    const metadata = await getVideoMetadata(filePath);
    
    // Delete temp file after reading
    fs.unlink(filePath, () => {});
    
    res.json({ success: true, metadata });
  } catch (err) {
    // Delete temp file on error
    fs.unlink(filePath, () => {});
    res.json({ success: false, error: err.message });
  }
});

function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    const ffprobe = require('child_process').spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      filePath
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => { stdout += data; });
    ffprobe.stderr.on('data', (data) => { stderr += data; });

    ffprobe.on('error', (err) => {
      reject(new Error('FFprobe not available. Make sure FFmpeg is installed.'));
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error('Failed to read video metadata'));
        return;
      }

      try {
        const data = JSON.parse(stdout);
        const format = data.format || {};
        const videoStream = (data.streams || []).find(s => s.codec_type === 'video') || {};
        const audioStream = (data.streams || []).find(s => s.codec_type === 'audio') || {};

        const metadata = {
          // File info
          filename: path.basename(format.filename || ''),
          fileSize: format.size ? formatBytes(parseInt(format.size)) : 'Unknown',
          duration: format.duration ? formatDuration(parseFloat(format.duration)) : 'Unknown',
          bitrate: format.bit_rate ? Math.round(parseInt(format.bit_rate) / 1000) + ' kbps' : 'Unknown',
          format: format.format_long_name || format.format_name || 'Unknown',

          // Video info
          video: {
            codec: videoStream.codec_long_name || videoStream.codec_name || 'Unknown',
            resolution: videoStream.width && videoStream.height ? `${videoStream.width}x${videoStream.height}` : 'Unknown',
            fps: videoStream.r_frame_rate ? evalFrameRate(videoStream.r_frame_rate) : 'Unknown',
            aspectRatio: videoStream.display_aspect_ratio || 'Unknown',
            colorSpace: videoStream.color_space || videoStream.pix_fmt || 'Unknown',
          },

          // Audio info
          audio: {
            codec: audioStream.codec_long_name || audioStream.codec_name || 'Unknown',
            sampleRate: audioStream.sample_rate ? audioStream.sample_rate + ' Hz' : 'Unknown',
            channels: audioStream.channels || 'Unknown',
            bitrate: audioStream.bit_rate ? Math.round(parseInt(audioStream.bit_rate) / 1000) + ' kbps' : 'Unknown',
          },

          // Tags/Metadata
          tags: {
            title: format.tags?.title || '-',
            artist: format.tags?.artist || format.tags?.author || '-',
            album: format.tags?.album || '-',
            comment: format.tags?.comment || '-',
            description: format.tags?.description || '-',
            encoder: format.tags?.encoder || format.tags?.encoding_tool || '-',
            creationTime: format.tags?.creation_time || '-',
            handler: videoStream.tags?.handler_name || '-',
            audioHandler: audioStream.tags?.handler_name || '-',
          },

          // Raw tags for advanced view
          rawTags: format.tags || {}
        };

        resolve(metadata);
      } catch (e) {
        reject(new Error('Failed to parse metadata'));
      }
    });
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function evalFrameRate(fr) {
  if (!fr || fr === '0/0') return 'Unknown';
  const parts = fr.split('/');
  if (parts.length === 2 && parts[1] !== '0') {
    return (parseInt(parts[0]) / parseInt(parts[1])).toFixed(2) + ' fps';
  }
  return fr + ' fps';
}

// ==========================================
// API: Check FFmpeg availability
// ==========================================
app.get('/api/check-ffmpeg', (req, res) => {
  if (!ffmpeg) {
    return res.json({ available: false });
  }

  // Check if ffmpeg binary is actually accessible
  const testCmd = require('child_process').spawn('ffmpeg', ['-version']);
  testCmd.on('error', () => {
    res.json({ available: false });
  });
  testCmd.on('close', (code) => {
    res.json({ available: code === 0 });
  });
});

// ==========================================
// API: Upload & Randomize Videos
// ==========================================
const uploadSessions = {}; // sessionId -> { files, status, clients[], outputFiles }

app.post('/api/upload', upload.array('videos', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.json({ success: false, error: 'No files uploaded' });
  }

  const sessionId = req.uploadSessionId;
  const sessionDir = req.uploadSessionDir;

  uploadSessions[sessionId] = {
    files: req.files.map((f, i) => ({
      originalName: f.originalname,
      path: f.path,
      size: f.size
    })),
    sessionDir,
    status: req.files.map(() => 'waiting'),
    outputFiles: {},
    clients: []
  };

  // Start processing
  processUploadQueue(sessionId);

  res.json({
    success: true,
    sessionId,
    fileCount: req.files.length
  });
});

// ==========================================
// API: SSE Progress for Upload Sessions
// ==========================================
app.get('/api/upload-progress', (req, res) => {
  const { sessionId } = req.query;
  const session = uploadSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('\n');
  session.clients.push(res);

  req.on('close', () => {
    session.clients = session.clients.filter(c => c !== res);
  });
});

// ==========================================
// Upload Queue Processor
// ==========================================
async function processUploadQueue(sessionId) {
  const session = uploadSessions[sessionId];
  if (!session) return;

  const { files } = session;

  for (let i = 0; i < files.length; i++) {
    await processUploadedVideo(sessionId, i);
  }

  sendUploadSSE(sessionId, { type: 'all_done' });
}

async function processUploadedVideo(sessionId, index) {
  const session = uploadSessions[sessionId];
  if (!session) return;

  const file = session.files[index];
  session.status[index] = 'processing';

  sendUploadSSE(sessionId, { index, type: 'start', filename: file.originalName });

  try {
    if (!ffmpeg) {
      throw new Error('FFmpeg not available');
    }

    sendUploadSSE(sessionId, { index, type: 'progress', percent: 10, detail: 'Starting metadata randomization...' });

    // Generate output filename
    const baseName = path.basename(file.originalName, path.extname(file.originalName));
    const safeName = baseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 50) || 'video';
    const outputFilename = `godmode_${safeName}_${Date.now()}.mp4`;
    const outputPath = path.join(session.sessionDir, outputFilename);

    // Process with FFmpeg
    const metaResult = await processVideoWithFFmpeg(file.path, outputPath);

    // Remove original uploaded file
    fs.unlinkSync(file.path);

    session.status[index] = 'complete';
    session.outputFiles[index] = outputFilename;

    sendUploadSSE(sessionId, {
      index,
      type: 'complete',
      filename: outputFilename,
      metaInfo: metaResult
    });

  } catch (err) {
    console.error(`[Upload Process Error #${index}]:`, err.message);
    session.status[index] = 'error';
    sendUploadSSE(sessionId, { index, type: 'error', detail: err.message });
  }
}

function sendUploadSSE(sessionId, data) {
  const session = uploadSessions[sessionId];
  if (!session) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  session.clients.forEach(client => {
    try {
      client.write(message);
    } catch (e) {
      // Client disconnected
    }
  });
}

// ==========================================
// API: Download processed upload file
// ==========================================
app.get('/api/upload-download-file/:filename', (req, res) => {
  const { sessionId } = req.query;
  const { filename } = req.params;
  const session = uploadSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const decodedFilename = decodeURIComponent(filename);
  const filePath = path.join(session.sessionDir, decodedFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${decodedFilename}"`);
  res.setHeader('Content-Type', 'video/mp4');
  res.download(filePath, decodedFilename);
});

// ==========================================
// API: Download all uploaded files as ZIP
// ==========================================
app.get('/api/upload-download-all', (req, res) => {
  const { sessionId } = req.query;
  const session = uploadSessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const files = Object.values(session.outputFiles).filter(f => f);
  if (files.length === 0) {
    return res.status(404).json({ error: 'No files to download' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="ttgodmode-randomized.zip"');

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  archive.pipe(res);

  files.forEach(filename => {
    const filePath = path.join(session.sessionDir, filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: filename });
    }
  });

  archive.finalize();
});

// ==========================================
// API: Start downloads
// ==========================================
app.post('/api/download', (req, res) => {
  const { urls, saveNames, randomizeMeta } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.json({ success: false, error: 'No URLs provided' });
  }

  if (urls.length > 50) {
    return res.json({ success: false, error: 'Maximum 50 URLs at a time' });
  }

  const sessionId = uuidv4();
  const sessionDir = path.join(DOWNLOADS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  sessions[sessionId] = {
    urls,
    saveNames: saveNames || urls.map(() => ''),
    sessionDir,
    randomizeMeta: !!randomizeMeta,
    status: urls.map(() => 'waiting'),
    files: {},
    clients: [],
  };

  // Start processing
  processQueue(sessionId);

  res.json({ success: true, sessionId });
});

// ==========================================
// API: SSE Progress Stream
// ==========================================
app.get('/api/progress', (req, res) => {
  const { sessionId } = req.query;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write('\n');

  session.clients.push(res);

  req.on('close', () => {
    session.clients = session.clients.filter(c => c !== res);
  });
});

// ==========================================
// API: Download single file
// ==========================================
app.get('/api/download-file/:filename', (req, res) => {
  const { sessionId } = req.query;
  const { filename } = req.params;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const decodedFilename = decodeURIComponent(filename);
  const filePath = path.join(session.sessionDir, decodedFilename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Force actual filename to prevent missing extensions
  res.setHeader('Content-Disposition', `attachment; filename="${decodedFilename}"`);
  res.setHeader('Content-Type', 'video/mp4');
  res.download(filePath, decodedFilename);
});

// ==========================================
// API: Download all as ZIP
// ==========================================
app.get('/api/download-all', (req, res) => {
  const { sessionId } = req.query;
  const session = sessions[sessionId];

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const files = Object.values(session.files).filter(f => f);
  if (files.length === 0) {
    return res.status(404).json({ error: 'No files to download' });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="ttgodmode-videos.zip"');

  const archive = archiver('zip', { zlib: { level: 5 } });
  archive.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  archive.pipe(res);

  files.forEach(filename => {
    const filePath = path.join(session.sessionDir, filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: filename });
    }
  });

  archive.finalize();
});

// ==========================================
// Download Queue Processor
// ==========================================
const MAX_CONCURRENT = 3;

async function processQueue(sessionId) {
  const session = sessions[sessionId];
  if (!session) return;

  const { urls } = session;
  let activeCount = 0;
  let nextIndex = 0;

  return new Promise((resolve) => {
    function startNext() {
      while (activeCount < MAX_CONCURRENT && nextIndex < urls.length) {
        const index = nextIndex++;
        activeCount++;
        downloadVideo(sessionId, urls[index], index).then(() => {
          activeCount--;
          if (nextIndex >= urls.length && activeCount === 0) {
            // All done
            sendSSE(sessionId, { type: 'all_done' });
            resolve();
          } else {
            startNext();
          }
        });
      }
    }
    startNext();
  });
}

// ==========================================
// Single Video Downloader + Optional Meta Randomizer
// ==========================================
async function downloadVideo(sessionId, url, index) {
  const session = sessions[sessionId];
  if (!session) return;

  session.status[index] = 'downloading';
  sendSSE(sessionId, { index, type: 'start' });

  try {
    // 1. Get download URL from tiktok-api-dl
    sendSSE(sessionId, { index, type: 'progress', percent: 10, detail: 'Fetching video metadata...' });

    const result = await Downloader(url, { version: "v3" });

    if (result.status !== "success" || !result.result) {
      throw new Error(result.message || 'Failed to fetch TikTok metadata');
    }

    const videoData = result.result;
    const downloadUrl = videoData.videoHD || videoData.video1;
    if (!downloadUrl) {
      throw new Error('No video URL found in the response');
    }

    const originalTitle = videoData.desc || `tiktok_video_${videoData.id}`;
    const safeTitle = originalTitle.replace(/[^a-zA-Z0-9\s]/g, '').trim().substring(0, 50);
    
    // Use custom save name if provided, otherwise use original title
    const customSaveName = (session.saveNames && session.saveNames[index]) ? session.saveNames[index] : '';
    const baseName = customSaveName || safeTitle || 'video';
    const finalFilename = `${baseName}_${videoData.id}.mp4`;
    const outputPath = path.join(session.sessionDir, finalFilename);

    sendSSE(sessionId, { index, type: 'title', title: originalTitle });

    // 2. Download the video file
    const fileRes = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream'
    });

    const totalLength = fileRes.headers['content-length'];
    let downloadedLength = 0;
    let lastPercent = 0;

    const writer = fs.createWriteStream(outputPath);

    fileRes.data.on('data', (chunk) => {
      downloadedLength += chunk.length;
      if (totalLength) {
        const percent = Math.floor((downloadedLength / totalLength) * 100);
        if (percent > lastPercent && percent % 5 === 0) {
          lastPercent = percent;
          const mbDownloaded = (downloadedLength / 1024 / 1024).toFixed(2);
          const mbTotal = (totalLength / 1024 / 1024).toFixed(2);
          sendSSE(sessionId, {
            index,
            type: 'progress',
            percent,
            detail: `Downloading: ${percent}% of ${mbTotal}MB`
          });
        }
      }
    });

    fileRes.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // 3. If randomizeMeta is ON, process with FFmpeg
    if (session.randomizeMeta) {
      sendSSE(sessionId, { index, type: 'meta_start', detail: 'Randomizing metadata...' });

      const metaBaseName = customSaveName ? `godmode_${customSaveName}` : `godmode_${safeTitle || 'video'}`;
      const metaFilename = `${metaBaseName}_${videoData.id}.mp4`;
      const metaOutputPath = path.join(session.sessionDir, metaFilename);

      try {
        const metaResult = await processVideoWithFFmpeg(outputPath, metaOutputPath);

        // Remove original, keep processed
        fs.unlinkSync(outputPath);

        session.status[index] = 'complete';
        session.files[index] = metaFilename;
        sendSSE(sessionId, {
          index,
          type: 'complete',
          filename: metaFilename,
          metaApplied: true,
          metaInfo: metaResult
        });
      } catch (ffmpegErr) {
        console.error(`[FFmpeg Error #${index}]:`, ffmpegErr.message);
        // Fallback: keep the original downloaded file
        session.status[index] = 'complete';
        session.files[index] = finalFilename;
        sendSSE(sessionId, {
          index,
          type: 'complete',
          filename: finalFilename,
          metaApplied: false,
          metaError: ffmpegErr.message
        });
      }
    } else {
      // No metadata randomization
      session.status[index] = 'complete';
      session.files[index] = finalFilename;
      sendSSE(sessionId, { index, type: 'complete', filename: finalFilename });
    }

  } catch (err) {
    console.error(`[Download Error #${index}]:`, err.message);
    session.status[index] = 'error';
    sendSSE(sessionId, { index, type: 'error', detail: err.message });
  }
}

// ==========================================
// SSE Helper
// ==========================================
function sendSSE(sessionId, data) {
  const session = sessions[sessionId];
  if (!session) return;

  const message = `data: ${JSON.stringify(data)}\n\n`;
  session.clients.forEach(client => {
    try {
      client.write(message);
    } catch (e) {
      // Client disconnected
    }
  });
}

// ==========================================
// Cleanup old sessions (every 1 minute)
// ==========================================
setInterval(() => {
  const now = Date.now();
  const FIFTEEN_MIN_MS = 15 * 60 * 1000;

  // Cleanup session tracking
  const sessionIds = Object.keys(sessions);
  if (sessionIds.length > 20) {
    const toRemove = sessionIds.slice(0, sessionIds.length - 20);
    toRemove.forEach(id => {
      delete sessions[id];
    });
  }

  // Cleanup upload sessions
  const uploadSessionIds = Object.keys(uploadSessions);
  if (uploadSessionIds.length > 20) {
    const toRemove = uploadSessionIds.slice(0, uploadSessionIds.length - 20);
    toRemove.forEach(id => {
      delete uploadSessions[id];
    });
  }

  // Cleanup device spoof sessions
  const spoofSessionIds = Object.keys(spoofSessions);
  if (spoofSessionIds.length > 20) {
    const toRemove = spoofSessionIds.slice(0, spoofSessionIds.length - 20);
    toRemove.forEach(id => {
      delete spoofSessions[id];
    });
  }

  // Cleanup physical files older than 15 minutes (downloads)
  fs.readdir(DOWNLOADS_DIR, (err, folders) => {
    if (err) return;

    folders.forEach(folder => {
      const folderPath = path.join(DOWNLOADS_DIR, folder);
      fs.stat(folderPath, (err, stats) => {
        if (err) return;

        if (now - stats.mtimeMs > FIFTEEN_MIN_MS) {
          fs.rm(folderPath, { recursive: true, force: true }, (err) => {
            if (!err) console.log(`[Auto-Delete] Removed expired download folder: ${folder}`);
          });

          if (sessions[folder]) {
            delete sessions[folder];
          }
        }
      });
    });
  });

  // Cleanup physical files older than 15 minutes (uploads)
  fs.readdir(UPLOADS_DIR, (err, folders) => {
    if (err) return;

    folders.forEach(folder => {
      const folderPath = path.join(UPLOADS_DIR, folder);
      fs.stat(folderPath, (err, stats) => {
        if (err) return;

        if (now - stats.mtimeMs > FIFTEEN_MIN_MS) {
          fs.rm(folderPath, { recursive: true, force: true }, (err) => {
            if (!err) console.log(`[Auto-Delete] Removed expired upload folder: ${folder}`);
          });

          if (uploadSessions[folder]) {
            delete uploadSessions[folder];
          }
        }
      });
    });
  });

}, 1 * 60 * 1000);

// ==========================================
// Start Server
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║        ⚡ TTGODMODE is running! ⚡           ║');
  console.log(`  ║   Open: http://localhost:${PORT}                  ║`);
  console.log('  ║   TikTok Download + Meta Randomizer          ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
});
