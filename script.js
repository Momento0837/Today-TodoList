const STORAGE_KEY = "local-daily-todos";
const RESET_HOUR = 1;

const todoForm = document.querySelector("#todoForm");
const todoInput = document.querySelector("#todoInput");
const todoList = document.querySelector("#todoList");
const todoListWrap = document.querySelector(".todo-list-wrap");
const todoScrollbar = document.querySelector("#todoScrollbar");
const todoScrollThumb = document.querySelector("#todoScrollThumb");
const clearAllButton = document.querySelector("#clearAllButton");
const emptyText = document.querySelector("#emptyText");
const dateText = document.querySelector("#dateText");
const clockText = document.querySelector("#clockText");
const remainText = document.querySelector("#remainText");

let state = loadState();
let editingId = null;
let placeholderTimer = null;
let isDraggingScrollbar = false;
let scrollbarDragOffset = 0;

const placeholderExamples = [
  "\uc608) \uce74\ud398 \uac00\uc11c \uadf8\ub9bc \uadf8\ub9ac\uae30",
  "\uc608) \uc9d1 \uc55e \uacf5\uc6d0\uc5d0\uc11c \ub7ec\ub2dd\ud558\uae30",
  "\uc608) \uce5c\uad6c\ub124 \uc9d1 \uace0\uc591\uc774\uc640 \ub180\uc544\uc8fc\uae30"
];
const PRIORITY_OPTIONS = [
  { value: 0, label: "\uc21c\uc704" },
  { value: 1, label: "1\uc21c\uc704" },
  { value: 2, label: "2\uc21c\uc704" },
  { value: 3, label: "3\uc21c\uc704" }
];
const PLACEHOLDER_TYPE_DELAY = 105;
const PLACEHOLDER_DELETE_DELAY = 50;
const PLACEHOLDER_BLINK_DELAY = 320;
const PLACEHOLDER_BLINK_TOGGLES = 6;

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getDayKey(date = new Date()) {
  const boundary = new Date(date);
  if (boundary.getHours() < RESET_HOUR) {
    boundary.setDate(boundary.getDate() - 1);
  }

  return [
    boundary.getFullYear(),
    String(boundary.getMonth() + 1).padStart(2, "0"),
    String(boundary.getDate()).padStart(2, "0")
  ].join("-");
}

function loadState() {
  const dayKey = getDayKey();
  const fallback = { dayKey, lastInputAt: null, todos: [] };
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(saved);
    if (parsed.dayKey !== dayKey) {
      return fallback;
    }

    return {
      dayKey,
      lastInputAt: parsed.lastInputAt ?? null,
      todos: Array.isArray(parsed.todos) ? parsed.todos : []
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) {
      return Number(a.done) - Number(b.done);
    }

    const priorityA = a.priority || 99;
    const priorityB = b.priority || 99;

    if (priorityA !== priorityB) {
      return priorityA - priorityB;
    }

    return a.createdAt - b.createdAt;
  });
}

function getTodoPositions() {
  const positions = new Map();

  todoList.querySelectorAll(".todo-item").forEach((item) => {
    positions.set(item.dataset.id, item.getBoundingClientRect());
  });

  return positions;
}

function animateTodoMoves(previousPositions) {
  if (!previousPositions?.size) {
    return;
  }

  todoList.querySelectorAll(".todo-item").forEach((item) => {
    const previous = previousPositions.get(item.dataset.id);

    if (!previous) {
      return;
    }

    const current = item.getBoundingClientRect();
    const deltaY = previous.top - current.top;

    if (Math.abs(deltaY) < 1) {
      return;
    }

    item.animate(
      [
        { transform: `translateY(${deltaY}px)` },
        { transform: "translateY(0)" }
      ],
      {
        duration: 360,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)"
      }
    );
  });
}

function closePriorityDropdowns(exceptDropdown = null) {
  todoList.querySelectorAll(".priority-dropdown.is-open").forEach((dropdown) => {
    if (dropdown === exceptDropdown) {
      return;
    }

    dropdown.classList.remove("is-open");
    dropdown.closest(".todo-item")?.classList.remove("has-open-dropdown");
    dropdown.querySelector(".priority-select")?.setAttribute("aria-expanded", "false");
  });
}

