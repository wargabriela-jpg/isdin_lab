(function () {
  'use strict';
  const $=id=>document.getElementById(id);
  const audio=new AudioEngine();
  const params={sensitivity:1.8,motion:1,brightness:1,speed:1,size:45};
  let orb=null,recorder=null,loading=false,webglLost=false,downloadURL=null,loadVersion=0,toastTimer=0;
  let videoOutput=null,frameOwner=window,frameRequest=0;
  let previous=performance.now(),lastUI=0,narrativeGain=0,restoreAfterFullscreen=false,idleTimer=0;
  const narrativeSmooth={};
  const presetMarkerStates=new Map();let activePreset=null;
  const canvas=$('orb-canvas');
  const playIcon='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const pauseIcon='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  function notify(message,persistent=false){
    clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;
    if(!persistent)toastTimer=setTimeout(()=>$('toast').hidden=true,6500);
  }
  function timeLabel(t){
    if(!Number.isFinite(t))return '--:--';
    const minutes=Math.floor(t/60),seconds=Math.floor(t%60),tenth=Math.floor((t%1)*10);
    return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}.${tenth}`;
  }
  const markers=new NarrativeMarkers($('marker-editor'),{
    getTime:()=>audio.currentTime,getDuration:()=>audio.duration,onChange:()=>updateMarkerTicks()
  });
  $('official-script').textContent=NarrativeMarkers.SCRIPT;
  function updateMarkerTicks(){
    const container=$('timeline-markers');container.replaceChildren();
    if(!audio.duration)return;
    for(const marker of markers.exportJSON().markers){
      if(marker.time===null||marker.time>audio.duration)continue;
      const tick=document.createElement('i');tick.style.left=`${marker.time/audio.duration*100}%`;container.append(tick);
    }
  }
  function syncControls(){
    const busy=Boolean(recorder?.busy),disabled=!audio.loaded||loading||busy;
    $('play').disabled=disabled;$('restart').disabled=disabled;$('timeline').disabled=disabled;
    $('audio-file').disabled=loading||busy;$('audio-preset').disabled=loading||busy;
    $('export').disabled=!audio.loaded||!orb||webglLost||!recorder?.supported||loading||busy||Boolean(videoOutput?.active);
    $('video-output').disabled=!orb||webglLost||busy;
    $('play').innerHTML=audio.playing?pauseIcon:playIcon;
    $('play').setAttribute('aria-label',audio.playing?'Pausar':'Reproducir');
    $('stop-export').hidden=!recorder?.active;
    for(const id of ['markers-file','markers-save','markers-clear','sensitivity','motion','brightness','speed','size','reset-visual'])$(id).disabled=busy;
    for(const view of markers.rows.values()){
      view.input.disabled=busy;view.capture.disabled=busy||!audio.loaded;
    }
    document.body.classList.toggle('recording',busy);
  }
  try {
    orb=new OrbRenderer(canvas);
    recorder=new OrbRecorder({audio,orb,
      onState:(state,detail)=>{
        if(state==='recording'){
          $('export-note').textContent='Grabando en tiempo real. Mantén esta pestaña visible.';
          $('export').textContent='Grabando…';
        }else if(state==='finalizing'){
          $('export-note').textContent=detail||'Preparando el archivo WebM…';
          $('export').textContent='Finalizando…';
        }else if(state==='idle'){
          $('export').innerHTML='<span aria-hidden="true">↗</span> Exportar con audio';
        }
        syncControls();
      },
      onComplete:(blob,mime,info)=>{
        if(downloadURL)URL.revokeObjectURL(downloadURL);
        downloadURL=URL.createObjectURL(blob);
        const link=$('download-export');link.href=downloadURL;link.download=info.partial?'isdin-lab-parcial.webm':'isdin-lab.webm';
        link.textContent=info.partial?'Descargar WebM parcial':'Descargar WebM';link.hidden=false;link.click();
        $('export-note').textContent=`${info.partial?'Exportación parcial':'Exportación completa'} · ${(blob.size/1048576).toFixed(1)} MB`;
        notify(info.partial?(info.reason||'Grabación parcial guardada.'):'WebM listo con la pista de audio original.');
      },
      onError:error=>{notify(error.message||String(error));$('export-note').textContent='No se completó la exportación. Revisa el mensaje.';syncControls();}
    });
    if(!recorder.supported)$('export-note').textContent='WebM no disponible aquí. Abre el proyecto en Chrome o Edge actualizados.';
  }catch(error){
    $('webgl-error').hidden=false;$('webgl-error').textContent=`No se pudo iniciar WebGL. ${error.message} Prueba Chrome o Edge con aceleración gráfica activada.`;
    console.error(error);
  }
  videoOutput=new VideoOutput({canvas,
    onChange:active=>{
      if(orb){orb.exporting=active;if(active)orb.setSize(1920,1080);else orb.resize();}
      $('video-output').textContent=active?'Cerrar salida de video':'↗ Salida de video';
      $('video-output').setAttribute('aria-pressed',String(active));
      $('video-output-status').textContent=active?'Salida abierta · F o doble clic para pantalla completa.':'Ventana limpia · 1920 × 1080 · sin textos.';
      syncControls();handleVisibilityChange();
    },
    onVisibility:()=>handleVisibilityChange(),onError:message=>notify(message)
  });
  $('video-output').addEventListener('click',()=>{
    try{if(videoOutput.active)videoOutput.close();else videoOutput.open();}catch(error){notify(error.message);}
  });
  window.addEventListener('beforeunload',()=>videoOutput?.close());
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();webglLost=true;videoOutput?.close();audio.pause();if(recorder?.busy)recorder.stop(true);syncControls();
    $('webgl-error').hidden=false;$('webgl-error').textContent='Se ha perdido el contexto WebGL. Guarda los marcadores y recarga la página para recuperar la visualización.';
    notify('WebGL interrumpido. Recarga la página para recuperar la visualización.',true);
  });

  async function loadAudioFile(file,{bundled=false,presetId=null}={}){
    const version=++loadVersion;loading=true;syncControls();$('file-info').textContent='Decodificando audio local…';
    try{
      const result=await audio.load(file);if(version!==loadVersion)return;
      if(activePreset)presetMarkerStates.set(activePreset,markers.exportJSON());
      markers.clear();markers.setDuration(result.duration);
      const saved=presetId&&(presetMarkerStates.get(presetId)||window.ISDIN_AUDIO_OPTIONS?.[presetId]?.markers);
      if(saved)markers.importJSON(saved);
      activePreset=presetId;
      $('audio-preset').value=presetId||'custom';
      $('audio-preset').querySelector('[value="custom"]').hidden=Boolean(presetId);
      document.querySelector('#panel-markers .panel-intro small').textContent=saved
        ?'Marcadores guardados para el audio incluido.'
        :'Los marcadores complementan la voz. Asigna los tiempos de este audio.';
      $('file-name').textContent=result.name;$('file-info').textContent=`${timeLabel(result.duration)} · ${bundled?'Audio final incluido':'Audio local listo'}`;
      $('duration').textContent=timeLabel(result.duration);$('timeline').max=String(result.duration);
      $('download-export').hidden=true;
      $('export-note').textContent=recorder?.supported?'Exporta la locución completa desde el inicio.':'Para exportar WebM utiliza Chrome o Edge actualizado.';
      if(!bundled)notify('Audio cargado. Asigna los marcadores narrativos a esta locución.');
    }catch(error){
      if(version!==loadVersion)return;
      $('audio-preset').value=activePreset||'custom';
      if(error.name!=='AbortError')notify(error.message);
      $('file-info').textContent=audio.loaded?`${timeLabel(audio.duration)} · Se conserva el audio anterior`:'Selecciona un WAV o MP3 válido';
    }finally{if(version===loadVersion){loading=false;syncControls();}}
  }
  async function loadAudioPreset(id){
    const preset=window.ISDIN_AUDIO_OPTIONS?.[id];if(!preset)return;
    try{
      const bytes=Uint8Array.from(atob(preset.base64),character=>character.charCodeAt(0));
      await loadAudioFile(new File([bytes],preset.name,{type:'audio/mpeg'}),{bundled:true,presetId:id});
    }catch(error){notify('No se pudo abrir el audio incluido: '+error.message);$('audio-preset').value=activePreset||'custom';}
  }
  $('audio-preset').addEventListener('change',event=>loadAudioPreset(event.target.value));
  $('audio-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    await loadAudioFile(file);event.target.value='';
  });

  async function togglePlayback(){
    if(!audio.loaded||loading||recorder?.busy)return;
    try{if(audio.playing)audio.pause();else await audio.play();}catch(error){notify(error.message);}syncControls();
  }
  $('play').addEventListener('click',togglePlayback);
  $('restart').addEventListener('click',()=>{audio.restart();syncControls();});
  $('timeline').addEventListener('input',event=>{if(!recorder?.busy)audio.seek(Number(event.target.value));syncControls();});
  audio.onended=()=>{if(recorder?.active)recorder.stop(false);syncControls();};

  function updateParam(id){
    params[id]=Number($(id).value);
    $(id).style.setProperty('--fill',`${(params[id]-Number($(id).min))/(Number($(id).max)-Number($(id).min))*100}%`);
    $(id+'-value').textContent=id==='size'?`${params[id]}%`:id==='sensitivity'||id==='speed'?`${params[id].toFixed(1)}×`:`${Math.round(params[id]*100)}%`;
  }
  for(const id of Object.keys(params)){$(id).addEventListener('input',()=>updateParam(id));updateParam(id);}
  $('reset-visual').addEventListener('click',()=>{
    for(const [id,value] of Object.entries({sensitivity:1.8,motion:1,brightness:1,speed:1,size:45})){$(id).value=String(value);updateParam(id);}
  });
  function selectPanel(name){
    for(const tab of document.querySelectorAll('[role=tab]')){
      const selected=tab.dataset.panel===name;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;
      $('panel-'+tab.dataset.panel).hidden=!selected;
    }
  }
  document.querySelectorAll('[role=tab]').forEach(tab=>{
    tab.addEventListener('click',()=>selectPanel(tab.dataset.panel));
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      event.preventDefault();const tabs=[...document.querySelectorAll('[role=tab]')];const index=tabs.indexOf(tab);
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      selectPanel(tabs[next].dataset.panel);tabs[next].focus();
    });
  });selectPanel('visual');

  $('markers-save').addEventListener('click',()=>{
    const data={...markers.exportJSON(),audio:{name:audio.fileName||null,duration:audio.duration||null}};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='isdin-lab-marcadores.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  });
  $('markers-file').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    try{
      if(file.size>1024*1024)throw new Error('El JSON es demasiado grande. Usa un archivo de marcadores menor de 1 MB.');
      const data=JSON.parse(await file.text());const count=markers.importJSON(data);
      const mismatch=data.audio?.name&&audio.loaded&&data.audio.name!==audio.fileName;
      notify(`${count} marcadores importados.${mismatch?' El audio tiene otro nombre: revisa los tiempos.':''}`);
    }catch(error){notify(`No se pudieron abrir los marcadores: ${error.message}`);}finally{event.target.value='';}
  });
  $('markers-clear').addEventListener('click',()=>{markers.clear();notify('Tiempos narrativos borrados.');});
  $('export').addEventListener('click',async()=>{
    if(recorder&&!recorder.busy){
      $('download-export').hidden=true;
      try{await recorder.start();}catch(_){/* Recorder reports the error through onError. */}
    }
  });
  $('stop-export').addEventListener('click',()=>recorder?.stop(true));

  function setClean(clean){
    document.body.classList.toggle('clean-view',clean);$('restore-ui').hidden=!clean;
    if(clean)$('toast').hidden=true;
    $('clean').setAttribute('aria-pressed',String(clean));wakePointer();orb?.resize();
  }
  function wakePointer(){
    clearTimeout(idleTimer);document.body.classList.remove('idle-cursor');
    if(document.body.classList.contains('clean-view'))idleTimer=setTimeout(()=>document.body.classList.add('idle-cursor'),2500);
  }
  document.addEventListener('pointermove',wakePointer,{passive:true});
  document.addEventListener('pointerdown',wakePointer,{passive:true});
  function toggleClean(){setClean(!document.body.classList.contains('clean-view'));}
  async function toggleFullscreen(){
    try{
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen){
        restoreAfterFullscreen=!document.body.classList.contains('clean-view');
        await document.documentElement.requestFullscreen();setClean(true);
      }
      else throw new Error('Pantalla completa no disponible aquí. Usa la opción de pantalla completa del navegador.');
    }catch(error){notify(error.message);}
  }
  $('clean').addEventListener('click',toggleClean);$('restore-ui').addEventListener('click',toggleClean);
  $('fullscreen').addEventListener('click',toggleFullscreen);
  document.addEventListener('fullscreenchange',()=>{
    const active=Boolean(document.fullscreenElement);$('fullscreen').setAttribute('aria-label',active?'Salir de pantalla completa':'Pantalla completa');
    if(!active&&restoreAfterFullscreen){setClean(false);restoreAfterFullscreen=false;}orb?.resize();
  });
  document.addEventListener('keydown',event=>{
    if(event.ctrlKey||event.altKey||event.metaKey||event.repeat||event.target.closest('input,textarea,select,[contenteditable=true]'))return;
    if(event.code==='Space'&&!event.target.closest('button,a')){event.preventDefault();togglePlayback();}
    else if(event.key.toLowerCase()==='h'){event.preventDefault();toggleClean();}
    else if(event.key.toLowerCase()==='f'){event.preventDefault();toggleFullscreen();}
  });
  function scheduleFrame(){
    // Drive the existing renderer from the visible output window when the
    // control tab is hidden. Use this page's clock to avoid time-origin jumps.
    frameOwner=videoOutput?.visible?videoOutput.window:window;
    frameRequest=frameOwner.requestAnimationFrame(()=>frame(performance.now()));
  }
  function handleVisibilityChange(){
    previous=performance.now();
    if(!frameOwner.closed)frameOwner.cancelAnimationFrame(frameRequest);
    scheduleFrame();
    if(document.hidden&&!videoOutput?.visible&&audio.playing&&!recorder?.busy){audio.pause();syncControls();notify('Reproducción pausada al ocultar la pestaña.');}
  }
  document.addEventListener('visibilitychange',handleVisibilityChange);

  function frame(now){
    scheduleFrame();
    const rawDt=Math.max(.001,(now-previous)/1000),dt=Math.min(.1,rawDt);previous=now;
    if(document.hidden&&!videoOutput?.visible)return;
    const features=audio.analyze(dt,params.sensitivity);
    features.playing=audio.playing;
    const target=markers.evaluate(audio.currentTime);
    narrativeGain+=((audio.playing?1:0)-narrativeGain)*(1-Math.exp(-dt/.3));
    for(const [key,value] of Object.entries(target)){
      if(typeof value!=='number')continue;
      const desired=value*narrativeGain;
      narrativeSmooth[key]=(narrativeSmooth[key]||0)+(desired-(narrativeSmooth[key]||0))*(1-Math.exp(-dt/.045));
    }
    if(orb&&!webglLost)orb.render(rawDt,features,narrativeSmooth,params);
    if(now-lastUI>80){
      lastUI=now;$('timeline').value=String(audio.currentTime);$('current-time').textContent=timeLabel(audio.currentTime);
      $('timeline').style.setProperty('--fill',`${audio.duration?audio.currentTime/audio.duration*100:0}%`);
      for(const band of ['bass','mid','treble'])$('meter-'+band).style.transform=`scaleX(${features[band]})`;
      $('rms-label').textContent=`RMS ${features.rms.toFixed(3)}`;
      $('analysis-note').textContent=audio.playing?(features.rms>.0015?'Señal de voz · Respuesta activa':orb?.voiceDrive>0?'Pausa vocal · Deteniendo movimiento':'Silencio · Movimiento detenido'):audio.loaded?'Locución lista · En reposo':'En reposo · Sin señal de audio';
      $('session-status').textContent=recorder?.busy?'Exportación en curso':audio.playing?(orb?.voiceDrive>0?'Respondiendo a la voz':'Pausa vocal'):'En espera de voz';
      markers.update(audio.currentTime);
      const expected=audio.playing?'Pausar':'Reproducir';if($('play').getAttribute('aria-label')!==expected)syncControls();
    }
  }
  syncControls();scheduleFrame();
  // Read-only diagnostics for integration checks; no external communication.
  window.ISDIN={audio,markers,orb,recorder,params,videoOutput};
  async function loadIncludedAudio(){
    loading=true;syncControls();
    loading=false;
    if(window.ISDIN_AUDIO_OPTIONS)await loadAudioPreset('audio-1');else syncControls();
  }
  loadIncludedAudio();
}());
