/**
 * The sole purpose of the file is avoiding circular dependencies.
 * See https://github.com/graphql/graphql-relay-js/issues/113
 */

const types = {
  Todo: null,
  User: null,
};

function register(type, value) {
  types[type] = value;
}

function detectType(obj) {
  return obj.todos ? types.User : types.Todo;
}

module.exports = {
  register,
  detectType,
};
