/* ---------- settings UI ---------- */
function bind(){
  const bs=$('beats');[2,3,4,5,6,7,9,12].forEach(n=>bs.add(new Option(n,n)));
  NOTES.forEach((n,i)=>$('note').add(new Option(n,i)));
  [2,3,4,5].forEach(o=>$('oct').add(new Option('octave '+o,o)));
  const num=['bpm','bars'],sel=['beats','countIn','recClick','note','oct'],chk=['loop','clickOnPlay','vibrate','hearLayers','echo','refCountIn'],rng=['clickVol','guideVol'];
  num.forEach(id=>$(id).value=S[id]);sel.forEach(id=>$(id).value=S[id]);chk.forEach(id=>$(id).checked=S[id]);rng.forEach(id=>$(id).value=S[id]);
  const changed=restart=>{save();buildDots();resetVisualIfIdle();if(restart&&T&&T.mode==='play'){stopTransport();startTransport('play')}};
  $('bpm').onchange=e=>{S.bpm=Math.max(30,Math.min(260,Math.round(+e.target.value||90)));e.target.value=S.bpm;changed(true)};
  $('bars').onchange=e=>{S.bars=Math.max(1,Math.min(64,Math.round(+e.target.value||4)));e.target.value=S.bars;changed(true)};
  $('bpmDown').onclick=()=>{S.bpm=Math.max(30,S.bpm-1);$('bpm').value=S.bpm;changed(true)};
  $('bpmUp').onclick=()=>{S.bpm=Math.min(260,S.bpm+1);$('bpm').value=S.bpm;changed(true)};
  sel.forEach(id=>$(id).onchange=e=>{S[id]=['recClick'].includes(id)?e.target.value:+e.target.value;changed(id==='beats')});
  chk.forEach(id=>$(id).onchange=e=>{S[id]=e.target.checked;changed(false)});
  rng.forEach(id=>$(id).oninput=e=>{S[id]=+e.target.value;save();if(id==='guideVol'&&T&&T.mode==='record')trackBus.gain.setTargetAtTime(S.guideVol,ctx.currentTime,0.02)});
  $('loop').onchange=e=>{S.loop=e.target.checked;save();if(T&&T.mode==='play'){stopTransport();startTransport('play')}};
  let taps=[];
  $('tap').onclick=()=>{
    const now=performance.now();taps=taps.filter(t=>now-t<2500);taps.push(now);
    if(taps.length>=2){const iv=(taps[taps.length-1]-taps[0])/(taps.length-1);S.bpm=Math.max(30,Math.min(260,Math.round(60000/iv)));$('bpm').value=S.bpm;changed(false)}
  };
  $('playNote').onclick=async()=>{await ensureCtx();tone(ctx.currentTime+0.02,1.6,noteFreq(),0.3)};
  $('latMs').value=S.latencyMs??'';
  $('latMs').placeholder='auto';
  $('latMs').onchange=e=>{const v=e.target.value;S.latencyMs=v===''?null:Math.max(0,Math.min(600,Math.round(+v)));save();showLat()};
  $('calBtn').onclick=calibrate;
  $('recBtn').onclick=()=>{
    if(T&&T.mode==='record'){const t=stopTransport();t.onDone&&t.onDone(false,t);return}
    doRecord(null);
  };
  $('playBtn').onclick=async()=>{
    if(T){stopTransport();return}
    await ensureCtx();startTransport('play');
  };
  $('exportBtn').onclick=exportMix;
  let armed=false;
  $('newBtn').onclick=e=>{
    if(!tracks.length)return;
    if(!armed){armed=true;e.target.textContent='Tap again to delete all layers';setTimeout(()=>{armed=false;e.target.textContent='New session (delete all layers)'},3000);return}
    stopTransport();tracks.forEach(tr=>{try{tr.g.disconnect();tr.p&&tr.p.disconnect()}catch(_){}});tracks=[];nextId=1;
    renderTracks();updateUI();status('New session');armed=false;e.target.textContent='New session (delete all layers)';
  };
}
function resetVisualIfIdle(){if(!T)resetVisual();document.querySelectorAll('.track canvas').forEach((cv,i)=>tracks[i]&&drawWave(tracks[i],cv))}
function showLat(){$('latInfo').textContent=S.latencyMs==null?'Not calibrated yet – using an estimate.':`Using ${S.latencyMs} ms.`}

bind();buildDots();resetVisual();renderTracks();updateUI();showLat();
