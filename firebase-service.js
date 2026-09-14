import { firebaseConfig } from './firebase-config.js';

let auth;
let authSdk;
let firestoreSdk;
let database;
let expensesCollection;

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

export async function connectToFirebase(
  localExpenses,
  deletedExpenseIds = new Set(),
  pendingExpenseIds = new Set(),
  firebaseInitialized = false
) {
  if (!isFirebaseConfigured()) {
    return {
      configured: false,
      expenses: localExpenses,
      deletedExpenseIds: [...deletedExpenseIds],
      pendingExpenseIds: [...pendingExpenseIds],
      user: null
    };
  }

  await loadFirebase();
  await auth.authStateReady();

  if (!auth.currentUser) {
    return {
      configured: true,
      expenses: localExpenses,
      deletedExpenseIds: [...deletedExpenseIds],
      pendingExpenseIds: [...pendingExpenseIds],
      user: null
    };
  }

  const result = await connectUserExpenses(
    auth.currentUser,
    localExpenses,
    deletedExpenseIds,
    pendingExpenseIds,
    firebaseInitialized
  );
  return { configured: true, ...result, user: auth.currentUser };
}

export async function signInWithGoogle(
  localExpenses,
  deletedExpenseIds = new Set(),
  pendingExpenseIds = new Set(),
  firebaseInitialized = false
) {
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

  const result = await connectUserExpenses(
    credential.user,
    localExpenses,
    deletedExpenseIds,
    pendingExpenseIds,
    firebaseInitialized
  );
  return { ...result, user: credential.user };
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

async function connectUserExpenses(user, localExpenses, deletedExpenseIds, pendingExpenseIds, firebaseInitialized) {
  expensesCollection = firestoreSdk.collection(database, 'users', user.uid, 'expenses');
  const pendingDeletedIds = new Set(deletedExpenseIds);
  for (const expenseId of pendingDeletedIds) {
    try {
      await firestoreSdk.deleteDoc(firestoreSdk.doc(expensesCollection, expenseId));
      pendingDeletedIds.delete(expenseId);
    } catch (error) {
      console.error(`No fue posible sincronizar la eliminación de ${expenseId}.`, error);
    }
  }

  const snapshot = await firestoreSdk.getDocs(expensesCollection);
  let cloudExpenses = snapshot.docs.map((expenseDocument) => ({
    ...expenseDocument.data(),
    id: expenseDocument.id
  })).filter((expense) => !pendingDeletedIds.has(expense.id));

  const localExpensesToSync = firebaseInitialized
    ? localExpenses.filter((expense) => pendingExpenseIds.has(expense.id))
    : localExpenses.filter((expense) => !pendingDeletedIds.has(expense.id));
  if (localExpensesToSync.length > 0) {
    await syncExpensesToFirebase(localExpensesToSync);
    const syncedIds = new Set(localExpensesToSync.map((expense) => expense.id));
    cloudExpenses = [
      ...cloudExpenses.filter((expense) => !syncedIds.has(expense.id)),
      ...localExpensesToSync
    ];
  }

  const mergedExpenses = new Map(cloudExpenses.map((expense) => [expense.id, expense]));
  return {
    expenses: [...mergedExpenses.values()],
    deletedExpenseIds: [...pendingDeletedIds],
    pendingExpenseIds: []
  };
}
