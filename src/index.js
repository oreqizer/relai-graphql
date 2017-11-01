/* eslint-disable no-underscore-dangle */
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const graphqlHTTP = require("express-graphql");

const schema = require("./schema");

const app = express();

app.use(cors());

app.use(morgan("tiny"));

app.use(
  "/graphql",
  graphqlHTTP({
    schema,
    graphiql: true,
  }),
);

const port = process.env.PORT || 8081;

app.listen(port, () => {
  console.log(`[graphql] Listening at ${port}`); // eslint-disable-line no-console
});
