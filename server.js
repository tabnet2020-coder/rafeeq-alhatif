/**
 * خادم تطبيق «رفيق الهاتف» (server.js) — الإصدار الكامل والنهائي
 * المصمم: عمر الطابوني (Tabent2020@gmail.com)
 * يشمل:
 * 1. عرض الواجهة المحدثة وأيقونة Tabony القياسية بجميع أبعادها.
 * 2. مسارات الإضافة والتعديل والحذف للمشرف (GET / POST / PUT / DELETE /api/guides).
 * 3. التوافق التام مع قاعدة بيانات Render PostgreSQL والتخزين الاحتياطي JSON.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const cors = require('cors');
const compression = require('compression');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'community_guides.json');

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '512kb' }));

// توليد صورة PNG احتياطية في الذاكرة فقط في حال لم يكن ملف الأيقونة مرفوعاً في public/assets
function createFallbackPng(width, height) {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c >>> 0;
  }
  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rowSize = width * 3 + 1;
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * rowSize;
    raw[rowStart] = 0;
    const isBorder = y < 12 || y >= height - 12;
    for (let x = 0; x < width; x++) {
      const p = rowStart + 1 + x * 3;
      if (isBorder || x < 12 || x >= width - 12) {
        raw[p] = 251; raw[p + 1] = 191; raw[p + 2] = 36;
      } else {
        raw[p] = 8; raw[p + 1] = 61; raw[p + 2] = 155;
      }
    }
  }
  const idat = zlib.deflateSync(raw);
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', idat), makeChunk('IEND', Buffer.alloc(0))]);
}

const MANIFEST_OBJECT = {
  id: '/',
  name: 'رفيق الهاتف — المساعد الرقمي المبسّط',
  short_name: 'رفيق الهاتف',
  description: 'مبادرة مجتمعية مجانية لشرح استخدام الهاتف والتطبيقات والأذونات للمبتدئين وكبار السن — تصميم عمر الطابوني (Tabent2020@gmail.com)',
  lang: 'ar',
  dir: 'rtl',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#0f172a',
  theme_color: '#115e59',
  categories: ['education', 'utilities', 'productivity'],
  icons: [
    { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
    { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/assets/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ],
  screenshots: [
    {
      src: '/assets/screenshot-mobile.png',
      sizes: '540x720',
      type: 'image/png',
      form_factor: 'narrow',
      label: 'الشاشة الرئيسية لتطبيق رفيق الهاتف على الجوال'
    },
    {
      src: '/assets/screenshot-wide.png',
      sizes: '1280x720',
      type: 'image/png',
      form_factor: 'wide',
      label: 'واجهة الشروحات والتدريب الآمن في تطبيق رفيق الهاتف'
    }
  ]
};

// تقديم ملفات public أولاً (بما فيها أيقونات Tabony في public/assets)
app.use(express.static(path.join(__dirname, 'public')));

app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.send(JSON.stringify(MANIFEST_OBJECT, null, 2));
});

// مسارات احتياطية للأيقونات ولقطات الشاشة في حال لم يُرفع مجلد public/assets
app.get('/assets/icon-192.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.send(createFallbackPng(192, 192));
});
app.get('/assets/icon-192-maskable.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.send(createFallbackPng(192, 192));
});
app.get('/assets/icon-512.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.send(createFallbackPng(512, 512));
});
app.get('/assets/icon-512-maskable.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.send(createFallbackPng(512, 512));
});
app.get('/assets/screenshot-mobile.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.send(createFallbackPng(540, 720));
});
app.get('/assets/screenshot-wide.png', (req, res) => {
  res.setHeader('Content-Type', 'image/png');
  res.send(createFallbackPng(1280, 720));
});

// إعداد قاعدة البيانات PostgreSQL على Render (مع بديل تلقائي JSON)
let pool = null;
let dbReady = false;

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.log('ℹ️ يعمل الخادم بنظام التخزين المحلي JSON تلقائياً.');
    return;
  }
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS volunteer_guides (
        id VARCHAR(100) PRIMARY KEY,
        cat VARCHAR(50) NOT NULL,
        icon VARCHAR(20) DEFAULT '🌟',
        title VARCHAR(250) NOT NULL,
        short_desc TEXT,
        keywords TEXT,
        intent_label VARCHAR(200),
        intent_action VARCHAR(200),
        why_note TEXT,
        steps_by_device JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    dbReady = true;
    console.log('✅ تم الاتصال بقاعدة بيانات PostgreSQL بنجاح.');
  } catch (err) {
    console.error('⚠️ تعذر الاتصال بقاعدة البيانات، سيتم استخدام التخزين المحلي:', err.message);
    dbReady = false;
  }
}

function readLocalGuides() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeLocalGuides(guides) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(guides, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing local guides:', err.message);
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    designer: 'عمر الطابوني (Tabent2020@gmail.com)',
    storage: dbReady ? 'PostgreSQL' : 'Local-JSON',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/guides', async (req, res) => {
  try {
    if (dbReady && pool) {
      const result = await pool.query('SELECT * FROM volunteer_guides ORDER BY created_at DESC LIMIT 200');
      const guides = result.rows.map((row) => ({
        id: row.id,
        cat: row.cat,
        icon: row.icon || '🌟',
        title: row.title,
        shortDesc: row.short_desc || '',
        keywords: row.keywords || '',
        intentLabel: row.intent_label || 'فتح إعدادات الهاتف',
        intentAction: row.intent_action || 'android.settings.SETTINGS',
        whyNote: row.why_note || '',
        stepsByDevice: row.steps_by_device || {}
      }));
      return res.json({ status: 'ok', storage: 'PostgreSQL', guides });
    }
    return res.json({ status: 'ok', storage: 'JSON File', guides: readLocalGuides() });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'حدث خطأ أثناء جلب الشروحات' });
  }
});

app.post('/api/guides', async (req, res) => {
  try {
    const body = req.body || {};
    const title = String(body.title || '').trim().slice(0, 200);
    const cat = ['accounts', 'apps', 'daily'].includes(body.cat) ? body.cat : 'apps';
    const stepsByDevice = body.stepsByDevice && typeof body.stepsByDevice === 'object' ? body.stepsByDevice : null;

    if (!title || !stepsByDevice || !Array.isArray(stepsByDevice.samsung) || stepsByDevice.samsung.length === 0) {
      return res.status(400).json({ status: 'error', message: 'بيانات الشرح غير مكتملة' });
    }

    const newGuide = {
      id: String(body.id || 'custom_' + Date.now()).slice(0, 80),
      cat,
      icon: String(body.icon || '🌟').slice(0, 10),
      title,
      shortDesc: String(body.shortDesc || 'شرح مضاف عبر المساهمة المجتمعية لمساعدة المبتدئين.').slice(0, 300),
      keywords: String(body.keywords || title).slice(0, 300),
      intentLabel: String(body.intentLabel || 'فتح إعدادات الهاتف لتطبيق الخطوات').slice(0, 150),
      intentAction: String(body.intentAction || 'android.settings.SETTINGS').slice(0, 150),
      whyNote: String(body.whyNote || 'تمت إضافة هذا الدليل المبسط بواسطة مساهمة مجتمعية لخدمة المستخدمين.').slice(0, 350),
      stepsByDevice
    };

    if (dbReady && pool) {
      await pool.query(
        `INSERT INTO volunteer_guides
         (id, cat, icon, title, short_desc, keywords, intent_label, intent_action, why_note, steps_by_device)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           cat = EXCLUDED.cat,
           title = EXCLUDED.title,
           short_desc = EXCLUDED.short_desc,
           keywords = EXCLUDED.keywords,
           why_note = EXCLUDED.why_note,
           steps_by_device = EXCLUDED.steps_by_device`,
        [
          newGuide.id, newGuide.cat, newGuide.icon, newGuide.title, newGuide.shortDesc,
          newGuide.keywords, newGuide.intentLabel, newGuide.intentAction, newGuide.whyNote,
          JSON.stringify(newGuide.stepsByDevice)
        ]
      );
      return res.status(201).json({ status: 'created', storage: 'PostgreSQL', guide: newGuide });
    }

    const current = readLocalGuides();
    current.unshift(newGuide);
    writeLocalGuides(current.slice(0, 200));
    return res.status(201).json({ status: 'created', storage: 'JSON File', guide: newGuide });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'تعذر حفظ الشرح الجديد' });
  }
});

// 4. تعديل شرح بواسطة المشرف (PUT /api/guides/:id)
app.put('/api/guides/:id', async (req, res) => {
  try {
    const guideId = String(req.params.id || '').trim();
    const body = req.body || {};
    const title = String(body.title || '').trim().slice(0, 200);
    const cat = ['accounts', 'apps', 'daily'].includes(body.cat) ? body.cat : 'apps';
    const stepsByDevice = body.stepsByDevice && typeof body.stepsByDevice === 'object' ? body.stepsByDevice : {};

    if (!guideId || !title) {
      return res.status(400).json({ status: 'error', message: 'بيانات التعديل غير مكتملة' });
    }

    if (dbReady && pool) {
      await pool.query(
        `INSERT INTO volunteer_guides
         (id, cat, icon, title, short_desc, keywords, intent_label, intent_action, why_note, steps_by_device)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
           cat = EXCLUDED.cat,
           title = EXCLUDED.title,
           short_desc = EXCLUDED.short_desc,
           keywords = EXCLUDED.keywords,
           why_note = EXCLUDED.why_note,
           steps_by_device = EXCLUDED.steps_by_device`,
        [
          guideId, cat, String(body.icon || '🌟').slice(0, 10), title,
          String(body.shortDesc || '').slice(0, 300),
          String(body.keywords || title).slice(0, 300),
          String(body.intentLabel || 'فتح إعدادات الهاتف').slice(0, 150),
          String(body.intentAction || 'android.settings.SETTINGS').slice(0, 150),
          String(body.whyNote || '').slice(0, 350),
          JSON.stringify(stepsByDevice)
        ]
      );
      return res.json({ status: 'updated', storage: 'PostgreSQL', id: guideId });
    }

    const current = readLocalGuides();
    const idx = current.findIndex((g) => g.id === guideId);
    const updatedObj = {
      id: guideId,
      cat,
      icon: String(body.icon || '🌟').slice(0, 10),
      title,
      shortDesc: String(body.shortDesc || '').slice(0, 300),
      keywords: String(body.keywords || title).slice(0, 300),
      intentLabel: String(body.intentLabel || 'فتح إعدادات الهاتف').slice(0, 150),
      intentAction: String(body.intentAction || 'android.settings.SETTINGS').slice(0, 150),
      whyNote: String(body.whyNote || '').slice(0, 350),
      stepsByDevice
    };
    if (idx >= 0) current[idx] = updatedObj;
    else current.unshift(updatedObj);
    writeLocalGuides(current);
    return res.json({ status: 'updated', storage: 'JSON File', id: guideId });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'تعذر تحديث الشرح' });
  }
});

// 5. حذف شرح بواسطة المشرف (DELETE /api/guides/:id)
app.delete('/api/guides/:id', async (req, res) => {
  try {
    const guideId = String(req.params.id || '').trim();
    if (!guideId) return res.status(400).json({ status: 'error', message: 'معرف الشرح مفقود' });

    if (dbReady && pool) {
      await pool.query('DELETE FROM volunteer_guides WHERE id = $1', [guideId]);
      return res.json({ status: 'deleted', storage: 'PostgreSQL', id: guideId });
    }

    const current = readLocalGuides().filter((g) => g.id !== guideId);
    writeLocalGuides(current);
    return res.json({ status: 'deleted', storage: 'JSON File', id: guideId });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'تعذر حذف الشرح' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 خادم رفيق الهاتف يعمل الآن على المنفذ ${PORT}`);
  });
});
