/* eslint-disable no-underscore-dangle */
const v4 = require("uuid/v4");

// DBs
const DB = {
  users: {},
  todos: {},
};

// Lookups
const Lookups = {
  userNameToId: {},
};

const newUser = ({ id, name }) => ({
  id,
  name,
  todos: [],
});

const newTodo = ({ id, text }) => ({
  id,
  text,
  complete: false,
});

// Users
// -----
function getUser(id) {
  return DB.users[id];
}

function getUserByName(name) {
  return DB.users[Lookups.userNameToId[name]];
}

function createUser(name) {
  const id = v4();
  const user = newUser({ id, name });

  Lookups.userNameToId[name] = id;
  DB.users[id] = user;
  return user;
}

// Todos
// -----
function checkTodoOwner(userId, id) {
  if (!DB.users[userId].todos.includes(id)) {
    throw new Error(`Todo with ID '${id}' does not belong to user with ID '${userId}'`);
  }
}

function getTodo(id) {
  return DB.todos[id];
}

function createTodo(userId, text) {
  const id = v4();
  const todo = newTodo({ id, text });

  DB.todos[id] = todo;
  DB.users[userId].todos.push(id);
  return todo;
}

function updateTodo(userId, todo) {
  checkTodoOwner(userId, todo.id);

  DB.todos[todo.id] = todo;
  DB.users[userId].todos[todo.id] = todo;
  return todo;
}

function deleteTodo(userId, id) {
  checkTodoOwner(userId, id);

  delete DB.todos[id];
  DB.users[userId].todos = DB.users[userId].todos.filter(oid => oid !== id);
  return id;
}

function markTodosComplete(userId, complete) {
  const updatedTodoIds = DB.users[userId].todos.filter(id => DB.todos[id].complete !== complete);

  // Mutation!!
  DB.users[userId].todos.forEach(id => {
    DB.todos[id].complete = complete;
  });

  return updatedTodoIds;
}

function clearCompleteTodos(userId) {
  const leftoverTodos = DB.users[userId].todos.filter(id => !DB.todos[id].complete);
  const removedTodoIds = DB.users[userId].todos.filter(id => DB.todos[id].complete);
  DB.users[userId].todos = leftoverTodos;

  // Mutation!!
  removedTodoIds.forEach(id => {
    delete DB.todos[id];
  });

  return removedTodoIds;
}

module.exports = {
  getUser,
  getUserByName,
  createUser,
  getTodo,
  createTodo,
  updateTodo,
  deleteTodo,
  markTodosComplete,
  clearCompleteTodos,
};
