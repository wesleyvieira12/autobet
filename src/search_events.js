//const api = require("axios");
const fetch = require("node-fetch");
const io = require("socket.io-client");
const TOKEN = "23507-XSPGIiL7lO3DWL";
const Bet = require("./models/bet");
const DEBUGAR = false;

function sleep(milliseconds) {
  console.log("Entrou no sleep");
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
  console.log("Saiu do sleep");
}

function diferencaDeGols(jogo) {
  console.log("Diferença de gols");
  const resultado = jogo.ss.split('-');
  const resultado_casa = parseInt(resultado[0]);
  const resultado_fora = parseInt(resultado[1]);
  return resultado_casa >= resultado_fora ? resultado_casa - resultado_fora : resultado_fora - resultado_casa;

}

function estaComMinimoDeCantos(evento, min_cantos) {
  console.log("minimo de escanteios");
  const cantos_casa = parseInt(evento.stats.corners[0]);
  const cantos_fora = parseInt(evento.stats.corners[1]);
  return cantos_casa + cantos_fora >= min_cantos;

}

async function temMercadoDeEscanteiosNaBet365(jogo) {
  
  try {
    console.log("Tem o mercado : verificando");
    const res = await fetch(`https://api.betsapi.com/v2/event/odds?token=${TOKEN}&event_id=${jogo.id}&odds_market=7,4`);
    // console.log("temMercadoDeEscanteiosNaBet365: "+odd_na_bet365.headers['x-ratelimit-remaining']); 
    let odd_na_bet365 = await res.json();
    odd_na_bet365 = odd_na_bet365["results"];
    
    sleep(500);
    return odd_na_bet365.odds['1_4'].length > 0;

  } catch(e) {
    console.log("Erro: verificando bet365");
    console.log(e);
      sleep(500);
    return false;
  }

}

async function verificaLinha(evento) {
  
  try {
    console.log("Verificando linha");
    let retorno = false;
    const cantos_casa = parseInt(evento.stats.corners[0]);
    const cantos_fora = parseInt(evento.stats.corners[1]);
    const res = await fetch(`https://api.betsapi.com/v2/event/odds?token=${TOKEN}&event_id=${evento.id}&odds_market=7,4`);
    // console.log("verificaLinha: "+odd_na_bet365.headers['x-ratelimit-remaining']); 
    let odd_na_bet365 = await res.json();
    odd_na_bet365 = odd_na_bet365["results"];
    sleep(500);
    const tamanho =  odd_na_bet365.odds['1_4'].length;
    
    if( tamanho > 0){
      console.log("....existe historico de odds");
    if(parseFloat(odd_na_bet365.odds['1_4'][0].handicap) == (cantos_casa+cantos_fora + 1)){
      console.log(".............LINHA DA BET ESTÁ OK");
      if(parseFloat(odd_na_bet365.odds['1_4'][0].over_od) >= ODD){
        console.log(".......................ODD OK");
        retorno = true;
      }
    }
    }
    console.log("....................................Retorno:"+ retorno);
    if(tamanho > 0){
      return [retorno, odd_na_bet365.odds['1_4'][0].handicap];
      
    }
      return [retorno, 0];
  
  } catch(e) {
    console.log("Erro: Verificando linha");
    console.log(e);
      sleep(500);
      return false;
  }
  
}

function resultadoDoJogo(jogo){
  console.log("Verificando linha");
  const resultado = jogo.ss.split('-');
  const resultado_casa = parseInt(resultado[0]);
  const resultado_fora = parseInt(resultado[1]);
  if(resultado_casa > resultado_fora) {
    return 'casa';
  } else if(resultado_casa < resultado_fora) {
    return 'fora';
  } else {
    return 'empate';
  }

}

function primeiroCalculo(evento) {
  console.log("1º CALCULO");
  const estatisticas = evento.stats;

  const casa = parseInt(estatisticas.on_target[0]) + parseInt(estatisticas.off_target[0]) + parseInt(estatisticas.corners[0]);                     
  const fora = parseInt(estatisticas.on_target[1]) + parseInt(estatisticas.off_target[1]) + parseInt(estatisticas.corners[1]);       
  
  return [casa >= 15 || fora>= 15, casa >= fora ? "casa" : "fora"];

}

function segundoCalculo(evento, jogo) {
  console.log("2º CALCULO");
  const estatisticas = evento.stats;
  const casa = parseInt(estatisticas.dangerous_attacks[0])/jogo.timer.tm;                     
  const fora = parseInt(estatisticas.dangerous_attacks[1])/jogo.timer.tm;       
  return [casa >= 1 || fora>= 1, casa >= fora ? "casa" : "fora"];

}

