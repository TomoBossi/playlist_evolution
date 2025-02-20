// Inner logic / Backend

history.scrollRestoration = "manual";
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Windows Phone|Opera Mini/i.test(navigator.userAgent);
const randomStarterTrack = true;
const statefulPlaylistEditing = false;
const eventLoopRefreshMs = 50;
let currentVolume = 0.5 + 0.5*isMobile;

let player = document.getElementById("player");
let shuffle = false;
let replay = false;
let custom = false;
let anchor = false;
let anchorScrollException = false;

let fullPlaylist;
let fullPlaylistLength;
let currentTrackFullPlaylistIndex;
let currentTrack;
let currentTrackDuration = 0;
let currentTrackElapsed = 0;

let playlist = [];
let currentTrackIndex = -1;

let continuingTracks;

let qsParams;
let digitLogger = "";
let playableTracks = [];
let uidMap = {}

let played_bar = document.getElementById("played_bar_bg");

init();
checkForStateChanges()

async function init() {
  const res = await fetch("./playlist.json");
  fullPlaylist = await res.json();
  fullPlaylistLength = Object.keys(fullPlaylist).length;
  continuingTracks = flagContinuing();

  for (let index in fullPlaylist) {
    uidMap[fullPlaylist[index]["uid"]] = index;
  }

  await buildHTML();
  
  qsParams = parseQsParams();
  if (isNaN(qsParams.track) && qsParams.playlist.length == 0) {
    currentTrackFullPlaylistIndex = randomIndex() * randomStarterTrack;
  } else {
    if (!isNaN(qsParams.track)) {
      currentTrackFullPlaylistIndex = qsParams.track;
    }
    if (qsParams.playlist.length > 0) {
      if (!currentTrackFullPlaylistIndex) {
        currentTrackFullPlaylistIndex = qsParams.playlist[0];
      }
      setPlaylist(qsParams.playlist);
    }
    autoScroll();
  }

  currentTrack = fullPlaylist[currentTrackFullPlaylistIndex];
  playIndex(currentTrackFullPlaylistIndex);
}

function setupPlayer(track) {
  player.setAttribute("src", track["file"]);
  if (track["file"].split('.').pop() === "flac") {
    player.setAttribute("type", "audio/flac");
  } else {
    player.setAttribute("type", "audio/mp3");
  }
}

function checkForStateChanges() {
  setInterval(() => {
      if (currentTrack !== undefined) {
        currentTrackElapsed = 0;
        currentTrackDuration = 0;
        currentTrackElapsed = player.currentTime - seconds(currentTrack["start"]);
        updateCurrentTrackDuration();
        updatePlayedBar();

        if (currentTrackElapsed > 0 &&
            currentTrackDuration > 0 &&
            currentTrackElapsed >= currentTrackDuration) {
          playNext(1, false);
        }
      }
    },
    eventLoopRefreshMs
  );
}

function playIndex(index, continuing = false, manual = false, updateState = true) {
  paused = false;
  dehighlightCurrentTrack();
  currentTrackFullPlaylistIndex = index;
  updateCurrentTrackIndex();

  if (continuing && manual && currentTrackDuration - currentTrackElapsed > 2*eventLoopRefreshMs/1000) {
    player.fastSeek(seconds(currentTrack["end"]));
  }

  if (continuing && replay) {
    seek(0);
  }

  currentTrack = fullPlaylist[currentTrackFullPlaylistIndex];
  if (!continuing) {
    let end = seconds(currentTrack["end"]);
    if (continuingTracks[currentTrackFullPlaylistIndex][0]) {
      end = continuingTracks[currentTrackFullPlaylistIndex][1];
    }

    let muted = false;
    if (player !== undefined) {
      muted = player.muted;
      player.pause();
    }
    setupPlayer(currentTrack);
    changeVolume(0.0);
    player.muted = muted;
    player.play();
    player.fastSeek(seconds(currentTrack["start"]));
  }
  
  if (updateState) {
    updateUrl();
  }
  updateDisplay();
  if (anchor) {
    autoScroll();
  }
}

function playNext(step = 1, manual = false) {
  let nextIndex = movedIndex(step);
  continuing = 
    step > 0 && 
    !shuffle && 
    nextIndex == currentTrackFullPlaylistIndex + 1 && 
    continuingTracks[currentTrackFullPlaylistIndex][0];
  playIndex(nextIndex, continuing, manual);
}

