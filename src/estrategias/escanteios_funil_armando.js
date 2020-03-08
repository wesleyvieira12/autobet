const CHAT_DO_TELEGRAM = "192133211";
const user = "armandomoura";
const password = "mariadalva";
const STAKE = "0.5";
const DEBUGAR = false;

const Bet = require("../models/bet");
const io = require("socket.io-client");
const {enviarMsg, editarMsg} = require("../functions/telegram");
const { Builder, By, Key} = require("selenium-webdriver");

async function salvarDadosAposta(info, event, user, result, n_apostas, message_id, linha){
  try {
    console.log("Salvando aposta no banco");
  const bet = await Bet.create({info, event, user, result, n_apostas, message_id, linha});
  return bet;
  } catch(e) {
    console.log("Erro na hora de salvar aposta");
    console.log(e);
    return false;
  }
}

async function atualizarDadosAposta(id,info, event, user, result, n_apostas, message_id, linha){
  try {
    console.log("Atualizando aposta no banco");
  const bet = await Bet.findByIdAndUpdate(id,
    {info, event, user, result, n_apostas, message_id, linha},
    {new:true});
  return bet;
  } catch(e) {
    console.log("Erro na hora de salvar aposta");
    console.log(e);
    return false;
  }
}

async function analisarEscanteios(evento, linha) {
  
    try {
      let aposta = [];
      if(!DEBUGAR){
        console.log("Sem debug");
        if(Bet.exists()){
          console.log("Banco existe");
          aposta = await Bet.findOne({event: evento.id, user});
          console.log(aposta);
        }
      }
      console.log("Após verificar se existe banco");
      if(aposta.n_apostas == "0") {
        try {
          enviarMsg("Robô Funil \n1º ENTRADA \nJogo: "+evento.home.name+" x "+evento.away.name+" \nLiga: "+evento.league.name+" \nMin: "+evento.timer.tm,CHAT_DO_TELEGRAM);
          await realizarApostaEscanteio(evento, linha, aposta.id, "1");
        } catch(e) {
          console.log(e);
          return false;
        }  
      }else { 
        if(aposta.n_apostas == "1") {
          try {
            enviarMsg("Robô Funil \n2º ENTRADA \nJogo: "+evento.home.name+" x "+evento.away.name+" \nLiga: "+evento.league.name+" \nMin: "+evento.timer.tm,CHAT_DO_TELEGRAM);
            await realizarApostaEscanteio(evento, aposta.linha+".5", aposta.id, "2");
          } catch(e) {
            console.log(e);
            return false;
          }
        }
      }
    } catch(e) {
      console.log(e);
      return false;
    }
}



