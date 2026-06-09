# Cross-device sync setup

The Quran reader can sync reflections, ayah edits, bookmarks, and reading position across your phone and computer.

Sync uses **Sign in with Google** (Firebase) — free on the Spark plan for a small family group (~10 users).

---

## Cost: free for ~10 users

Firebase **Spark (free) plan** is enough for a small family group:

- **Google Sign-In** — free, unlimited for normal use
- **Firestore** — 50,000 reads / 20,000 writes per day (far more than 10 casual readers need)
- **Authentication** — free for common providers

No credit card required on Spark. You only pay if you upgrade to Blaze and exceed free quotas (unlikely at this scale).

---

## Setup — Sign in with Google (Firebase)

### 1. Create a Firebase project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project** → name it (e.g. `quran-reader-sync`) → continue
3. Disable Google Analytics if you don't need it → **Create project**

### 2. Enable Google Authentication

1. In the project, open **Build → Authentication**
2. Click **Get started**
3. Under **Sign-in method**, enable **Google**
4. Set a support email → **Save**

### 3. Create a Firestore database

1. Open **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in production mode** (we deploy rules next)
4. Pick a region close to your users (e.g. `us-central1`) → **Enable**

### 4. Deploy security rules

Each user may only read/write their own data at `users/{uid}/data/data`.

From the repo root, install Firebase CLI if needed:

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
```

When prompted, select your project and use the existing `firestore.rules` file in this repo.

Deploy rules:

```bash
firebase deploy --only firestore:rules
```

Or paste the contents of `firestore.rules` into **Firestore → Rules** in the console and click **Publish**.

### 5. Register your web app

1. Project **Settings** (gear) → **General**
2. Under **Your apps**, click **Web** (`</>`)
3. App nickname: `Quran Reader` → **Register app**
4. Copy the `firebaseConfig` object

### 6. Add authorized domains

1. **Authentication → Settings → Authorized domains**
2. Ensure these are listed:
   - `localhost` (for local testing)
   - `rkarim25.github.io` (GitHub Pages)
3. Add any custom domain you use

### 7. Paste config into the repo

Edit `docs/firebase-config.js` and replace the placeholders:

```javascript
const FIREBASE_CONFIG = {
  apiKey: "AIza…",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
};
```

Commit and push (the web API key is safe to commit — security is enforced by Firestore rules and authorized domains).

### 8. Sign in on each device

1. Open the reader (e.g. `https://rkarim25.github.io/Quran/`)
2. Click **Sync** in the header
3. Click **Sign in with Google** and choose your account
4. On first login, local data merges with cloud (newer edits win per field)
5. Repeat on your phone — same Google account, same synced data

**Sign out:** Sync modal → **Sign out** (local data stays on the device).

---

## How sync works

- **On boot:** If signed in with Google → pull remote, merge with local
- **On save:** Changes debounce 4 seconds, then push to Firestore
- **Merge:** Bookmarks and ayah edits use latest `updatedAt` / `at` timestamp; prefs and last-read position follow the same rule
- **Offline:** Edits stay local; sync resumes when back online

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Firebase not configured" | Fill in `docs/firebase-config.js` and redeploy |
| Sign-in popup blocked | Allow popups, or use on phone (redirect flow) |
| Permission denied in Firestore | Deploy `firestore.rules`; user must be signed in |
| Domain not authorized | Add domain under Authentication → Authorized domains |
| Data not appearing on phone | Same Google account? Try **Pull now** in Sync modal |

---

## Files reference

| File | Purpose |
|------|---------|
| `docs/firebase-config.js` | Your Firebase web config (placeholders in git) |
| `docs/firebase-sync.js` | Google auth + Firestore sync |
| `docs/github-sync.js` | Shared user-data merge helpers (used by Firebase sync) |
| `firestore.rules` | Firestore security rules (deploy to Firebase) |