function createPriorityDropdown(todo) {
  const priority = Number(todo.priority || 0);
  const selected = PRIORITY_OPTIONS.find((option) => option.value === priority) ?? PRIORITY_OPTIONS[0];
  const dropdown = document.createElement("div");
  dropdown.className = "priority-dropdown";
  dropdown.dataset.priority = String(priority);
  dropdown.dataset.id = todo.id;

  const trigger = document.createElement("button");
  trigger.className = "priority-select";
  trigger.type = "button";
  trigger.dataset.action = "priority-toggle";
  trigger.dataset.id = todo.id;
  trigger.dataset.priority = String(priority);
  trigger.title = "\uc6b0\uc120\uc21c\uc704 \uc120\ud0dd";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.textContent = selected.label;

  const menu = document.createElement("div");
  menu.className = "priority-menu";
  menu.role = "listbox";

  PRIORITY_OPTIONS.forEach((option) => {
    const optionButton = document.createElement("button");
    optionButton.className = "priority-option";
    optionButton.type = "button";
    optionButton.dataset.action = "priority-option";
    optionButton.dataset.id = todo.id;
    optionButton.dataset.priority = String(option.value);
    optionButton.role = "option";
    optionButton.setAttribute("aria-selected", String(option.value === priority));
    optionButton.textContent = option.label;
    menu.append(optionButton);
  });

  dropdown.append(trigger, menu);
  return dropdown;
}

function renderTodos() {
  const sorted = sortTodos(state.todos);
  todoList.innerHTML = "";

  sorted.forEach((todo) => {
    const item = document.createElement("li");
    item.className = `todo-item${todo.done ? " is-done" : ""}`;
    item.dataset.id = todo.id;

    const priorityDropdown = createPriorityDropdown(todo);

    const title = document.createElement(editingId === todo.id ? "input" : "span");
    title.className = editingId === todo.id ? "todo-edit-input" : "todo-title";

    if (editingId === todo.id) {
      title.type = "text";
      title.value = todo.title;
      title.maxLength = 80;
      title.dataset.action = "edit-input";
      setTimeout(() => {
        title.focus();
        title.select();
      }, 0);
    } else {
      title.textContent = todo.title;
    }

    const actions = document.createElement("div");
    actions.className = "todo-actions";

    const editButton = document.createElement("button");
    editButton.className = "edit-button";
    editButton.type = "button";
    editButton.dataset.action = "edit";
    editButton.dataset.id = todo.id;
    editButton.title = "\uc218\uc815";
    editButton.setAttribute("aria-label", "\uc218\uc815");

    const editIcon = document.createElement("img");
    editIcon.className = "button-image-icon";
    editIcon.src = "images/Icon_Edit.png";
    editIcon.alt = "";
    editIcon.setAttribute("aria-hidden", "true");
    editButton.append(editIcon);

    if (editingId === todo.id) {
      editButton.disabled = true;
      editButton.classList.add("is-placeholder");

      const saveButton = document.createElement("button");
      saveButton.className = "save-button";
      saveButton.type = "button";
      saveButton.dataset.action = "save-edit";
      saveButton.dataset.id = todo.id;
      saveButton.textContent = "Save";
      saveButton.title = "\uc800\uc7a5";

      const cancelButton = document.createElement("button");
      cancelButton.className = "cancel-button";
      cancelButton.type = "button";
      cancelButton.dataset.action = "cancel-edit";
      cancelButton.dataset.id = todo.id;
      cancelButton.textContent = "Cancel";
      cancelButton.title = "\ucde8\uc18c";

      actions.append(saveButton, cancelButton);
    } else {
      const doneButton = document.createElement("button");
      doneButton.className = "done-button";
      doneButton.type = "button";
      doneButton.dataset.action = "done";
      doneButton.dataset.id = todo.id;
      doneButton.textContent = todo.done ? "Back" : "OK";
      doneButton.title = todo.done ? "\uc644\ub8cc \ucde8\uc18c" : "\uc644\ub8cc";

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-button";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete";
      deleteButton.dataset.id = todo.id;
      deleteButton.textContent = "X";
      deleteButton.title = "\uc0ad\uc81c";

      actions.append(doneButton, deleteButton);
    }

    item.append(priorityDropdown, editButton, title, actions);
    todoList.append(item);
  });

  const hasTodos = state.todos.length > 0;
  emptyText.hidden = hasTodos;
  clearAllButton.hidden = !hasTodos;
  todoForm.classList.toggle("is-centered", !hasTodos);
  todoForm.classList.toggle("is-bottom", hasTodos);
  requestAnimationFrame(updateTodoScrollbar);
}

