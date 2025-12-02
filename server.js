const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  console.log('Origin:', req.get('origin'));
  next();
});

// CORS - Configure allowed origins
const allowedOrigins = [
  'https://claude.site',
  'https://claude.ai',
  'http://localhost:3000', // Local development
  'http://localhost:5173'  // Vite default
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Check for wildcards (e.g. https://*.claude.site)
    if (origin.endsWith('.claude.site') && origin.startsWith('https://')) {
      return callback(null, true);
    }

    console.log('Blocked by CORS:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Utility function to validate YouTube URL
const isValidYouTubeUrl = (url) => {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  return youtubeRegex.test(url);
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'YouTube Transcript API is running',
    timestamp: new Date().toISOString()
  });
});

// Extract transcript endpoint
app.post('/api/transcript', async (req, res) => {
  const { url } = req.body;

  // Validate URL presence
  if (!url) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'YouTube URL is required'
    });
  }

  // Validate YouTube URL format
  if (!isValidYouTubeUrl(url)) {
    return res.status(400).json({
      error: 'Invalid URL',
      message: 'Please provide a valid YouTube URL'
    });
  }

  const requestId = crypto.randomUUID();
  const tempFileBase = path.join(__dirname, `temp_${requestId}`);

  try {
    // Check if yt-dlp is installed
    try {
      await execAsync('which yt-dlp');
    } catch (error) {
      return res.status(500).json({
        error: 'Server Configuration Error',
        message: 'yt-dlp is not installed on the server. Please install it using: pip install yt-dlp'
      });
    }

    // Helper to find the generated subtitle file
    const findSubtitleFile = async (basePath) => {
      const dir = path.dirname(basePath);
      const baseName = path.basename(basePath);
      const files = await fs.readdir(dir);
      // Look for files starting with baseName and ending with .vtt
      return files.find(f => f.startsWith(baseName) && f.endsWith('.vtt'));
    };

    // Helper to run yt-dlp
    const runYtDlp = async (command) => {
      return execAsync(command, {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 30000 // 30 seconds timeout
      });
    };

    let vttContent = null;

    // Try auto-subs first
    // Note: we use --quiet to suppress output, and --output to specify filename prefix
    const autoSubCommand = `yt-dlp --quiet --skip-download --write-auto-subs --sub-lang en --sub-format vtt --output "${tempFileBase}" "${url}"`;
    
    try {
      await runYtDlp(autoSubCommand);
      const filename = await findSubtitleFile(tempFileBase);
      if (filename) {
        vttContent = await fs.readFile(path.join(__dirname, filename), 'utf-8');
      }
    } catch (e) {
      // Ignore and try manual
    }

    // If no auto-subs, try manual subs
    if (!vttContent) {
      const manualSubCommand = `yt-dlp --quiet --skip-download --write-subs --sub-lang en --sub-format vtt --output "${tempFileBase}" "${url}"`;
      try {
        await runYtDlp(manualSubCommand);
        const filename = await findSubtitleFile(tempFileBase);
        if (filename) {
          vttContent = await fs.readFile(path.join(__dirname, filename), 'utf-8');
        }
      } catch (e) {
        // Ignore
      }
    }

    if (!vttContent) {
      return res.status(404).json({
        error: 'Transcript Not Found',
        message: 'No transcript available for this video. The video may not have captions or subtitles.'
      });
    }

    // Clean VTT format to plain text
    const cleanTranscript = (vttContent) => {
      if (!vttContent) return '';

      const lines = vttContent.split('\n');
      const transcriptLines = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Skip WEBVTT header, timestamps, and empty lines
        if (line === '' ||
            line.startsWith('WEBVTT') ||
            line.startsWith('Kind:') ||
            line.startsWith('Language:') ||
            line.match(/^\d{2}:\d{2}:\d{2}\.\d{3}\s-->\s\d{2}:\d{2}:\d{2}\.\d{3}/) ||
            line.match(/^\d+$/)) {
          continue;
        }

        // Remove VTT tags like <c>, </c>, etc.
        const cleanedLine = line.replace(/<[^>]+>/g, '');
        if (cleanedLine) {
          transcriptLines.push(cleanedLine);
        }
      }

      return transcriptLines.join(' ');
    };

    const transcript = cleanTranscript(vttContent);

    res.status(200).json({
      success: true,
      url,
      transcript,
      length: transcript.length
    });

  } catch (error) {
    console.error('Error extracting transcript:', error);

    if (error.killed && error.signal === 'SIGTERM') {
      return res.status(408).json({
        error: 'Request Timeout',
        message: 'Transcript extraction took too long. Please try again.'
      });
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to extract transcript',
      details: error.message
    });
  } finally {
    // Cleanup files
    try {
      const dir = __dirname;
      const files = await fs.readdir(dir);
      const tempFiles = files.filter(f => f.startsWith(`temp_${requestId}`));
      for (const file of tempFiles) {
        await fs.unlink(path.join(dir, file));
      }
    } catch (cleanupError) {
      console.error('Error cleaning up temp files:', cleanupError);
    }
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`YouTube Transcript API server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Transcript endpoint: POST http://localhost:${PORT}/api/transcript`);
});

module.exports = app;
