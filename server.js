var express = require('express');
var router = express.Router();
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
require('dotenv').config();

var app = express();
var p = process.env.PORT || 3000;

mongoose.set('strictQuery', true);
mongoose
  .connect(process.env.MONGODB_URI, { dbName: 'mp3' })
  .then(() => {
    console.log('Mongo connected to DB:', mongoose.connection.name);
  })
  .catch(err => {
    console.error('Mongo connection error:', err.message);
    process.exit(1);
  });

var xd = function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header(
    'Access-Control-Allow-Headers',
    'X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept'
  );
  res.header('Access-Control-Allow-Methods', 'POST, GET, PUT, DELETE, OPTIONS');
  next();
};
app.use(xd);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

require('./routes')(app, router);

app.listen(p);
console.log('Server running on port ' + p);
