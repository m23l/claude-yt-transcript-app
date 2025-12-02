const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
require('dotenv').config();

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
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

    // Extract transcript using yt-dlp
    // yt-dlp --skip-download --write-auto-sub --sub-lang en --sub-format txt --output "%(title)s" URL
    const command = `yt-dlp --skip-download --write-subs --write-auto-subs --sub-lang en --sub-format json3 --print "%(title)s" --output "-" "${url}"`;

    // Alternative approach: Get subtitles directly
    // Note: Unset proxy variables to avoid proxy issues with YouTube access
    const subtitleCommand = `http_proxy= https_proxy= HTTP_PROXY= HTTPS_PROXY= GLOBAL_AGENT_HTTP_PROXY= GLOBAL_AGENT_NO_PROXY= yt-dlp --skip-download --write-auto-subs --sub-lang en --sub-format vtt --output "temp_%(id)s" "${url}" && cat temp_*.en.vtt 2>/dev/null && rm -f temp_*`;

    let stdout, stderr;

    try {
      const result = await execAsync(subtitleCommand, {
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 30000 // 30 seconds timeout
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (execError) {
      // If auto-subs fail, try manual subs
      const manualSubCommand = `http_proxy= https_proxy= HTTP_PROXY= HTTPS_PROXY= GLOBAL_AGENT_HTTP_PROXY= GLOBAL_AGENT_NO_PROXY= yt-dlp --skip-download --write-subs --sub-lang en --sub-format vtt --output "temp_%(id)s" "${url}" && cat temp_*.en.vtt 2>/dev/null && rm -f temp_*`;

      try {
        const result = await execAsync(manualSubCommand, {
          maxBuffer: 1024 * 1024 * 10,
          timeout: 30000
        });
        stdout = result.stdout;
        stderr = result.stderr;
      } catch (manualError) {
        return res.status(404).json({
          error: 'Transcript Not Found',
          message: 'No transcript available for this video. The video may not have captions or subtitles.',
          details: execError.message
        });
      }
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

    const transcript = cleanTranscript(stdout);

    if (!transcript) {
      return res.status(404).json({
        error: 'Transcript Not Found',
        message: 'Unable to extract transcript from this video'
      });
    }

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
