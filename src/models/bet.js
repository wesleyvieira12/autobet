const mongoose = require("../database");

const BetSchema = new mongoose.Schema({
  info: {
    type: String,
    required: true
  },
  event: {
    type: String,
    required: true
  },
  user: {
    type: String,
    required: true
  },
  result: {
    type: String,
    required: true,
    default: "pendente"
  },
  n_apostas: {
    type: String,
    required: true,
    default: "1",
  },
  message_id: {
    type: String,
    required: true
  },
  linha: {
    type: String,
    required: true
  }
});

const Bet = mongoose.model('Bet', BetSchema);

module.exports = Bet;