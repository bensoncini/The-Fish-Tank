// Data layer. Two interchangeable stores with the same shape:
//   firebaseStore — the real shared library (Google sign-in + Firestore)
//   demoStore     — saved only in this browser, for trying the site before Firebase is set up
//
// Store shape:
//   kind, onAuth(cb), signIn(), signOut(), isAdmin(user)
//   watch(onBooks, onFish, onError) -> unsubscribe
//   addBook(data), updateBook(id, patch), deleteBook(id), setFish(uid, data)

const FIREBASE_VERSION = "10.12.2";

export async function firebaseStore(config) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const toUser = (u) => (u ? { uid: u.uid, name: u.displayName || "", email: (u.email || "").toLowerCase() } : null);

  return {
    kind: "firebase",
    onAuth(cb) { return A.onAuthStateChanged(auth, (u) => cb(toUser(u))); },
    async signIn() {
      const provider = new A.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      try {
        await A.signInWithPopup(auth, provider);
      } catch (e) {
        if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
          await A.signInWithRedirect(auth, provider);
        } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
          throw e;
        }
      }
    },
    signOut() { return A.signOut(auth); },
    async isAdmin(user) {
      try {
        const snap = await F.getDoc(F.doc(db, "config", "members"));
        const admins = (snap.exists() && snap.data().admins) || [];
        return admins.map((a) => String(a).toLowerCase()).includes(user.email);
      } catch { return false; }
    },
    watch(onBooks, onFish, onError) {
      const offBooks = F.onSnapshot(F.collection(db, "books"),
        (snap) => onBooks(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);
      const offFish = F.onSnapshot(F.collection(db, "fish"), (snap) => {
        const fish = {};
        snap.docs.forEach((d) => { fish[d.id] = d.data(); });
        onFish(fish);
      }, onError);
      return () => { offBooks(); offFish(); };
    },
    addBook(data) { return F.addDoc(F.collection(db, "books"), data); },
    updateBook(id, patch) { return F.updateDoc(F.doc(db, "books", id), patch); },
    deleteBook(id) { return F.deleteDoc(F.doc(db, "books", id)); },
    setFish(uid, data) { return F.setDoc(F.doc(db, "fish", uid), data); }
  };
}

// ---------------------------------------------------------------------------

const DEMO_KEY = "fishtank-demo-v1";
const DEMO_USER = { uid: "demo-you", name: "You", email: "demo@example.com" };

function demoSeed() {
  const day = 86400000, now = Date.now();
  return {
    fish: {
      "demo-gill": { name: "Gill Bates (example)", color: "gold", joinedAt: now - 40 * day },
      "demo-finn": { name: "Finn Diesel (example)", color: "sky", joinedAt: now - 30 * day }
    },
    books: {
      d1: { title: "The Old Man and the Sea", author: "Ernest Hemingway", shelf: "read", owner: "demo-gill", rating: 5,
            note: "A man, a marlin, a whole lot of feelings.", isbn: "9780684801223", addedAt: now - 20 * day, updatedAt: now - 9 * day, finishedAt: now - 9 * day },
      d2: { title: "Moby-Dick", author: "Herman Melville", shelf: "reading", owner: "demo-gill", rating: 0,
            note: "Chapter 32 is just whale facts. Respect.", isbn: "9780142437247", addedAt: now - 6 * day, updatedAt: now - 6 * day },
      d3: { title: "Jaws", author: "Peter Benchley", shelf: "want", owner: "demo-finn", rating: 0,
            note: "", isbn: "9780345544148", addedAt: now - 3 * day, updatedAt: now - 3 * day },
      d4: { title: "Project Hail Mary", author: "Andy Weir", shelf: "read", owner: "demo-finn", rating: 4,
            note: "Not a fish, but a very good boi.", isbn: "9780593135204", addedAt: now - 15 * day, updatedAt: now - 2 * day, finishedAt: now - 2 * day },
      d5: { title: "Dune", author: "Frank Herbert", shelf: "reading", owner: "demo-finn", rating: 0,
            note: "", isbn: "9780441172719", addedAt: now - 1 * day, updatedAt: now - 1 * day }
    }
  };
}

export function demoStore() {
  let data;
  try { data = JSON.parse(localStorage.getItem(DEMO_KEY)); } catch { data = null; }
  if (!data || !data.books || !data.fish) data = demoSeed();
  const listeners = new Set();
  const save = () => {
    try { localStorage.setItem(DEMO_KEY, JSON.stringify(data)); } catch { /* storage blocked: keep in memory */ }
    listeners.forEach((fn) => fn());
  };
  const books = () => Object.entries(data.books).map(([id, b]) => ({ id, ...b }));

  return {
    kind: "demo",
    onAuth(cb) { setTimeout(() => cb(DEMO_USER), 0); return () => {}; },
    async signIn() {},
    async signOut() {},
    async isAdmin() { return true; },
    watch(onBooks, onFish) {
      const push = () => { onBooks(books()); onFish({ ...data.fish }); };
      listeners.add(push);
      setTimeout(push, 0);
      return () => listeners.delete(push);
    },
    async addBook(doc) { data.books["b" + Date.now().toString(36)] = doc; save(); },
    async updateBook(id, patch) { data.books[id] = { ...data.books[id], ...patch }; save(); },
    async deleteBook(id) { delete data.books[id]; save(); },
    async setFish(uid, doc) { data.fish[uid] = doc; save(); },
    reset() { data = demoSeed(); save(); }
  };
}
