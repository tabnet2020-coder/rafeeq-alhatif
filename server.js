/**
 * خادم تطبيق «رفيق الهاتف» (Node.js + Express + PostgreSQL / JSON Fallback)
 * مصمم للتشغيل المباشر على منصة Render (Web Service + Render Postgres)
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const compression = require('compression');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'community_guides.json');

app.use(cors());
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// إعداد الاتصال بقاعدة بيانات PostgreSQL على Render (في حال توفر DATABASE_URL)
let pool = null;
let dbReady = false;

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.log('ℹ️ لم يتم تعيين DATABASE_URL — سيعمل الخادم بنظام التخزين المحلي JSON تلقائياً.');
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
    console.log('✅ تم الاتصال بقاعدة بيانات PostgreSQL وتجهيز جدول شروحات المتطوعين بنجاح.');
  } catch (err) {
    console.error('⚠️ تعذر الاتصال بقاعدة بيانات PostgreSQL، سيتم التحول للتخزين المحلي:', err.message);
    dbReady = false;
  }
}

// دوال القراءة والكتابة من ملف JSON الاحتياطي
function readLocalGuides() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
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
    console.error('Error writing local guides file:', err.message);
  }
}

// 1. فحص حالة الخادم (Health Check لـ Render)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'rafeeq-alhatif-api',
    storage: dbReady ? 'PostgreSQL' : 'Local-JSON',
    timestamp: new Date().toISOString()
  });
});

// 2. جلب جميع الشروحات المضافة بواسطة المتطوعين
app.get('/api/guides', async (req, res) => {
  try {
    if (dbReady && pool) {
      const result = await pool.query(
        'SELECT * FROM volunteer_guides ORDER BY created_at DESC LIMIT 200'
      );
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

    const localGuides = readLocalGuides();
    return res.json({ status: 'ok', storage: 'JSON File', guides: localGuides });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'حدث خطأ أثناء جلب الشروحات' });
  }
});

// 3. إضافة شرح تطوعي جديد إلى قاعدة البيانات المشتركة
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
         ON CONFLICT (id) DO NOTHING`,
        [
          newGuide.id,
          newGuide.cat,
          newGuide.icon,
          newGuide.title,
          newGuide.shortDesc,
          newGuide.keywords,
          newGuide.intentLabel,
          newGuide.intentAction,
          newGuide.whyNote,
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

// توجيه أي مسار آخر إلى صفحة التطبيق الرئيسية (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 خادم رفيق الهاتف يعمل الآن على المنفذ ${PORT}`);
  });
});
