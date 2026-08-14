'use strict';

import {
  connectToFirebase,
  deleteExpenseFromFirebase,
  isFirebaseConfigured,
  saveExpenseToFirebase,
  signInWithGoogle,
  signOutFromFirebase,
  syncExpensesToFirebase
} from './firebase-service.js';

const ExpenseType = Object.freeze({
  FOOD: 'COMIDA',
  TRANSPORTATION: 'TRANSPORTE',
  SUBSCRIPTIONS: 'SUSCRIPCIONES',
  PURCHASES: 'COMPRAS',
  HEALTH: 'SALUD',
  YUKI: 'YUKI',
  MSI: 'MSI'
});

const LegacyExpenseType = Object.freeze({
  PERSONAL_HEALTH: 'PERSONAL_Y_SALUD'
});

const ExpenseTypeIcon = Object.freeze({
  [ExpenseType.FOOD]: '🍔',
  [ExpenseType.TRANSPORTATION]: '🚗',
  [ExpenseType.SUBSCRIPTIONS]: '📺',
  [ExpenseType.PURCHASES]: '🛍️',
  [ExpenseType.HEALTH]: '❤️',
  [ExpenseType.YUKI]: '🐶',
  [ExpenseType.MSI]: '💳'
});

const ExpenseSubtypes = Object.freeze({
  [ExpenseType.FOOD]: ['Uber Eats', 'Restaurantes', 'Autoservicio', 'Súper', 'Otro'],
  [ExpenseType.TRANSPORTATION]: ['Uber', 'DiDi', 'Gasolina', 'Estacionamiento', 'Otro'],
  [ExpenseType.SUBSCRIPTIONS]: ['Streaming', 'Música', 'Nube', 'Aplicaciones', 'Otro'],
  [ExpenseType.PURCHASES]: ['Ecommerce', 'Ropa', 'Otro'],
  [ExpenseType.HEALTH]: ['Wegovy', 'Farmacia', 'Consultas', 'Otro'],
  [ExpenseType.YUKI]: ['Alimento', 'Veterinario', 'Accesorios', 'Estética', 'Otro'],
  [ExpenseType.MSI]: ['Tecnología', 'Hogar', 'Ropa', 'Otro']
});

const CategoryBudgets = Object.freeze({
  [ExpenseType.FOOD]: 2300,
  [ExpenseType.TRANSPORTATION]: 1500,
  [ExpenseType.SUBSCRIPTIONS]: 1850,
  [ExpenseType.PURCHASES]: 1500,
  [ExpenseType.HEALTH]: null,
  [ExpenseType.YUKI]: 1200,
  [ExpenseType.MSI]: null
});

const CategoryBudgetComments = Object.freeze({
  [ExpenseType.FOOD]: 'Incluye restaurantes, Uber Eats, autoservicio y súper.',
  [ExpenseType.TRANSPORTATION]: 'Considera gasolina y un menor uso de Uber o DiDi.',
  [ExpenseType.SUBSCRIPTIONS]: 'Gasto prácticamente fijo.',
  [ExpenseType.PURCHASES]: 'Amazon, Mercado Libre, ropa y compras personales.',
  [ExpenseType.YUKI]: 'Alimento, veterinario, accesorios y estética de Yuki.',
  [ExpenseType.HEALTH]: 'Solo seguimiento: farmacia, consultas y tratamientos.',
  [ExpenseType.MSI]: 'Seguimiento del monto mensual por pagar.'
});

const STORAGE_KEY = 'personal-finance-expenses-v1';
const PERIOD_START_STORAGE_KEY = 'personal-finance-period-start-v1';
const CUT_OFF_DAY = 13;