function addTodo(title) {
  state.todos.push({
    id: createId(),
    title,
    priority: 0,
    done: false,
    createdAt: Date.now()
  });
  state.lastInputAt = new Date().toISOString();
  state.dayKey = getDayKey();
  saveState();
  renderTodos();
}

function setPriority(id, priority) {
  const previousPositions = getTodoPositions();

  state.todos = state.todos.map((todo) => {
    if (todo.id !== id) {
      return todo;
    }

    return { ...todo, priority };
  });
  saveState();
  renderTodos();
  animateTodoMoves(previousPositions);
}

function startEditTodo(id) {
  editingId = id;
  renderTodos();
}

function saveEditTodo(id, title) {
  const trimmed = title.trim();
  if (!trimmed) {
    return;
  }

  state.todos = state.todos.map((item) => (
    item.id === id ? { ...item, title: trimmed, updatedAt: Date.now() } : item
  ));
  editingId = null;
  saveState();
  renderTodos();
}

function cancelEditTodo() {
  editingId = null;
  renderTodos();
}

function toggleDone(id) {
  const previousPositions = getTodoPositions();

  state.todos = state.todos.map((todo) => (
    todo.id === id ? { ...todo, done: !todo.done } : todo
  ));
  saveState();
  renderTodos();
  animateTodoMoves(previousPositions);
}

function deleteTodo(id) {
  state.todos = state.todos.filter((todo) => todo.id !== id);
  saveState();
  renderTodos();
}

function clearAllTodos() {
  if (!state.todos.length) {
    return;
  }

  state.todos = [];
  editingId = null;
  todoListWrap.scrollTop = 0;
  saveState();
  renderTodos();
}

function getNextResetTime(date = new Date()) {
  const reset = new Date(date);
  reset.setHours(RESET_HOUR, 0, 0, 0);

  if (date >= reset) {
    reset.setDate(reset.getDate() + 1);
  }

  return reset;
}

