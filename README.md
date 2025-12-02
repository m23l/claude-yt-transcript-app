# YouTube Transcript API

A Node.js backend API for extracting transcripts from YouTube videos using yt-dlp.

## Features

- Extract transcripts from YouTube videos
- Support for both manual and auto-generated captions
- RESTful API with Express
- CORS enabled for localhost:3000
- Comprehensive error handling
- Health check endpoint

## Prerequisites

Before running this application, ensure you have the following installed:

- **Node.js** (v14 or higher)
- **npm** (comes with Node.js)
- **yt-dlp** (YouTube video downloader)
- **Internet access** to YouTube (direct or via proxy that allows youtube.com)

### Installing yt-dlp

#### macOS (using Homebrew):
```bash
brew install yt-dlp
```

#### Linux (using pip):
```bash
pip install yt-dlp
```

or

```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
```

#### Windows:
Download from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases) and add to PATH.

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd claude-yt-transcript-app
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file (optional):
```bash
cp .env.example .env
```

You can customize the PORT in the `.env` file (default is 3001).

## Usage

### Starting the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

The server will start on `http://localhost:3001` (or your configured PORT).

## API Endpoints

### 1. Health Check

Check if the API is running.

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "OK",
  "message": "YouTube Transcript API is running",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. Extract Transcript

Extract transcript from a YouTube video.

**Endpoint:** `POST /api/transcript`

**Request Body:**
```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "transcript": "Full transcript text...",
  "length": 1234
}
```

**Error Responses:**

- **400 Bad Request** - Missing or invalid URL
```json
{
  "error": "Invalid URL",
  "message": "Please provide a valid YouTube URL"
}
```

- **404 Not Found** - No transcript available
```json
{
  "error": "Transcript Not Found",
  "message": "No transcript available for this video. The video may not have captions or subtitles."
}
```

- **500 Internal Server Error** - Server error
```json
{
  "error": "Internal Server Error",
  "message": "Failed to extract transcript",
  "details": "Error details..."
}
```

## Example Usage

### Using cURL

```bash
curl -X POST http://localhost:3001/api/transcript \
  -H "Content-Type: application/json" \
  -d '{"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
```

### Using JavaScript (fetch)

```javascript
fetch('http://localhost:3001/api/transcript', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
  })
})
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Error:', error));
```

## Error Handling

The API includes comprehensive error handling for:

- Invalid or missing YouTube URLs
- Videos without transcripts
- yt-dlp not installed
- Request timeouts (30 seconds)
- Network errors
- Server errors

## CORS Configuration

CORS is configured to allow requests from `http://localhost:3000`. To allow additional origins, modify the CORS configuration in `server.js`:

```javascript
app.use(cors({
  origin: ['http://localhost:3000', 'https://your-domain.com'],
  credentials: true
}));
```

## Development

### Project Structure

```
claude-yt-transcript-app/
├── server.js           # Main Express server
├── package.json        # Dependencies and scripts
├── .env.example        # Environment variables template
├── .gitignore         # Git ignore rules
└── README.md          # This file
```

### Dependencies

- **express**: Web framework for Node.js
- **cors**: Enable CORS for cross-origin requests
- **dotenv**: Load environment variables from .env file

### Dev Dependencies

- **nodemon**: Auto-reload server during development

## Troubleshooting

### yt-dlp not found

If you get an error that yt-dlp is not installed:

1. Install yt-dlp following the instructions above
2. Verify installation: `yt-dlp --version`
3. Make sure yt-dlp is in your system PATH

### No transcript available

Some videos don't have captions/subtitles. Try:

1. Verify the video has captions on YouTube
2. Check if the video is age-restricted or private
3. Try a different video URL

### Port already in use

If port 3001 is already in use:

1. Change the PORT in your `.env` file
2. Or set it when starting: `PORT=3002 npm start`

### Network and proxy issues

This API requires direct internet access to YouTube. If you're in a restricted environment:

1. **Proxy environments**: The server attempts to bypass proxies by unsetting proxy environment variables. If you're behind a corporate proxy that allows YouTube access, you may need to configure yt-dlp to use your proxy settings.

2. **Containerized environments**: Some container environments (like Docker or cloud sandboxes) may have network restrictions. Ensure YouTube (youtube.com and googlevideo.com) is accessible from your environment.

3. **Testing**: To verify yt-dlp can access YouTube, run:
   ```bash
   yt-dlp --list-formats "https://www.youtube.com/watch?v=jNQXAC9IVRw"
   ```

## License

ISC