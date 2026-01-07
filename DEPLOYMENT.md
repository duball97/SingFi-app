# Coolify Deployment Guide for SingFi

## Coolify Configuration

### 1. Repository Settings
- **Repository**: `SingFi-app` (your repo name)
- **Branch**: `main` (or your default branch)

### 2. Build Configuration
- **Build Pack**: `Dockerfile` (recommended) or `Nixpacks` ✅
- **Base Directory**: `/` (root)
- **Port**: `3000` (Coolify will set this via PORT env var)
- **Is it a static site?**: ❌ **UNCHECKED** (this is a full-stack app)

**Note**: If using Nixpacks, set `NIXPACKS_NODE_VERSION=20` in environment variables to avoid using EOL Node 18.

### 3. Environment Variables

Add these in Coolify's environment variables section:

#### Required Backend Variables:
```
PORT=3000
NODE_ENV=production
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
REPLICATE_API_TOKEN=your_replicate_api_token
OPENAI_API_KEY=your_openai_api_key
```

#### Build Optimization Variables (Recommended):
```
NIXPACKS_NODE_VERSION=20
```

#### Optional (if you need different API URL):
```
VITE_API_URL=/api
```

**Note**: In production, the frontend uses relative paths (`/api`), so the Express server serves both the API and the built React app.

### 4. Build Process

The `.nixpacks.toml` file configures:
1. **Setup**: Installs Node.js 20, Python 3, and ffmpeg
2. **Install**: Runs `npm ci` to install dependencies
3. **Build**: Runs `npm run build` to build the Vite frontend
4. **Start**: Runs `npm start` which starts the Express server

### 5. How It Works

- The Express server runs on the PORT provided by Coolify (usually 3000)
- In production, Express serves:
  - API routes at `/api/*`
  - Static frontend files from the `dist/` folder
  - `index.html` for all non-API routes (SPA routing)

### 6. Post-Deployment

After deployment:
1. Your app will be accessible at the domain Coolify assigns
2. All API calls will work automatically (using relative paths)
3. The frontend and backend run in a single container

### 7. Troubleshooting

- **Build fails**: Check that all environment variables are set
- **API not working**: Verify `NODE_ENV=production` is set
- **Frontend not loading**: Check that `npm run build` completed successfully
- **Port issues**: Coolify sets PORT automatically, don't override it
- **Build timeout**: 
  - The `.dockerignore` file excludes large files (tools/, vocals/, etc.) to speed up builds
  - Use `Dockerfile` build pack instead of Nixpacks for faster builds
  - Set `NIXPACKS_NODE_VERSION=20` if using Nixpacks
  - The optimized `.nixpacks.toml` uses `npm ci` instead of `npm install` for faster installs