function movedIndex(step) {
  let index = currentTrackFullPlaylistIndex;
  if (!replay) {
    if (shuffle) {
      index = randomIndex();
    } else {
      if (playlist.length > 0) {
        index = playlist.length + currentTrackIndex + step;
        index %= playlist.length;
        index = playlist[index];
      } else {
        index += fullPlaylistLength + step;
        index %= fullPlaylistLength;
      }
    }
  }
  return index;
}

function togglePause() {
  if (player !== undefined) {
    if (!player.paused) {
      player.pause();
    } else {
      player.play();
    }
  }
}

function seek(second) {
  if (player !== undefined) {
    second = Math.max(second, seconds(currentTrack["start"]));
    if (second >= currentTrackDuration + seconds(currentTrack["start"])) {
      playNext(1, true);
    } else {
      player.fastSeek(second);
    }
  }
}

function seekFraction(fraction) {
  seek(fraction * currentTrackDuration + seconds(currentTrack["start"]));
}

function skip(seconds) {
  seek(player.currentTime + seconds);
}

function seekLogged() {
  if (digitLogger) {
    seekFraction(parseFloat("0." + digitLogger));
  }
}

function restartCurrentTrack() {
  seek(0);
}

function changeVolume(volumeDelta) {
  currentVolume = Math.min(Math.max(currentVolume + volumeDelta, 0), 1);
  player.volume = currentVolume * (currentTrack["volume_multiplier"] ?? 1.0);
}

function playLogged() {
  setSelectedAsDigitLogger();
  if (digitLogger) {
    let index = Number(digitLogger) % fullPlaylistLength;
    if (playableTracks.includes(index.toString())) {
      replay = false;
      player.muted = false;
      playIndex(index, false, true);
    }
  }
}

function playState() {
  qsParams = parseQsParams();
  if (!isNaN(qsParams.track) && qsParams.track != currentTrackFullPlaylistIndex) {
    replay = false;
    playIndex(qsParams.track, false, true, false);
  }
  setPlaylist(qsParams.playlist);
}

function toggleMute() {
  if (player !== undefined) {
    if (!player.muted) {
      player.muted = true;
    } else {
      player.muted = false;
    }
  }
}

function toggleShuffle() {
  shuffle = !shuffle;
}

function toggleReplay() {
  replay = !replay;
}

function toggleAnchor(e) {
  e.preventDefault();
  anchor = !anchor;
  autoScroll();
}

function updateCurrentTrackDuration() {
  currentTrackDuration = Math.max(seconds(currentTrack["end"]) - seconds(currentTrack["start"]), 0);
  currentTrackDuration += (player.duration - seconds(currentTrack["start"])) * (currentTrackDuration == 0);
  currentTrackDuration = Math.max(currentTrackDuration, 0);
}

function updateDigitLogger(key) {
  if (!(isNaN(Number(key)) || key === null || key === ' ')) {
    digitLogger += key;
  } else {
    digitLogger = "";
  }
}

function randomIndex() {
  if (playlist.length > 0) {
    return playlist[Math.floor(Math.random() * playlist.length)];
  }
  return Math.floor(Math.random() * fullPlaylistLength);
}

function updateCurrentTrackIndex() {
  let index = playlist.indexOf(currentTrackFullPlaylistIndex);
  if (index > -1) {
    currentTrackIndex = index;
  }
}

// Interaction

document.addEventListener(
  "scroll", 
  (e) => {
    if (!anchorScrollException) {
      anchor = false;
      updateTitle();
    } else {
      anchorScrollException = false;
    }
  }
);

played_bar.addEventListener(
  "click",
  (e) => {
    seekFraction(e.clientX/played_bar.offsetWidth);
  }
);

window.addEventListener("popstate", playState);
window.addEventListener("pushstate", playState);

