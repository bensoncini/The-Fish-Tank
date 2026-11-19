# The Fish Tank

The fish bois' group library. Everyone signs in with Google, picks a fish, and tracks books on three shelves:

- **In the Tank**: reading now
- **Fully Digested**: finished (rated out of 5 fins)
- **Bait Box**: want to read

Adding a book searches [Open Library](https://openlibrary.org), so the cover, author and year fill in automatically.

It's a plain static site (HTML, CSS, JS, no build step) hosted on **GitHub Pages**, with **Firebase** handling sign-in and storing the books. Both are free at this size.

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

### 5. Put the site on GitHub Pages

1. Create a new **public** repository on GitHub (for example `the-fish-tank`). Don't add a README, .gitignore or licence.
2. Push this folder to it (GitHub shows the commands; they look like):
   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/the-fish-tank.git
   git push -u origin main
   ```
3. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`, **Save**.
4. After a minute the site is live at `https://YOUR-USERNAME.github.io/the-fish-tank/`.

### 6. Allow sign-in from your GitHub Pages address

Firebase → **Authentication → Settings → Authorized domains → Add domain** → `YOUR-USERNAME.github.io`.

Without this, the Google sign-in popup errors on the live site.

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
