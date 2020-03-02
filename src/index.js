//EXECUTAR O AUTO BET
//criando container com selenium standalone
//docker run -d -p 4444:4444 -v /dev/shm:/dev/shm selenium/standalone-firefox
//criando conteinar com mongodb
//docker run -d -p 27017/27017 mongo:latest

const Bet = require("./models/bet");

const { Builder, By, Key, until} = require("selenium-webdriver");
const axios = require("axios");
var telegram = require('telegram-bot-api');

const TOKEN = "23507-XSPGIiL7lO3DWL";
const TOKEN_TELEGRAM = "639207754:AAEwqI0bsPeZKqFJw2u3R19uQk26y3-EQBA";
const STAKE = "1";
const ODD = 1.60;

function enviarMsgTelegram(msg) {
  
  var api = new telegram({
          token: TOKEN_TELEGRAM
  });

  api.sendMessage({
    chat_id: "388474792",
    text: msg
  })
  .catch(function(err)
  {
    console.log(err);
  });
}

function sleep(milliseconds) {
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
}

async function salvarDadosAposta(info, name){
  try {
  const bet = await Bet.create({info, name});
  return bet;
  } catch(e) {
    console.log(e);
  }
}

function diferencaDeGols(jogo) {
  
  const resultado = jogo.ss.split('-');
  const resultado_casa = parseInt(resultado[0]);
  const resultado_fora = parseInt(resultado[1]);
  return resultado_casa >= resultado_fora ? resultado_casa - resultado_fora : resultado_fora - resultado_casa;

}

function estaComMinimoDeCantos(evento, min_cantos) {

  const cantos_casa = parseInt(evento.stats.corners[0]);
  const cantos_fora = parseInt(evento.stats.corners[1]);
  return cantos_casa + cantos_fora >= min_cantos;

}

async function temMercadoDeEscanteiosNaBet365(jogo) {
  
  try {

    const odd_na_bet365 = await axios.get(`https://api.betsapi.com/v2/event/odds?token=${TOKEN}&event_id=${jogo.id}&odds_market=7,4`);
    // console.log("temMercadoDeEscanteiosNaBet365: "+odd_na_bet365.headers['x-ratelimit-remaining']); 
    sleep(500);
    return odd_na_bet365.data.results.odds['1_7'].length > 0;

  } catch(e) {
    
    const ratelimit = parseInt(e.response.headers['x-ratelimit-remaining']);
    if(ratelimit <= 0){
      sleep(500);
      console.log("Tentando reconectar ao servidor na função: temMercadoDeEscanteiosNaBet365, RateLimit:"+ ratelimit+" X-RateLimit-Reset: "+ e.response.headers['x-ratelimit-reset']);
    }
  }

}

async function verificaLinha(evento) {
  
  try {
    let retorno = false;
    const cantos_casa = parseInt(evento.stats.corners[0]);
    const cantos_fora = parseInt(evento.stats.corners[1]);
    const odd_na_bet365 = await axios.get(`https://api.betsapi.com/v2/event/odds?token=${TOKEN}&event_id=${evento.id}&odds_market=7,4`);
    // console.log("verificaLinha: "+odd_na_bet365.headers['x-ratelimit-remaining']); 
    sleep(500);
    const tamanho =  odd_na_bet365.data.results.odds['1_7'].length;
    if( tamanho > 0){
      console.log("....existe historico de odds");
    if(parseFloat(odd_na_bet365.data.results.odds['1_7'][tamanho - 1].handicap) <= (cantos_casa+cantos_fora + 1)){
      console.log(".............LINHA DA BET ESTÁ OK");
      if(parseFloat(odd_na_bet365.data.results.odds['1_7'][tamanho - 1].over_od) >= ODD){
        console.log(".......................ODD OK");
        retorno = true;
      }
    }
    }
    console.log("....................................Retorno:"+ retorno);
    if(tamanho > 0){
      return [retorno, odd_na_bet365.data.results.odds['1_7'][tamanho - 1].handicap];
      
    }
      return [retorno, 0];
  
  } catch(e) {
    const ratelimit = parseInt(e.response.headers['x-ratelimit-remaining']);
    if(ratelimit <= 0){
      sleep(500);
      console.log("Tentando reconectar ao servidor na função: verificaLinha, RateLimit:"+ ratelimit+" X-RateLimit-Reset: "+ e.response.headers['x-ratelimit-reset']);
    }
  }
  
}

