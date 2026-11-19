/* ---------- track UI ---------- */
function drawWave(tr,cv){
  const dpr=window.devicePixelRatio||1,w=cv.clientWidth,h=cv.clientHeight;if(!w)return;
  cv.width=w*dpr;cv.height=h*dpr;const g=cv.getContext('2d');g.scale(dpr,dpr);g.clearRect(0,0,w,h);
  const lb=loopBeats();
  for(let b=0;b<lb;b++){g.fillStyle=b%S.beats===0?'rgba(255,255,255,.22)':'rgba(255,255,255,.07)';g.fillRect(Math.round(b/lb*w),0,1,h)}
  const d=tr.buffer.getChannelData(0),n=d.length,step=n/w,shift=tr.nudge/1000*tr.buffer.sampleRate;
  g.fillStyle=tr.color;
  for(let x=0;x<w;x++){
    const a=Math.max(0,Math.floor(x*step-shift)),b=Math.min(n,Math.floor((x+1)*step-shift));let m=0;
    for(let i=a;i<b;i+=3){const v=Math.abs(d[i]);if(v>m)m=v}
    const hh=Math.max(1,Math.min(1,m)*h*0.95);g.fillRect(x,(h-hh)/2,1,hh);
  }
}
function renderTracks(){
  const wrap=$('tracks');wrap.innerHTML='';
  $('empty').hidden=tracks.length>0;
  tracks.forEach(tr=>{
    const el=document.createElement('div');el.className='track'+(isOn(tr)?'':' off');el.style.setProperty('--c',tr.color);
    el.innerHTML=`<div class="trow"><input class="name" aria-label="Layer name"><button class="m">M</button><button class="s">S</button><button class="more" aria-label="More">⋯</button></div>
<div class="wave"><canvas></canvas><div class="ph"></div></div>
<div class="tctl"${tr.open?'':' hidden'}>
<div class="rowc"><label>Volume</label><input type="range" class="vol" min="0" max="1.5" step="0.01"></div>
<div class="rowc"><label>Pan</label><input type="range" class="pan" min="-1" max="1" step="0.05"></div>
<div class="rowc"><label>Timing</label><button class="nm">−10ms</button><span class="nud"></span><button class="np">+10ms</button></div>
<div class="rowc"><button class="redo">● Redo this take</button><button class="del danger">Delete</button></div></div>`;
    const q=s=>el.querySelector(s);
    q('.name').value=tr.name;q('.name').oninput=e=>tr.name=e.target.value;
    q('.m').classList.toggle('on',tr.mute);q('.s').classList.toggle('on',tr.solo);
    q('.m').onclick=()=>{tr.mute=!tr.mute;applyGains();renderTracks()};
    q('.s').onclick=()=>{tr.solo=!tr.solo;applyGains();renderTracks()};
    q('.more').onclick=()=>{tr.open=!tr.open;q('.tctl').hidden=!tr.open};
    q('.vol').value=tr.vol;q('.vol').oninput=e=>{tr.vol=+e.target.value;applyGains()};
    q('.pan').value=tr.pan;q('.pan').oninput=e=>{tr.pan=+e.target.value;applyGains()};
    const nud=()=>{q('.nud').textContent=(tr.nudge>0?'+':'')+tr.nudge+' ms';drawWave(tr,q('canvas'))};
    q('.nm').onclick=()=>{tr.nudge-=10;nud()};q('.np').onclick=()=>{tr.nudge+=10;nud()};
    q('.redo').onclick=()=>doRecord(tr);
    let armed=false;
    q('.del').onclick=e=>{
      if(!armed){armed=true;e.target.textContent='Tap again to delete';setTimeout(()=>{armed=false;e.target.textContent='Delete'},2500);return}
      try{tr.g.disconnect();tr.p&&tr.p.disconnect()}catch(_){}
      tracks=tracks.filter(x=>x!==tr);renderTracks();updateUI();
    };
    wrap.appendChild(el);
    nud();
  });
  wrap.classList.toggle('playing',!!T);
  lockSettings();
}
window.addEventListener('resize',()=>{document.querySelectorAll('.track canvas').forEach((cv,i)=>tracks[i]&&drawWave(tracks[i],cv))});

function updateUI(){
  const rec=T&&T.mode==='record',play=T&&T.mode==='play';
  $('recBtn').textContent=rec?'■ Cancel take':'● Record layer';$('recBtn').classList.toggle('cancel',!!rec);
  $('recBtn').disabled=!!play;
  $('playBtn').textContent=play?'■ Stop':(tracks.length?'▶ Play':'▶ Metronome');$('playBtn').classList.toggle('on',!!play);
  $('playBtn').disabled=!!rec;
  $('tracks').classList.toggle('playing',!!T);
  document.querySelectorAll('.redo,.del').forEach(b=>b.disabled=!!T);
  $('calBtn').disabled=!!T||busy;
}
function lockSettings(){
  const lock=tracks.length>0;
  ['bpm','bpmDown','bpmUp','tap','beats','bars'].forEach(id=>$(id).disabled=lock);
  $('lockNote').hidden=!lock;
}
