"use strict";
const $=id=>document.getElementById(id);
const NOTES=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
const COLORS=['#ff6b6b','#4dabf7','#ffd43b','#69db7c','#da77f2','#ff922b','#38d9a9','#f783ac'];
const DEF={bpm:90,beats:4,bars:4,countIn:1,loop:true,clickVol:0.6,clickOnPlay:true,recClick:'visual',vibrate:false,hearLayers:true,guideVol:0.45,echo:true,note:0,oct:4,refCountIn:true,latencyMs:null};
let S=Object.assign({},DEF);
try{Object.assign(S,JSON.parse(localStorage.getItem('layerbooth')||'{}'))}catch(e){}
function save(){try{localStorage.setItem('layerbooth',JSON.stringify(S))}catch(e){}}
function status(t){$('status').textContent=t||''}

/* ---------- audio core ---------- */
const WORKLET=`class Rec extends AudioWorkletProcessor{
constructor(){super();this.on=false;this.buf=new Float32Array(2048);this.n=0;this.t0=0;
this.port.onmessage=e=>{if(e.data==='start'){this.on=true;this.n=0}else if(e.data==='stop'){this.flush();this.on=false;this.port.postMessage({done:true})}}}
flush(){if(this.n>0){this.port.postMessage({t:this.t0,d:this.buf.slice(0,this.n)});this.n=0}}
process(inputs){const inp=inputs[0];if(this.on&&inp&&inp[0]){const a=inp[0],b=inp[1];for(let i=0;i<a.length;i++){if(this.n===0)this.t0=currentTime+i/sampleRate;this.buf[this.n++]=b?(a[i]+b[i])*0.5:a[i];if(this.n===this.buf.length)this.flush()}}return true}}
registerProcessor('rec',Rec);`;
let ctx=null,master,trackBus,clickBus,workletOK=false;
async function ensureCtx(){
  if(!ctx){
    const AC=window.AudioContext||window.webkitAudioContext;
    ctx=new AC({latencyHint:'interactive'});
    master=ctx.createGain();master.connect(ctx.destination);
    trackBus=ctx.createGain();trackBus.connect(master);
    clickBus=ctx.createGain();clickBus.connect(master);
    if(ctx.audioWorklet){try{const u=URL.createObjectURL(new Blob([WORKLET],{type:'application/javascript'}));await ctx.audioWorklet.addModule(u);workletOK=true}catch(e){workletOK=false}}
    setSession('playback');
  }
  if(ctx.state!=='running')await ctx.resume();
}
function setSession(t){try{if(navigator.audioSession)navigator.audioSession.type=t}catch(e){}}
const beatDur=()=>60/S.bpm, loopBeats=()=>S.beats*S.bars, loopLen=()=>loopBeats()*beatDur();
function latency(){
  if(S.latencyMs!=null&&S.latencyMs!=='')return S.latencyMs/1000;
  return ctx?((ctx.baseLatency||0)+(ctx.outputLatency||0)+0.012):0.05;
}
function noteFreq(){const midi=(+S.oct+1)*12+(+S.note);return 440*Math.pow(2,(midi-69)/12)}

function click(t,accent,vol){
  const o=ctx.createOscillator(),g=ctx.createGain();
  o.type='square';o.frequency.value=accent?1760:1100;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol*(accent?0.5:0.3),t+0.001);
  g.gain.exponentialRampToValueAtTime(0.0001,t+0.05);
  o.connect(g);g.connect(clickBus);o.start(t);o.stop(t+0.06);
}
function tone(t,dur,freq,vol){
  const g=ctx.createGain(),o=ctx.createOscillator(),o2=ctx.createOscillator(),g2=ctx.createGain();
  o.type='triangle';o.frequency.value=freq;o2.type='sine';o2.frequency.value=freq*2;g2.gain.value=0.15;
  o.connect(g);o2.connect(g2);g2.connect(g);g.connect(master);
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+0.03);
  g.gain.setValueAtTime(vol,Math.max(t+0.04,t+dur-0.15));g.gain.linearRampToValueAtTime(0,t+dur);
  o.start(t);o2.start(t);o.stop(t+dur+0.05);o2.stop(t+dur+0.05);
}