function resultadoDoJogo(jogo){

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

  const estatisticas = evento.stats;

  const casa = parseInt(estatisticas.on_target[0]) + parseInt(estatisticas.off_target[0]) + parseInt(estatisticas.corners[0]);                     
  const fora = parseInt(estatisticas.on_target[1]) + parseInt(estatisticas.off_target[1]) + parseInt(estatisticas.corners[1]);       
  
  return [casa >= 15 || fora>= 15, casa >= fora ? "casa" : "fora"];

}

function segundoCalculo(evento, jogo) {

  const estatisticas = evento.stats;
  const casa = parseInt(estatisticas.dangerous_attacks[0])/jogo.timer.tm;                     
  const fora = parseInt(estatisticas.dangerous_attacks[1])/jogo.timer.tm;       
  return [casa >= 1 || fora>= 1, casa >= fora ? "casa" : "fora"];

}

async function analisarJogo(jogo) {
  try {
    
      const name = "L:"+jogo.league.name+" J: "+jogo.home.name+" x "+jogo.away.name;
      // console.log(name);
     if(!(await Bet.findOne({name}))) {
        let evento = await axios.get(`https://api.betsapi.com/v1/event/view?token=${TOKEN}&event_id=${jogo.id}`);
        // console.log("analisarJogo: "+evento.headers['x-ratelimit-remaining']); 
        evento = evento.data.results[0];
        sleep(500);
        console.log("\033[0;35m Analisando jogo: \033[1;37m"+evento.home.name+" x "+evento.away.name+"");
        const diferenca = diferencaDeGols(jogo);
        const minimo = estaComMinimoDeCantos(evento,8);
        const tem_mercado = await temMercadoDeEscanteiosNaBet365(jogo);

        if( diferenca <= 1){
          console.log("\033[1;32m ->Diferença de gols :\033[1;37m [ok]");
          if(minimo){
            console.log("\033[1;32m ->Minimo de cantos:\033[1;37m [ok]");
            if(tem_mercado){
              console.log("\033[0;32m ->Tem Mercado:\033[1;37m [ok]");
              if(primeiroCalculo(evento)[0]) {
                console.log("\033[0;34m ->Primeiro calculo:\033[1;37m [ok]");
                if(segundoCalculo(evento,jogo)[0]){
                  console.log("\033[0;34m ->Segundo calculo:\033[1;37m [ok]");
                  if(primeiroCalculo(evento)[1] != resultadoDoJogo(jogo)) {
                    console.log("\033[5;30m ->Analisando a linha do jogo:"+evento.home.name+" x "+evento.away.name+"\033[1;37m");
                    const retorno = await verificaLinha(evento);
                    if(retorno[0]){
                      enviarMsgTelegram("Abrindo o navegador");
                      console.log("\033[0;31m ->Abrindo o navegador\033[1;37m");
                      await realizarAposta(evento, retorno[1]);
                    }else { console.log("\033[0;31m Linha e Odd ainda não estão nos padrões \033[1;37m");}
                  }else { console.log("\033[0;31m Time que está ganhando, tem melhores números\033[1;37m");}
                }else { console.log("\033[0;31m Segundo calculo: [falha]\033[1;37m");}
              }else { console.log("\033[0;31m Primeiro calculo: [falha]\033[1;37m");}
            }else { console.log("\033[0;31m ->Tem Mercado: [falha]\033[1;37m");}
          }else { console.log("\033[0;31m ->Minimo de cantos: [falha]\033[1;37m");}
        }else { console.log("\033[0;31m ->Diferença de gols: [falha]\033[1;37m");}
      }
  } catch(e) {
      console.log(e);
      sleep(500);
  }
}

async function buscarJogosAoVivo() {
    try {
      const res = await axios.get(`https://api.betsapi.com/v1/events/inplay?sport_id=1&token=${TOKEN}`);     
      // console.log("buscarJogosAoVivo: "+res.headers['x-ratelimit-remaining']); 
        for(let jogo of res.data.results){
          if(jogo.hasOwnProperty('timer')){
            if(parseInt(jogo.timer.tm) >= 80 && parseInt(jogo.timer.tm)<= 84){
              await analisarJogo(jogo);
            }
          }
        }
        sleep(5000);
        var data = new Date();
        console.log("\n INICIANDO BUSCA DE JOGOS("+data.toUTCString()+")....\n");
        process.exit();
    } catch(e) { 
      process.exit();
    }  
}

