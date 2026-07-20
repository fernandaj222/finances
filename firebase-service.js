import { firebaseConfig } from './firebase-config.js';

let expensesCollection;
let firestoreSdk;

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

export async function connectToFirebase(localExpenses) {
  if (!isFirebaseConfigured()) return localExpenses;

  const [appSdk, authSdk, loadedFirestoreSdk] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js')
  ]);
  firestoreSdk = loadedFirestoreSdk;

  const app = appSdk.initializeApp(firebaseConfig);
  const auth = authSdk.getAuth(app);
  const credential = auth.currentUser
    ? { user: auth.currentUser }
    : await authSdk.signInAnonymously(auth);
  const database = firestoreSdk.getFirestore(app);
  expensesCollection = firestoreSdk.collection(database, 'users', credential.user.uid, 'expenses');

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
    const batch = firestoreSdk.writeBatch(expensesCollection.firestore);
    expenses.slice(start, start + 500).forEach((expense) => {
      const { id, ...data } = expense;
      batch.set(firestoreSdk.doc(expensesCollection, id), data);
    });
    await batch.commit();
  }
}
