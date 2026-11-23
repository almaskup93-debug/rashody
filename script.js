'use strict';

const STORAGE_KEY = 'rashody.expenses.v1';
const BUDGET_STORAGE_PREFIX = 'rashody.budgets.v1.';
const CATEGORIES = ['Еда', 'Транспорт', 'Дом', 'Другое'];
const form = document.querySelector('#expense-form');
const amountInput = document.querySelector('#amount');
const dateInput = document.querySelector('#date');
const statusLine = document.querySelector('#status');
let expenses = [];
let storageReady = true;
let budgetMonth = '';

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}

function parseAmount(value) {
  const text = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)$/.test(text)) return null;
  const digits = text.replace(/[ \u00a0\u202f]/g, '');
  const amount = Number(digits);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function money(amount) {
  return `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₸`;
}

function readBudgetLimits(month) {
  try {
    const raw = localStorage.getItem(BUDGET_STORAGE_PREFIX + month);
    const limits = raw === null ? {} : JSON.parse(raw);
    if (!limits || typeof limits !== 'object' || Array.isArray(limits)) return null;
    let total = 0;
    for (const [category, limit] of Object.entries(limits)) {
      if (!CATEGORIES.includes(category) || !Number.isSafeInteger(limit) || limit <= 0) return null;
      total += limit;
      if (!Number.isSafeInteger(total)) return null;
    }
    return limits;
  } catch {
    return null;
  }
}

function renderBudgetLimits() {
  const month = localDate().slice(0, 7);
  if (budgetMonth === month) return;
  budgetMonth = month;
  const limits = readBudgetLimits(month);
  const budgetStatus = document.querySelector('#budget-status');
  budgetStatus.textContent = limits === null ? 'Не удалось прочитать лимиты. Сохранённые данные не изменены. Проверьте хранилище браузера и обновите страницу.' : '';
  document.querySelector('#budget-month').textContent = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' }).format(new Date());
  const container = document.querySelector('#budget-forms');
  container.replaceChildren();
  CATEGORIES.forEach((category, index) => {
    const budgetForm = document.createElement('form');
    budgetForm.className = 'budget-form';
    budgetForm.noValidate = true;
    const title = document.createElement('h3');
    title.id = `budget-category-${index}`;
    title.textContent = category;
    budgetForm.setAttribute('aria-labelledby', title.id);
    const label = document.createElement('label');
    label.textContent = 'Лимит, ₸';
    const input = document.createElement('input');
    input.type = 'text';
    input.name = 'limit';
    input.inputMode = 'numeric';
    input.required = true;
    input.placeholder = '15 000';
    input.value = limits && limits[category] ? money(limits[category]).replace(' ₸', '') : '';
    const saved = document.createElement('p');
    saved.id = `budget-saved-${index}`;
    saved.className = 'budget-saved muted';
    saved.setAttribute('aria-live', 'polite');
    saved.textContent = limits === null ? 'Лимит недоступен' : limits[category] ? `Лимит: ${money(limits[category])}` : 'Лимит не задан';
    const error = document.createElement('p');
    error.id = `budget-error-${index}`;
    error.className = 'budget-error error';
    error.setAttribute('role', 'status');
    input.setAttribute('aria-describedby', `${saved.id} ${error.id}`);
    label.append(input);
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Сохранить';
    budgetForm.append(title, label, button, saved, error);
    budgetForm.addEventListener('submit', event => {
      event.preventDefault();
      if (month !== localDate().slice(0, 7)) {
        renderBudgetLimits();
        budgetStatus.textContent = 'Начался новый месяц. Введите лимит заново.';
        return;
      }
      const limit = parseAmount(input.value);
      input.setAttribute('aria-invalid', String(limit === null));
      error.textContent = '';
      if (limit === null) {
        error.textContent = 'Введите положительный целый лимит, например 15 000.';
        input.focus();
        return;
      }
      const previous = readBudgetLimits(month);
      if (previous === null) {
        error.textContent = 'Не удалось прочитать лимиты. Данные не перезаписаны. Проверьте хранилище браузера.';
        return;
      }
      const total = CATEGORIES.reduce((sum, name) => sum + (name === category ? limit : previous[name] || 0), 0);
      if (!Number.isSafeInteger(total)) {
        error.textContent = 'Общая сумма лимитов слишком велика для точного расчёта.';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      try {
        localStorage.setItem(BUDGET_STORAGE_PREFIX + month, JSON.stringify({ ...previous, [category]: limit }));
      } catch {
        error.textContent = 'Не удалось сохранить лимит. Проверьте свободное место и доступ к хранилищу браузера.';
        return;
      }
      input.value = money(limit).replace(' ₸', '');
      saved.textContent = `Лимит: ${money(limit)}`;
      budgetStatus.textContent = '';
    });
    container.append(budgetForm);
  });
}

function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw === null ? [] : JSON.parse(raw);
    const ids = new Set();
    let sum = 0;
    if (!Array.isArray(saved) || !saved.every(item => {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id) ||
          !Number.isSafeInteger(item.amount) || item.amount <= 0 || !CATEGORIES.includes(item.category) ||
          !validDate(item.date) || typeof item.comment !== 'string') return false;
      ids.add(item.id);
      sum += item.amount;
      return Number.isSafeInteger(sum);
    })) throw new Error('Некорректные данные');
    expenses = saved;
  } catch {
    storageReady = false;
    statusLine.textContent = 'Не удалось прочитать сохранённые траты. Данные не перезаписаны. Проверьте доступ к хранилищу браузера.';
  }
}