async function realizarAposta(evento, linha) { 
  try {
    let encontrou_liga = false;
    let encontrou_time = false;
    let encontrou_mercado = false;
    
    let driver = await new Builder().forBrowser("firefox").usingServer("http://localhost:4444/wd/hub").build();
    
    // Apply timeout for 10 seconds
    await driver.manage().setTimeouts( { implicit: 10000 } );
    await driver.get("https://www.bet365.com");
    await driver.findElement(By.xpath("//div[4]/div[3]/div")).click();
    await driver.findElement(By.xpath("//input[@type='text']")).sendKeys("wesleyvieira12"+ Key.TAB);
    await driver.findElement(By.xpath("//input[@type='password']")).sendKeys("andreia12");
    await driver.findElement(By.xpath("//div[5]/div")).click();
    await driver.findElement(By.xpath("/html/body/div[1]/div/div[2]/div[1]/div/div[2]/div[2]/div/div/div[11]/div/div[1]/div[3]/div")).click();
    await driver.sleep(4000);
    let ligas_jogos = await driver.findElements(By.className("ipo-Competition"));
    for(let liga_jogos of ligas_jogos) {

      const liga = await liga_jogos.findElement(By.className("ipo-CompetitionButton_NameLabel"));
      const nome_liga = await liga.getText();
      if(nome_liga.toLowerCase() == evento.league.name.toLowerCase()){
        encontrou_liga = true;
        const times = await liga_jogos.findElements(By.className("ipo-TeamStack_TeamWrapper"));
        let casa = "";
        let fora = "";
        for(let time of times) {
          const text_time = await time.getText();
          if(text_time.toLowerCase() == evento.home.name.toLowerCase()){
            encontrou_time = true;
            time.click();
            await driver.sleep(5000);
            let mercados = await driver.findElements(By.className("gll-MarketGroup"));
            for( let mercado of mercados) {
              const mercado_name = await mercado.findElement(By.className("gll-MarketGroupButton_Text"));
              const mercado_text = await mercado_name.getText();
              if(mercado_text.toLowerCase() == 'asian corners') {
                encontrou_mercado=true;
                const linha_bet365 = await (await mercado.findElement(By.className("gll-ParticipantRowValue_Name"))).getText();
                if(parseFloat(linha_bet365) <= parseFloat(linha)) {
                const over_canto = await mercado.findElement(By.className("gll-Participant_General"));
                over_canto.click();
                
                
                await driver.manage().setTimeouts( { implicit: 10000 } );
                // Store the web element
                const iframe_aposta = driver.findElement(By.xpath('/html/body/div[1]/div/div[2]/div[2]/div/div/div/div[2]/div/div/div[2]/iframe'));
                // Switch to the frame
                await driver.switchTo().frame(iframe_aposta);
                console.log("Inserindo aposta");
                enviarMsgTelegram("Inserindo aposta");
                await driver.findElement(By.className("bs-Stake_TextBox")).sendKeys(STAKE);
                console.log("Clicando no botão");
                enviarMsgTelegram("Clicando no botão");
                
                await driver.findElement(By.className('placeBet')).click();
                const name = "L:"+evento.league.name+" J:"+evento.home.name+" x "+evento.away.name;
                const info = "Aposta na linha: "+linha+". Jogo: "+evento.home.name+" x "+evento.away.name+". Odd: "+linha_bet365;
                salvarDadosAposta(info, name);
                console.log(info);
                enviarMsgTelegram(info);
                } else {
                  console.log("Linha na bet365: "+linha_bet365 + " Linha:"+linha);
                  enviarMsgTelegram("Linha na bet365: "+linha_bet365 + " Linha:"+linha);
                }
                await driver.sleep(4000);
                await driver.quit();
                return true;
              }
            }
            if(!encontrou_mercado){
              console.log("Não encontrou o mercado");
              enviarMsgTelegram("Não encontrou o mercado");
            }
            await driver.quit();
            return true;
            
          }
        }
        if(!encontrou_time){
          console.log("Não encontrou o time");
          enviarMsgTelegram("Não encontrou o time");
        }
        await driver.quit();
        return true;
      }  
    }
    if(!encontrou_liga){
      console.log("Não encontrou a liga!");
      enviarMsgTelegram("Não encontrou a liga!");
    }
    await driver.quit();
    return true;
  } catch(e) {
    console.log(e);
    enviarMsgTelegram(e);
  }
}

buscarJogosAoVivo();