async function realizarApostaEscanteio(evento, linha, id, n_apostas) { 
  try {

    let encontrou_time = false;
    let encontrou_mercado = false;
    
   let driver = await new Builder().usingServer("http://selenium-wesleyvieira12:4444/wd/hub").forBrowser("firefox").build();
    // let driver = await new Builder().forBrowser("firefox").build();
    console.log("1");
    await driver.manage().setTimeouts( { implicit: 10000 } );
    await driver.sleep(4000);
    await driver.get("https://www.bet365.com");
    await driver.findElement(By.xpath("/html/body/div/div/div[1]/div/div[2]/div[4]/div[3]/div")).click();
    console.log("user: "+user);
    await driver.findElement(By.xpath("//input[@type='text']")).sendKeys(user+ Key.TAB);
    console.log("3");
    console.log("password: "+password);
    await driver.findElement(By.xpath("//input[@type='password']")).sendKeys(password+ Key.ENTER);
    console.log("4");
    await driver.sleep(4000);
    await driver.manage().setTimeouts( { implicit: 10000 } );
    await driver.findElement(By.className("li-MainHeader_EventCount")).click();
    console.log("ok4");
    await driver.sleep(4000);
    await driver.manage().setTimeouts( { implicit: 10000 } );
    let ligas_jogos = await driver.findElements(By.className("ipo-CompetitionRenderer"));
    
    await driver.manage().setTimeouts( { implicit: 10000 } );
    for(let liga_jogos of ligas_jogos) {
        const times = await liga_jogos.findElements(By.className("ipo-TeamStack_TeamWrapper "));
        for(let time of times) {
          const text_time = await time.getText();
          if(text_time.toLowerCase() == evento.home.name.toLowerCase()){
            encontrou_time = true;
            time.click();
            await driver.sleep(1000);
            await driver.manage().setTimeouts( { implicit: 10000 } );
            let mercados = await driver.findElements(By.className("gll-MarketGroup"));
            for( let mercado of mercados) {
              const mercado_name = await mercado.findElement(By.className("gll-MarketGroupButton_Text"));
              const mercado_text = await mercado_name.getText();
              console.log(mercado_text);
              if(mercado_text.toLowerCase() == 'asian corners') {
                encontrou_mercado=true;
                const linha_bet365 = await (await mercado.findElement(By.className("gll-ParticipantRowValue_Name"))).getText();
                if(parseFloat(linha_bet365) <= parseFloat(linha) || DEBUGAR) {
                const over_canto = await mercado.findElement(By.className("gll-Participant_General"));
                over_canto.click();

                await driver.manage().setTimeouts( { implicit: 10000 } );
                // Store the web element
                const iframe_aposta = driver.findElement(By.xpath('/html/body/div[1]/div/div[2]/div[2]/div/div/div/div[2]/div/div/div[2]/iframe'));
                // Switch to the frame
                await driver.switchTo().frame(iframe_aposta);
                console.log("📝 Inserindo aposta 📝");
                await enviarMsg("Inserindo aposta", CHAT_DO_TELEGRAM);
                await driver.findElement(By.className("bs-Stake_TextBox")).sendKeys(STAKE);
                await driver.manage().setTimeouts( { implicit: 10000 } );
                console.log("Clicando no botão");
                enviarMsg("⚡️ Clicando no botão ⚡️",CHAT_DO_TELEGRAM);
                
                await driver.findElement(By.className('placeBet')).click();
                const info = "💰 Aposta na linha: "+linha+". Jogo: "+evento.home.name+" x "+evento.away.name;
                console.log(info);
                const msg = await enviarMsg(info,CHAT_DO_TELEGRAM);
                await atualizarDadosAposta(id,info, evento.id, user, "pendente", n_apostas, msg.message_id, linha);
              
                await driver.sleep(10000);
                await driver.quit();
                return true;
                } else {
                  await Bet.findOneAndDelete(id);
                  console.log("ID:"+id+"ERRO: Linha na bet365: "+linha_bet365 + " Linha:"+linha+"\nJogo: "+evento.home.name+" x "+evento.away.name);
                  enviarMsg("🚫 ERRO: Linha na bet365: "+linha_bet365 + " Linha:"+linha+"\nJogo: "+evento.home.name+" x "+evento.away.name,CHAT_DO_TELEGRAM);
                }
                await driver.sleep(10000);
                await driver.quit();
                return true;
              }
            }
            if(!encontrou_mercado){
              await Bet.findOneAndDelete(id);
              
              console.log("ID:"+id+"Não encontrou o mercado\nJogo: "+evento.home.name+" x "+evento.away.name);
              enviarMsg("🚫 Não encontrou o mercado \nJogo: "+evento.home.name+" x "+evento.away.name,CHAT_DO_TELEGRAM);
            }
            await driver.quit();
            return true;
            
          }
        }
        if(!encontrou_time){
          await Bet.findOneAndDelete(id);
          console.log("ID:"+id+"Não encontrou o time\nJogo: "+evento.home.name+" x "+evento.away.name);
          enviarMsg("🚫 Não encontrou o time \nJogo: "+evento.home.name+" x "+evento.away.name,CHAT_DO_TELEGRAM);
        }
        await driver.quit();
        return true;
      }  
      await driver.quit();
      return true;
    } catch(e) {
      await Bet.findOneAndDelete(id);
      console.log(e);
      return false;  
    }
}

const socket = io.connect("http://servidor:3000");
socket.on('new-bet-broadcast', async function (data) {
  console.log(data);
  await salvarDadosAposta("new aposta", data.evento.id, user, "pendente", 0, "0", "0");
  await analisarEscanteios(data.evento, data.linha);
});