function updateTime() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const reset = getNextResetTime(now);
  const remainingMs = Math.max(0, reset - now);
  const remainingHours = Math.floor(remainingMs / 1000 / 60 / 60);
  const remainingMinutes = Math.floor((remainingMs / 1000 / 60) % 60);
  const remainingSeconds = Math.floor((remainingMs / 1000) % 60);
  const dateParts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ];

  dateText.textContent = `${dateParts.join(".")} ${getKoreanWeekday(now)}`;
  clockText.textContent = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  remainText.textContent = `\ub9ac\uc14b\uae4c\uc9c0 ${String(remainingHours).padStart(2, "0")}:${String(remainingMinutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;

  if (hours >= 7 && hours <= 17) {
    document.body.dataset.sky = "day";
  } else if (hours >= 18 && hours <= 20) {
    document.body.dataset.sky = "sunset";
  } else {
    document.body.dataset.sky = "night";
  }

  if (state.dayKey !== getDayKey(now)) {
    state = { dayKey: getDayKey(now), lastInputAt: null, todos: [] };
    saveState();
    renderTodos();
  }
}

function getKoreanWeekday(date) {
  return ["\uc77c", "\uc6d4", "\ud654", "\uc218", "\ubaa9", "\uae08", "\ud1a0"][date.getDay()];
}

function updateGlowPosition(event) {
  const centerOffsetX = (event.clientX / window.innerWidth - 0.5) * 4.5;
  const centerOffsetY = (event.clientY / window.innerHeight - 0.5) * 3.5;
  const x = centerOffsetX.toFixed(2);
  const y = centerOffsetY.toFixed(2);

  document.documentElement.style.setProperty("--glow-shift-x", `${x}%`);
  document.documentElement.style.setProperty("--glow-shift-y", `${y}%`);
}

function updateTodoScrollbar() {
  const scrollable = todoListWrap.scrollHeight - todoListWrap.clientHeight;
  const trackHeight = todoScrollbar.clientHeight;
  const shouldShow = scrollable > 1;

  todoScrollbar.classList.toggle("is-visible", shouldShow);

  if (!shouldShow || trackHeight <= 0) {
    return;
  }

  const visibleRatio = todoListWrap.clientHeight / todoListWrap.scrollHeight;
  const thumbHeight = Math.max(34, Math.floor(trackHeight * visibleRatio * 0.34));
  const maxThumbTop = trackHeight - thumbHeight;
  const thumbTop = maxThumbTop * (todoListWrap.scrollTop / scrollable);

  todoScrollThumb.style.height = `${thumbHeight}px`;
  todoScrollThumb.style.transform = `translateY(${thumbTop}px)`;
}

function scrollTodoListFromThumb(clientY) {
  const trackRect = todoScrollbar.getBoundingClientRect();
  const thumbHeight = todoScrollThumb.offsetHeight;
  const maxThumbTop = Math.max(1, trackRect.height - thumbHeight);
  const nextThumbTop = Math.min(
    maxThumbTop,
    Math.max(0, clientY - trackRect.top - scrollbarDragOffset)
  );
  const scrollable = todoListWrap.scrollHeight - todoListWrap.clientHeight;

  todoListWrap.scrollTop = scrollable * (nextThumbTop / maxThumbTop);
}

function setAnimatedPlaceholder(text) {
  todoInput.placeholder = text;
}

function schedulePlaceholder(callback, delay) {
  placeholderTimer = setTimeout(callback, delay);
}

function animatePlaceholder(exampleIndex = 0, charIndex = 0, mode = "type", blinkCount = 0, cursorVisible = true) {
  const example = placeholderExamples[exampleIndex % placeholderExamples.length];

  clearTimeout(placeholderTimer);

  if (mode === "type") {
    setAnimatedPlaceholder(`${example.slice(0, charIndex)}_`);

    if (charIndex < example.length) {
      schedulePlaceholder(() => animatePlaceholder(exampleIndex, charIndex + 1, "type"), PLACEHOLDER_TYPE_DELAY);
      return;
    }

    schedulePlaceholder(() => animatePlaceholder(exampleIndex, charIndex, "blink", 0, false), 740);
    return;
  }

  if (mode === "blink") {
    setAnimatedPlaceholder(`${example}${cursorVisible ? "_" : ""}`);

    if (blinkCount < PLACEHOLDER_BLINK_TOGGLES - 1) {
      schedulePlaceholder(() => animatePlaceholder(exampleIndex, charIndex, "blink", blinkCount + 1, !cursorVisible), PLACEHOLDER_BLINK_DELAY);
      return;
    }

    schedulePlaceholder(() => animatePlaceholder(exampleIndex, example.length, "delete"), 340);
    return;
  }

  setAnimatedPlaceholder(`${example.slice(0, charIndex)}_`);

  if (charIndex > 0) {
    schedulePlaceholder(() => animatePlaceholder(exampleIndex, charIndex - 1, "delete"), PLACEHOLDER_DELETE_DELAY);
    return;
  }

  schedulePlaceholder(() => animatePlaceholder(exampleIndex + 1, 0, "type"), 370);
}

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const title = todoInput.value.trim();

  if (!title) {
    return;
  }

  addTodo(title);
  todoInput.value = "";
  todoInput.focus();
});

todoList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) {
    return;
  }

  const { action, id } = button.dataset;

  if (action === "priority-toggle") {
    const dropdown = button.closest(".priority-dropdown");
    const shouldOpen = !dropdown?.classList.contains("is-open");
    closePriorityDropdowns(dropdown);
    dropdown?.classList.toggle("is-open", shouldOpen);
    dropdown?.closest(".todo-item")?.classList.toggle("has-open-dropdown", shouldOpen);
    button.setAttribute("aria-expanded", String(shouldOpen));
    return;
  }

  if (action === "priority-option") {
    closePriorityDropdowns();
    setPriority(id, Number(button.dataset.priority));
    return;
  }

  if (action === "done") {
    toggleDone(id);
  }

  if (action === "edit") {
    startEditTodo(id);
  }

  if (action === "save-edit") {
    const item = button.closest(".todo-item");
    const input = item?.querySelector(".todo-edit-input");
    saveEditTodo(id, input?.value ?? "");
  }

  if (action === "cancel-edit") {
    cancelEditTodo();
  }

  if (action === "delete") {
    deleteTodo(id);
  }
});

todoList.addEventListener("keydown", (event) => {
  const dropdown = event.target.closest(".priority-dropdown");

  if (dropdown && event.key === "Escape") {
    closePriorityDropdowns();
    dropdown.querySelector(".priority-select")?.focus();
    return;
  }

  if (dropdown && event.key === "ArrowDown") {
    event.preventDefault();
    dropdown.classList.add("is-open");
    dropdown.closest(".todo-item")?.classList.add("has-open-dropdown");
    dropdown.querySelector(".priority-select")?.setAttribute("aria-expanded", "true");
    dropdown.querySelector(".priority-option")?.focus();
    return;
  }

  if (event.target.matches(".priority-option") && event.key === "ArrowUp") {
    event.preventDefault();
    const options = [...dropdown.querySelectorAll(".priority-option")];
    const index = options.indexOf(event.target);
    options[Math.max(0, index - 1)]?.focus();
    return;
  }

  if (event.target.matches(".priority-option") && event.key === "ArrowDown") {
    event.preventDefault();
    const options = [...dropdown.querySelectorAll(".priority-option")];
    const index = options.indexOf(event.target);
    options[Math.min(options.length - 1, index + 1)]?.focus();
    return;
  }

  const input = event.target.closest(".todo-edit-input");

  if (!input) {
    return;
  }

  if (event.key === "Enter") {
    saveEditTodo(input.closest(".todo-item").dataset.id, input.value);
  }

  if (event.key === "Escape") {
    cancelEditTodo();
  }
});

window.addEventListener("pointermove", updateGlowPosition);
window.addEventListener("resize", updateTodoScrollbar);

document.addEventListener("click", (event) => {
  if (!event.target.closest(".priority-dropdown")) {
    closePriorityDropdowns();
  }
});

clearAllButton.addEventListener("click", clearAllTodos);

todoListWrap.addEventListener("scroll", updateTodoScrollbar);

todoScrollbar.addEventListener("pointerdown", (event) => {
  const thumbRect = todoScrollThumb.getBoundingClientRect();

  if (event.target === todoScrollThumb) {
    scrollbarDragOffset = event.clientY - thumbRect.top;
  } else {
    scrollbarDragOffset = todoScrollThumb.offsetHeight / 2;
  }

  isDraggingScrollbar = true;
  todoScrollThumb.setPointerCapture(event.pointerId);
  scrollTodoListFromThumb(event.clientY);
});

todoScrollThumb.addEventListener("pointermove", (event) => {
  if (!isDraggingScrollbar) {
    return;
  }

  scrollTodoListFromThumb(event.clientY);
});

todoScrollThumb.addEventListener("pointerup", (event) => {
  isDraggingScrollbar = false;
  todoScrollThumb.releasePointerCapture(event.pointerId);
});

renderTodos();
updateTime();
animatePlaceholder();
setInterval(updateTime, 1000);
