# HedgeIQ - Simple HTML Setup with Auth

## What You Have

A clean, working version of your site with NO frameworks. Just HTML, CSS, and JavaScript.

### Files:
- `index.html` - Your landing page
- `dashboard.html` - Your dashboard (protected by auth)
- `login.html` - Simple login page
- `styles/dashboard.css` - Dashboard styles
- `styles/main.css` - Landing page styles
- `scripts/auth.js` - Simple auth system
- `scripts/dashboard.js` - Dashboard functionality

## How to Use

### 1. Extract all files to a folder on your computer

```
hedgeiq-simple/
├── index.html
├── login.html
├── dashboard.html
├── styles/
│   ├── dashboard.css
│   └── main.css
└── scripts/
    ├── auth.js
    └── dashboard.js
```

### 2. Open `index.html` in your browser

Just double-click it. That's it. It works.

### 3. Test the auth flow

**Login credentials:**
- Email: `demo@hedgeiq.com`
- Password: `demo123`

**Flow:**
1. Open `index.html`
2. Click "Sign In" or "Start Free Trial"
3. Enter demo credentials
4. Get redirected to dashboard
5. Click "Sign Out" to logout

## How Auth Works

**Super simple:**

1. **Login page** (`login.html`) checks email/password
2. If correct, stores user info in `localStorage`
3. Redirects to dashboard

4. **Dashboard** (`dashboard.html`) runs `auth.js` first
5. `auth.js` checks if user logged in
6. If not logged in → redirect to login
7. If logged in → show dashboard

**No backend needed for demo.** When you're ready for production:
- Replace the hardcoded credentials
- Call your FastAPI backend for real auth
- Use JWT tokens instead of localStorage

## Connecting Your Backend

In `scripts/dashboard.js`, line 14:
```javascript
const API_BASE_URL = 'http://localhost:8000/api';
```

Make sure your FastAPI backend is running on port 8000. The dashboard will fetch data from:
- `http://localhost:8000/api/metrics`
- `http://localhost:8000/api/levels`

## Adding Real Users (Later)

Replace the `DEMO_USERS` object in `login.html` (line 118) with a backend call:

```javascript
// Instead of:
if (DEMO_USERS[email] && DEMO_USERS[email].password === password) {
  // ...
}

// Do this:
const response = await fetch('YOUR_BACKEND_URL/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const data = await response.json();
if (data.success) {
  localStorage.setItem('hedgeiq_user', JSON.stringify(data.user));
  window.location.href = 'dashboard.html';
}
```

## Deploy When Ready

### Option 1: Netlify (easiest)
1. Drag the entire folder to netlify.app
2. Done. It's live.

### Option 2: Vercel
1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel`
3. Done.

### Option 3: Your own server
1. Upload files to server
2. Point domain to files
3. Done.

No build process. No npm install. No bullshit.

## Benefits Over Next.js

✅ No framework overhead
✅ No build errors
✅ Works immediately
✅ Easy to understand
✅ Fast as fuck
✅ No dependencies
✅ Can deploy anywhere
✅ No complicated routing
✅ Just open the HTML file

## Next Steps

1. Test everything works locally
2. Connect your FastAPI backend
3. Replace demo credentials with real backend auth
4. Add Stripe for payments (if needed)
5. Deploy

That's it. You're done with the frontend nightmare.
