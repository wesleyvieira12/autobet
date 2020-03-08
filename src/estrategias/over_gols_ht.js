//EXECUTAR O AUTO BET
//criando container com selenium standalone
//docker run -d -p 4444:4444 -v /dev/shm:/dev/shm selenium/standalone-firefox
//criando conteinar com mongodb
//docker run -d -p 27017:27017 mongo:latest

const Bet = require("./models/bet");

const { Builder, By, Key} = require("selenium-webdriver");
const axios = require("axios");
var telegram = require('telegram-bot-api');

const TOKEN = "23507-XSPGIiL7lO3DWL";
const TOKEN_TELEGRAM = "639207754:AAEwqI0bsPeZKqFJw2u3R19uQk26y3-EQBA";
const STAKE = "0.50";
const ODD = 1.70;

function enviarMsgTelegram(msg, chat) {
  
  var api = new telegram({
          token: TOKEN_TELEGRAM
  });
  console.log("Enviando mensagem telegram");
  api.sendMessage({
    chat_id: chat,
    text: msg
  })
  .catch(function(err)
  {
    console.log("Erro telegram");
    console.log(err);
  });
}

function sleep(milliseconds) {
  console.log("Entrou no sleep");
  const date = Date.now();
  let currentDate = null;
  do {
    currentDate = Date.now();
  } while (currentDate - date < milliseconds);
  console.log("Saiu do sleep");
}

async function salvarDadosAposta(info, name){
  try {
    console.log("Salvando aposta no banco");
  const bet = await Bet.create({info, name});
  return bet;
  } catch(e) {
    console.log("Erro na hora de salvar aposta");
    console.log(e);
  }
}


async function temMercadoDeGolsHTNaBet365(jogo) {
  
  try {
    console.log("Tem o mercado golht: verificando");
    const odd_na_bet365 = await axios.get(`https://api.betsapi.com/v2/event/odds?token=${TOKEN}&event_id=${jogo.id}&odds_market=6`);
    // console.log("temMercadoDeEscanteiosNaBet365: "+odd_na_bet365.headers['x-ratelimit-remaining']); 
    sleep(100);
    return odd_na_bet365.data.results.odds['1_6'].length > 0;

  } catch(e) {
    console.log("Erro: verificando golht bet365");
    console.log(e);
      sleep(100);
      return;
  }

}

async function verificaLinhaGolHT(evento) {
  
  try {
    console.log("Verificando linha GOLHT");
    let retorno = false;
    const odd_na_bet365 = await axios.get(`https://api.betsapi.com/v2/event/odds?token=${TOKEN}&event_id=${evento.id}&odds_market=6`);
    // console.log("verificaLinha: "+odd_na_bet365.headers['x-ratelimit-remaining']); 
    sleep(100);
    const tamanho =  odd_na_bet365.data.results.odds['1_6'].length;
    
    if( tamanho > 0){
    if(parseFloat(odd_na_bet365.data.results.odds['1_6'][0].handicap) == '0.5' || parseFloat(odd_na_bet365.data.results.odds['1_6'][0].handicap) == '0.5,1.0'){
      if(parseFloat(odd_na_bet365.data.results.odds['1_6'][0].over_od) >= ODD){
        retorno = true;
      }
    }
    }
    if(tamanho > 0){
      return [retorno, odd_na_bet365.data.results.odds['1_6'][0].handicap];
      
    }
      return [retorno, 0];
  
  } catch(e) {
    console.log("Erro: Verificando linha");
    console.log(e);
      sleep(100);
      return;
  }
  
}

function temMinimoDePontos(evento, min) {
  const estatisticas = evento.stats;
  const total = parseInt(estatisticas.on_target[0]) + parseInt(estatisticas.on_target[1]) + (parseInt(estatisticas.off_target[0])+ parseInt(estatisticas.off_target[1])*0.5);
  if( total >= min) {
    return [true, total];
  }
  return [false, total];
}

