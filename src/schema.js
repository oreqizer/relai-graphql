const {
  GraphQLID,
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
} = require("graphql");
const relay = require("graphql-relay");

const db = require("./database");
const typeStore = require("./typeStore");

/**
 * See 'schema.graphql' for shorthand notation
 */

/**
 * We get the node interface and field from the relay library.
 *
 * The first method is the way we resolve an ID to its object. The second is the
 * way we resolve an object that implements node to its type.
 */
const { nodeInterface, nodeField } = relay.nodeDefinitions(globalId => {
  const { type, id } = relay.fromGlobalId(globalId);
  if (type === "User") {
    return db.getUser(id);
  }
  if (type === "Todo") {
    return db.getTodo(id);
  }
  return null;
}, typeStore.detectType);

/**
 * We define our basic todo type.
 *
 * This implements the following type system shorthand:
 *   type Todo {
 *     id: ID!
 *     text: String!
 *     complete: Boolean!
 *   }
 */
const todoType = new GraphQLObjectType({
  name: "Todo",
  description: "A todo item.",
  interfaces: [nodeInterface], // can be () => [nodeInterface]
  fields: () => ({
    id: relay.globalIdField(),
    text: {
      type: new GraphQLNonNull(GraphQLString),
      description: "The text of the todo.",
    },
    complete: {
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  }),
});

typeStore.register("Todo", todoType);

const showType = new GraphQLEnumType({
  name: "ShowType",
  values: {
    all: {},
    active: {},
    complete: {},
  },
});

/**
 * We define a connection between a user and his todos.
 *
 * connectionType implements the following type system shorthand:
 *   type TodoConnection {
 *     edges: [TodoEdge]
 *     pageInfo: PageInfo!
 *   }
 *
 * connectionType has an edges field - a list of edgeTypes that implement the
 * following type system shorthand:
 *   type TodoEdge {
 *     cursor: String!
 *     node: Todo
 *   }
 */
const { connectionType: todoConnection, edgeType: todoEdge } = relay.connectionDefinitions({
  nodeType: todoType,
});

/**
 * We define the user type.
 *
 * This implements the following type system shorthand:
 *   type User {
 *     id: ID!
 *     name: String!
 *     todos: TodoConnection
 *   }
 */
const userType = new GraphQLObjectType({
  name: "User",
  description: "A user.",
  interfaces: [nodeInterface], // can be () => [nodeInterface]
  fields: () => ({
    id: relay.globalIdField(),
    name: {
      type: new GraphQLNonNull(GraphQLString),
      description: "The name of the user.",
    },
    todos: {
      type: todoConnection,
      description: "User's todos.",
      args: Object.assign({}, relay.connectionArgs, {
        show: {
          type: showType,
          defaultValue: "all",
        },
      }),
      resolve: (user, args) => {
        const todos = user.todos.map(db.getTodo);
        switch (args.show) {
          case "all":
            return relay.connectionFromArray(todos, args);
          case "active":
            return relay.connectionFromArray(todos.filter(todo => !todo.complete), args);
          case "complete":
            return relay.connectionFromArray(todos.filter(todo => todo.complete), args);
          default:
            return null;
        }
      },
    },
    countTodos: {
      type: new GraphQLNonNull(GraphQLInt),
      description: "Number of user's todos.",
      resolve: user => user.todos.map(db.getTodo).length,
    },
    countTodosComplete: {
      type: new GraphQLNonNull(GraphQLInt),
      description: "Number of user's completed todos.",
      resolve: user => user.todos.map(db.getTodo).filter(todo => todo.complete).length,
    },
  }),
});

typeStore.register("User", userType);

/**
 * This is the type that will be the root of our query, and the
 * entry point into our schema.
 *
 * This implements the following type system shorthand:
 *   type Query {
 *     user: User
 *     node(id: String!): Node
 *   }
 */
const queryType = new GraphQLObjectType({
  name: "Query",
  fields: () => ({
    user: {
      type: userType,
      args: {
        name: {
          type: new GraphQLNonNull(GraphQLString),
        },
      },
      resolve: (_, args) => {
        const maybeUser = db.getUserByName(args.name);
        if (maybeUser) {
          return maybeUser;
        }

        const user = db.createUser(args.name);
        return user;
      },
    },
    node: nodeField,
  }),
});

/**
 * This will return a GraphQLFieldConfig for our create todo
 * mutation.
 *
 * It creates these two types implicitly:
 *   input CreateTodoInput {
 *     userId: ID!
 *     text: String!
 *     clientMutationId: String
 *   }
 *
 *   type CreateTodoPayload {
 *     todoEdge: TodoEdge
 *     clientMutationId: String
 *   }
 */
const createTodoMutation = relay.mutationWithClientMutationId({
  name: "CreateTodo",
  inputFields: {
    userId: {
      type: new GraphQLNonNull(GraphQLID),
    },
    text: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  outputFields: {
    todoEdge: {
      type: todoEdge,
      resolve: payload => {
        const todo = db.getTodo(payload.todoId);
        return {
          cursor: todo.id,
          node: todo,
        };
      },
    },
    user: {
      type: new GraphQLNonNull(userType),
      resolve: payload => db.getUser(payload.localUserId),
    },
  },
  mutateAndGetPayload: ({ userId, text }) => {
    const localUserId = relay.fromGlobalId(userId).id;
    const todo = db.createTodo(localUserId, text);
    return {
      localUserId,
      todoId: todo.id,
    };
  },
});

/**
 * This will return a GraphQLFieldConfig for our update todo
 * mutation.
 *
 * It creates these two types implicitly:
 *   input UpdateTodoInput {
 *     userId: ID!
 *     id: ID!
 *     text: String!
 *     complete: Boolean!
 *     clientMutationId: String
 *   }
 *
 *   type UpdateTodoPayload {
 *     todoEdge: TodoEdge
 *     clientMutationId: String
 *   }
 */
const updateTodoMutation = relay.mutationWithClientMutationId({
  name: "UpdateTodo",
  inputFields: {
    userId: {
      type: new GraphQLNonNull(GraphQLID),
    },
    id: {
      type: new GraphQLNonNull(GraphQLID),
    },
    text: {
      type: new GraphQLNonNull(GraphQLString),
    },
    complete: {
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
  outputFields: {
    todoEdge: {
      type: todoEdge,
      resolve: payload => {
        const todo = db.getTodo(payload.todoId);
        return {
          cursor: todo.id,
          node: todo,
        };
      },
    },
    user: {
      type: new GraphQLNonNull(userType),
      resolve: payload => db.getUser(payload.localUserId),
    },
  },
  mutateAndGetPayload: ({ userId, id, text, complete }) => {
    const localTodoId = relay.fromGlobalId(id).id;
    const localUserId = relay.fromGlobalId(userId).id;
    const updatedTodo = db.updateTodo(localUserId, { id: localTodoId, text, complete });
    return {
      localUserId,
      todoId: updatedTodo.id,
    };
  },
});

/**
 * This will return a GraphQLFieldConfig for our delete todo
 * mutation.
 *
 * It creates these two types implicitly:
 *   input DeleteTodoInput {
 *     userId: ID!
 *     todoId: ID!
 *   }
 *
 *   type DeleteTodoPayload {
 *     deletedId: ID!
 *     clientMutationId: String
 *   }
 */
const deleteTodoMutation = relay.mutationWithClientMutationId({
  name: "DeleteTodo",
  inputFields: {
    userId: {
      type: new GraphQLNonNull(GraphQLID),
    },
    todoId: {
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  outputFields: {
    deletedId: {
      type: new GraphQLNonNull(GraphQLID),
      resolve: payload => relay.toGlobalId("Todo", payload.deletedId),
    },
    user: {
      type: new GraphQLNonNull(userType),
      resolve: payload => db.getUser(payload.localUserId),
    },
  },
  mutateAndGetPayload: ({ userId, todoId }) => {
    const localTodoId = relay.fromGlobalId(todoId).id;
    const localUserId = relay.fromGlobalId(userId).id;
    const deletedId = db.deleteTodo(localUserId, localTodoId);
    return { localUserId, deletedId };
  },
});

/**
 * This will return a GraphQLFieldConfig for our mark todos complete
 * mutation.
 *
 * It creates these two types implicitly:
 *   input MarkTodosCompleteInput {
 *     userId: ID!
 *     complete: Boolean!
 *   }
 *
 *   type MarkTodosCompletePayload {
 *     updatedTodos: [Todo!]
 *     clientMutationId: String
 *   }
 */
const markTodosCompleteMutation = relay.mutationWithClientMutationId({
  name: "MarkTodosComplete",
  inputFields: {
    userId: {
      type: new GraphQLNonNull(GraphQLID),
    },
    complete: {
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
  outputFields: {
    updatedTodos: {
      type: new GraphQLNonNull(new GraphQLList(todoType)),
      resolve: payload => payload.updatedLocalIds.map(db.getTodo),
    },
    user: {
      type: new GraphQLNonNull(userType),
      resolve: payload => db.getUser(payload.localUserId),
    },
  },
  mutateAndGetPayload: ({ userId, complete }) => {
    const localUserId = relay.fromGlobalId(userId).id;
    const updatedLocalIds = db.markTodosComplete(localUserId, complete);
    return { localUserId, updatedLocalIds };
  },
});

/**
 * This will return a GraphQLFieldConfig for our clear complete todos
 * mutation.
 *
 * It creates these two types implicitly:
 *   input ClearCompleteTodosInput {
 *     userId: ID!
 *   }
 *
 *   type ClearCompleteTodosPayload {
 *     deletedTodos: [Todo!]
 *     clientMutationId: String
 *   }
 */
const clearCompleteTodosMutation = relay.mutationWithClientMutationId({
  name: "ClearCompleteTodos",
  inputFields: {
    userId: {
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  outputFields: {
    deletedTodoIds: {
      type: new GraphQLNonNull(new GraphQLList(GraphQLID)),
      resolve: payload => payload.deletedLocalIds.map(id => relay.toGlobalId("Todo", id)),
    },
    user: {
      type: new GraphQLNonNull(userType),
      resolve: payload => db.getUser(payload.localUserId),
    },
  },
  mutateAndGetPayload: ({ userId }) => {
    const localUserId = relay.fromGlobalId(userId).id;
    const deletedLocalIds = db.clearCompleteTodos(localUserId);
    return { localUserId, deletedLocalIds };
  },
});

/**
 * This is the type that will be the root of our mutations, and the
 * entry point into performing writes in our schema.
 *
 * This implements the following type system shorthand:
 *   type Mutation {
 *     createTodo(input CreateTodoInput!): CreateTodoPayload
 *     updateTodo(input UpdateTodoInput!): UpdateTodoPayload
 *     deleteTodo(input DeleteTodoInput!): DeleteTodoPayload
 *   }
 */
const mutationType = new GraphQLObjectType({
  name: "Mutation",
  fields: () => ({
    createTodo: createTodoMutation,
    updateTodo: updateTodoMutation,
    deleteTodo: deleteTodoMutation,
    markTodosComplete: markTodosCompleteMutation,
    clearCompleteTodos: clearCompleteTodosMutation,
  }),
});

/**
 * Finally, we construct our schema (whose starting query type is the query
 * type we defined above) and export it.
 */
const TodoSchema = new GraphQLSchema({
  query: queryType,
  mutation: mutationType,
});

module.exports = TodoSchema;