document.addEventListener(
  "keydown",
  (e) => {
    // console.log(e.key);
    // console.log(e.code);
    let caseMatched = true;
    if (player !== undefined) {
      switch (e.code) {
        case "Enter":
          e.preventDefault();
          playLogged();
          break;
        case "Space":
          e.preventDefault();
          togglePause();
          break;
        case "KeyM":
          toggleMute();
          break;
        case "KeyZ":
          toggleShuffle();
          break;
        case "KeyX":
          toggleReplay();
          break;
        case "KeyR":
          restartCurrentTrack();
          break;
        case "KeyS":
          changeVolume(-0.05);
          break;
        case "KeyW":
          changeVolume(0.05);
          break;
        case "KeyA":
          playNext(-1, true);
          break;
        case "KeyD":
          playNext(1, true);
          break;
        case "KeyQ":
          skip(-5);
          break;
        case "KeyE":
          skip(5);
          break;
        case "KeyI":
          editPlaylist(currentTrackFullPlaylistIndex);
          updatePlaylistDisplay();
          break;
        case "KeyP":
          insertToPlaylist();
          updatePlaylistDisplay();
          break;
        case "Period":
          seekLogged();
          break;
        case "Tab":
          toggleAnchor(e);
          break;
        case "Backspace":
          digitLogger = "";
          break;
        case "Escape":
          deletePlaylist();
          updatePlaylistDisplay(true);
          break;
        default:
          caseMatched = false;
      }
      updateDigitLogger(e.key);
      if (caseMatched) {
        updateDisplay();
      }
    }
  },
  false
);

// Graphics

async function buildHTML() {
  const tracklist = document.getElementById("tracklist");
  const cover_large_div = document.getElementById("cover_large_div");
  const cover_large = document.createElement("img");
  cover_large.setAttribute("src", "");
  cover_large.setAttribute("id", "cover_large");
  cover_large.classList.add("prevent-select");
  cover_large_div.appendChild(cover_large);
  cover_large_div.setAttribute("onclick", "hideCover()");
  let totalPlaylistDuration = 0;

  Object.keys(fullPlaylist).forEach(index => {
    const div_row = document.createElement("div");
    const div_info = document.createElement("div");
    const title = document.createElement("h3");
    const album_artists = document.createElement("p");
    const duration = document.createElement("h4");
    const playlistIndex = document.createElement("h5");
    const cover_div = document.createElement("div");
    const cover = document.createElement("img");
    let thumb_cover_path = "img/cover_art/" + fullPlaylist[index]["album_cover"].slice(0, -4) + "_50.jpg";
    let trackDuration = trackDurationForDisplay(index);
    let formattedDuration = "??:??";
    let formattedPlaylistIndex = "0000 |";

    title.innerHTML = `${"<span class=\"index\">" + index.padStart(4, '0') + "</span> " + fullPlaylist[index]["title"]}`;
    album_artists.innerHTML = `${fullPlaylist[index]["album"] + " - " + fullPlaylist[index]["artists"]}`;
    playlistIndex.innerHTML = formattedPlaylistIndex;

    cover.setAttribute("src", thumb_cover_path);
    cover.setAttribute("onclick", `showCover(${index})`);
    cover.classList.add("cover-thumb");
    title.classList.add("prevent-select");
    album_artists.classList.add("prevent-select");
    duration.classList.add("prevent-select");
    playlistIndex.classList.add("prevent-select");
    cover.classList.add("prevent-select");
    div_info.classList.add("info");

    div_info.appendChild(title);
    div_info.appendChild(album_artists);
    div_info.appendChild(duration);
    div_info.appendChild(playlistIndex);
    cover_div.appendChild(cover);
    div_row.appendChild(cover_div);
    div_row.appendChild(div_info);

    title.classList.add("fade");
    album_artists.classList.add("fade");
    cover_div.classList.add("cover-placeholder");
    div_row.setAttribute("id", index);
    if (!isMobile) { div_row.classList.add("hover"); }

    if (continuingTracks[index][0]) {
      div_row.classList.add("continuing");
    }

    playableTracks.push(index);
    div_row.setAttribute("ondblclick", `playIndex(${index})`);
    if (isMobile) { div_row.setAttribute("onclick", `playIndex(${index})`); }
    if (trackDuration < 3600*2) {
      formattedDuration = formattedParsedDuration(trackDuration);
      totalPlaylistDuration += trackDuration;
    }

    duration.innerHTML = formattedDuration;
    tracklist.appendChild(div_row);
  });
  const [totalDays, totalHours, totalMinutes, totalSeconds] = parseDuration(totalPlaylistDuration);
  const playlist_duration = document.getElementById("playlist_duration");
  playlist_duration.innerHTML = `Total length (no rain): ${totalDays} days, ${totalHours} hours, ${totalMinutes} minutes and ${totalSeconds} seconds`;
}

