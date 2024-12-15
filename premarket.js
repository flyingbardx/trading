let { SmartAPI, WebSocket,WebSocketV2 } = require('smartapi-javascript');
const otplib = require("otplib");
const fs = require("fs")

const secret = "AUBJH74PDIAGTZQLEFRNCMA2QA"
const totp = otplib.authenticator.generate(secret);

let smart_api = new SmartAPI({
	api_key: '3VCkYkZj', 
});

var jwtToken ="0";
var refreshToken ="0";
var feedToken ="0";

var tokenSymbolMap = {};

var crudeoil_token = "435823";

var crudeoil_option_chain = []

const db = {}

db["SYMBOL"] = require('better-sqlite3')('SYMBOL.db')

function floor_ceil_multiple(x,multiple){

    var remainder = x % multiple
    var floor_val = x - remainder
   	var ceil_val = floor_val+ multiple
    return [floor_val, ceil_val]
}

function get_latest_expiry(symbol){
	var today = new Date().toISOString().slice(0, 10);
	
	const query = `
            SELECT EXPIRY FROM SYMBOLS
            WHERE TRADINGSYMBOL LIKE ? AND EXPIRY >= ?
            ORDER BY EXPIRY ASC
            LIMIT 1
        `;

     var data = db["SYMBOL"].prepare(query).get(symbol+"%", today)

	return data["EXPIRY"]

}

function get_option_chain( symbol,price, no_of_strike, strike_gap ){
	var floorCeilData = floor_ceil_multiple(price , strike_gap)
	var min_strike = floorCeilData[0] - (no_of_strike -1)*strike_gap
	var max_strike = floorCeilData[1] + (no_of_strike-1)*strike_gap
	var strikes = []
	for(var i = min_strike ; i<= max_strike ; i= i+strike_gap){
		strikes.push(i)
	}
	var expiry = get_latest_expiry(symbol)
	const query = `SELECT TOKEN,SYMBOL,STRIKEPRICE,OPTIONTYPE,TRADINGSYMBOL,EXPIRY,LOTSIZE FROM SYMBOLS WHERE EXPIRY =? and TRADINGSYMBOL LIKE ? AND TRADINGSYMBOL NOT LIKE '%CRUDEOILM%' AND STRIKEPRICE IN(${Array(strikes.length).fill('?').join(',')}) ORDER BY EXPIRY ASC, STRIKEPRICE ASC, OPTIONTYPE ASC`;
	var data = db["SYMBOL"].prepare(query).all(expiry, symbol+"%", strikes)

	var calls = db["SYMBOL"].prepare(`SELECT TOKEN,SYMBOL,STRIKEPRICE,OPTIONTYPE,TRADINGSYMBOL,EXPIRY,LOTSIZE FROM SYMBOLS WHERE EXPIRY =? and OPTIONTYPE='CE' and TRADINGSYMBOL LIKE ? AND TRADINGSYMBOL NOT LIKE '%CRUDEOILM%'  AND STRIKEPRICE IN(${Array(strikes.length).fill('?').join(',')}) ORDER BY EXPIRY ASC, STRIKEPRICE ASC, OPTIONTYPE ASC`).all(expiry, symbol+"%", strikes)
	var puts = db["SYMBOL"].prepare(`SELECT TOKEN,SYMBOL,STRIKEPRICE,OPTIONTYPE,TRADINGSYMBOL,EXPIRY,LOTSIZE FROM SYMBOLS WHERE EXPIRY =? and OPTIONTYPE='PE' and TRADINGSYMBOL LIKE ? AND TRADINGSYMBOL NOT LIKE '%CRUDEOILM%' AND STRIKEPRICE IN(${Array(strikes.length).fill('?').join(',')}) ORDER BY EXPIRY ASC, STRIKEPRICE ASC, OPTIONTYPE ASC`).all(expiry, symbol+"%", strikes)
	return {option_chain:data,CALLS:calls,PUTS:puts,PRICE:price}
}

async function loadIndex()
{
	return new Promise(async function(res,rej){

	    exchangeTokens = {
	    "MCX": [crudeoil_token],
	    }
		requestFormat  = {
			"mode": "LTP",
			"exchangeTokens":exchangeTokens,
		}
		var crudeoil_price = 0
		
		try{
			var data = await smart_api.marketData(requestFormat)
			if(typeof data.data !="undefined"){
				for(var i = 0; i<data.data.fetched.length;i++){
					var token  = data.data.fetched[i]["symbolToken"]
					var ltp  = data.data.fetched[i]["ltp"]

					if(token == crudeoil_token){
						crudeoil_price = ltp
					}

				}
				crudeoil_option_chain  = get_option_chain( "CRUDEOIL", crudeoil_price, 5, 50 )
				
				fs.writeFile('premarket.json', JSON.stringify({"CRUDEOIL":crudeoil_option_chain}),function(){
					console.log("File written")
				})

				const currentDate = new Date()
				currentDate.setHours(currentDate.getHours()+5)
				currentDate.setMinutes(currentDate.getMinutes()+30)
				const dateTime = currentDate.toISOString().replace('T',' ').slice(0,19)
				
			}
			
			res(data.data.fetched)
		}catch(err){
			rej("Error occured")
			console.log(err)
		}
			
	})
}

async function login(){
	return smart_api
		.generateSession('K51661547', '1991', totp)
		.then((data) => {
			jwtToken = data.data["jwtToken"]
			refreshToken = data.data["refreshToken"]
			feedToken = data.data["feedToken"]
			return smart_api.getProfile();
		}).then((data) => {
			console.log(data)
		}).catch((ex) => {
			console.log(ex)
		});
}

function delay(second){
	return new Promise(function(res,rej){
		setTimeout(function(){
			res("done")
		}, second*1000)
	})
}

(async function(){
	await login();
	await loadIndex();
	
})()
