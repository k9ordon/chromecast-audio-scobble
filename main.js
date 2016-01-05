var chromecastPlayer = require('chromecast-player')();
var scribble = require('scribble');
var ping = require('ping');
var express = require('express')
var webapp = express();
var bunyan = require('bunyan');
log = bunyan.createLogger({name: 'chromecast-audo-scrobble'});

var util = require('util');

var config = require('./config.json');

var accounts = config.accounts;
var scrobblers = {};

// STATUS
var STATUS = false;
var LAST_TRACK = false;
var LAST_LAST_FM_RESPONSE = false;
var LAST_PONG = false;

// TIMEOUTS
var TIMEOUT_LASTPONG_TIME = 30 * 1000;
var TIMEOUT_LASTPONG = false;

var TIMEOUT_DISCOVER_TIME = 60 * 1000;
var TIMEOUT_DISCOVER = false;

var createScrobbler = function(account) {
  var scrobbler = new scribble(
    config.lastfm.key,
    config.lastfm.secret,
    account.lastfm_username,
    account.lastfm_password
  );
  return scrobbler;
};

// iterate accounts
// setup scrobblers
accounts.forEach(function(account) {
  if (account.active != true) return false;

  log.info('Added Lastfm account', account.lastfm_username);
  scrobblers[account.lastfm_username] = createScrobbler(account);
});

// discover and init chromecast
var discoverChromecast = function() {
  log.info('discoverChromecast');

  clearTimeout(TIMEOUT_DISCOVER);
  TIMEOUT_DISCOVER = setTimeout(function() {
    log.info('i hase not discoverd :(');
    discoverChromecast();
  },TIMEOUT_DISCOVER_TIME);

  chromecastPlayer.attach(function(err, player) {
    var session = player.currentSession;
    var heartbeat = player.platform.heartbeat;

    STATUS = session.playerState;

    clearTimeout(TIMEOUT_DISCOVER);

    // var platform = util.inspect(player.platform, {showHidden: false, depth: 1});
    log.info('chromecastPlayer attach', STATUS);

    heartbeat.on('message', function(data) {
      LAST_PONG = new Date();

      clearTimeout(TIMEOUT_LASTPONG);
      TIMEOUT_LASTPONG = setTimeout(function() {
        log.info('i hase lost pong :(');
        discoverChromecast();
      },TIMEOUT_LASTPONG_TIME);
      log.info('heartbeat', data);
    });

    player.on('status', onStatus);
  });
}
discoverChromecast();

// on chromecast status change
var onStatus = function(status) {
  // log.info('onStatus', status.playerState);

  STATUS = status.playerState;

  // if we play a track
  if (status.playerState == "PLAYING" && status.media && status.media.metadata) {
    var song = {
      artist: status.media.metadata.artist,
      track: status.media.metadata.songName,
      album: status.media.metadata.albumName
    };

    LAST_TRACK = song.artist + ' - ' + song.track;

    log.info('onStatus', status.playerState, song, util.inspect(status, {showHidden: false, depth: 3}));

    scrobbleSongOnAllScrobblers(song);
  } else {
    log.info('onStatus', status.playerState, util.inspect(status, {showHidden: false, depth: 3}));
  }
}

var onLostPong = function() {

}

var scrobbleSongOnAllScrobblers = function(song) {
  for (var username in scrobblers) {
    scrobbleSong(scrobblers[username], song)
  }
}

var scrobbleSong = function(scrobbler, song) {
  log.info("scrobbleSong", scrobbler.username, song.track);

  // scrobbler.Scrobble(song, function(response) {
  //     LAST_LAST_FM_RESPONSE = response;
  // });
}

// simple http status server
webapp.get('/', function(req, res) {
  res.send("<meta http-equiv='refresh' content='10'><meta name='viewport' content='user-scalable=no, width=device-width, minimum-scale=1.0, maximum-scale=1.0' /><body><pre>" + STATUS + '\n\nLAST_TRACK\n' + LAST_TRACK + '\n\nLAST_PONG\n' + LAST_PONG + '\n\nONLINE_ACCOUNTS\n' + Object.keys(scrobblers).toString() + '\n\nLAST_FM_RESPONSE\n' + LAST_LAST_FM_RESPONSE);
});

webapp.get('/add/:username', function(req, res) {
  var username = req.params.username;
  if (!username) return res.send('no username');

  var account = getAccountFromUsername(username);
  if (!account) return res.send('no user');

  scrobblers[account.lastfm_username] = createScrobbler(account);

  log.info('Added Lastfm account', account.lastfm_username);
  // res.send('added ' + account.lastfm_username);
  res.redirect('/');
});

webapp.get('/remove/:username', function(req, res) {
  var username = req.params.username;
  if (!username) return res.send('no username');

  delete scrobblers[username];

  log.info('Removed Lastfm account', username);
  // res.send('removed ' + account.lastfm_username);
  res.redirect('/');
});

var getAccountFromUsername = function(username) {
  var user = false;
  accounts.forEach(function(account) {
    if (account.lastfm_username === username) user = account;
  });
  return user;
}

webapp.get('/scan', function(req, res) {
  log.info('Scan');
  discoverChromecast();
  res.redirect('/');
});

webapp.listen(8123);