const elements = {
  form: document.querySelector('#expenseForm'),
  expenseId: document.querySelector('#expenseId'),
  date: document.querySelector('#expenseDate'),
  concept: document.querySelector('#expenseConcept'),
  type: document.querySelector('#expenseType'),
  subtype: document.querySelector('#expenseSubtype'),
  amount: document.querySelector('#expenseAmount'),
  submitButton: document.querySelector('#submitButton'),
  cancelEditButton: document.querySelector('#cancelEditButton'),
  periodTitle: document.querySelector('#periodTitle'),
  periodStatus: document.querySelector('#periodStatus'),
  periodSelect: document.querySelector('#periodSelect'),
  previousPeriodButton: document.querySelector('#previousPeriodButton'),
  nextPeriodButton: document.querySelector('#nextPeriodButton'),
  periodTotal: document.querySelector('#periodTotal'),
  budgetTotal: document.querySelector('#budgetTotal'),
  budgetRemaining: document.querySelector('#budgetRemaining'),
  budgetPeriodTotal: document.querySelector('#budgetPeriodTotal'),
  summaryExpenseCount: document.querySelector('#summaryExpenseCount'),
  expenseCount: document.querySelector('#expenseCount'),
  tableBody: document.querySelector('#expensesTableBody'),
  exportExcelButton: document.querySelector('#exportExcelButton'),
  categoryKpis: document.querySelector('#categoryKpis'),
  categoryTableBody: document.querySelector('#categoryTableBody'),
  tableContainer: document.querySelector('#tableContainer'),
  emptyState: document.querySelector('#emptyState'),
  datePeriodHint: document.querySelector('#datePeriodHint'),
  toast: document.querySelector('#toast'),
  authStatus: document.querySelector('#authStatus'),
  signInButton: document.querySelector('#signInButton'),
  signOutButton: document.querySelector('#signOutButton'),
  errors: {
    date: document.querySelector('#dateError'),
    concept: document.querySelector('#conceptError'),
    type: document.querySelector('#typeError'),
    subtype: document.querySelector('#subtypeError'),
    amount: document.querySelector('#amountError')
  }
};

let expenses = [];
const currentPeriod = getCardPeriod(new Date());
let firstTrackedPeriodStart;
let availablePeriods = [];
let selectedPeriodId = currentPeriod.id;
let toastTimer;
let firebaseConfigured = false;
let firebaseConnectionFailed = false;
let signedInUser = null;

initialize().catch(handleInitializationError);

async function initialize() {
  const localExpenses = loadLocalExpenses();
  const firebaseState = await connectToFirebase(localExpenses);
  expenses = firebaseState.expenses;
  firebaseConfigured = firebaseState.configured;
  signedInUser = firebaseState.user;
  saveExpensesLocally();
  firstTrackedPeriodStart = loadFirstTrackedPeriodStart();
  availablePeriods = buildAvailablePeriods();

  populateExpenseTypes();
  populateExpenseSubtypes();
  await migrateExpensePeriods();
  renderPeriodOptions();
  setDefaultDate();
  updateDatePeriodHint();
  render();

  attachEventListeners();
  updateAuthenticationUI();

  if (!isFirebaseConfigured()) {
    showToast('Firebase aún no está configurado; los datos siguen guardándose localmente.');
  } else if (isPermanentUser(signedInUser)) {
    showToast('Registros sincronizados con tu cuenta de Google.');
  } else {
    showToast('Inicia sesión con Google para sincronizar tus registros.');
  }
}

function handleInitializationError(error) {
  console.error('No fue posible conectar con Firebase.', error);
  expenses = loadLocalExpenses();
  firstTrackedPeriodStart = loadFirstTrackedPeriodStart();
  availablePeriods = buildAvailablePeriods();
  populateExpenseTypes();
  populateExpenseSubtypes();
  migrateExpensePeriods().catch((migrationError) => {
    console.error('No fue posible sincronizar la migración de datos.', migrationError);
  });
  renderPeriodOptions();
  setDefaultDate();
  updateDatePeriodHint();
  render();
  firebaseConfigured = isFirebaseConfigured();
  attachEventListeners();
  updateAuthenticationUI(true);

  showToast('Sin conexión con Firebase; se usará el guardado local.');
}