async function analisarGolHT(jogo) {
  try {
    console.log("-------------------------------------------------------------------------------------------");
    console.log("L:"+jogo.league.name+" J: "+jogo.home.name+" x "+jogo.away.name);
    console.log("-------------------------------------------------------------------------------------------");
    const name = "golsht"+jogo.id;
    // console.log(name);
    const aposta = await Bet.find({name});
    
    if(aposta.length == 0) {

        let evento = await axios.get(`https://api.betsapi.com/v1/event/view?token=${TOKEN}&event_id=${jogo.id}`);
        // console.log("analisarJogo: "+evento.headers['x-ratelimit-remaining']); 
        evento = evento.data.results[0];
        sleep(100);
        console.log("\033[0;35m Analisando jogo: \033[1;37m"+evento.home.name+" x "+evento.away.name+"");
        const resultado = jogo.ss.split('-');
        const resultado_casa = parseInt(resultado[0]);
        const resultado_fora = parseInt(resultado[1]);
        const minimo = temMinimoDePontos(evento,5);
        if( resultado_casa == 0 && resultado_fora == 0){
          console.log("\033[1;32m ->Jogo 0 x 0:\033[1;37m [ok]");
          if(minimo[0]){
            console.log("\033[1;32m ->Minimo de pontos:\033[1;37m [ok]");
            if(await temMercadoDeGolsHTNaBet365(jogo)){
              console.log("\033[0;32m ->Tem Mercado:\033[1;37m [ok]");
              console.log("\033[5;30m ->Analisando a linha do jogo:"+evento.home.name+" x "+evento.away.name+"\033[1;37m");
              const retorno = await verificaLinhaGolHT(evento);
              if(retorno[0]){
                enviarMsgTelegram("⚽️ ROBO GOLS HT - 5 PONTOS ⚽️\nJogo: "+evento.home.name+" x "+evento.away.name+"\nLiga: "+evento.league.name,"192133211");
                enviarMsgTelegram("🌍 Abrindo o navegador 🌍\n⚽️ ROBO GOLS HT - 5 PONTOS ⚽️\nJogo: "+evento.home.name+" x "+evento.away.name+"\nLiga: "+evento.league.name, "388474792");
                console.log("\033[0;31m ->Abrindo o navegador\033[1;37m");
                await realizarApostaGols(evento, retorno[1]);
              }else { console.log("\033[0;31m Linha e Odd ainda não estão nos padrões \033[1;37m");}
            }else { console.log("\033[0;31m ->Tem Mercado: [falha]\033[1;37m");}
          }else { console.log("\033[0;31m ->Minimo de pontos:["+minimo[1]+"] [falha]\033[1;37m");}
        }else { console.log("\033[0;31m ->Jogo 0 x 0: [falha]\033[1;37m");}
      }else { console.log("\033[0;31m ->Já existe aposta em GOLHT no jogo"+jogo.home.name+" x "+jogo.away.name+"\033[1;37m");}
  } catch(e) {
      console.log("Erro: Analisar jogo");
      console.log(e);
      sleep(100);
      return;
  }
}

