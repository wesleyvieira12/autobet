const mongoose = require("../database");

const BetSchema = new mongoose.Schema({
  info: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  }
});

const Bet = mongoose.model('Bet', BetSchema);

module.exports = Bet;