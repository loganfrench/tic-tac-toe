var express = require('express');
var app = express();
var path = require('path');
var server = require('http').createServer(app);
var io = require('socket.io')(server);

const port = 2083;
const winningCombos = [
	[0, 1, 2],
	[3, 4, 5],
	[6, 7, 8],
	[0, 3, 6],
	[1, 4, 7],
	[2, 5, 8],
	[0, 4, 8],
	[2, 4, 6],
];

var users = {};
var games = {};

io.on('connection', function(socket) {
	var addedUser = false;

	socket.on('new_user', function(username) {
		if(addedUser) return;
		addedUser = true;

		console.log('Connect: ' + socket.id);
		
		users[socket.id] = {
			socket: socket,
			game: null
		};
		
		socket.emit("update_rooms", games);
		socket.emit("new_user", {
			id: socket.id
		});
	});
	
	socket.on('create_room', function() {
		if(!addedUser) return;

		if(!(socket.id in users)) return socket.disconnect();
		
		for(var i in games) {
			if(games[i].pOne == socket.id || games[i].pSecond == socket.id) return;
		}
		
		var id = (Math.random() + new Date().getTime() * Math.random()).toString(36);
		
		games[id] = {
			status: 0, // 0 - ожидает второго игрока, 1 - ход первого игрока (Х), 2 - ход второго игрока (О)
			pOne: socket.id,
			pSecond: null,
			fields: [
				[null, null, null],
				[null, null, null],
				[null, null, null],
			],
			spectators: [],
			score: {
				draw: 0,
				X: 0,
				O: 0,
			},
			winner: null,
			timer: null,
		};
		
		users[socket.id].game = id;
		
		socket.join(id);
		
		io.to(id).emit("join_room", {
			id: id,
			game: games[id]
		});
		io.to(id).emit("update_game", games[id]);
		
		io.emit("update_rooms", games);
	});
	
	socket.on('join_room', function(id) {
		if(!addedUser) return;
		if(!(socket.id in users)) return;
		
		if(!(id in games)) return socket.emit("leave_room", null);
		
		users[socket.id].game = id;
		socket.join(id);
		
		if(games[id].status != 0) games[id].spectators.push(socket.id);
		else {
			games[id].pSecond = socket.id;
			games[id].status = getRandomInt(1, 2);
		}
		
		socket.emit("join_room", {
			id: id,
			game: games[id]
		});
		
		io.to(id).emit("update_game", games[id]);
		io.to(id).emit("start_game", games[id]);
		io.emit("update_rooms", games);
	});
	
	socket.on('select_square', function(id) {
		if(!addedUser) return;
		
		if(!(socket.id in users)) return;
		if(users[socket.id].game == null) return socket.disconnect();
		
		var gameID = users[socket.id].game;
		
		if(!(gameID in games)) return socket.disconnect();
		
		if(games[gameID].spectators.indexOf(socket.id) != -1) return;
		
		if(games[gameID].status == 0) return;
		else if(games[gameID].status == 1 && socket.id != games[gameID].pOne) return;
		else if(games[gameID].status == 2 && socket.id != games[gameID].pSecond) return;
		
		var id = parseInt(id);
		
		if(isNaN(id)) return;
		if(id < 0 || id > 9) return socket.disconnect();
		
		var sign = games[gameID].pOne == socket.id ? "X" : "O";
		
		if(games[gameID].fields[Math.floor(id / 3)][Math.floor(id % 3)] != null) return;
		
		games[gameID].fields[Math.floor(id / 3)][Math.floor(id % 3)] = sign;
		
		var countFields = 0;
		for(var line in games[gameID].fields) {
			for(var column in games[gameID].fields[line]) {
				if(games[gameID].fields[line][column] != null) countFields++;
			}
		}
		
		var checkWin = checkWins(games[gameID].fields, sign);
		
		if(checkWin || countFields >= 9) {
			games[gameID].status = 3;
			games[gameID].winner = countFields >= 9 && !checkWin ? "draw" : sign;
			games[gameID].score[games[gameID].winner] += 1;
			
			(function() {
				setTimeout(function() {
					if(!(gameID in games)) return;
					games[gameID].status = getRandomInt(1, 2);
					games[gameID].fields = [
						[null, null, null],
						[null, null, null],
						[null, null, null],
					];
					games[gameID].winner = null;
					games[gameID].timer = null;
					
					io.to(gameID).emit("start_game", games[gameID]);
					io.to(gameID).emit("update_game", games[gameID]);
				}, 2 * 1000);
			})();
		}
		else games[gameID].status = games[gameID].status == 1 ? 2 : 1;
		
		io.to(gameID).emit("update_game", games[gameID]);
		io.emit("update_rooms", games);
	});
	
	socket.on('disconnect', function() {
		if(!addedUser) return;
		if(!(socket.id in users)) return;
		
		console.log('Disconnect: ' + socket.id);
		
		if(users[socket.id].game != null) {
			var gameID = users[socket.id].game;
			
			socket.leave(gameID);
			
			if(gameID in games) {
				if(games[gameID].spectators.indexOf(socket.id) != -1) {
					games[gameID].spectators.splice(games[gameID].spectators.indexOf(socket.id), 1);
				}
				else {
					io.to(gameID).emit("leave_room", games[gameID]);
					
					for(var i in games[gameID].spectators) {
						if(games[gameID].spectators[i] in users) {
							users[games[gameID].spectators[i]].game = null;
							socket.leave(gameID);
						}
					}
						
					users[games[gameID].pOne].game = null;
					users[games[gameID].pOne].socket.leave(gameID);
					
					if(games[gameID].pSecond != null) {
						users[games[gameID].pSecond].game = null;
						users[games[gameID].pSecond].socket.leave(gameID);
					}

					delete games[gameID];

					io.emit("update_rooms", games);
				}
			}
		}
		delete users[socket.io];
	});
});

app.use(express.static(path.join(__dirname, 'public')));
server.listen(port, function () {
	console.log('Server listening at port %d', port);
});

function checkWins(fields, sign) {
	for (var i in winningCombos) {
		var count = 0;
		for (var j in winningCombos[i]) {
			var field = fields[Math.floor(winningCombos[i][j] / 3)][Math.floor(winningCombos[i][j] % 3)];
			if(field == sign) count++;
		}
		if(count >= 3) return true;
	}
}

function getRandomInt(min, max) {
	return Math.floor(min + Math.random() * (max + 1 - min));
}