function attachEventListeners() {
  elements.form.addEventListener('submit', handleSubmit);
  elements.cancelEditButton.addEventListener('click', resetForm);
  elements.tableBody.addEventListener('click', handleTableAction);
  elements.exportExcelButton.addEventListener('click', handleExportExcel);
  elements.previousPeriodButton.addEventListener('click', () => navigatePeriod(-1));
  elements.nextPeriodButton.addEventListener('click', () => navigatePeriod(1));
  elements.periodSelect.addEventListener('change', handlePeriodSelection);
  elements.date.addEventListener('change', updateDatePeriodHint);
  elements.type.addEventListener('change', populateExpenseSubtypes);
  elements.signInButton.addEventListener('click', handleGoogleSignIn);
  elements.signOutButton.addEventListener('click', handleSignOut);
}

function updateAuthenticationUI(connectionFailed = false) {
  firebaseConnectionFailed = connectionFailed;
  const hasPermanentSession = isPermanentUser(signedInUser);
  elements.signInButton.classList.toggle('hidden', hasPermanentSession || !firebaseConfigured);
  elements.signOutButton.classList.toggle('hidden', !hasPermanentSession);
  elements.signInButton.disabled = connectionFailed;
  elements.submitButton.disabled = requiresGoogleSignIn();
  elements.submitButton.textContent = elements.submitButton.disabled ? 'Inicia sesión para guardar' : 'Agregar gasto';

  if (connectionFailed) {
    elements.authStatus.textContent = 'Firebase no está disponible. Se usará el respaldo local.';
  } else if (!firebaseConfigured) {
    elements.authStatus.textContent = 'Guardado local: Firebase no está configurado.';
  } else if (hasPermanentSession) {
    elements.authStatus.textContent = signedInUser.email || signedInUser.displayName || 'Sesión de Google activa';
  } else if (signedInUser?.isAnonymous) {
    elements.authStatus.textContent = 'Vincula los registros actuales con tu cuenta de Google.';
  } else {
    elements.authStatus.textContent = 'Inicia sesión para ver tus registros en cualquier dispositivo.';
  }
}

function isPermanentUser(user) {
  return Boolean(user && !user.isAnonymous);
}

function requiresGoogleSignIn() {
  return firebaseConfigured && !firebaseConnectionFailed && !isPermanentUser(signedInUser);
}

async function handleGoogleSignIn() {
  elements.signInButton.disabled = true;
  elements.signInButton.textContent = 'Abriendo Google…';

  try {
    const result = await signInWithGoogle(expenses);
    signedInUser = result.user;
    expenses = result.expenses;
    saveExpensesLocally();
    firstTrackedPeriodStart = loadFirstTrackedPeriodStart();
    availablePeriods = buildAvailablePeriods();
    selectedPeriodId = currentPeriod.id;
    renderPeriodOptions();
    resetForm();
    render();
    updateAuthenticationUI();
    showToast('Sesión iniciada. Registros sincronizados con Google.');
  } catch (error) {
    console.error('No fue posible iniciar sesión con Google.', error);
    const messages = {
      'auth/operation-not-allowed': 'Habilita el proveedor Google en Firebase Authentication.',
      'auth/popup-closed-by-user': 'Se cerró la ventana antes de iniciar sesión.',
      'auth/unauthorized-domain': 'Autoriza este dominio en Firebase Authentication.'
    };
    const message = messages[error.code] || 'No fue posible iniciar sesión con Google.';
    showToast(message);
  } finally {
    elements.signInButton.disabled = false;
    elements.signInButton.textContent = 'Entrar con Google';
  }
}

async function handleSignOut() {
  try {
    await signOutFromFirebase();
    signedInUser = null;
    expenses = [];
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PERIOD_START_STORAGE_KEY);
    firstTrackedPeriodStart = loadFirstTrackedPeriodStart();
    availablePeriods = buildAvailablePeriods();
    selectedPeriodId = currentPeriod.id;
    renderPeriodOptions();
    resetForm();
    render();
    updateAuthenticationUI();
    showToast('Sesión cerrada y copia local eliminada.');
  } catch (error) {
    console.error('No fue posible cerrar la sesión.', error);
    showToast('No fue posible cerrar la sesión.');
  }
}

function populateExpenseTypes() {
  elements.type.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Selecciona una categoría';
  elements.type.append(placeholder);

  Object.values(ExpenseType).forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = formatType(type);
    elements.type.append(option);
  });
}

