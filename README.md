# The Fish Tank

The fish bois' group library. Everyone signs in with Google, picks a fish, and tracks books on three shelves:

- **In the Tank**: reading now
- **Fully Digested**: finished (rated out of 5 fins)
- **Bait Box**: want to read

Adding a book searches [Open Library](https://openlibrary.org), so the cover, author and year fill in automatically.

Live at **<https://thefishtank.netlify.app>**.

It's a plain static site (HTML, CSS, JS, no build step). The code lives on **GitHub**, **Netlify** hosts it and redeploys on every push to `main`, and **Firebase** handles sign-in and stores the books. All free at this size.

---

## Setup (about 15 minutes, one time)

### 1. Create the Firebase project

1. Go to <https://console.firebase.google.com> and click **Create a project**. Call it something like `fish-tank`. You can turn Google Analytics off.
2. On the project home page, click the **web icon `</>`** to add a web app. Give it a nickname, leave "Firebase Hosting" unticked, and click **Register app**.
3. Firebase shows a `firebaseConfig = { ... }` block. Copy the values into [`firebase-config.js`](firebase-config.js), replacing the `PASTE_...` placeholders.
   These values are safe to commit publicly. The security rules are what protect the data.

### 2. Turn on Google sign-in

1. In the left menu: **Build → Authentication → Get started**.
2. **Sign-in method** tab → **Google** → **Enable**, choose a support email, **Save**.

### 3. Create the database and lock it down

1. **Build → Firestore Database → Create database**. Pick a location near you and start in **production mode**.
2. Open the **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules), and click **Publish**.

### 4. Add the member list

Only emails on this list can see or add books.

1. Still in Firestore, open the **Data** tab and click **Start collection**.
2. Collection ID: `config`. Document ID: `members`.
3. Add a field `emails`, type **array**, with one **string** entry per person (their Google account email, **all lowercase**). Include your own.
4. Add a field `admins`, type **array**, with your own email. Admins can tidy up anyone's books.
5. Save.

To add a friend later, add their email to `emails`. They reload the site and they're in.

### 5. Put the code on GitHub

1. Create a new repository on GitHub. Don't add a README, .gitignore or licence.
2. Push this folder to it:
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```

### 6. Host it on Netlify

1. Sign in at <https://app.netlify.com>, then **Add new project → Import an existing project → GitHub**, and pick the repo.
2. Branch `main`. Leave base directory, build command and publish directory blank. **Deploy**.
3. **Project configuration → Change project name** to pick the address (here, `thefishtank` → `thefishtank.netlify.app`).
4. **Project configuration → Access & security → Visitor access**: make sure protection is **off**, or your friends get a Netlify login page instead of the site.

Every push to `main` redeploys automatically.

### 7. Allow sign-in from the live address

The site's address has to be allowed in three places, or Google sign-in fails there:

1. Firebase → **Authentication → Settings → Authorized domains → Add domain** → `thefishtank.netlify.app`.
2. Google Cloud → **APIs & Services → Credentials** → *Browser key (auto created by Firebase)* → **Website restrictions**: `https://thefishtank.netlify.app/*`, plus `https://YOUR-PROJECT.firebaseapp.com/*` and `http://localhost:8080/*`.
3. Google Cloud → **Google Auth Platform → Branding**: home page `https://thefishtank.netlify.app/`, privacy policy `https://thefishtank.netlify.app/privacy.html`, authorized domain `thefishtank.netlify.app`.

---

## Trying it locally

ES modules need a web server, so double-clicking `index.html` won't work. From this folder:

```bash
python -m http.server 8080
```

Then open <http://localhost:8080>. `localhost` is already allowed for sign-in.

**Demo mode:** add `?demo` to the address (<http://localhost:8080/?demo>) to try everything without Firebase. Demo books are saved only in that browser.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Page structure |
| `styles.css` | The aquarium look |
| `app.js` | Shelves, add-a-book flow, Open Library search |
| `store.js` | Talks to Firebase (or the browser-only demo store) |
| `firebase-config.js` | Your Firebase project's keys |
| `firestore.rules` | Who can read and write what. Paste into the Firebase console |
