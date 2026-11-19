/* ---------- calibration ---------- */
async function calibrate(){
  if(T||busy)return;busy=true;$('calBtn').disabled=true;
  $('latInfo').textContent='Listening… keep quiet for 6 seconds.';
  try{
    await ensureCtx();setSession('play-and-record');
    const stream=await getMic(false);
    const src=ctx.createMediaStreamSource(stream);const rec=await makeRecorder(src);rec.start();
    const n=10,gap=0.5,t0=ctx.currentTime+0.8;
    for(let i=0;i<n;i++){
      const t=t0+i*gap,o=ctx.createOscillator(),g=ctx.createGain();
      o.type='square';o.frequency.value=2000;g.gain.setValueAtTime(0.9,t);g.gain.exponentialRampToValueAtTime(0.0001,t+0.02);
      o.connect(g);g.connect(master);o.start(t);o.stop(t+0.03);
    }
    await new Promise(r=>setTimeout(r,(0.8+n*gap+0.7)*1000));
    await rec.stop();stream.getTracks().forEach(x=>x.stop());setSession('playback');
    const ch=rec.chunks;if(!ch.length)throw new Error('no audio');
    const sr=ctx.sampleRate,base=ch[0].t,last=ch[ch.length-1];
    const len=Math.round((last.t-base)*sr)+last.d.length,data=place(ch,base,len);
    const lats=[];
    for(let i=0;i<n;i++){
      const a=Math.round((t0+i*gap-base)*sr),w=Math.round(0.45*sr);
      const na=Math.max(0,a-Math.round(0.12*sr)),nb=Math.max(0,a-Math.round(0.02*sr));
      let nz=0;for(let k=na;k<nb;k++)nz+=Math.abs(data[k]);nz=nb>na?nz/(nb-na):0;
      let M=0;for(let k=a;k<Math.min(len,a+w);k++){const v=Math.abs(data[k]);if(v>M)M=v}
      if(M<0.01||M<nz*8)continue;
      const th=Math.max(nz*6,M*0.3);
      for(let k=a;k<Math.min(len,a+w);k++){if(Math.abs(data[k])>=th){lats.push((k-a)/sr);break}}
    }
    lats.sort((x,y)=>x-y);
    const med=lats.length?lats[lats.length>>1]:0;
    const mad=lats.length?lats.map(x=>Math.abs(x-med)).sort((x,y)=>x-y)[lats.length>>1]:1;
    if(lats.length>=6&&mad<0.005&&med>0&&med<0.45){
      S.latencyMs=Math.round(med*1000);save();$('latMs').value=S.latencyMs;
      $('latInfo').textContent=`Done: measured ${S.latencyMs} ms (heard ${lats.length}/10 clicks).`;
    }else{
      $('latInfo').textContent=`Couldn't hear the clicks clearly (${lats.length}/10). Turn the volume up, make the room quieter, and try again.`;
    }
  }catch(e){
    setSession('playback');
    $('latInfo').textContent=(e&&e.name==='NotAllowedError')?'Microphone blocked – allow mic access and try again.':'Calibration failed: '+(e&&e.message||e);
  }
  busy=false;$('calBtn').disabled=false;
}

/* ---------- export ---------- */
function encodeWav(ab){
  const nc=ab.numberOfChannels,len=ab.length,sr=ab.sampleRate,chs=[];
  for(let c=0;c<nc;c++)chs.push(ab.getChannelData(c));
  let pk=0;for(const d of chs)for(let i=0;i<len;i++){const v=Math.abs(d[i]);if(v>pk)pk=v}
  const g=pk>0.98?0.98/pk:1;
  const buf=new ArrayBuffer(44+len*nc*2),v=new DataView(buf);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
  ws(0,'RIFF');v.setUint32(4,36+len*nc*2,true);ws(8,'WAVE');ws(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);
  v.setUint16(22,nc,true);v.setUint32(24,sr,true);v.setUint32(28,sr*nc*2,true);v.setUint16(32,nc*2,true);v.setUint16(34,16,true);
  ws(36,'data');v.setUint32(40,len*nc*2,true);
  let o=44;for(let i=0;i<len;i++)for(let c=0;c<nc;c++){const s=Math.max(-1,Math.min(1,chs[c][i]*g));v.setInt16(o,s<0?s*0x8000:s*0x7fff,true);o+=2}
  return new Blob([buf],{type:'audio/wav'});
}
async function exportMix(){
  if(!tracks.length){$('exportInfo').textContent='Record a layer first.';return}
  $('exportInfo').textContent='Mixing…';
  const sr=ctx.sampleRate,len=Math.round(loopLen()*sr);
  const OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext,oc=new OAC(2,len,sr);
  for(const tr of tracks){
    if(!isOn(tr))continue;
    const s=oc.createBufferSource();s.buffer=tr.buffer;const g=oc.createGain();g.gain.value=tr.vol;s.connect(g);
    let last=g;if(oc.createStereoPanner){const p=oc.createStereoPanner();p.pan.value=tr.pan;g.connect(p);last=p}
    last.connect(oc.destination);
    const off=tr.nudge/1000;if(off>=0)s.start(off);else s.start(0,-off);
  }
  const r=await oc.startRendering();
  const url=URL.createObjectURL(encodeWav(r));
  const a=document.createElement('a');a.href=url;a.download=`layers-${S.bpm}bpm.wav`;document.body.appendChild(a);a.click();a.remove();
  $('exportInfo').innerHTML=`Mix ready. If it didn't download, <a class="dl" href="${url}" download="layers.wav">tap here</a>. Muted layers are left out.`;
}
