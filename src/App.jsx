import React, { useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'personal-todolist-state-v1';
const INBOX_ID = 'inbox';
const NO_CATEGORY_ID = '';
const PUBLIC_APP_URL = 'https://wellbin-li.github.io/todo-list/';
const IMPORT_HASH_PREFIX = '#todo-import=';

const priorities = [
  { value: 'low', label: '低', rank: 1 },
  { value: 'medium', label: '中', rank: 2 },
  { value: 'high', label: '高', rank: 3 },
];

const priorityMeta = Object.fromEntries(priorities.map((priority) => [priority.value, priority]));
const priorityFilterOptions = [...priorities].sort((a, b) => b.rank - a.rank);

const categoryOptions = (categories) => [
  ...categories.map((category) => ({ value: category.id, label: category.name })),
  { value: NO_CATEGORY_ID, label: '无分类' },
];

const defaultCategory = {
  id: INBOX_ID,
  name: '收件箱',
  createdAt: new Date().toISOString(),
};

const createId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const formatLocalDate = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const todayString = () => formatLocalDate();

const createEmptyTodo = (categoryId = INBOX_ID) => ({
  id: createId(),
  title: '',
  description: '',
  categoryId,
  priority: 'low',
  dueDate: todayString(),
  completed: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {
        categories: [defaultCategory],
        todos: [],
      };
    }

    const parsed = JSON.parse(raw);
    const categories = Array.isArray(parsed.categories) ? parsed.categories : [defaultCategory];

    return {
      categories,
      todos: Array.isArray(parsed.todos)
        ? parsed.todos.map((todo) => ({
            ...todo,
            priority: priorityMeta[todo.priority] ? todo.priority : 'low',
          }))
        : [],
    };
  } catch {
    return {
      categories: [defaultCategory],
      todos: [],
    };
  }
}

function compareDueDate(a, b) {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return a.dueDate.localeCompare(b.dueDate);
}

function sortTodos(todos, categories) {
  const categoryNames = Object.fromEntries(categories.map((category) => [category.id, category.name]));

  return [...todos].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }

    const dueDiff = compareDueDate(a, b);
    if (dueDiff !== 0) return dueDiff;

    const priorityDiff = priorityMeta[b.priority].rank - priorityMeta[a.priority].rank;
    if (priorityDiff !== 0) return priorityDiff;

    const categoryDiff = (categoryNames[a.categoryId] ?? '无分类').localeCompare(
      categoryNames[b.categoryId] ?? '无分类',
      'zh-CN',
    );
    if (categoryDiff !== 0) return categoryDiff;

    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function isOverdue(todo) {
  return Boolean(todo.dueDate && !todo.completed && todo.dueDate < todayString());
}

function categoryColorClass(categories, categoryId) {
  const index = categories.findIndex((category) => category.id === categoryId);
  return index >= 0 ? `tag-color-${index % 6}` : 'tag-color-empty';
}