function saveExpenses(next) {
  if (!storageReady) {
    statusLine.textContent = 'Сохранение недоступно: сначала проверьте хранилище браузера и обновите страницу.';
    return false;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    expenses = next;
    return true;
  } catch {
    statusLine.textContent = 'Не удалось сохранить изменения. Проверьте свободное место и доступ к хранилищу браузера.';
    return false;
  }
}

function render() {
  renderBudgetLimits();
  const month = localDate().slice(0, 7);
  const current = expenses.filter(item => item.date.slice(0, 7) === month);
  document.querySelector('#month-label').textContent = new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' }).format(new Date());
  document.querySelector('#total').textContent = money(current.reduce((sum, item) => sum + item.amount, 0));
  const categoryTotals = document.querySelector('#category-totals');
  categoryTotals.replaceChildren();
  for (const category of CATEGORIES) {
    const group = document.createElement('div');
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = category;
    value.textContent = money(current.filter(item => item.category === category).reduce((sum, item) => sum + item.amount, 0));
    group.append(label, value);
    categoryTotals.append(group);
  }
  const list = document.querySelector('#expenses');
  list.replaceChildren();
  document.querySelector('#empty').hidden = expenses.length > 0;
  for (const item of expenses) {
    const row = document.createElement('li');
    row.className = 'expense';
    const info = document.createElement('div');
    info.className = 'expense-info';
    const amount = document.createElement('strong');
    amount.textContent = money(item.amount);
    const details = document.createElement('p');
    details.className = 'muted';
    details.textContent = `${item.category} · ${item.date.split('-').reverse().join('.')}`;
    info.append(amount, details);
    if (item.comment) {
      const comment = document.createElement('p');
      comment.textContent = item.comment;
      info.append(comment);
    }
    row.append(info);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete';
    remove.textContent = 'Удалить';
    remove.setAttribute('aria-label', `Удалить трату ${money(item.amount)}, ${item.category}, ${item.date.split('-').reverse().join('.')}`);
    remove.addEventListener('click', () => {
      if (saveExpenses(expenses.filter(expense => expense.id !== item.id))) {
        statusLine.textContent = 'Трата удалена.';
        render();
        amountInput.focus();
      }
    });
    row.append(remove);
    list.append(row);
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const amount = parseAmount(amountInput.value);
  const category = document.querySelector('#category').value;
  const date = dateInput.value;
  document.querySelector('#amount-error').textContent = amount === null ? 'Введите положительную целую сумму, например 5 000.' : '';
  document.querySelector('#date-error').textContent = validDate(date) ? '' : 'Укажите корректную дату.';
  amountInput.setAttribute('aria-invalid', String(amount === null));
  dateInput.setAttribute('aria-invalid', String(!validDate(date)));
  if (amount === null) { amountInput.focus(); return; }
  if (!validDate(date)) { dateInput.focus(); return; }
  if (!CATEGORIES.includes(category)) return;
  if (!Number.isSafeInteger(expenses.reduce((sum, item) => sum + item.amount, 0) + amount)) {
    document.querySelector('#amount-error').textContent = 'Сумма слишком велика для точного расчёта.';
    amountInput.setAttribute('aria-invalid', 'true');
    amountInput.focus();
    return;
  }
  const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, amount, category, date, comment: document.querySelector('#comment').value.trim() };
  if (saveExpenses([item, ...expenses])) {
    form.reset();
    dateInput.value = localDate();
    statusLine.textContent = 'Трата добавлена.';
    render();
    amountInput.focus();
  }
});

dateInput.value = localDate();
loadExpenses();
render();
window.addEventListener('focus', render);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