function populateExpenseSubtypes() {
  const selectedType = elements.type.value;
  elements.subtype.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = selectedType ? 'Selecciona un tipo' : 'Selecciona una categoría primero';
  elements.subtype.append(placeholder);
  elements.subtype.disabled = !selectedType;
  elements.errors.subtype.textContent = '';
  elements.subtype.removeAttribute('aria-invalid');

  (ExpenseSubtypes[selectedType] || []).forEach((subtype) => {
    const option = document.createElement('option');
    option.value = subtype;
    option.textContent = subtype;
    elements.subtype.append(option);
  });
}

function buildAvailablePeriods() {
  const periods = [];
  const firstStart = parseLocalDate(firstTrackedPeriodStart);
  const currentStart = parseLocalDate(currentPeriod.startDate);

  for (let offset = 0; ; offset += 1) {
    const start = new Date(firstStart.getFullYear(), firstStart.getMonth() + offset, CUT_OFF_DAY + 1);
    if (start > currentStart) break;
    periods.push(getCardPeriod(start));
  }

  const today = new Date();
  if (today.getDate() > CUT_OFF_DAY) {
    const previousPeriodStart = new Date(currentStart.getFullYear(), currentStart.getMonth() - 1, CUT_OFF_DAY + 1);
    const previousPeriod = getCardPeriod(previousPeriodStart);
    if (!periods.some((period) => period.id === previousPeriod.id)) {
      periods.push(previousPeriod);
    }
  }

  return periods.sort((first, second) => parseLocalDate(first.startDate) - parseLocalDate(second.startDate));
}

function renderPeriodOptions() {
  elements.periodSelect.replaceChildren();
  [...availablePeriods].reverse().forEach((period) => {
    const option = document.createElement('option');
    option.value = period.id;
    option.textContent = formatPeriodLabel(period);
    option.selected = period.id === selectedPeriodId;
    elements.periodSelect.append(option);
  });
}

function handlePeriodSelection(event) {
  selectPeriod(event.target.value);
}

function navigatePeriod(direction) {
  const currentIndex = availablePeriods.findIndex((period) => period.id === selectedPeriodId);
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= availablePeriods.length) return;
  selectPeriod(availablePeriods[nextIndex].id);
}

function selectPeriod(periodId) {
  if (!availablePeriods.some((period) => period.id === periodId)) return;
  selectedPeriodId = periodId;
  resetForm();
  renderPeriodOptions();
  render();
}

function getSelectedPeriod() {
  return availablePeriods.find((period) => period.id === selectedPeriodId) || currentPeriod;
}

function getCardPeriod(referenceDate) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();
  const startDate = day > CUT_OFF_DAY
    ? new Date(year, month, CUT_OFF_DAY + 1)
    : new Date(year, month - 1, CUT_OFF_DAY + 1);
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, CUT_OFF_DAY);
  const start = toISODate(startDate);
  const end = toISODate(endDate);

  return {
    id: `${start}_${end}`,
    startDate: start,
    endDate: end,
    status: getPeriodStatus(start, end)
  };
}

function getPeriodStatus(startDate, endDate) {
  const today = toISODate(new Date());
  if (today < startDate) return 'FUTURE';
  if (today > endDate) return 'CLOSED';
  return 'OPEN';
}

