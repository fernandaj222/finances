'use strict';

/**
 * @typedef {'COMIDA'|'TRANSPORTE'|'SUSCRIPCIONES'|'SALUD'|'COMPRAS'|'YUKI'|'MSI'} ExpenseTypeValue
 */

/**
 * @typedef {Object} Expense
 * @property {string} id
 * @property {string} date
 * @property {string} concept
 * @property {ExpenseTypeValue} type
 * @property {number} amount
 * @property {string} periodId
 */

/**
 * @typedef {Object} CardPeriod
 * @property {string} id
 * @property {string} name
 * @property {string} startDate
 * @property {string} endDate
 * @property {boolean} isOpen
 */

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

const elements = {
  form: document.querySelector('#expenseForm'),
  expenseId: document.querySelector('#expenseId'),
  date: document.querySelector('#expenseDate'),
  concept: document.querySelector('#expenseConcept'),
  type: document.querySelector('#expenseType'),
  amount: document.querySelector('#expenseAmount'),
  submitButton: document.querySelector('#submitButton'),
  cancelEditButton: document.querySelector('#cancelEditButton'),
  periodLabel: document.querySelector('#periodLabel'),
  periodTotal: document.querySelector('#periodTotal'),
  expenseCount: document.querySelector('#expenseCount'),
  tableBody: document.querySelector('#expensesTableBody'),
  tableContainer: document.querySelector('#tableContainer'),
  emptyState: document.querySelector('#emptyState'),
  toast: document.querySelector('#toast'),
  errors: {
    date: document.querySelector('#dateError'),
    concept: document.querySelector('#conceptError'),
    type: document.querySelector('#typeError'),
    amount: document.querySelector('#amountError')
  }
};

/** @type {Expense[]} */
let expenses = loadExpenses();
/** @type {CardPeriod} */
let currentPeriod = getCardPeriod(new Date());
let toastTimer;

initialize();

function initialize() {
  populateExpenseTypes();
  configureCurrentPeriod();
  setDefaultDate();
  render();

  elements.form.addEventListener('submit', handleSubmit);
  elements.cancelEditButton.addEventListener('click', resetForm);
  elements.tableBody.addEventListener('click', handleTableAction);
}

function populateExpenseTypes() {
  Object.values(ExpenseType).forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = formatType(type);
    elements.type.append(option);
  });
}

function configureCurrentPeriod() {
  elements.periodLabel.textContent = `${formatLongDate(currentPeriod.startDate)} – ${formatLongDate(currentPeriod.endDate)}`;
  elements.date.min = currentPeriod.startDate;
  elements.date.max = currentPeriod.endDate;
}

function setDefaultDate() {
  const today = toISODate(new Date());
  elements.date.value = isDateInsidePeriod(today, currentPeriod) ? today : currentPeriod.startDate;
}

/**
 * Determines the active card period using a fixed cut-off day.
 * If the card cuts on day 13, the active period begins on day 14.
 * @param {Date} referenceDate
 * @returns {CardPeriod}
 */
function getCardPeriod(referenceDate) {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();

  let startDate;
  let endDate;

  if (day > CUT_OFF_DAY) {
    startDate = new Date(year, month, CUT_OFF_DAY + 1);
    endDate = new Date(year, month + 1, CUT_OFF_DAY);
  } else {
    startDate = new Date(year, month - 1, CUT_OFF_DAY + 1);
    endDate = new Date(year, month, CUT_OFF_DAY);
  }

  const start = toISODate(startDate);
  const end = toISODate(endDate);

  return {
    id: `${start}_${end}`,
    name: `${formatMonthYear(startDate)} - ${formatMonthYear(endDate)}`,
    startDate: start,
    endDate: end,
    isOpen: true
  };
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

  const existingId = elements.expenseId.value;

  if (existingId) {
    expenses = expenses.map((expense) =>
      expense.id === existingId
        ? {
            ...expense,
            ...draft,
            amount: roundMoney(draft.amount),
            periodId: currentPeriod.id
          }
        : expense
    );
    showToast('Gasto actualizado correctamente.');
  } else {
    expenses.push({
      id: createId(),
      ...draft,
      amount: roundMoney(draft.amount),
      periodId: currentPeriod.id
    });
    showToast('Gasto agregado correctamente.');
  }

  saveExpenses();
  resetForm();
  render();
}

function validateExpense(draft) {
  const errors = {};

  if (!draft.date) {
    errors.date = 'Selecciona una fecha.';
  } else if (!isDateInsidePeriod(draft.date, currentPeriod)) {
    errors.date = 'La fecha debe pertenecer al periodo activo.';
  }

  if (!draft.concept) {
    errors.concept = 'Escribe el concepto del gasto.';
  }

  if (!Object.values(ExpenseType).includes(draft.type)) {
    errors.type = 'Selecciona un tipo válido.';
  }

  if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
    errors.amount = 'Ingresa un costo mayor que cero.';
  }

  return errors;
}

function displayErrors(errors) {
  Object.entries(errors).forEach(([field, message]) => {
    elements.errors[field].textContent = message;
    const input = elements[field];
    input.setAttribute('aria-invalid', 'true');
  });
}

function clearErrors() {
  Object.entries(elements.errors).forEach(([field, errorElement]) => {
    errorElement.textContent = '';
    elements[field].removeAttribute('aria-invalid');
  });
}

function render() {
  const periodExpenses = getCurrentPeriodExpenses();
  renderSummary(periodExpenses);
  renderTable(periodExpenses);
}

function getCurrentPeriodExpenses() {
  return expenses
    .filter((expense) => expense.periodId === currentPeriod.id)
    .sort((first, second) => {
      const dateComparison = second.date.localeCompare(first.date);
      return dateComparison !== 0 ? dateComparison : second.concept.localeCompare(first.concept);
    });
}

function renderSummary(periodExpenses) {
  const total = periodExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  elements.periodTotal.textContent = formatCurrency(total);
  elements.expenseCount.textContent = `${periodExpenses.length} ${periodExpenses.length === 1 ? 'gasto' : 'gastos'}`;
}

function renderTable(periodExpenses) {
  elements.tableBody.replaceChildren();

  if (periodExpenses.length === 0) {
    elements.emptyState.classList.remove('hidden');
    elements.tableContainer.classList.add('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.tableContainer.classList.remove('hidden');

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
      </td>
    `;
    elements.tableBody.append(row);
  });
}

function handleTableAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;

  if (action === 'edit') {
    startEdit(id);
  }

  if (action === 'delete') {
    deleteExpense(id);
  }
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
  elements.concept.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteExpense(id) {
  const expense = expenses.find((item) => item.id === id);
  if (!expense) return;

  const confirmed = window.confirm(`¿Eliminar el gasto “${expense.concept}” por ${formatCurrency(expense.amount)}?`);
  if (!confirmed) return;

  expenses = expenses.filter((item) => item.id !== id);
  saveExpenses();

  if (elements.expenseId.value === id) {
    resetForm();
  }

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
  return (
    expense &&
    typeof expense.id === 'string' &&
    typeof expense.date === 'string' &&
    typeof expense.concept === 'string' &&
    Object.values(ExpenseType).includes(expense.type) &&
    Number.isFinite(expense.amount) &&
    typeof expense.periodId === 'string'
  );
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

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `expense-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2
  }).format(value);
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatLongDate(value) {
  return new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatMonthYear(date) {
  return new Intl.DateTimeFormat('es-MX', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function formatType(type) {
  return type.charAt(0) + type.slice(1).toLowerCase();
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add('visible');

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove('visible');
  }, 2600);
}