function showCover(index) {
  let cover_large_path = "img/cover_art/" + fullPlaylist[index]["album_cover"].slice(0, -4) + "_440.jpg";
  const cover_large_div = document.getElementById("cover_large_div");
  const cover_large = document.getElementById("cover_large");
  cover_large.setAttribute("src", cover_large_path);
  cover_large.style.opacity = "1";
  cover_large_div.style.zIndex = "100";
}

function hideCover() {
  const cover_large_div = document.getElementById("cover_large_div");
  const cover_large = document.getElementById("cover_large");
  cover_large.style.opacity = "0";
  cover_large_div.style.zIndex = "-1";
  cover_large.setAttribute("src", "");
}

function autoScroll() {
  anchorScrollException = true;
  window.scrollTo(0, window.scrollY + document.getElementById(currentTrackFullPlaylistIndex).getBoundingClientRect().top);
}

function highlightCurrentTrack() {
  document.getElementById(currentTrackFullPlaylistIndex).setAttribute("playing", "true");
}

function dehighlightCurrentTrack() {
  document.getElementById(currentTrackFullPlaylistIndex).setAttribute("playing", "false");
}

function updateDisplay() {
  updateTitle();
  updatePlayedBar();
  highlightCurrentTrack();
}

function updateTitle() {
  let title = currentTrack["title"] + " - " + currentTrack["artists"];
  title += " | \u{1F50A}" + Math.round(100*currentVolume) + "%";
  title = "\u{1F507} ".repeat(player.muted) + title;
  title = "\u2693\uFE0F ".repeat(anchor) + title;
  title = "\u25B6\uFE0F ".repeat(!player.paused) + title;
  title = "\u23F8\uFE0F ".repeat(player.paused) + title;
  title = "\u{1F500} ".repeat(shuffle) + title;
  title = "\u{1F501} ".repeat(replay) + title;
  title = "\u{1F49F} ".repeat(custom) + title;
  document.title = title;
}

function updateUrl() {
  let paramsTrack = currentTrack["uid"];
  let paramsPlaylist = playlist.map(idx => fullPlaylist[idx]["uid"]).join(",");
  let qs = "?track=" + paramsTrack;
  if (paramsPlaylist) {
    qs += "&playlist=" + paramsPlaylist;
  }
  window.history.pushState(null, "", qs);
}

function seconds(time) {
  if (time === null) {
    return 0;
  }

  const [hours, minutes, secDecimals] = time.split(':');
  const [sec, decimals] = secDecimals.split('.');
  let totalSeconds = +hours * 3600 + +minutes * 60 + +sec
  if (decimals) {
    totalSeconds += +decimals/10**decimals.length;
  }
  return totalSeconds;
}

function trackDurationForDisplay(index) {
  let displayDuration = Math.max(seconds(fullPlaylist[index]["end"]) - seconds(fullPlaylist[index]["start"]), 0);
  displayDuration += (seconds(fullPlaylist[index]["duration"]) - seconds(fullPlaylist[index]["start"])) * (displayDuration == 0);
  return displayDuration;
}

function updatePlayedBar() {
  let played_proportion = Math.min(currentTrackElapsed/currentTrackDuration, 1);
  document.getElementById("played_bar").style.width = `${100*played_proportion}%`;
}

function parseDuration(seconds) {
  seconds = Math.floor(seconds)
  let perDay = 60*60*24;
  let perHr = 60*60;
  let perMin = 60;
  let days = Math.floor(seconds / perDay);
  seconds -= days*perDay;
  let hours = Math.floor(seconds / perHr);
  seconds -= hours*perHr;
  let minutes = Math.floor(seconds / perMin);
  seconds -= minutes*perMin;
  return [days, hours, minutes, seconds];
}

function formattedParsedDuration(totalSeconds) {
  let [days, hours, minutes, seconds] = parseDuration(totalSeconds);
  minutes = minutes + 60*hours + 24*60*days;
  return minutes.toString().padStart(2, '0') + ":" + seconds.toString().padStart(2, '0');
}

