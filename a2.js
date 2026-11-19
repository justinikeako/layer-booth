/* ---------- visuals ---------- */
const box=$('beatbox');
function buildDots(){
  $('dots').innerHTML='';
  for(let i=0;i<S.beats;i++){const d=document.createElement('div');d.className='dot'+(i===0?' first':'');$('dots').appendChild(d)}
}
function posText(){return `${S.bpm} BPM · ${S.beats} beats/bar · ${S.bars} bar${S.bars>1?'s':''} (${loopLen().toFixed(1)}s)`}
function resetVisual(){
  box.classList.remove('rec','flash','acc');
  $('lbl').textContent='Ready';$('big').textContent='♪';$('pos').textContent=posText();
  document.querySelectorAll('.dot').forEach(d=>d.classList.remove('on'));
  document.documentElement.style.setProperty('--ph','0%');
}
let flashTO;
function showBeat(ev){
  const dots=document.querySelectorAll('.dot');
  dots.forEach((d,i)=>d.classList.toggle('on',i===ev.inBar));
  box.classList.toggle('rec',T.mode==='record');
  box.classList.add('flash');box.classList.toggle('acc',ev.inBar===0);
  clearTimeout(flashTO);flashTO=setTimeout(()=>box.classList.remove('flash','acc'),Math.min(120,T.bd*400));
  if(ev.counting){
    $('lbl').textContent=T.mode==='record'?'Get ready…':'Count-in';
    $('big').textContent=-ev.b<=S.beats?String(-ev.b):String(ev.inBar+1);
    $('pos').textContent='Recording starts after the count';
  }else{
    const bar=Math.floor(ev.b/S.beats)%S.bars+1;
    $('lbl').textContent=T.mode==='record'?'● Recording – sing!':'Playing';
    $('big').textContent=String(ev.inBar+1);
    $('pos').textContent=`Bar ${bar} of ${S.bars}`;
  }
  if(S.vibrate&&navigator.vibrate){try{navigator.vibrate(ev.inBar===0?45:20)}catch(e){}}
}
function frame(){
  requestAnimationFrame(frame);
  if(!T||!ctx)return;
  const now=ctx.currentTime;let ev=null;
  while(T.vis.length&&T.vis[0].t<=now)ev=T.vis.shift();
  if(ev)showBeat(ev);
  const L=T.lb*T.bd;
  const p=now>=T.t0?((now-T.t0)%L)/L:0;
  document.documentElement.style.setProperty('--ph',(p*100).toFixed(2)+'%');
}
requestAnimationFrame(frame);

/* ---------- recording ---------- */
async function getMic(echo){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia)throw new Error('unsupported');
  return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:echo,noiseSuppression:false,autoGainControl:false,channelCount:1}});
}
function micError(e){
  status('');
  const msg=(e&&e.name==='NotAllowedError')||(e&&e.message==='unsupported')
    ?'Microphone blocked. Allow mic access for this page in your browser settings. If you opened this inside another app, open it in Chrome or Safari instead.'
    :'Could not start the microphone: '+(e&&e.message||e);
  $('lbl').textContent='Mic problem';$('big').textContent='🎤';$('pos').textContent=msg;
}
async function makeRecorder(src){
  const chunks=[];const sink=ctx.createGain();sink.gain.value=0;sink.connect(ctx.destination);
  if(workletOK){
    const node=new AudioWorkletNode(ctx,'rec',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
    src.connect(node);node.connect(sink);
    let res;const done=new Promise(r=>res=r);
    node.port.onmessage=e=>{if(e.data.done)res();else chunks.push(e.data)};
    return{chunks,start(){node.port.postMessage('start')},
      async stop(){node.port.postMessage('stop');await Promise.race([done,new Promise(r=>setTimeout(r,600))]);try{src.disconnect();node.disconnect();sink.disconnect()}catch(e){}}};
  }
  const sz=2048,sp=ctx.createScriptProcessor(sz,1,1);let on=false;
  sp.onaudioprocess=e=>{if(on)chunks.push({t:ctx.currentTime-sz/ctx.sampleRate,d:new Float32Array(e.inputBuffer.getChannelData(0))})};
  src.connect(sp);sp.connect(sink);
  return{chunks,start(){on=true},async stop(){on=false;try{src.disconnect();sp.disconnect();sink.disconnect()}catch(e){}}};
}
function place(chunks,start,len){
  const sr=ctx.sampleRate,out=new Float32Array(len);
  for(const c of chunks){
    const idx=Math.round((c.t-start)*sr),d=c.d;
    const i0=Math.max(0,-idx),i1=Math.min(d.length,len-idx);
    for(let i=i0;i<i1;i++)out[idx+i]=d[i];
  }
  return out;
}
function buildTake(chunks,start,dur){
  if(!chunks.length)return null;
  const sr=ctx.sampleRate,len=Math.round(dur*sr),out=place(chunks,start,len);
  let pk=0;for(let i=0;i<len;i++){const v=Math.abs(out[i]);if(v>pk)pk=v}
  if(pk<1e-4)return null;
  const gain=Math.min(6,0.8/pk);
  const f=Math.min(Math.round(0.008*sr),len>>2);
  for(let i=0;i<len;i++){let g=gain;if(i<f)g*=i/f;else if(i>len-1-f)g*=(len-1-i)/f;out[i]*=g}
  const b=ctx.createBuffer(1,len,sr);b.getChannelData(0).set(out);return b;
}
let busy=false;
async function doRecord(replace){
  if(T||busy)return;busy=true;
  try{await ensureCtx()}catch(e){busy=false;status('Audio could not start');return}
  setSession('play-and-record');status('Opening mic…');
  let stream;
  try{stream=await getMic(S.echo)}catch(e){busy=false;setSession('playback');micError(e);return}
  const src=ctx.createMediaStreamSource(stream);
  const rec=await makeRecorder(src);rec.start();status(replace?'Re-recording '+replace.name:'Recording layer '+(tracks.length+1));
  startTransport('record',{excludeId:replace&&replace.id,onDone:async(ok,t)=>{
    await rec.stop();stream.getTracks().forEach(x=>x.stop());setSession('playback');busy=false;
    if(!ok){status('Take discarded');updateUI();return}
    const buf=buildTake(rec.chunks,t.t0+latency(),t.lb*t.bd);
    if(!buf){status('No sound captured – check the mic');updateUI();return}
    if(replace&&tracks.includes(replace)){replace.buffer=buf;status(replace.name+' replaced')}
    else{addTrack(buf);status('Layer added')}
    applyGains();renderTracks();updateUI();
  }});
  busy=false;
}