async function migrateExpensePeriods() {
  let changed = false;
  expenses = expenses.map((expense) => {
    const correctPeriodId = getCardPeriod(parseLocalDate(expense.date)).id;
    const healthSubtypes = ['Wegovy', 'Farmacia', 'Consultas'];
    const correctType = expense.type === LegacyExpenseType.PERSONAL_HEALTH
      ? (healthSubtypes.includes(expense.subtype) ? ExpenseType.HEALTH : ExpenseType.PURCHASES)
      : expense.type;
    if (expense.periodId !== correctPeriodId || expense.type !== correctType) {
      changed = true;
      return { ...expense, periodId: correctPeriodId, type: correctType };
    }
    return expense;
  });
  if (changed) {
    saveExpensesLocally();
    await syncExpensesToFirebase(expenses);
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  if (requiresGoogleSignIn()) {
    showToast('Inicia sesión con Google antes de guardar.');
    return;
  }
  clearErrors();

  const draft = {
    date: elements.date.value,
    concept: elements.concept.value.trim(),
    type: elements.type.value,
    subtype: elements.subtype.value,
    amount: Number(elements.amount.value)
  };

  const validationErrors = validateExpense(draft);
  if (Object.keys(validationErrors).length > 0) {
    displayErrors(validationErrors);
    return;
  }

  const targetPeriod = getCardPeriod(parseLocalDate(draft.date));
  const existingId = elements.expenseId.value;

  let savedExpense;
  if (existingId) {
    expenses = expenses.map((expense) => expense.id === existingId
      ? { ...expense, ...draft, amount: roundMoney(draft.amount), periodId: targetPeriod.id }
      : expense);
    savedExpense = expenses.find((expense) => expense.id === existingId);
  } else {
    savedExpense = {
      id: createId(),
      ...draft,
      amount: roundMoney(draft.amount),
      periodId: targetPeriod.id
    };
    expenses.push(savedExpense);
  }

  selectedPeriodId = targetPeriod.id;
  saveExpensesLocally();
  availablePeriods = buildAvailablePeriods();
  renderPeriodOptions();
  resetForm();
  render();

  try {
    await saveExpenseToFirebase(savedExpense);
    showToast(existingId ? 'Gasto actualizado correctamente.' : 'Gasto agregado correctamente.');
  } catch (error) {
    console.error('No fue posible sincronizar el gasto.', error);
    showToast('El gasto quedó guardado localmente, pero no se sincronizó.');
  }
}

function validateExpense(draft) {
  const errors = {};
  if (!draft.date) errors.date = 'Selecciona una fecha.';
  if (draft.date) {
    const periodId = getCardPeriod(parseLocalDate(draft.date)).id;
    if (!availablePeriods.some((period) => period.id === periodId)) {
      errors.date = 'Selecciona una fecha de un periodo disponible.';
    }
  }
  if (!draft.concept) errors.concept = 'Escribe el concepto del gasto.';
  if (!Object.values(ExpenseType).includes(draft.type)) errors.type = 'Selecciona una categoría válida.';
  if (draft.type && !(ExpenseSubtypes[draft.type] || []).includes(draft.subtype)) {
    errors.subtype = 'Selecciona un tipo válido.';
  }
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) errors.amount = 'Ingresa un costo mayor que cero.';
  return errors;
}

function displayErrors(errors) {
  Object.entries(errors).forEach(([field, message]) => {
    elements.errors[field].textContent = message;
    elements[field].setAttribute('aria-invalid', 'true');
  });
}

function clearErrors() {
  Object.entries(elements.errors).forEach(([field, errorElement]) => {
    errorElement.textContent = '';
    elements[field].removeAttribute('aria-invalid');
  });
}

function render() {
  const selectedPeriod = getSelectedPeriod();
  const periodExpenses = getPeriodExpenses(selectedPeriod.id);
  renderPeriodHeader(selectedPeriod);
  renderSummary(periodExpenses);
  renderTable(periodExpenses);
  renderCategoryTable(periodExpenses);
  updateNavigationButtons();
}

function renderPeriodHeader(period) {
  elements.periodTitle.textContent = formatPeriodLabel(period);
  elements.periodStatus.textContent = formatPeriodStatus(period.status);
  elements.periodStatus.dataset.status = period.status;
}

function getPeriodExpenses(periodId) {
  return expenses
    .filter((expense) => expense.periodId === periodId)
    .sort((first, second) => second.date.localeCompare(first.date) || second.concept.localeCompare(first.concept));
}

