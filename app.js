'use strict';

const ExpenseType = Object.freeze({
  FOOD: 'COMIDA',
  TRANSPORTATION: 'TRANSPORTE',
  SUBSCRIPTIONS: 'SUSCRIPCIONES',
  HEALTH: 'SALUD',
  PURCHASES: 'COMPRAS',
  YUKI: 'YUKI',
  MSI: 'MSI'
});

const STORAGE_KEY = 'personal-finance-expenses-v1';
const CUT_OFF_DAY = 13;
const PERIODS_BEFORE_CURRENT = 11;
const PERIODS_AFTER_CURRENT = 1;

const elements = {
  form: document.querySelector('#expenseForm'),
  expenseId: document.querySelector('#expenseId'),
  date: document.querySelector('#expenseDate'),
  concept: document.querySelector('#expenseConcept'),
  type: document.querySelector('#expenseType'),
  amount: document.querySelector('#expenseAmount'),
  submitButton: document.querySelector('#submitButton'),
  cancelEditButton: document.querySelector('#cancelEditButton'),
  periodTitle: document.querySelector('#periodTitle'),
  periodStatus: document.querySelector('#periodStatus'),
  periodSelect: document.querySelector('#periodSelect'),
  previousPeriodButton: document.querySelector('#previousPeriodButton'),
  nextPeriodButton: document.querySelector('#nextPeriodButton'),
  periodTotal: document.querySelector('#periodTotal'),
  summaryExpenseCount: document.querySelector('#summaryExpenseCount'),
  expenseCount: document.querySelector('#expenseCount'),
  tableBody: document.querySelector('#expensesTableBody'),
  tableContainer: document.querySelector('#tableContainer'),
  emptyState: document.querySelector('#emptyState'),
  periodHistory: document.querySelector('#periodHistory'),
  datePeriodHint: document.querySelector('#datePeriodHint'),
  toast: document.querySelector('#toast'),
  errors: {
    date: document.querySelector('#dateError'),
    concept: document.querySelector('#conceptError'),
    type: document.querySelector('#typeError'),
    amount: document.querySelector('#amountError')
  }
};

let expenses = loadExpenses();
const currentPeriod = getCardPeriod(new Date());
let availablePeriods = buildAvailablePeriods();
let selectedPeriodId = currentPeriod.id;
let toastTimer;

initialize();

function initialize() {
  populateExpenseTypes();
  migrateExpensePeriods();
  renderPeriodOptions();
  setDefaultDate();
  updateDatePeriodHint();
  render();

  elements.form.addEventListener('submit', handleSubmit);
  elements.cancelEditButton.addEventListener('click', resetForm);
  elements.tableBody.addEventListener('click', handleTableAction);
  elements.previousPeriodButton.addEventListener('click', () => navigatePeriod(-1));
  elements.nextPeriodButton.addEventListener('click', () => navigatePeriod(1));
  elements.periodSelect.addEventListener('change', handlePeriodSelection);
  elements.periodHistory.addEventListener('click', handleHistorySelection);
  elements.date.addEventListener('change', updateDatePeriodHint);
}

function populateExpenseTypes() {
  Object.values(ExpenseType).forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = formatType(type);
    elements.type.append(option);
  });
}

