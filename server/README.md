# How to host this server for FREE 🚀

### Option 1: Render.com (Recommended)
1. Create a free account on [Render.com](https://render.com).
2. Click **"New"** > **"Web Service"**.
3. Connect your GitHub repository (or upload this folder).
4. Set **Build Command**: `npm install`
5. Set **Start Command**: `node index.js`
6. Render will give you a URL like `https://ali-socket.onrender.com`.

### Option 2: Local Network (For Testing)
If all your devices are on the same WiFi:
1. Open terminal in this folder.
2. Run `npm install` then `node index.js`.
3. Find your Computer's IP (type `ipconfig` in cmd).
4. Use `http://YOUR_IP:3001` as the URL in frontend.

### Frontend Update
Server deploy karne ke baad, `.env` file mein `VITE_SOCKET_URL` ko naye URL se update karein.