function deletePlaylist() {
  playlist = [];
  currentTrackIndex = -1;
  if (custom && statefulPlaylistEditing) {
    updateUrl();
  }
  custom = false;
}

function editPlaylist(trackIndex) {
  let index = playlist.indexOf(trackIndex);
  custom = true;
  if (index > -1) {
    playlist.splice(index, 1);
    if (playlist.length === 0) {
        custom = false;
    }
  } else {
    if (digitLogger) {
      index = Number(digitLogger) % playlist.length;
      playlist.splice(index, 0, trackIndex);
      currentTrackIndex = index;
    } else {
      playlist.push(trackIndex);
      currentTrackIndex = playlist.length - 1;
    }
  }
  updateDisplay();
  if (statefulPlaylistEditing) {
    updateUrl();
  }
}

function insertToPlaylist() {
  setSelectedAsDigitLogger();
  if (digitLogger) {
    let trackIndex = Number(digitLogger) % fullPlaylistLength;
    digitLogger = "";
    editPlaylist(trackIndex);
  } else {
    editPlaylist(currentTrackFullPlaylistIndex);
  }
}

function setPlaylist(newPlaylist) {
  custom = newPlaylist.length > 0;
  playlist = newPlaylist;
  updatePlaylistDisplay();
  currentTrackIndex = playlist.indexOf(currentTrackFullPlaylistIndex);
  if (custom && currentTrackIndex == -1) {
    currentTrackIndex = 0;
  }
}

function getInsideContainer(containerID, childID) {
    let element = document.getElementById(childID);
    let parent = element ? element.parentNode : {};
    return (parent.id && parent.id === containerID) ? element : {};
}

function updatePlaylistDisplay(clear = false) {
  let div_row;
  let indexDisplay;
  Object.keys(fullPlaylist).forEach(index => {
    div_row = document.getElementById(index);
    indexDisplay = div_row.querySelector("h5");
    div_row.setAttribute("playlist", "false");
    indexDisplay.innerHTML = "0000 |";
  });
  if (!clear) {
    for (let [playlistIndex, index] of playlist.entries()) {
      div_row = document.getElementById(index);
      indexDisplay = div_row.querySelector("h5");
      div_row.setAttribute("playlist", "true");
      indexDisplay.innerHTML = `${playlistIndex.toString().padStart(4, '0') + " |"}`;
    }
  }
}

function flagContinuing() {
  let res = [];
  Object.keys(fullPlaylist).forEach(index => {
    res[index] = [
      index < fullPlaylistLength - 1 && 
      fullPlaylist[index]["file"] == fullPlaylist[Number(index)+1]["file"] &&
      fullPlaylist[index]["end"] == fullPlaylist[Number(index)+1]["start"], 
      null
    ];
  });
  let last_seen_end = null;
  for (let i = fullPlaylistLength - 1; i >= 0; i--) {
    if (res[i][0]) {
        res[i][1] = last_seen_end;
    } else {
        last_seen_end = fullPlaylist[i]["end"]
    }
  }
  return res;
}

function parseQsParams() {
  let params = new URLSearchParams(window.location.href.split("?").pop());
  let paramsTrack = NaN;
  let paramsPlaylist = [];
  if (params.has("track")) {
    let input = params.get("track");
    paramsTrack = Number(uidMap[input] ?? input) % fullPlaylistLength;
  }
  if (params.has("playlist")) {
    paramsPlaylist = [...new Set(params.get("playlist").split(",").map((input) => Number(uidMap[input] ?? input) % fullPlaylistLength).filter((input) => !isNaN(input)))]
  }
  return {
    track: paramsTrack,
    playlist: paramsPlaylist
  };
}

function isNumeric(value) {
  return /^-?\d+$/.test(value);
}

function getSelected() {
  try {
    let selected = document.getSelection().focusNode.parentNode.parentNode.parentNode.id;
    if (isNumeric(selected)) {
      return selected;
    }
  } catch {}
}

function setSelectedAsDigitLogger() {
  let selected = getSelected();
  if (!digitLogger && selected != undefined) {
    digitLogger = selected;
  }
}