function buildAvailablePeriods() {
  const periods = [];
  const currentStart = parseLocalDate(currentPeriod.startDate);

  for (let offset = -PERIODS_BEFORE_CURRENT; offset <= PERIODS_AFTER_CURRENT; offset += 1) {
    const start = new Date(currentStart.getFullYear(), currentStart.getMonth() + offset, CUT_OFF_DAY + 1);
    periods.push(getCardPeriod(start));
  }

  expenses.forEach((expense) => {
    const period = getCardPeriod(parseLocalDate(expense.date));
    if (!periods.some((item) => item.id === period.id)) periods.push(period);
  });

  return periods.sort((a, b) => a.startDate.localeCompare(b.startDate));
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

function handleHistorySelection(event) {
  const button = event.target.closest('button[data-period-id]');
  if (button) selectPeriod(button.dataset.periodId);
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

function migrateExpensePeriods() {
  let changed = false;
  expenses = expenses.map((expense) => {
    const correctPeriodId = getCardPeriod(parseLocalDate(expense.date)).id;
    if (expense.periodId !== correctPeriodId) {
      changed = true;
      return { ...expense, periodId: correctPeriodId };
    }
    return expense;
  });
  if (changed) saveExpenses();
}

function handleSubmit(event) {
  event.preventDefault();
  clearErrors();

  const draft = {
    date: elements.date.value,
    concept: elements.concept.value.trim(),
    type: elements.type.value,
    amount: Number(elements.amount.value)
  };

  const validationErrors = validateExpense(draft);
  if (Object.keys(validationErrors).length > 0) {
    displayErrors(validationErrors);
    return;
  }

  const targetPeriod = getCardPeriod(parseLocalDate(draft.date));
  const existingId = elements.expenseId.value;

  if (existingId) {
    expenses = expenses.map((expense) => expense.id === existingId
      ? { ...expense, ...draft, amount: roundMoney(draft.amount), periodId: targetPeriod.id }
      : expense);
    showToast('Gasto actualizado correctamente.');
  } else {
    expenses.push({
      id: createId(),
      ...draft,
      amount: roundMoney(draft.amount),
      periodId: targetPeriod.id
    });
    showToast('Gasto agregado correctamente.');
  }

  selectedPeriodId = targetPeriod.id;
  saveExpenses();
  availablePeriods = buildAvailablePeriods();
  renderPeriodOptions();
  resetForm();
  render();
}

function validateExpense(draft) {
  const errors = {};
  if (!draft.date) errors.date = 'Selecciona una fecha.';
  if (!draft.concept) errors.concept = 'Escribe el concepto del gasto.';
  if (!Object.values(ExpenseType).includes(draft.type)) errors.type = 'Selecciona un tipo válido.';
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
  renderHistory();
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
  elements.periodTotal.textContent = formatCurrency(total);
  elements.summaryExpenseCount.textContent = String(periodExpenses.length);
  elements.expenseCount.textContent = `${periodExpenses.length} ${periodExpenses.length === 1 ? 'gasto' : 'gastos'}`;
}

function renderTable(periodExpenses) {
  elements.tableBody.replaceChildren();
  elements.emptyState.classList.toggle('hidden', periodExpenses.length > 0);
  elements.tableContainer.classList.toggle('hidden', periodExpenses.length === 0);

  periodExpenses.forEach((expense) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHTML(formatShortDate(expense.date))}</td>
      <td>${escapeHTML(expense.concept)}</td>
      <td><span class="type-badge">${escapeHTML(formatType(expense.type))}</span></td>
      <td class="amount-column">${escapeHTML(formatCurrency(expense.amount))}</td>
      <td class="actions-column">
        <div class="table-actions">
          <button class="icon-button" type="button" data-action="edit" data-id="${expense.id}">Editar</button>
          <button class="icon-button icon-button-danger" type="button" data-action="delete" data-id="${expense.id}">Eliminar</button>
        </div>
      </td>`;
    elements.tableBody.append(row);
  });
}

function renderHistory() {
  elements.periodHistory.replaceChildren();
  [...availablePeriods].reverse().forEach((period) => {
    const periodExpenses = getPeriodExpenses(period.id);
    const total = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `history-item${period.id === selectedPeriodId ? ' active' : ''}`;
    button.dataset.periodId = period.id;
    button.innerHTML = `
      <span>
        <strong>${escapeHTML(formatCompactPeriodLabel(period))}</strong>
        <small>${escapeHTML(formatPeriodStatus(period.status))} · ${periodExpenses.length} movimientos</small>
      </span>
      <b>${escapeHTML(formatCurrency(total))}</b>`;
    elements.periodHistory.append(button);
  });
}

function updateNavigationButtons() {
  const index = availablePeriods.findIndex((period) => period.id === selectedPeriodId);
  elements.previousPeriodButton.disabled = index <= 0;
  elements.nextPeriodButton.disabled = index >= availablePeriods.length - 1;
}

function handleTableAction(event) {
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
  elements.amount.value = String(expense.amount);
  elements.submitButton.textContent = 'Guardar cambios';
  elements.cancelEditButton.classList.remove('hidden');
  updateDatePeriodHint();
  elements.concept.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteExpense(id) {
  const expense = expenses.find((item) => item.id === id);
  if (!expense) return;
  if (!window.confirm(`¿Eliminar el gasto “${expense.concept}” por ${formatCurrency(expense.amount)}?`)) return;
  expenses = expenses.filter((item) => item.id !== id);
  saveExpenses();
  if (elements.expenseId.value === id) resetForm();
  render();
  showToast('Gasto eliminado.');
}

function resetForm() {
  elements.form.reset();
  elements.expenseId.value = '';
  elements.submitButton.textContent = 'Agregar gasto';
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

function loadExpenses() {
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

function isValidStoredExpense(expense) {
  return expense && typeof expense.id === 'string' && typeof expense.date === 'string' &&
    typeof expense.concept === 'string' && Object.values(ExpenseType).includes(expense.type) &&
    Number.isFinite(expense.amount);
}

function saveExpenses() {
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

function formatCompactPeriodLabel(period) {
  return `${formatDayMonth(period.startDate)} – ${formatDayMonth(period.endDate)}`;
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
  return type.charAt(0) + type.slice(1).toLowerCase();
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
