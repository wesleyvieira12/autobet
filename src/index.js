const Bet = require("./models/bet");

const { Builder, By, Key, until} = require("selenium-webdriver");
const axios = require("axios");

const TOKEN = "23507-XSPGIiL7lO3DWL";
const STAKE = "1";
const ODD = 1.60;

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
      temMercadoDeEscanteiosNaBet365();
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

    if(odd_na_bet365.data.results.odds['1_7'].length > 0){
      console.log("....existe historico de odds");
    if(parseFloat(odd_na_bet365.data.results.odds['1_7'][0].handicap) <= (cantos_casa+cantos_fora + 1)){
      console.log(".............LINHA DA BET ESTÁ OK");
      if(parseFloat(odd_na_bet365.data.results.odds['1_7'][0].over_od) >= ODD){
        console.log(".......................ODD OK");
        retorno = true;
      }
    }
    }
    console.log("....................................Retorno:"+ retorno);
    if(odd_na_bet365.data.results.odds['1_7'].length > 0){
      return [retorno, odd_na_bet365.data.results.odds['1_7'][0].handicap];
      
    }
      return [retorno, 0];
  
  } catch(e) {
    const ratelimit = parseInt(e.response.headers['x-ratelimit-remaining']);
    if(ratelimit <= 0){
      sleep(500);
      verificaLinha();
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

        if( diferenca <= 1 && minimo && tem_mercado){
          console.log("\033[1;32m ->Diferença de gols :\033[1;37m [ok]");
          console.log("\033[1;32m ->Minimo de cantos:\033[1;37m [ok]");
          console.log("\033[0;32m ->Tem Mercado:\033[1;37m [ok]");
          if(primeiroCalculo(evento)[0] && segundoCalculo(evento,jogo)[0]) {
            console.log("->Primeiro e segundo calculo: ok");
            if(primeiroCalculo(evento)[1] != resultadoDoJogo(jogo)) {
              console.log("->Analisando a linha do jogo:"+evento.home.name+" x "+evento.away.name+"");
              const retorno = await verificaLinha(evento);
              if(retorno[0]){
                console.log("->Abrindo o navegador");
                realizarAposta(evento, retorno[1]);
              }
            }
          }
        }
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
        console.log("\n REINICIANDO BUSCA DE JOGOS....\n");
        await buscarJogosAoVivo();
    } catch(e) {
      console.log(e);    
    }
    
   
}

async function realizarAposta(evento, linha) { 
  let driver = await new Builder().forBrowser("firefox").build();
  
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
      const times = await liga_jogos.findElements(By.className("ipo-TeamStack_TeamWrapper"));
      let casa = "";
      let fora = "";
      for(let time of times) {
        const text_time = await time.getText();
        if(text_time.toLowerCase() == evento.home.name.toLowerCase()){
          time.click();
          await driver.sleep(5000);
          let mercados = await driver.findElements(By.className("gll-MarketGroup"));
          for( let mercado of mercados) {
            const mercado_name = await mercado.findElement(By.className("gll-MarketGroupButton_Text"));
            const mercado_text = await mercado_name.getText();
            if(mercado_text.toLowerCase() == 'asian corners') {
              const over_canto = await mercado.findElement(By.className("gll-Participant_General"));
              over_canto.click();
              const linha_bet365 = await (await mercado.findElement(By.className("gll-ParticipantRowValue_Name"))).getText();
              if(parseFloat(linha_bet365) <= parseFloat(linha)) {
              await driver.manage().setTimeouts( { implicit: 10000 } );
              // Store the web element
              const iframe_aposta = driver.findElement(By.xpath('/html/body/div[1]/div/div[2]/div[2]/div/div/div/div[2]/div/div/div[2]/iframe'));
              // Switch to the frame
              await driver.switchTo().frame(iframe_aposta);
              await driver.findElement(By.className("bs-Stake_TextBox")).sendKeys(STAKE);
              
              await driver.findElement(By.className('placeBet')).click();
              const name = "L:"+evento.league.name+" J:"+evento.home.name+" x "+evento.away.name;
              const info = "Aposta na linha: "+linha+". Jogo: "+evento.home.name+" x "+evento.away.name+". Odd: "+linha_bet365;
              salvarDadosAposta(info, name);
              console.log(info);
              }
              await driver.sleep(4000);
              await driver.quit();
              return true;
            }
          }
          
        }
      }
    }  
  }
  await driver.close();
}

// realizarAposta({
//   data:{
//     results: [
//       {
//       league: {
//       id: "895",
//       name: "England Premier League",
//       cc: "jp"
//       },
//       home: {
//       id: "43733",
//       name: "Watford",
//       image_id: "3133",
//       cc: "jp"
//       },
//       away: {
//       id: "5620",
//       name: "Liverpool",
//       image_id: "3134",
//       cc: "jp"
//       }
//     }]
//   }
//   });

buscarJogosAoVivo();