async function realizarApostaGols(evento, linha) { 
  try {

    let encontrou_time = false;
    let encontrou_mercado = false;
    
    let driver = await new Builder().usingServer("http://localhost:4444/wd/hub").forBrowser("firefox").build();
    // let driver = await new Builder().forBrowser("firefox").build();
    
    // Apply timeout for 10 seconds
    await driver.manage().setTimeouts( { implicit: 10000 } );
    await driver.get("https://www.bet365.com");
    await driver.findElement(By.xpath("//div[4]/div[3]/div")).click();
    await driver.findElement(By.xpath("//input[@type='text']")).sendKeys("wesleyvieira12"+ Key.TAB);
    await driver.findElement(By.xpath("//input[@type='password']")).sendKeys("andreia12");
    await driver.findElement(By.xpath("//div[5]/div")).click();
    await driver.findElement(By.xpath("/html/body/div[1]/div/div[2]/div[1]/div/div[2]/div[2]/div/div/div[11]/div/div[1]/div[3]/div")).click();
    await driver.sleep(4000);
    let ligas_jogos = await driver.findElements(By.className("ipo-CompetitionRenderer"));
    for(let liga_jogos of ligas_jogos) {
        const times = await liga_jogos.findElements(By.className("ipo-TeamStack_TeamWrapper"));
        for(let time of times) {
          const text_time = await time.getText();
          if(text_time.toLowerCase() == evento.home.name.toLowerCase()){
            encontrou_time = true;
            time.click();
            await driver.sleep(1000);
            let mercados = await driver.findElements(By.className("gll-MarketGroup"));
            for( let mercado of mercados) {
              const mercado_name = await mercado.findElement(By.className("gll-MarketGroupButton_Text"));
              const mercado_text = await mercado_name.getText();
              if(mercado_text.toLowerCase() == 'first half goals') {
                encontrou_mercado=true;
                const linha_bet365 = await (await mercado.findElement(By.className("gll-ParticipantRowValue_Name"))).getText();
                if(linha_bet365 == "0.5") {
                const over_gol = await mercado.findElement(By.className("gll-Participant_General"));
                over_gol.click();
                
                await driver.manage().setTimeouts( { implicit: 10000 } );
                // Store the web element
                const iframe_aposta = driver.findElement(By.xpath('/html/body/div[1]/div/div[2]/div[2]/div/div/div/div[2]/div/div/div[2]/iframe'));
                // Switch to the frame
                await driver.switchTo().frame(iframe_aposta);
                console.log("📝 Inserindo aposta 📝");
                enviarMsgTelegram("Inserindo aposta", "388474792");
                await driver.findElement(By.className("bs-Stake_TextBox")).sendKeys(STAKE);
                console.log("Clicando no botão");
                enviarMsgTelegram("⚡️ Clicando no botão ⚡️", "388474792");
                
                await driver.findElement(By.className('placeBet')).click();
                const name = "golsht"+evento.id;
                const info = "Aposta na linha: "+linha+". Jogo: "+evento.home.name+" x "+evento.away.name;
                await salvarDadosAposta(info, name);
                console.log(info);
                enviarMsgTelegram("💰 "+info, "388474792");
                } else {
                  console.log("ERRO: Linha na bet365: "+linha_bet365 + " Linha:"+linha);
                  enviarMsgTelegram("🚫 ERRO: Linha na bet365: "+linha_bet365 + " Linha:"+linha+" 🚫", "388474792");
                }
                await driver.sleep(4000);
                await driver.quit();
                return true;
              }
            }
            if(!encontrou_mercado){
              console.log("Não encontrou o mercado");
              enviarMsgTelegram("🚫 Não encontrou o mercado 🚫", "388474792");
            }
            await driver.quit();
            return true;
            
          }
        }
        if(!encontrou_time){
          console.log("Não encontrou o time");
          enviarMsgTelegram("🚫 Não encontrou o time 🚫", "388474792");
        }
        await driver.quit();
        return true;
      }  
    await driver.quit();
    return true;
  } catch(e) {
    process.exit();    
  }
}

async function buscarJogosAoVivo() {
    try {
      const res = await axios.get(`https://api.betsapi.com/v1/events/inplay?sport_id=1&token=${TOKEN}`);   
      console.log("Jogos ao vivo: "+res.data.results.length);  
      // console.log("buscarJogosAoVivo: "+res.headers['x-ratelimit-remaining']); 
        for(let jogo of res.data.results){
          if(jogo.hasOwnProperty('timer')){
            if(parseInt(jogo.timer.tm) >= 0 && parseInt(jogo.timer.tm)<= 23){
              console.log("Antes de analisar....");
              await analisarGolHT(jogo);
              console.log("Depois de analisar....");
            }
          }
        }
        sleep(5000);
        var data = new Date();
        console.log("\n INICIANDO BUSCA DE JOGOS("+data.toLocaleString()+")....\n");
        buscarJogosAoVivo();
    } catch(e) { 
      console.log("Erro buscar jogos");
      process.exit();
    }  
}

buscarJogosAoVivo();
