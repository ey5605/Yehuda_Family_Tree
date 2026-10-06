import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// High limit for photos in JSON
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS configuration for cross-origin or preview domain requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'family-tree.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// API: Get family tree data
app.get('/api/tree', (req, res) => {
  try {
    fs.appendFileSync('/tmp/api-requests.log', `[${new Date().toISOString()}] GET /api/tree from ${req.ip} UA: ${req.headers['user-agent']}\n`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (fs.existsSync(DATA_FILE)) {
      const content = fs.readFileSync(DATA_FILE, 'utf-8');
      return res.send(content);
    }
    // Return empty tree structure
    return res.json({
      persons: {},
      relationships: [],
      metadata: {
        title: 'אילן היוחסין של משפחת יהודה',
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error reading tree file:', error);
    return res.status(500).json({ error: 'Failed to read data' });
  }
});

// API: Save family tree data
app.post('/api/tree', (req, res) => {
  try {
    const data = req.body;
    fs.appendFileSync('/tmp/api-requests.log', `[${new Date().toISOString()}] POST /api/tree from ${req.ip} UA: ${req.headers['user-agent']} size: ${JSON.stringify(data).length}\n`);
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    data.metadata = {
      ...data.metadata,
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.json({ success: true, timestamp: data.metadata.lastUpdated });
  } catch (error) {
    console.error('Error saving tree file:', error);
    return res.status(500).json({ error: 'Failed to save data' });
  }
});

// API: Sync family tree from remote Publish URL
app.post('/api/sync-from-publish', async (req, res) => {
  try {
    let { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'נא לספק כתובת URL תקינה' });
    }

    url = url.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    let targetUrl = url;
    if (!targetUrl.includes('/api/tree')) {
      targetUrl = targetUrl.replace(/\/+$/, '') + '/api/tree';
    }

    targetUrl += (targetUrl.includes('?') ? '&' : '?') + `_t=${Date.now()}`;

    const remoteRes = await fetch(targetUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AIStudioSync/1.0',
      },
    });

    if (!remoteRes.ok) {
      return res.status(remoteRes.status).json({
        error: `שגיאה במשיכת הנתונים מקישור ה-Publish (${remoteRes.status} ${remoteRes.statusText})`,
      });
    }

    const data = await remoteRes.json();
    if (!data || !data.persons || typeof data.persons !== 'object') {
      return res.status(400).json({
        error: 'הנתונים שהתקבלו אינם במבנה של אילן יוחסין תקין.',
      });
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');

    return res.json({
      success: true,
      tree: data,
      personsCount: Object.keys(data.persons).length,
      lastUpdated: data.metadata?.lastUpdated,
    });
  } catch (error: any) {
    console.error('Error syncing from remote publish URL:', error);
    return res.status(500).json({
      error: error.message || 'שגיאה בניסיון התחברות לקישור ה-Publish',
    });
  }
});

// API: Fetch Google Drawings export or proxy
app.get('/api/import-drawing', async (req, res) => {
  const urlParam = req.query.url as string;
  if (!urlParam) {
    return res.status(400).json({ error: 'Missing drawing URL' });
  }

  try {
    // Extract document ID from Google Drawings link
    const match = urlParam.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const docId = match ? match[1] : urlParam;

    const svgExportUrl = `https://docs.google.com/drawings/d/${docId}/export/svg`;
    const pngExportUrl = `https://docs.google.com/drawings/d/${docId}/export/png`;

    // Attempt to fetch SVG
    const svgResponse = await fetch(svgExportUrl, {
      redirect: 'manual', // do not follow redirect to login page blindly
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (svgResponse.status === 302 || svgResponse.status === 401 || svgResponse.status === 403) {
      return res.status(403).json({
        error: 'AUTH_REQUIRED',
        docId,
        message: 'המסמך ב-Google Drawings דורש התחברות לחשבון Google או הרשאת גישה ציבורית.',
        tip: 'כדי לייבא ישירות מקישור, יש להגדיר ב-Google Drawings: שיתוף (Share) > כל מי שקיבל את הקישור יכול לצפות (Anyone with the link can view). לחלופין, ניתן להוריד מ-Google Drawings קובץ SVG או PNG ולהעלות כאן ישירות.',
        originalUrl: urlParam,
      });
    }

    if (!svgResponse.ok) {
      return res.status(svgResponse.status).json({
        error: 'FETCH_FAILED',
        docId,
        message: `שגיאה בגישה למסמך (סטטוס ${svgResponse.status})`,
        originalUrl: urlParam,
      });
    }

    const svgText = await svgResponse.text();
    return res.json({
      success: true,
      format: 'svg',
      docId,
      svg: svgText,
    });
  } catch (err: any) {
    console.error('Error fetching Google Drawing:', err);
    return res.status(500).json({
      error: 'SERVER_ERROR',
      message: err.message || 'שגיאת שרת בעת ניסיון גישה לקישור',
      originalUrl: urlParam,
    });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.join(__dirname, 'index.html');
        if (fs.existsSync(indexPath)) {
          let template = fs.readFileSync(indexPath, 'utf-8');
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
        } else {
          next();
        }
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
