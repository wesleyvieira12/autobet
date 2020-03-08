const mongoose = require("mongoose");

mongoose.connect('mongodb://mongodb/autobet_db', {useNewUrlParser: true, useUnifiedTopology: true });
mongoose.Promise = global.Promise;

module.exports = mongoose;