function renderSummary(periodExpenses) {
  const total = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const budgetTotal = Object.values(CategoryBudgets)
    .filter(Number.isFinite)
    .reduce((sum, budget) => sum + budget, 0);
  const budgetedExpenses = periodExpenses.filter((expense) =>
    Number.isFinite(CategoryBudgets[expense.type]));
  const budgetedTotal = budgetedExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const remaining = budgetTotal - budgetedTotal;

  elements.periodTotal.textContent = formatCurrency(total);
  elements.budgetTotal.textContent = formatCurrency(budgetTotal);
  elements.budgetPeriodTotal.textContent = formatCurrency(budgetedTotal);
  elements.budgetRemaining.textContent = remaining >= 0
    ? formatCurrency(remaining)
    : `${formatCurrency(Math.abs(remaining))} excedido`;
  elements.budgetRemaining.dataset.status = remaining < 0 ? 'OVER' : 'AVAILABLE';
  elements.summaryExpenseCount.textContent = String(periodExpenses.length);
  elements.expenseCount.textContent = `${periodExpenses.length} ${periodExpenses.length === 1 ? 'gasto' : 'gastos'}`;
}

function renderTable(periodExpenses) {
  elements.tableBody.replaceChildren();
  elements.emptyState.classList.toggle('hidden', periodExpenses.length > 0);
  elements.tableContainer.classList.toggle('hidden', periodExpenses.length === 0);

  periodExpenses.forEach((expense) => {
    const disabledAttribute = requiresGoogleSignIn() ? ' disabled' : '';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHTML(formatShortDate(expense.date))}</td>
      <td>${escapeHTML(expense.concept)}</td>
      <td><span class="type-badge">${escapeHTML(formatType(expense.type))}</span></td>
      <td>${escapeHTML(expense.subtype || 'Sin clasificar')}</td>
      <td class="amount-column">${escapeHTML(formatCurrency(expense.amount))}</td>
      <td class="actions-column">
        <div class="table-actions">
          <button class="icon-button" type="button" data-action="edit" data-id="${expense.id}"${disabledAttribute}>Editar</button>
          <button class="icon-button icon-button-danger" type="button" data-action="delete" data-id="${expense.id}"${disabledAttribute}>Eliminar</button>
        </div>
      </td>`;
    elements.tableBody.append(row);
  });
}

function renderCategoryTable(periodExpenses) {
  elements.categoryKpis.replaceChildren();
  elements.categoryTableBody.replaceChildren();

  Object.values(ExpenseType).forEach((type) => {
    const typeExpenses = periodExpenses.filter((expense) => expense.type === type);
    const total = typeExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const budget = CategoryBudgets[type];
    const hasBudget = Number.isFinite(budget);
    const percentage = hasBudget ? Math.round((total / budget) * 100) : null;
    const balance = hasBudget ? budget - total : null;
    const progressMarkup = hasBudget
      ? `<div class="category-kpi-progress-row">
          <div class="category-kpi-progress${percentage > 100 ? ' over-budget' : ''}" role="progressbar" aria-label="Presupuesto de ${escapeHTML(formatType(type))}" aria-valuenow="${Math.min(percentage, 100)}" aria-valuetext="${percentage}% utilizado" aria-valuemin="0" aria-valuemax="100">
            <span style="width: ${Math.min(percentage, 100)}%"></span>
          </div>
          <b>${percentage}%</b>
        </div>`
      : '<div class="category-kpi-unbudgeted">Sin presupuesto · solo seguimiento</div>';
    const balanceLabel = hasBudget
      ? (balance >= 0
        ? `${formatCurrency(balance)} disponible`
        : `${formatCurrency(Math.abs(balance))} excedido`)
      : 'Sin evaluación presupuestal';
    const kpi = document.createElement('article');
    kpi.className = `category-kpi${hasBudget && balance < 0 ? ' over-budget' : ''}`;
    kpi.innerHTML = `
      <div class="category-kpi-heading">
        <span class="category-kpi-name">
          <span class="category-kpi-icon" aria-hidden="true">${ExpenseTypeIcon[type]}</span>
          ${escapeHTML(formatType(type))}
        </span>
        <strong>${escapeHTML(formatCurrency(total))}</strong>
      </div>
      ${progressMarkup}
      <small>${typeExpenses.length} ${typeExpenses.length === 1 ? 'movimiento' : 'movimientos'} · ${escapeHTML(balanceLabel)}</small>
      <p class="category-budget-comment">${escapeHTML(CategoryBudgetComments[type])}</p>`;
    elements.categoryKpis.append(kpi);

    const row = document.createElement('tr');
    row.className = 'category-total-row';
    row.innerHTML = `
      <td><span class="type-badge">${escapeHTML(formatType(type))}</span></td>
      <td><strong>Total categoría</strong></td>
      <td>${typeExpenses.length}</td>
      <td class="amount-column">${escapeHTML(formatCurrency(total))}</td>`;
    elements.categoryTableBody.append(row);

    const subtypeNames = [...ExpenseSubtypes[type]];
    if (typeExpenses.some((expense) => !expense.subtype)) subtypeNames.push('Sin clasificar');

    subtypeNames.forEach((subtype) => {
      const subtypeExpenses = typeExpenses.filter((expense) =>
        subtype === 'Sin clasificar' ? !expense.subtype : expense.subtype === subtype);
      const subtypeTotal = subtypeExpenses.reduce((sum, expense) => sum + expense.amount, 0);
      const subtypeRow = document.createElement('tr');
      subtypeRow.innerHTML = `
        <td></td>
        <td class="subcategory-name">↳ ${escapeHTML(subtype)}</td>
        <td>${subtypeExpenses.length}</td>
        <td class="amount-column">${escapeHTML(formatCurrency(subtypeTotal))}</td>`;
      elements.categoryTableBody.append(subtypeRow);
    });
  });
}

function updateNavigationButtons() {
  const index = availablePeriods.findIndex((period) => period.id === selectedPeriodId);
  elements.previousPeriodButton.disabled = index <= 0;
  elements.nextPeriodButton.disabled = index >= availablePeriods.length - 1;
}

function handleExportExcel() {
  const selectedPeriod = getSelectedPeriod();
  const periodExpenses = getPeriodExpenses(selectedPeriod.id);

  if (periodExpenses.length === 0) {
    showToast('No hay movimientos para exportar en este periodo.');
    return;
  }

  const rows = periodExpenses.map((expense) => ({
    Fecha: formatExportDate(expense.date),
    Concepto: expense.concept,
    Categoría: formatType(expense.type),
    Tipo: expense.subtype || 'Sin clasificar',
    Costo: Number(expense.amount)
  }));

  const workbook = window.XLSX ? window.XLSX.utils.book_new() : null;
  if (workbook) {
    const worksheet = window.XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 14 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 14 }
    ];
    window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos');
    window.XLSX.writeFile(workbook, `movimientos-${selectedPeriod.startDate}_${selectedPeriod.endDate}.xlsx`);
    showToast('Excel descargado.');
    return;
  }

  const headers = ['Fecha', 'Concepto', 'Categoría', 'Tipo', 'Costo'];
  const csvRows = [headers, ...rows.map((row) => [
    row.Fecha,
    row.Concepto,
    row.Categoría,
    row.Tipo,
    row.Costo.toFixed(2)
  ])];
  const csvContent = csvRows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `movimientos-${selectedPeriod.startDate}_${selectedPeriod.endDate}.csv`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast('Archivo CSV descargado.');
}

function formatExportDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function handleTableAction(event) {
  if (requiresGoogleSignIn()) return;
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'edit') startEdit(button.dataset.id);
  if (button.dataset.action === 'delete') deleteExpense(button.dataset.id);
}

function startEdit(id) {
  const expense = expenses.find((item) => item.id === id);
  if (!expense) return;
  elements.expenseId.value = expense.id;
  elements.date.value = expense.date;
  elements.concept.value = expense.concept;
  elements.type.value = expense.type;
  populateExpenseSubtypes();
  elements.subtype.value = expense.subtype || '';
  elements.amount.value = String(expense.amount);
  elements.submitButton.textContent = 'Guardar cambios';
  elements.cancelEditButton.classList.remove('hidden');
  updateDatePeriodHint();
  elements.concept.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteExpense(id) {
  const expense = expenses.find((item) => item.id === id);
  if (!expense) return;
  if (!window.confirm(`¿Eliminar el gasto “${expense.concept}” por ${formatCurrency(expense.amount)}?`)) return;
  expenses = expenses.filter((item) => item.id !== id);
  saveExpensesLocally();
  if (elements.expenseId.value === id) resetForm();
  render();
  try {
    await deleteExpenseFromFirebase(id);
    showToast('Gasto eliminado.');
  } catch (error) {
    console.error('No fue posible eliminar el gasto de Firebase.', error);
    showToast('Se eliminó localmente, pero no se sincronizó con Firebase.');
  }
}

function resetForm() {
  elements.form.reset();
  populateExpenseSubtypes();
  elements.expenseId.value = '';
  elements.submitButton.textContent = requiresGoogleSignIn() ? 'Inicia sesión para guardar' : 'Agregar gasto';
  elements.cancelEditButton.classList.add('hidden');
  clearErrors();
  setDefaultDate();
  updateDatePeriodHint();
}

function setDefaultDate() {
  const selectedPeriod = getSelectedPeriod();
  const today = toISODate(new Date());
  elements.date.value = isDateInsidePeriod(today, selectedPeriod) ? today : selectedPeriod.startDate;
}

function updateDatePeriodHint() {
  if (!elements.date.value) {
    elements.datePeriodHint.textContent = '';
    return;
  }
  const period = getCardPeriod(parseLocalDate(elements.date.value));
  elements.datePeriodHint.textContent = `Este gasto se guardará en el periodo ${formatPeriodLabel(period)}.`;
}

function loadLocalExpenses() {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return [];
    const parsedValue = JSON.parse(rawValue);
    if (!Array.isArray(parsedValue)) return [];
    return parsedValue.filter(isValidStoredExpense);
  } catch (error) {
    console.error('No fue posible cargar los gastos guardados.', error);
    return [];
  }
}

function loadFirstTrackedPeriodStart() {
  try {
    const storedStart = localStorage.getItem(PERIOD_START_STORAGE_KEY);
    let firstStart = currentPeriod.startDate;
    if (storedStart) {
      const storedDate = parseLocalDate(storedStart);
      const isValidStart = !Number.isNaN(storedDate.getTime()) &&
        getCardPeriod(storedDate).startDate === storedStart &&
        storedStart <= currentPeriod.startDate;
      if (isValidStart) firstStart = storedStart;
    }

    expenses.forEach((expense) => {
      const expensePeriodStart = getCardPeriod(parseLocalDate(expense.date)).startDate;
      if (expensePeriodStart < firstStart) firstStart = expensePeriodStart;
    });

    localStorage.setItem(PERIOD_START_STORAGE_KEY, firstStart);
    return firstStart;
  } catch (error) {
    console.error('No fue posible guardar el inicio del historial.', error);
  }

  return currentPeriod.startDate;
}

function isValidStoredExpense(expense) {
  const validTypes = [...Object.values(ExpenseType), ...Object.values(LegacyExpenseType)];
  return expense && typeof expense.id === 'string' && typeof expense.date === 'string' &&
    typeof expense.concept === 'string' && validTypes.includes(expense.type) &&
    Number.isFinite(expense.amount);
}

function saveExpensesLocally() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  } catch (error) {
    console.error('No fue posible guardar los gastos.', error);
    showToast('No fue posible guardar la información en este navegador.');
  }
}

function isDateInsidePeriod(date, period) {
  return date >= period.startDate && date <= period.endDate;
}

function parseLocalDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatPeriodLabel(period) {
  return `${formatDayMonth(period.startDate)} – ${formatDayMonthYear(period.endDate)}`;
}

function formatDayMonth(value) {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`)).replace('.', '');
}

function formatDayMonthYear(value) {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`)).replace('.', '');
}

function formatPeriodStatus(status) {
  return { OPEN: 'Periodo actual', CLOSED: 'Periodo cerrado', FUTURE: 'Periodo futuro' }[status];
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(value);
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`)).replace('.', '');
}

function formatType(type) {
  if (type === ExpenseType.MSI) return 'MSI';
  const label = type.replaceAll('_', ' ');
  return label.charAt(0) + label.slice(1).toLowerCase();
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHTML(value) {
  const element = document.createElement('div');
  element.textContent = String(value);
  return element.innerHTML;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), 2600);
}
