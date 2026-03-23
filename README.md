# FaceAttend — AI Face Recognition Attendance System

A professional face recognition attendance system built with Node.js, MongoDB Atlas, Cloudinary, and face-api.js.

## Features

- 📸 **AI Face Recognition** — Powered by face-api.js
- 👥 **Multi-Sample Capture** — 5 face samples per student for better accuracy
- 🔐 **Admin Authentication** — JWT-based login system
- 📊 **Dashboard** — Real-time attendance stats
- 📱 **Mobile-First** — Responsive design with bottom navigation
- 🛡️ **Liveness Detection** — Rejects static photos
- ☁️ **Cloud Storage** — MongoDB Atlas + Cloudinary
- 📥 **Export** — Download attendance records as CSV

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas |
| Images | Cloudinary |
| AI/ML | face-api.js (TensorFlow.js) |
| Auth | JWT + bcrypt |

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/face-attendance.git
cd face-attendance
npm install
```

### 2. Create `.env` file
```env
NODE_ENV=production
PORT=5000
MONGODB_URI=your_mongodb_atlas_uri
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=7d
```

### 3. Start the server
```bash
npm start
```

Open `http://localhost:5000` — Default login: `admin` / `admin123`

## Deployment (Render)

1. Push to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your GitHub repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add environment variables from `.env`
6. Deploy!

## Folder Structure

```
face-attendance/
├── public/              # Frontend
│   ├── css/style.css
│   ├── js/
│   │   ├── register.js  # Camera + multi-sample capture
│   │   ├── attendance.js # Scanning + liveness detection
│   │   ├── dashboard.js
│   │   ├── records.js
│   │   └── auth-helper.js
│   ├── index.html        # Dashboard
│   ├── register.html
│   ├── attendance.html
│   ├── records.html
│   └── login.html
├── server/              # Backend
│   ├── models/          # Mongoose models
│   ├── routes/          # API routes
│   ├── middleware/       # Auth middleware
│   ├── cloudinary.js
│   ├── database.js
│   └── server.js
├── .env                 # Secrets (not in git)
├── .gitignore
└── package.json
```

## License

MIT
