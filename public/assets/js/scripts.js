var socket;

var user = {
	id: null,
	game: null,
	gameFields: null,
	you: null, // true - X, false - O
	step: null, // true - client step, false - friend step
};

$(function () {	
	socket = io();

	socket.emit('new_user');
	
	socket.on("new_user", function(data) {
		$("#main_block").fadeIn('slow');
		$("#my-id").text(data.id);
		user.id = data.id;
		
		var room = new URLSearchParams(window.location.search).get('room');
		if(room != undefined) joinRoom(room);
	});
	
	socket.on("join_room", function(data) {
		$("#main_block").hide();
		$("#game_block").fadeIn('slow');
		
		history.replaceState(null, null, "?room=" + data.id);
		
		if(data.game.spectators.indexOf(user.id) == -1) user.you = data.game.pOne == user.id ? true : false;

		$("#status_game").text(getStatusGame(data.game.status));
		$("#play_for").text(getPlayFor(user.you));
		
		user.game = data.id;
		
		$("#x-score").text(data.game.score.X);
		$("#o-score").text(data.game.score.O);
		$("#draw-score").text(data.game.score.draw);
	});
	
	socket.on("start_game", function(game) {
		$("#play_for").text(getPlayFor(user.you));
		
		$("#modal").css("display", "none");
		
		if(game.spectators.indexOf(user.id) != -1) return;
		
		user.you = game.pOne == user.id ? true : false;
		
		if(game.status == 1 && user.you) user.step = true;
		else if(game.status == 2 && !user.you) user.step = true;
		else user.step = false;
		
		if(user.step) addHover();
		
		$(".square").each(function(e) {
			$(this).attr("id", e);
			
			$(this).click(function(e) {
				selectSquare(e.target.id);
			});
		});
	});
	
	socket.on("update_game", function(game) {
		$("#status_game").text(getStatusGame(game.status));
		
		if(game.spectators.indexOf(user.id) == -1) {
			if(game.status == 1 && user.you) user.step = true;
			else if(game.status == 2 && !user.you) user.step = true;
			else user.step = false;

			if(user.step) {
				setTimeout(function() {
					addHover();
				}, 25);
			}
		}
		
		console.log(game);
		
		user.gameFields = game.fields;

		for(var line in game.fields) {
			for(var column in game.fields[line]) {
				$("#game_block #" + (parseInt(line) * 3 + parseInt(column))).text(game.fields[line][column] != null ? game.fields[line][column] : "");
				if(game.fields[line][column] != null) {
					(function(line, column) {
						setTimeout(function() {
							$("#game_block #" + (parseInt(line) * 3 + parseInt(column))).removeClass("sq-hov");
						}, 25)
					})(line, column)
				}
			}
		}
		
		if(game.status == 3) {
			removeHover();
			$("#modal").css("display", "block");
			$("#game-over-message").text(game.winner == "draw" ? "Ничья" : (game.winner + " победил!"));
			
			$("#x-score").text(game.score.X);
			$("#o-score").text(game.score.O);
			$("#draw-score").text(game.score.draw);
		}
	});
	
	socket.on("leave_room", function(game) {
		$("#modal").css("display", "block");
		$("#game-over-message").text(game == null ? "Игры не существует" : "Один из игроков вышел");
		setTimeout(function() {
			$("#modal").css("display", "none");
			leaveRoom();
		}, 2 * 1000);
	});
	
	socket.on("update_rooms", function(data) {
		$("#rooms").html('');
		for(var i in data) {
			$("#rooms").append(
				'<a href="#" onclick="joinRoom(\'' + i + '\');return false;">' +
					'<div class="media text-muted pt-3">' +
						'<p class="media-body pb-3 mb-0 small lh-125 border-bottom border-gray">' +
							'<strong class="d-block text-gray-dark">@' + i + '</strong>' +
							(data[i].status == 0 ? "Ожидает игрока" : "Идет игра") +
						'</p>' +
					'</div>' +
				'</a>'
			);
		}
	});
	
	socket.on("reconnect", function() {
		$("#main_block").fadeOut('fast');
		$("#game_block").fadeOut('fast');
		$("#error_block").fadeIn('slow');
	});

});

function createRoom() {
	socket.emit("create_room");
}

function joinRoom(id) {
	socket.emit("join_room", id);
}

function selectSquare(id) {
	if(user.game == null || !user.step) return;
	if(user.gameFields[Math.floor(id / 3)][Math.floor(id % 3)] != null) return;
	user.gameFields[Math.floor(id / 3)][Math.floor(id % 3)] = user.you ? "X" : "O";
	removeHover();
	$("#status_game").text("Переход хода");
	$("#game_block #" + id).text(user.you ? "X" : "O");
	$("#game_block #" + id).removeClass("sq-hov");
	socket.emit("select_square", id);
}

function addHover() {
	$(".square").each(function(e) {
		$(this).addClass('sq-hov');
	});
}

function removeHover() {
	$(".square").each(function(e) {
		$(this).removeClass('sq-hov');
	});
}

function leaveRoom() {
	user.game = null;
	user.gameFields = null;
	user.you = null;
	user.step = null;
	$("#game_block").fadeOut('fast');
	$("#main_block").fadeIn('slow');
	history.replaceState(null, null, "/");
}

/* get's */

function getStatusGame(status) {
	switch(status) {
		case 0: return "Ожидание игроков";
		case 1: return "Ход Х";
		case 2: return "Ход О";
		default: return null;
	}
} 

function getPlayFor(you) {
	if(you == null) return "Следящий";
	return you ? "X" : "O";
} 
