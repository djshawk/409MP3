// Get the packages we need
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    bodyParser = require('body-parser');

// Read .env file
require('dotenv').config();

// Create our Express application
var app = express();

// Use environment defined port or 3000
var port = process.env.PORT || 3000;

// Connect to MongoDB (SRV URI from .env)
mongoose.set('strictQuery', true);
mongoose.connect(process.env.MONGODB_URI, { dbName: 'mp3' })
  .then(() => {
    console.log('✅ Mongo connected to DB:', mongoose.connection.name);
  })
  .catch(err => {
    console.error('❌ Mongo connection error:', err.message);
    process.exit(1);
  });


var allowCrossDomain = function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    next();
};
app.use(allowCrossDomain);

app.use(bodyParser.urlencoded({ extended: true })); // needed for dbFill.py
app.use(bodyParser.json());

require('./routes')(app, router);

app.listen(port);
console.log('Server running on port ' + port);
