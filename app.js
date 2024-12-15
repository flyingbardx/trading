let { SmartAPI, WebSocket,WebSocketV2 } = require('smartapi-javascript');
const otplib = require("otplib");
const fs = require('fs')

const db = {}
var option_chain = []
const LTP = 0
db["CRUDEOIL"] = require('better-sqlite3')('databases/CRUDEOIL.db')

const secret = "AUBJH74PDIAGTZQLEFRNCMA2QA"
const totp = otplib.authenticator.generate(secret);

let smart_api = new SmartAPI({
	api_key: '3VCkYkZj', 
});

var jwtToken ="0";
var refreshToken ="0";
var feedToken ="0";

var tokenSymbolMap = {};

var crudeoil_future = "435823"

var crudeoil_option_chain = []

var crudeoil_tokens = []

function createTable(db, token){
	db.exec(`CREATE TABLE IF NOT EXISTS "${token}" (
		"ID"    INTEGER,
		"token"   NUMERIC,
		"sequence_number" NUMERIC,
		"exchange_timestamp"  NUMERIC,
		"five_second_timestamp" NUMERIC,
		"fifteen_second_timestamp" NUMERIC,
		"thirty_second_timestamp" NUMERIC,
		"one_minute_timestamp" NUMERIC,
		"three_minute_timestamp" NUMERIC,
		"five_minute_timestamp" NUMERIC,
		"fifteen_minute_timestamp" NUMERIC,
		"last_traded_price"   NUMERIC,
		"floored_price"   NUMERIC,
		"floored_5_price"   NUMERIC,
		"floored_10_price"   NUMERIC,
		"floored_20_price"   NUMERIC,
		"volume"   NUMERIC,
		"buy_volume" NUMERIC,
		"sell_volume" NUMERIC,
		"delta" NUMERIC,
		open_interest NUMERIC,
		"total_bid_quantity" NUMERIC,
		"total_ask_quantity" NUMERIC,
		PRIMARY KEY("ID" AUTOINCREMENT))`
	);
}