function App() {
  const initialState = useMemo(loadInitialState, []);
  const [categories, setCategories] = useState(initialState.categories);
  const [todos, setTodos] = useState(initialState.todos);
  const [draftTodo, setDraftTodo] = useState(() =>
    createEmptyTodo(initialState.categories[0]?.id ?? NO_CATEGORY_ID),
  );
  const [categoryDraft, setCategoryDraft] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const isImportingRef = useRef(window.location.hash.startsWith(IMPORT_HASH_PREFIX));

  useEffect(() => {
    const rawImport = window.location.hash.startsWith(IMPORT_HASH_PREFIX)
      ? decodeURIComponent(window.location.hash.slice(IMPORT_HASH_PREFIX.length))
      : null;

    if (rawImport) {
      try {
        JSON.parse(rawImport);
        localStorage.setItem(STORAGE_KEY, rawImport);
        window.history.replaceState(null, '', window.location.pathname);
        window.location.reload();
      } catch {
        window.history.replaceState(null, '', window.location.pathname);
      }

      return;
    }

    const shouldMigrateToPublic = new URLSearchParams(window.location.search).get('migrateToPublic') === '1';
    const isLocalDev = window.location.origin === 'http://127.0.0.1:5173';
    const savedState = localStorage.getItem(STORAGE_KEY);

    if (shouldMigrateToPublic && isLocalDev && savedState) {
      window.location.href = `${PUBLIC_APP_URL}${IMPORT_HASH_PREFIX}${encodeURIComponent(savedState)}`;
    }
  }, []);

  useEffect(() => {
    if (isImportingRef.current) return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ categories, todos }));
  }, [categories, todos]);

  const totalActive = todos.filter((todo) => !todo.completed).length;
  const totalCompleted = todos.filter((todo) => todo.completed).length;
  const totalAll = todos.length;
  const filteredTodos = useMemo(
    () =>
      todos.filter((todo) => {
        const categoryMatches = categoryFilter === 'all' || todo.categoryId === categoryFilter;
        const priorityMatches = priorityFilter === 'all' || todo.priority === priorityFilter;
        return categoryMatches && priorityMatches;
      }),
    [todos, categoryFilter, priorityFilter],
  );
  const sortedTodos = useMemo(() => sortTodos(filteredTodos, categories), [filteredTodos, categories]);
  const activeTodos =
    statusFilter === 'completed' ? [] : sortedTodos.filter((todo) => !todo.completed);
  const completedTodos =
    statusFilter === 'active' ? [] : sortedTodos.filter((todo) => todo.completed);

  function addTodo(event) {
    event.preventDefault();
    const title = draftTodo.title.trim();

    if (!title) return;

    setTodos((current) => [
      {
        ...draftTodo,
        id: createId(),
        categoryId: draftTodo.categoryId,
        title,
        description: draftTodo.description.trim(),
        dueDate: draftTodo.dueDate || todayString(),
        updatedAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setDraftTodo(createEmptyTodo(draftTodo.categoryId));
  }

  function updateTodo(todoId, patch) {
    setTodos((current) =>
      current.map((todo) =>
        todo.id === todoId
          ? {
              ...todo,
              ...patch,
              updatedAt: new Date().toISOString(),
            }
          : todo,
      ),
    );
  }

  function deleteTodo(todoId) {
    setTodos((current) => current.filter((todo) => todo.id !== todoId));
  }

  function addCategory(event) {
    event.preventDefault();
    const name = categoryDraft.trim();

    if (!name) return;

    const category = {
      id: createId(),
      name,
      createdAt: new Date().toISOString(),
    };

    setCategories((current) => [...current, category]);
    setDraftTodo(createEmptyTodo(category.id));
    setCategoryDraft('');
  }

  function beginRenameCategory(category) {
    setEditingCategoryId(category.id);
    setEditingCategoryName(category.name);
  }

  function saveCategoryName(event) {
    event.preventDefault();
    const nextName = editingCategoryName.trim();

    if (!nextName) return;

    setCategories((current) =>
      current.map((category) =>
        category.id === editingCategoryId ? { ...category, name: nextName } : category,
      ),
    );
    setEditingCategoryId(null);
    setEditingCategoryName('');
  }

  function deleteCategory(categoryId) {
    const remainingCategories = categories.filter((category) => category.id !== categoryId);
    const fallbackCategoryId = remainingCategories[0]?.id ?? NO_CATEGORY_ID;

    setTodos((current) =>
      current.map((todo) =>
        todo.categoryId === categoryId ? { ...todo, categoryId: fallbackCategoryId } : todo,
      ),
    );
    setCategories(remainingCategories);
    setDraftTodo((current) =>
      current.categoryId === categoryId ? { ...current, categoryId: fallbackCategoryId } : current,
    );
    setCategoryFilter((current) => (current === categoryId ? 'all' : current));
  }

  return (
    <main className="board-shell app-layout">
      <aside className="left-rail">
        <section className="tag-manager" aria-label="分类标签管理">
          <h2>分类标签</h2>
          <form className="tag-add-form" onSubmit={addCategory}>
            <input
              aria-label="新分类名称"
              placeholder="添加分类标签"
              value={categoryDraft}
              onChange={(event) => setCategoryDraft(event.target.value)}
            />
            <button type="submit">添加</button>
          </form>

          <div className="category-tags">
            {categories.length === 0 ? <p className="empty-tags">暂无分类</p> : null}
            {categories.map((category, index) => (
              <div className={`category-chip tag-color-${index % 6}`} key={category.id}>
                {editingCategoryId === category.id ? (
                  <form className="chip-edit-form" onSubmit={saveCategoryName}>
                    <input
                      aria-label="分类名称"
                      autoFocus
                      value={editingCategoryName}
                      onBlur={saveCategoryName}
                      onChange={(event) => setEditingCategoryName(event.target.value)}
                    />
                  </form>
                ) : (
                  <button onClick={() => beginRenameCategory(category)} type="button">
                    {category.name}
                  </button>
                )}
                <button
                  aria-label={`删除${category.name}`}
                  className="chip-delete"
                  onClick={() => deleteCategory(category.id)}
                  type="button"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <section className="main-column">
        <div className="title-block">
          <h1 className="app-title">
            <span className="title-main">TodoList-个人任务工作台</span>
            <span className="title-date">当前日期：{todayString()}</span>
          </h1>
          <div className="overview">
            <button
              className={statusFilter === 'all' ? 'active' : ''}
              onClick={() => setStatusFilter('all')}
              type="button"
            >
              {totalAll} 全部
            </button>
            <button
              className={statusFilter === 'active' ? 'active' : ''}
              onClick={() => setStatusFilter('active')}
              type="button"
            >
              {totalActive} 待完成
            </button>
            <button
              className={statusFilter === 'completed' ? 'active' : ''}
              onClick={() => setStatusFilter('completed')}
              type="button"
            >
              {totalCompleted} 已完成
            </button>
          </div>
        </div>

        <form className="quick-add-form" onSubmit={addTodo}>
            <input
              aria-label="任务标题"
              placeholder="添加待办"
              value={draftTodo.title}
              onChange={(event) => setDraftTodo((current) => ({ ...current, title: event.target.value }))}
            />
            <input
              aria-label="任务备注"
              className="quick-note"
              placeholder="备注"
              value={draftTodo.description}
              onChange={(event) => setDraftTodo((current) => ({ ...current, description: event.target.value }))}
            />
            <CustomSelect
              ariaLabel="任务分类"
              className={categoryColorClass(categories, draftTodo.categoryId)}
              options={categoryOptions(categories)}
              value={draftTodo.categoryId}
              onChange={(nextValue) => setDraftTodo((current) => ({ ...current, categoryId: nextValue }))}
            />
            <CustomSelect
              ariaLabel="优先级"
              className={`priority priority-${draftTodo.priority}`}
              options={priorities}
              value={draftTodo.priority}
              onChange={(nextValue) => setDraftTodo((current) => ({ ...current, priority: nextValue }))}
            />
            <DateField
              label="到期日期"
              value={draftTodo.dueDate || todayString()}
              onChange={(nextDate) => setDraftTodo((current) => ({ ...current, dueDate: nextDate }))}
            />
            <button type="submit">新增</button>
          </form>

        <section className="task-board" aria-label="待办列表">
          {statusFilter !== 'completed' ? (
            <TaskGroup
              categories={categories}
              emptyText="还没有待办"
              label="进行中"
              todos={activeTodos}
              updateTodo={updateTodo}
              deleteTodo={deleteTodo}
            />
          ) : null}
          {statusFilter !== 'active' ? (
            <TaskGroup
              categories={categories}
              emptyText="暂无完成项"
              label="已完成"
              muted
              todos={completedTodos}
              updateTodo={updateTodo}
              deleteTodo={deleteTodo}
            />
          ) : null}
        </section>
      </section>

      <aside className="right-rail">
        <section className="filters-panel" aria-label="排序和筛选">
          <label>
            类别
            <CustomSelect
              ariaLabel="按类别筛选"
              className={`category-filter-select ${
                categoryFilter === 'all' ? 'filter-neutral' : categoryColorClass(categories, categoryFilter)
              }`}
              options={[{ value: 'all', label: '全部类别' }, ...categoryOptions(categories)]}
              value={categoryFilter}
              onChange={setCategoryFilter}
            />
          </label>

          <label>
            优先级
            <CustomSelect
              ariaLabel="按优先级筛选"
              className={`priority-filter-select ${
                priorityFilter === 'all' ? 'filter-neutral' : `priority-${priorityFilter}`
              }`}
              options={[{ value: 'all', label: '全部优先级' }, ...priorityFilterOptions]}
              value={priorityFilter}
              onChange={setPriorityFilter}
            />
          </label>
        </section>
      </aside>
    </main>
  );
}

function TaskGroup({ label, todos, categories, emptyText, muted = false, updateTodo, deleteTodo }) {
  return (
    <section className={`task-group ${muted ? 'muted' : ''}`}>
      <div className="group-label">
        <span>{label}</span>
        <strong>{todos.length}</strong>
      </div>

      <div className="compact-list">
        {todos.length === 0 ? (
          <p className="empty-line">{emptyText}</p>
        ) : (
          todos.map((todo) => (
            <article
              className={`compact-task priority-row-${todo.priority} ${todo.completed ? 'completed' : ''}`}
              key={todo.id}
            >
              <input
                aria-label="完成任务"
                checked={todo.completed}
                onChange={(event) => updateTodo(todo.id, { completed: event.target.checked })}
                onClick={(event) => event.stopPropagation()}
                type="checkbox"
              />
              <CustomSelect
                ariaLabel="编辑任务分类"
                className={`task-category-select ${categoryColorClass(categories, todo.categoryId)}`}
                options={categoryOptions(categories)}
                value={todo.categoryId}
                onChange={(nextValue) => updateTodo(todo.id, { categoryId: nextValue })}
              />
              <div className="task-copy">
                <input
                  aria-label="编辑任务标题"
                  className="task-title"
                  value={todo.title}
                  onChange={(event) => updateTodo(todo.id, { title: event.target.value })}
                  onClick={(event) => event.stopPropagation()}
                />
                <input
                  aria-label="编辑任务备注"
                  className="task-note"
                  placeholder="备注"
                  value={todo.description}
                  onChange={(event) => updateTodo(todo.id, { description: event.target.value })}
                  onClick={(event) => event.stopPropagation()}
                />
              </div>
              <CustomSelect
                ariaLabel="编辑优先级"
                className={`priority priority-${todo.priority}`}
                options={priorities}
                value={todo.priority}
                onChange={(nextValue) => updateTodo(todo.id, { priority: nextValue })}
              />
              <DateField
                label="编辑到期日"
                overdue={isOverdue(todo)}
                value={todo.dueDate}
                onChange={(nextDate) => updateTodo(todo.id, { dueDate: nextDate })}
              />
              {isOverdue(todo) ? <span className="overdue-label">过期</span> : <span className="overdue-spacer" />}
              <button
                aria-label="删除任务"
                className="ghost-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteTodo(todo.id);
                }}
                type="button"
              >
                ×
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function DateField({ label, value, onChange, overdue = false }) {
  const inputId = useMemo(() => createId(), []);
  const inputRef = useRef(null);

  function openPicker(event) {
    event.preventDefault();
    event.stopPropagation();

    if (inputRef.current?.showPicker) {
      inputRef.current.showPicker();
      return;
    }

    inputRef.current?.focus();
  }

  return (
    <button className={`date-field ${overdue ? 'overdue' : ''}`} onClick={openPicker} type="button">
      <span>{value || '选择日期'}</span>
      <input
        aria-hidden="true"
        aria-label={label}
        id={inputId}
        ref={inputRef}
        tabIndex={-1}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </button>
  );
}

function CustomSelect({ ariaLabel, className = '', options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return undefined;

    function closeOnOutside(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    window.addEventListener('pointerdown', closeOnOutside);
    return () => window.removeEventListener('pointerdown', closeOnOutside);
  }, [open]);

  return (
    <div className={`custom-select ${className} ${open ? 'open' : ''}`} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={ariaLabel}
        className="custom-select-trigger"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        type="button"
      >
        <span>{selected?.label}</span>
      </button>
      <div className="custom-select-menu" role="listbox">
        {options.map((option) => (
          <button
            aria-selected={option.value === value}
            className={option.value === value ? 'selected' : ''}
            key={option.value}
            onClick={(event) => {
              event.stopPropagation();
              onChange(option.value);
              setOpen(false);
            }}
            role="option"
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default App;
