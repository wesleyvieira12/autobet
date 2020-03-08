var telegram = require('telegram-bot-api');

const TOKEN_TELEGRAM = "639207754:AAEwqI0bsPeZKqFJw2u3R19uQk26y3-EQBA";
const api = new telegram({
  token: TOKEN_TELEGRAM
});

async function enviarMsg(msg, chat){
  try {
    console.log("Enviando mensagem telegram");
    return await api.sendMessage({
    chat_id: chat,
    text: msg
    });

  } catch(err) {
    console.log("Erro telegram");
    console.log(err);
    return false;
  };
  

}

async function editarMsg(msg, chat, message_id){

  try {

    
    console.log("Enviando mensagem telegram");
    await api.editMessageText({
      chat_id: chat,
      message_id: message_id,
      text: msg
    });

  } catch(err) {
    console.log("Erro telegram");
    console.log(err);
    return false;
  };
  

}

module.exports = {editarMsg, enviarMsg};