function createTables(){
	return new Promise(function(res,rej){
		createTable(db["CRUDEOIL"], "T_"+crudeoil_future)

		fs.readFile("premarket.json" ,function(err,data){
			var json = JSON.parse(data.toString())
			// console.log(json)	
			for(var i=0 ; i< json.CRUDEOIL.option_chain.length ; i++){
				createTable(db["CRUDEOIL"], "T_"+json.CRUDEOIL.option_chain[i].TOKEN)
				crudeoil_tokens.push(json.CRUDEOIL.option_chain[i].TOKEN)
			}
		})
		res("done")
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
var web_socket = {fetchData:function(){}}

var previousLTP = {}
var previousVolume = {}
var previousAction = {}
var accumulatedVolume = {}

function floorToMinute(timestamp,minute) {
	const flooredTimestamp = timestamp - (timestamp % (60*minute*1000));
 	return flooredTimestamp
}
function floorToSecond(timestamp,second) {
	const flooredTimestamp = timestamp - (timestamp % (second*1000));
	return flooredTimestamp
}

function receiveTick(data) {
	if(data != "pong"){
		// console.log(data)
		var token = data["token"].replaceAll('"', '')

		if( typeof previousLTP[token] == "undefined"){
			previousLTP[token] = data["last_traded_price"]/100
		}
		if( typeof previousVolume[token] == "undefined"){
			previousVolume[token] = parseInt(data["vol_traded"],10)
		}		
		if( typeof previousAction[token] == "undefined"){
			previousAction[token] = "buy"
		}
		if( typeof accumulatedVolume[token] == "undefined"){
			accumulatedVolume[token] = 0
		}

		var sequence_number = data["sequence_number"]
		var exchange_timestamp = data["exchange_timestamp"]
		// exchange_timestamp = exchange_timestamp/1000
		// console.log(exchange_timestamp)

		var five_second_timestamp = floorToSecond(exchange_timestamp,5)
		var fifteen_second_timestamp = floorToSecond(exchange_timestamp,15)
		var thirty_second_timestamp = floorToSecond(exchange_timestamp,30)

		var one_minute_timestamp = floorToMinute(exchange_timestamp,1)
		var three_minute_timestamp = floorToMinute(exchange_timestamp,3)
		var five_minute_timestamp = floorToMinute(exchange_timestamp,5)
		var fifteen_minute_timestamp = floorToMinute(exchange_timestamp,15)
		var last_traded_price = data["last_traded_price"]/100
		
		var floored_price = Math.floor(last_traded_price)
		var floored_5_price = Math.floor(last_traded_price/5)*5
		var floored_10_price = Math.floor(last_traded_price/10)*10
		var floored_20_price = Math.floor(last_traded_price/20)*20

		var volume_trade_for_the_day = data["vol_traded"]
		var open_interest = data["open_interest"]
		var bid1_quantity = parseInt(data["best_5_buy_data"][0]["quantity"],10)
        var bid2_quantity = parseInt(data["best_5_buy_data"][1]["quantity"],10)
        var bid3_quantity = parseInt(data["best_5_buy_data"][2]["quantity"],10)
        var bid4_quantity = parseInt(data["best_5_buy_data"][3]["quantity"],10)
        var bid5_quantity = parseInt(data["best_5_buy_data"][4]["quantity"],10)
        var ask1_quantity = parseInt(data["best_5_sell_data"][0]["quantity"],10)
        var ask2_quantity = parseInt(data["best_5_sell_data"][1]["quantity"],10)
        var ask3_quantity = parseInt(data["best_5_sell_data"][2]["quantity"],10)
        var ask4_quantity = parseInt(data["best_5_sell_data"][3]["quantity"],10)
        var ask5_quantity = parseInt(data["best_5_sell_data"][4]["quantity"],10)
        
        var total_bid_quantity = bid1_quantity+bid2_quantity+bid3_quantity+bid4_quantity+bid5_quantity
        var total_ask_quantity = ask1_quantity+ask2_quantity+ask3_quantity+ask4_quantity+ask5_quantity

        var buy_volume = 0
        var sell_volume = 0
        var delta = 0
        var volume = 0

		if(previousLTP[token]  != 0){

			var volume = volume_trade_for_the_day - previousVolume[token] 
			if(last_traded_price > previousLTP[token] ){
				buy_volume = volume+accumulatedVolume[token]
				previousAction[token] = "buy"
				accumulatedVolume[token] = 0
			}
			if(last_traded_price < previousLTP[token] ){
				sell_volume = volume+accumulatedVolume[token]
				previousAction[token] = "sell"
				accumulatedVolume[token] = 0
			}

			if(last_traded_price == previousLTP[token]){
				accumulatedVolume[token] += volume
			}
		}
		
		previousLTP[token] = last_traded_price 
		previousVolume[token] = volume_trade_for_the_day
		    
        delta = buy_volume - sell_volume
		var insert = db["CRUDEOIL"].prepare(`INSERT INTO ${ "T_"+token} (token,sequence_number,exchange_timestamp,five_second_timestamp,fifteen_second_timestamp,thirty_second_timestamp,one_minute_timestamp,three_minute_timestamp,five_minute_timestamp,fifteen_minute_timestamp,last_traded_price,floored_price,floored_5_price,floored_10_price,floored_20_price,volume,buy_volume,sell_volume,delta,open_interest,total_bid_quantity,total_ask_quantity) VALUES (@token,@sequence_number,@exchange_timestamp,@five_second_timestamp,@fifteen_second_timestamp,@thirty_second_timestamp,@one_minute_timestamp,@three_minute_timestamp,@five_minute_timestamp,@fifteen_minute_timestamp,@last_traded_price,@floored_price,@floored_5_price,@floored_10_price,@floored_20_price,@volume,@buy_volume,@sell_volume,@delta,@open_interest,@total_bid_quantity,@total_ask_quantity)`)
		insert.run({token,sequence_number,exchange_timestamp,five_second_timestamp,fifteen_second_timestamp,thirty_second_timestamp,one_minute_timestamp,three_minute_timestamp,five_minute_timestamp,fifteen_minute_timestamp,last_traded_price,floored_price,floored_5_price,floored_10_price,floored_20_price,volume,buy_volume,sell_volume,delta,open_interest,total_bid_quantity,total_ask_quantity})
	}
}

async function startWebSocket(){
	console.log("Websocket started")

	web_socket = new WebSocketV2({
		jwttoken: jwtToken,
		apikey: '3VCkYkZj',
		clientcode: 'K51661547',
		feedtype: feedToken,
	});


	let nfo_req = {
			correlationID: 'correlation_id',
			action: 1,
			mode : 3,
			exchangeType: 5,
			tokens: crudeoil_tokens.concat([crudeoil_future]),
	};

	web_socket.connect().then((res) => {
	
		web_socket.fetchData(nfo_req);

		web_socket.on('tick', receiveTick);

	});
}

function isWithinMCXHours() {
    const now = new Date();

    // Current date, setting hours to 9:15 AM and 3:30 PM
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 59);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 30);

    // Check if current time is between 9:15 AM and 3:30 PM
    return now >= start && now <= end;
}

(async function(){
	await createTables();
	await login();
	startWebSocket()
	
})()
