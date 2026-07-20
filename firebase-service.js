import { firebaseConfig } from './firebase-config.js';

let auth;
let authSdk;
let firestoreSdk;
let database;
let expensesCollection;

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

export async function connectToFirebase(localExpenses) {
  if (!isFirebaseConfigured()) {
    return { configured: false, expenses: localExpenses, user: null };
  }

  await loadFirebase();
  await auth.authStateReady();

  if (!auth.currentUser) {
    return { configured: true, expenses: localExpenses, user: null };
  }

  const expenses = await connectUserExpenses(auth.currentUser, localExpenses);
  return { configured: true, expenses, user: auth.currentUser };
}

export async function signInWithGoogle(localExpenses) {
  await loadFirebase();
  const provider = new authSdk.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  let credential;
  if (auth.currentUser?.isAnonymous) {
    try {
      credential = await authSdk.linkWithPopup(auth.currentUser, provider);
    } catch (error) {
      const existingCredential = authSdk.GoogleAuthProvider.credentialFromError(error);
      const accountAlreadyExists = ['auth/credential-already-in-use', 'auth/email-already-in-use']
        .includes(error.code);
      if (!accountAlreadyExists || !existingCredential) throw error;
      credential = await authSdk.signInWithCredential(auth, existingCredential);
    }
  } else {
    credential = await authSdk.signInWithPopup(auth, provider);
  }

  const expenses = await connectUserExpenses(credential.user, localExpenses);
  return { expenses, user: credential.user };
}

export async function signOutFromFirebase() {
  if (!auth) return;
  await authSdk.signOut(auth);
  expensesCollection = undefined;
}

export async function saveExpenseToFirebase(expense) {
  if (!expensesCollection) return;
  const { id, ...data } = expense;
  await firestoreSdk.setDoc(firestoreSdk.doc(expensesCollection, id), data);
}

export async function deleteExpenseFromFirebase(expenseId) {
  if (!expensesCollection) return;
  await firestoreSdk.deleteDoc(firestoreSdk.doc(expensesCollection, expenseId));
}

export async function syncExpensesToFirebase(expenses) {
  if (!expensesCollection || expenses.length === 0) return;

  for (let start = 0; start < expenses.length; start += 500) {
    const batch = firestoreSdk.writeBatch(database);
    expenses.slice(start, start + 500).forEach((expense) => {
      const { id, ...data } = expense;
      batch.set(firestoreSdk.doc(expensesCollection, id), data);
    });
    await batch.commit();
  }
}

async function loadFirebase() {
  if (auth) return;

  const [appSdk, loadedAuthSdk, loadedFirestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js')
  ]);
  authSdk = loadedAuthSdk;
  firestoreSdk = loadedFirestoreSdk;

  const app = appSdk.initializeApp(firebaseConfig);
  auth = authSdk.getAuth(app);
  database = firestoreSdk.getFirestore(app);
}

async function connectUserExpenses(user, localExpenses) {
  expensesCollection = firestoreSdk.collection(database, 'users', user.uid, 'expenses');
  const snapshot = await firestoreSdk.getDocs(expensesCollection);
  const cloudExpenses = snapshot.docs.map((expenseDocument) => ({
    ...expenseDocument.data(),
    id: expenseDocument.id
  }));
  const mergedExpenses = new Map(cloudExpenses.map((expense) => [expense.id, expense]));
  localExpenses.forEach((expense) => mergedExpenses.set(expense.id, expense));

  if (localExpenses.length > 0) await syncExpensesToFirebase(localExpenses);
  return [...mergedExpenses.values()];
}
