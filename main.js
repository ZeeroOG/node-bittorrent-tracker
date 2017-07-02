var sqlite3 = require('sqlite3').verbose();
var express = require('express')
var ipv4 = require('express-ipv4');

var db = new sqlite3.Database('peers.db');
var app = express()

const MAX_NUMWANT = 500; // Max peer list sent on request
const INTERVAL = 15 * 60; // Announce interval (in seconds)
const PEER_RETENTION = 60 * 60 * 12; // Retention time of a peer in DB after last update (in seconds)
const CLEAN_INTERVAL = 30; // Interval between database cleaning

app.get('/', function (req, res) {
	res.send('hello world')
})

app.get('/announce/', function (req, res) {
	var info_hash = req.query.info_hash;
	var peer_id = req.query.peer_id;
	var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	var port = req.query.port;
	var uploaded = req.query.uploaded;
	var downloaded = req.query.downloaded;
	var left = req.query.left;
	var numwant = req.query.numwant || 50;
	var status = req.query.event || "";
	var last_update = Math.floor(Date.now() / 1000);

	db.serialize(function() {
		var update = false;

		var stmt = db.prepare('SELECT rowid AS id FROM peers WHERE info_hash = ? AND peer_id = ?');
		stmt.each(info_hash, peer_id, function(err, row) {
			update = true;
			var id = row.id;
		});
		stmt.finalize();

		if (update) {
			var stmt = db.prepare('UPDATE peers SET info_hash = ?, peer_id = ?, ip = ?, port = ?, uploaded = ?, downloaded = ?, dl_left = ?, status = ?, numwant = ?, last_update = ? WHERE id = ?');
			stmt.run(info_hash, peer_id, ip, port, uploaded, downloaded, left, status, numwant, last_update, id);
		} else {
			var stmt = db.prepare('INSERT INTO peers (info_hash, peer_id, ip, port, uploaded, downloaded, dl_left, status, numwant, last_update) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
			stmt.run(info_hash, peer_id, ip, port, uploaded, downloaded, left, status, numwant, last_update);
		}
	});

	var ret = "d8:intervali" + INTERVAL + "e5:peersl";

	db.serialize(function() {
		var stmt = db.prepare('SELECT peer_id, ip, port FROM peers WHERE info_hash = ? ORDER BY downloaded DESC, dl_left ASC, uploaded DESC LIMIT ?');
		stmt.each(info_hash, numwant, function(err, row) {
			line = "d2:id20:" + row.peer_id + "2:ip" + row.ip.length + ":" + row.ip + "4:porti" + row.port + "ee";
			console.log('hello ' + row.ip);
			ret += line
		});
	});

	ret += "ee";

	res.send(ret)
})

// Init. database
db.serialize(function() {
	db.run("DROP TABLE peers");
	db.run("CREATE TABLE IF NOT EXISTS peers (info_hash TEXT, peer_id TEXT, ip TEXT, port INTEGER, uploaded INTEGER, downloaded INTEGER, dl_left INTEGER, status TEXT, numwant INTEGER, last_update INTEGER)");
});

// Clean database
setInterval(function() {
	var current = Math.floor(Date.now() / 1000);
	var limit = current - PEER_RETENTION;

	db.serialize(function() {
		var stmt = db.prepare("DELETE FROM peers WHERE last_update < ?")
  		stmt.run(limit);
	});

	console.log('[' + current + '] Databse cleaned.');
}, CLEAN_INTERVAL * 1000);

app.listen(3000);
//db.close();
