(function(){
  'use strict';
  var cfg = window.playerConfig || {};
  var video = document.getElementById('video');
  var shell = document.getElementById('playerShell');
  var playPause = document.getElementById('playPause');
  var seekBack = document.getElementById('seekBack');
  var seekForward = document.getElementById('seekForward');
  var muteBtn = document.getElementById('muteBtn');
  var nextEpisodeBtn = document.getElementById('nextEpisodeBtn');
  var pipBtn = document.getElementById('pipBtn');
  var fsBtn = document.getElementById('fsBtn');
  var playerBack = document.getElementById('playerBack');
  var playerStatus = document.getElementById('playerStatus');
  var playerBar = document.getElementById('playerBar');
  var playerBuffer = document.getElementById('playerBuffer');
  var currentTimeEl = document.getElementById('currentTime');
  var durationTimeEl = document.getElementById('durationTime');
  var playerTimeline = document.getElementById('playerTimeline');
  var bigPlay = document.getElementById('bigPlay');
  var bigPlayBtn = document.getElementById('bigPlayBtn');
  var retryBtn = document.getElementById('retryBtn');
  var reconnectBtn = document.getElementById('reconnectBtn');
  var copyUrlBtn = document.getElementById('copyUrlBtn');
  var playerError = document.getElementById('playerError');
  var playerErrorText = document.getElementById('playerErrorText');

  var hls = null;
  var hideTimer = null;
  var focusNav = new TVSpatialNavigator();

  function fmt(sec){
    if(!sec || isNaN(sec)) return '00:00';
    sec = Math.floor(sec);
    var h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
    if(h > 0) return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  }

  function setStatus(t){ if(playerStatus) playerStatus.textContent = t || ''; }
  function showError(t){ playerErrorText.textContent = t || 'Kaynak açılamadı'; playerError.hidden = false; refreshNav(playerError); }
  function hideError(){ playerError.hidden = true; refreshNav(document); }

  function refreshNav(scope){
    var items = Array.from((scope || document).querySelectorAll('.selector')).filter(function(el){ return !el.closest('[hidden]'); });
    focusNav.setCollection(items);
    if(items.length) focusNav.focus(items[0]);
  }

  focusNav.on('focus', function(e){ if(e.elem) e.elem.classList.add('focus'); });
  focusNav.on('unfocus', function(e){ if(e.elem) e.elem.classList.remove('focus'); });

  function hideUiLater(){
    clearTimeout(hideTimer);
    shell.classList.remove('hide-player-ui');
    if(!video.paused){
      hideTimer = setTimeout(function(){ shell.classList.add('hide-player-ui'); }, 4500);
    }
  }

  function saveProgress(){
    try{
      var key = cfg.itemId || cfg.rawUrl;
      var progress = JSON.parse(localStorage.getItem('f_progress') || '{}');
      progress[key] = Math.floor(video.currentTime || 0);
      localStorage.setItem('f_progress', JSON.stringify(progress));
    }catch(e){}
  }

  function restoreProgress(){
    try{
      var key = cfg.itemId || cfg.rawUrl;
      var progress = JSON.parse(localStorage.getItem('f_progress') || '{}');
      var t = progress[key];
      if(t && t > 8) video.currentTime = t;
    }catch(e){}
  }

  function updateButtons(){
    playPause.textContent = video.paused ? 'PLAY' : 'PAUSE';
    muteBtn.textContent = video.muted ? 'UNMUTE' : 'MUTE';
  }

  function play(){
    video.play().then(function(){ hideError(); hideUiLater(); updateButtons(); setStatus('Oynuyor'); }).catch(function(){
      bigPlay.hidden = false;
      setStatus('Başlatmak için PLAY');
    });
  }

  
  function attach(){
    hideError();

    if(hls){
      try{ hls.destroy(); }catch(e){}
      hls = null;
    }

    var raw = cfg.rawUrl || '';
    var proxy = cfg.playbackUrl || '';
    var lower = raw.toLowerCase();
    var isM3u8 = lower.indexOf('.m3u8') !== -1;
    var isFile = /\.(mp4|mkv|ts|m4v|mov)(\?|$)/i.test(raw);

    // Render üzerinde büyük dosyalarda proxy sorun çıkarabildiği için
    // dosya tabanlı streamlerde direct-first gidiyoruz.
    var source = raw || proxy;
    if(isM3u8){
      source = proxy || raw;
    }else if(isFile){
      source = raw || proxy;
    }else{
      source = raw || proxy;
    }

    setStatus('Kaynak bağlanıyor');

    if(isM3u8 && window.Hls && Hls.isSupported()){
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 90
      });
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, function(){
        restoreProgress();
        play();
        setStatus('HLS hazır');
      });
      hls.on(Hls.Events.ERROR, function(_, data){
        if(data && data.fatal){
          // HLS proxy bozarsa direct dene
          if(source !== raw && raw){
            try{ hls.destroy(); }catch(e){}
            hls = null;
            video.src = raw;
            video.load();
            video.addEventListener('loadedmetadata', function onMeta(){
              video.removeEventListener('loadedmetadata', onMeta);
              restoreProgress();
              play();
              setStatus('Direct kaynak hazır');
            }, { once:true });
            return;
          }
          showError('HLS hata: ' + (data.details || 'bilinmeyen'));
        }
      });
      return;
    }

    video.src = source;
    video.load();
    video.addEventListener('loadedmetadata', function onMeta(){
      video.removeEventListener('loadedmetadata', onMeta);
      restoreProgress();
      play();
      setStatus(source === raw ? 'Direct kaynak hazır' : 'Proxy kaynak hazır');
    }, { once:true });
  }


  playPause.addEventListener('click', function(){
    if(video.paused) play(); else { video.pause(); updateButtons(); setStatus('Duraklatıldı'); shell.classList.remove('hide-player-ui'); }
  });
  seekBack.addEventListener('click', function(){ video.currentTime = Math.max(0, (video.currentTime || 0) - 10); hideUiLater(); });
  seekForward.addEventListener('click', function(){ video.currentTime = Math.min(video.duration || 0, (video.currentTime || 0) + 10); hideUiLater(); });
  muteBtn.addEventListener('click', function(){ video.muted = !video.muted; if(!video.muted && video.volume < 0.1) video.volume = 1; updateButtons(); hideUiLater(); });
  pipBtn.addEventListener('click', async function(){ try{ if(document.pictureInPictureElement) await document.exitPictureInPicture(); else if(video.requestPictureInPicture) await video.requestPictureInPicture(); }catch(e){} hideUiLater(); });
  fsBtn.addEventListener('click', function(){ if(document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); hideUiLater(); });
  playerBack.addEventListener('click', function(){ window.history.back(); });
  bigPlayBtn.addEventListener('click', function(){ bigPlay.hidden = true; play(); });
  if(nextEpisodeBtn){ nextEpisodeBtn.addEventListener('click', function(){ if(cfg.nextEpisodeUrl) window.location.href = cfg.nextEpisodeUrl; }); }
  retryBtn.addEventListener('click', function(){ hideError(); attach(); });
  copyUrlBtn.addEventListener('click', function(){ navigator.clipboard.writeText(cfg.rawUrl || cfg.playbackUrl || ''); setStatus('URL kopyalandı'); });
  reconnectBtn.addEventListener('click', function(){ hideError(); attach(); });

  playerTimeline.addEventListener('click', function(e){
    var rect = playerTimeline.getBoundingClientRect();
    var pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if(video.duration) video.currentTime = pct * video.duration;
    hideUiLater();
  });

  video.addEventListener('timeupdate', function(){
    currentTimeEl.textContent = fmt(video.currentTime);
    durationTimeEl.textContent = fmt(video.duration);
    if(video.duration) playerBar.style.width = ((video.currentTime / video.duration) * 100) + '%';
  });
  video.addEventListener('progress', function(){
    try{
      if(video.duration && video.buffered.length){
        var end = video.buffered.end(video.buffered.length - 1);
        playerBuffer.style.width = Math.min(100, (end / video.duration) * 100) + '%';
      }
    }catch(e){}
  });
  video.addEventListener('playing', function(){ bigPlay.hidden = true; updateButtons(); hideUiLater(); });
  video.addEventListener('pause', function(){ updateButtons(); if(video.currentTime > 0 && !video.ended) bigPlay.hidden = false; });
  video.addEventListener('error', function(){
    var raw = cfg.rawUrl || '';
    var proxy = cfg.playbackUrl || '';
    var current = video.currentSrc || video.src || '';
    var canFallbackToRaw = raw && current !== raw;
    var canFallbackToProxy = proxy && current !== proxy;

    if(canFallbackToRaw){
      setStatus('Direct kaynağa geçiliyor');
      video.src = raw;
      video.load();
      play();
      return;
    }

    if(canFallbackToProxy){
      setStatus('Proxy kaynağa geçiliyor');
      video.src = proxy;
      video.load();
      play();
      return;
    }

    showError('Akış bağlantısı koptu. Tekrar dene veya sonraki bölüme geç.');
  });

  ['mousemove','keydown','click','touchstart'].forEach(function(evt){ document.addEventListener(evt, hideUiLater, true); });
  setInterval(function(){ if(!video.paused) saveProgress(); }, 5000);

  TVRemote.bind(function(action){
    if(!playerError.hidden){
      if(action === 'back'){ playerError.hidden = true; refreshNav(document); return; }
      if(action === 'left' || action === 'right' || action === 'up' || action === 'down'){ focusNav.move(action); return; }
      if(action === 'enter'){ var focused = focusNav.getFocusedElement(); if(focused) focused.click(); return; }
      return;
    }
    if(action === 'left'){ seekBack.click(); return; }
    if(action === 'right'){ seekForward.click(); return; }
    if(action === 'up'){ video.volume = Math.min(1, (video.volume || 1) + 0.1); video.muted = false; updateButtons(); hideUiLater(); return; }
    if(action === 'down'){ video.volume = Math.max(0, (video.volume || 1) - 0.1); if(video.volume === 0) video.muted = true; updateButtons(); hideUiLater(); return; }
    if(action === 'enter' || action === 'playpause'){ playPause.click(); return; }
    if(action === 'play'){ if(video.paused) playPause.click(); return; }
    if(action === 'pause'){ if(!video.paused) playPause.click(); return; }
    if(action === 'back'){ window.history.back(); return; }
    if(action === 'ff'){ seekForward.click(); return; }
    if(action === 'play' && nextEpisodeBtn && !nextEpisodeBtn.hidden && cfg.nextEpisodeUrl && video.ended){ nextEpisodeBtn.click(); return; }
    if(action === 'rw'){ seekBack.click(); return; }
  });

  document.addEventListener('DOMContentLoaded', function(){ if(nextEpisodeBtn && !cfg.nextEpisodeUrl) nextEpisodeBtn.hidden = true;
    refreshNav(document);
    attach();
    if(window.attachContinueWatching){ attachContinueWatching(video,cfg); }
    updateButtons();
  });
})();
              