/* ---------- tracks ---------- */
let tracks=[],nextId=1;
function attachNodes(tr){
  tr.g=ctx.createGain();
  tr.p=ctx.createStereoPanner?ctx.createStereoPanner():null;
  if(tr.p){tr.g.connect(tr.p);tr.p.connect(trackBus)}else tr.g.connect(trackBus);
}
function isOn(tr){const any=tracks.some(x=>x.solo);return any?tr.solo:!tr.mute}
function applyGains(){
  if(!ctx)return;
  for(const tr of tracks){
    const on=isOn(tr)&&!(T&&T.excludeId===tr.id);
    tr.g.gain.setTargetAtTime(on?tr.vol:0,ctx.currentTime,0.01);
    if(tr.p)tr.p.pan.setTargetAtTime(tr.pan,ctx.currentTime,0.01);
  }
}
function addTrack(buf){
  const id=nextId++;
  const tr={id,name:'Layer '+id,buffer:buf,vol:0.9,pan:0,mute:false,solo:false,nudge:0,color:COLORS[(id-1)%COLORS.length],open:false};
  attachNodes(tr);tracks.push(tr);
}

/* ---------- transport ---------- */
let T=null;
function startTransport(mode,opts={}){
  const bd=beatDur(),cb=mode==='record'?S.countIn*S.beats:0;
  const tStart=ctx.currentTime+0.15;
  T={mode,bd,t0:tStart+cb*bd,lb:loopBeats(),cb,nextBeat:-cb,end:(mode==='record'||!S.loop)?loopBeats():Infinity,
     sources:[],vis:[],onDone:opts.onDone,excludeId:opts.excludeId};
  trackBus.gain.setValueAtTime(mode==='record'?S.guideVol:1,ctx.currentTime);
  applyGains();
  T.timer=setInterval(tick,25);tick();updateUI();
}
function tick(){
  if(!T)return;
  const ahead=ctx.currentTime+0.15;
  while(T.nextBeat<T.end&&T.t0+T.nextBeat*T.bd<ahead){scheduleBeat(T.nextBeat,T.t0+T.nextBeat*T.bd);T.nextBeat++}
  if(T.end!==Infinity){
    const endT=T.t0+T.end*T.bd+(T.mode==='record'?latency()+0.15:0.05);
    if(ctx.currentTime>=endT){const t=stopTransport();if(t.onDone)t.onDone(true,t)}
  }
}
function scheduleBeat(b,t){
  const inBar=((b%S.beats)+S.beats)%S.beats,accent=inBar===0,counting=b<0;
  let vol=0;
  if(counting)vol=S.clickVol;
  else if(T.mode==='record')vol=S.recClick==='normal'?S.clickVol:S.recClick==='quiet'?S.clickVol*0.25:0;
  else vol=S.clickOnPlay?S.clickVol:0;
  if(vol>0)click(t,accent,vol);
  if(counting&&b===-T.cb&&S.refCountIn)tone(t,Math.min(T.cb*T.bd-0.12,4),noteFreq(),0.22);
  if(!counting&&b%T.lb===0&&(T.mode==='play'||S.hearLayers)){
    for(const tr of tracks){
      if(tr.id===T.excludeId)continue;
      const s=ctx.createBufferSource();s.buffer=tr.buffer;s.connect(tr.g);
      const off=tr.nudge/1000;
      if(off>=0)s.start(t+off);else s.start(t,-off);
      T.sources.push(s);s.onended=()=>{if(T){const i=T.sources.indexOf(s);if(i>=0)T.sources.splice(i,1)}};
    }
  }
  T.vis.push({t,b,inBar,counting});
}
function stopTransport(){
  if(!T)return null;
  clearInterval(T.timer);
  T.sources.forEach(s=>{try{s.stop()}catch(e){}});
  const t=T;T=null;applyGains();resetVisual();updateUI();return t;
}