async function funil(evento, jogo) {
  if(primeiroCalculo(evento)[0]) {
    console.log("\033[0;34m ->Primeiro calculo:\033[1;37m [ok]");
    if(segundoCalculo(evento,jogo)[0]){
      console.log("\033[0;34m ->Segundo calculo:\033[1;37m [ok]");
      if(primeiroCalculo(evento)[1] != resultadoDoJogo(jogo)) {
        console.log("\033[5;30m ->Analisando a linha do jogo:"+evento.home.name+" x "+evento.away.name+"\033[1;37m");
        const retorno = await verificaLinha(evento);
        if(retorno[0]){
          return [true, retorno[1]];
          
        }else { console.log("\033[0;31m Linha e Odd ainda não estão nos padrões \033[1;37m");}
      }else { console.log("\033[0;31m Time que está ganhando, tem melhores números\033[1;37m");}
    }else { console.log("\033[0;31m Segundo calculo: [falha]\033[1;37m");}
  }else { console.log("\033[0;31m Primeiro calculo: [falha]\033[1;37m");}

  return [false,0];
}

async function buscarJogosAoVivo() {
    try {
      
      const res = await fetch(`https://api.betsapi.com/v1/events/inplay?sport_id=1&token=${TOKEN}`);   
      const jogos = await res.json();  
      // console.log("buscarJogosAoVivo: "+res.headers['x-ratelimit-remaining']); 
        for(let jogo of jogos["results"]){
          if(jogo.hasOwnProperty('timer')){
            if((parseInt(jogo.timer.tm) >= 80 && parseInt(jogo.timer.tm)<= 85)){
              console.log("Antes de analisar....");
              try {
                let retorno = await analisarEscanteios(jogo);
                if(retorno) {
                  var socket = io.connect("http://servidor:3000");
                  console.log("===================WEBSOCKET===========================")
                  socket.emit('new-bet', {evento: retorno[0], linha: retorno[1]});
                }
                console.log("Depois de analisar....");
              } catch(e) { 
                console.log("ao analisar jogo");
                console.log(e);
                return false;
              }
            }
          }
        }
        sleep(5000);
        var data = new Date();
        console.log("\n INICIANDO BUSCA DE JOGOS("+data.toLocaleString()+")....\n");
        return true;
    } catch(e) { 
      console.log("Erro buscar jogos");
      console.log(e);
      return false;
    }  
}

async function analisarEscanteios(jogo) {
  try {
      const resultado_jogo = jogo.ss.split('-');
      const resultado_casa = parseInt(resultado_jogo[0]);
      const resultado_fora = parseInt(resultado_jogo[1]);
      console.log("-------------------------------------------------------------------------------------------");
      console.log("Min: "+jogo.timer.tm+" L:"+jogo.league.name+" J: "+jogo.home.name+" "+resultado_casa+" x "+resultado_fora+" "+jogo.away.name);
      console.log("-------------------------------------------------------------------------------------------");
    try {
      let aposta = [];
        if(Bet.exists()){
          console.log("Banco existe");
          aposta = await Bet.find({event: jogo.id});
        }

      if(aposta.length == 0){
        try {
          let res = await fetch(`https://api.betsapi.com/v1/event/view?token=${TOKEN}&event_id=${jogo.id}`);
          // console.log("analisarJogo: "+evento.headers['x-ratelimit-remaining']); 
          console.log("Após busca de evento");
          let evento = await res.json(); 
          evento = evento["results"][0];
          sleep(500);
          console.log("\033[0;35m Analisando jogo: \033[1;37m"+evento.home.name+" x "+evento.away.name+"");
          const diferenca = diferencaDeGols(jogo);
          console.log("Após diferença de gols");
          const minimo = estaComMinimoDeCantos(evento,8);
          console.log("Após minimo de cantos");
          try {
            const tem_mercado = await temMercadoDeEscanteiosNaBet365(jogo);
            console.log("Após se tem mercado");
            if( diferenca <= 1 || DEBUGAR){
              console.log("\033[1;32m ->Diferença de gols :\033[1;37m [ok]");
              if(minimo || DEBUGAR){
                console.log("\033[1;32m ->Minimo de cantos:\033[1;37m [ok]");
                if(tem_mercado){
                  console.log("\033[0;32m ->Tem Mercado:\033[1;37m [ok]");
                  try {
                    const retorno = await funil(evento, jogo);
                    if(retorno[0]|| DEBUGAR){                        
                      try {
                        return [evento, retorno[1]];
                      } catch(e) {
                        console.log(e);
                        return false;
                      }
                    }else { console.log("\033[0;31m ->Não bateu estratégia do funil\033[1;37m"); return false;}
                  } catch(e) {
                    console.log(e);
                    return false;
                  }
                }else { console.log("\033[0;31m ->Tem Mercado: [falha]\033[1;37m"); return false;}
              }else { console.log("\033[0;31m ->Minimo de cantos: [falha]\033[1;37m"); return false;}
            }else { console.log("\033[0;31m ->Diferença de gols: [falha]\033[1;37m"); return false;}
          } catch(e) {
            console.log(e);
            return false;
          }
        } catch(e) {
          console.log(e);
          return false;
        }
      }else{ console.log("===================APOSTA EM ANDAMENTO==========================="); return false;}
    } catch(e) {
      console.log(e);
      return false;
    }
  } catch(e) {
      console.log("Erro: Analisar jogo");
      console.log(e);
      sleep(500);
      return false;
  }
}

buscarJogosAoVivo().then( res => {
  console.log(res);
  process.exit(1);
}).catch(e => {
  console.log(e);
  process.exit(1);
});
