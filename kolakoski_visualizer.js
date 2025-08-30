/* ===== Simple toggle script for the sidebar ===== */
(function(){
  var btn = document.getElementById('toggleSidebar');
  if(btn){
    btn.addEventListener('click', function(){
      var on = document.body.classList.toggle('has-collapsed');
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }
})();

/* ===== Utils & labels ===== */
function log2(x){ return Math.log(x)/Math.log(2); }
function clamp(v,a,b){ return Math.min(b, Math.max(a, v)); }
const PC12 = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function midiFromFreq(f){ return 69 + 12*log2(f/440); }
function label12_full(f){ var m=Math.round(midiFromFreq(f)); var pc=PC12[((m%12)+12)%12]; var oct=Math.floor(m/12)-1; return pc+oct; }
function label12_pc(f){ var m=Math.round(midiFromFreq(f)); return PC12[((m%12)+12)%12]; }
function quantize24Pitch(f){
  var qIdx = Math.round(24*log2(f/440)) + 69*2;
  var pc24 = ((qIdx % 24) + 24) % 24;
  var basePC = Math.floor(pc24/2);
  var half = pc24%2;
  var stepName = PC12[basePC];
  var alter = (stepName.includes("#")?1:0) + (half?0.5:0);
  stepName = stepName.replace("#","");
  var midiApprox = Math.round(69 + 12*log2(f/440));
  var octave = Math.floor(midiApprox/12)-1;
  return { step: stepName, alter: alter, octave: octave };
}
function label24_pc_oct(f){
  var q = quantize24Pitch(f);
  var acc = "";
  if (q.alter===0.5) acc="(¼#)";
  else if (q.alter===-0.5) acc="(¼b)";
  else if (q.alter===1.5) acc="(¾#)";
  else if (q.alter===-1.5) acc="(¾b)";
  else if (q.alter===1) acc="#";
  else if (q.alter===-1) acc="b";
  return q.step + acc + q.octave;
}

/* ===== Canvas/view ===== */
let canvas=document.getElementById("c"),ctx=canvas.getContext("2d");
let dpr=1,tx=0,ty=0,scale=1,baseR=140,gap=100;
function initCanvas(){ let r=canvas.getBoundingClientRect(); if(!r.width||!r.height) r={width:window.innerWidth||900,height:(window.innerHeight||650)-160};
  dpr=window.devicePixelRatio||1; canvas.width=r.width*dpr; canvas.height=r.height*dpr; ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr); }
function fit(){ let outer=baseR+5*gap, rect=canvas.getBoundingClientRect(); let maxR=Math.min(rect.width,rect.height)/2-24; scale=Math.max(0.15, maxR/outer); tx=rect.width/2; ty=rect.height/2; }
window.addEventListener("resize",()=>{ initCanvas(); fit(); draw(); });
document.getElementById("fit").addEventListener("click",()=>{ initCanvas(); fit(); draw(); });
document.getElementById("zoomIn").addEventListener("click",()=>{ scale=Math.min(20,scale*1.18); draw(); });
document.getElementById("zoomOut").addEventListener("click",()=>{ scale=Math.max(0.2,scale/1.18); draw(); });

/* ===== Data/build ===== */
let allRows=[],nodes=[],hoverDots=[];
const BANDS=[ [41.2,82.41],[82.41,164.81],[164.81,329.63],[329.63,659.26],[659.26,1318.51],[1318.51,1760] ];
function demoRows(){ let arr=[]; let fundamentals=[41.20,82.41,164.81,329.63,659.26,880.00,1318.51];
  for(let f of fundamentals){ for(let p=1;p<=6;p++){ let fr=f*p; if(fr>=41.2 && fr<=1760) arr.push({freq_hz:fr}); } } return arr.slice(0,100); }
function parseCSVSmart(text){
  let lines=text.split(/\r?\n/); if(!lines.length) return [];
  let first=lines.find(l=>l.trim().length>0)||"";
  let delim=','; let counts={',':(first.match(/,/g)||[]).length,'\t':(first.match(/\t/g)||[]).length,';':(first.match(/;/g)||[]).length};
  if(counts['\t']>counts[',']&&counts['\t']>=counts[';'])delim='\t'; else if(counts[';']>counts[',']&&counts[';']>counts['\t'])delim=';';
  function split(line){var out=[],cur="",q=false;for(var i=0;i<line.length;i++){var ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===delim&&!q){out.push(cur);cur="";}else{cur+=ch;}}out.push(cur);return out;}
  let header=split(lines[0]).map(h=>h.trim().toLowerCase()); let rows=[];
  for(let r=1;r<lines.length;r++){ if(!lines[r].trim()) continue; let cells=split(lines[r]); let obj={}; for(let j=0;j<header.length;j++){ obj[header[j]]=(cells[j]!==undefined?cells[j]:"").trim(); } rows.push(obj); }
  return rows;
}
document.getElementById("fileInput").addEventListener("change", e=>{
  let f=e.target.files[0]; if(!f) return;
  let r=new FileReader();
  r.onload = ev => { allRows = parseCSVSmart(ev.target.result); buildNodes(); draw(); };
  r.readAsText(f);
});
document.getElementById("nRows").addEventListener("change", ()=>{ buildNodes(); draw(); });
document.getElementById("angleMode").addEventListener("change", ()=>{ buildNodes(); draw(); });
document.getElementById("quantMode").addEventListener("change", ()=>{ draw(); });

function kolakoski(N){
  var seq=[1,2,2], i=2, val=1;
  while(seq.length<N){
    for(var k=0;k<seq[i] && seq.length<N;k++) seq.push(val);
    val=3-val; i++;
  }
  return seq.slice(0,N);
}
function buildNodes(){
  nodes=[]; hoverDots=[];
  let source = (allRows && allRows.length) ? allRows : demoRows();
  let rows = source.slice(0, +document.getElementById("nRows").value || 100);
  // partition by band
  let perBand = Array(BANDS.length).fill(0).map(()=>[]);
  for (let r of rows){
    let f = parseFloat(r.freq_hz); if(!isFinite(f) || f<41.2 || f>1760) continue;
    let bi=0; for(let i=0;i<BANDS.length;i++){ let lo=BANDS[i][0], hi=BANDS[i][1]; let ok=(i<BANDS.length-1)?(f>=lo && f<hi):(f>=lo && f<=hi); if(ok){ bi=i; break; } }
    perBand[bi].push(f);
  }
  let angleMode = document.getElementById("angleMode").value || "kolak";
  for(let b=0;b<perBand.length;b++){
    let list = perBand[b]; let R = baseR + b*gap;
    if(!list.length) continue;
    let N = list.length;
    if (angleMode === "even"){
      let dth = 2*Math.PI/N;
      for (let j=0;j<N;j++){ let a=j*dth; nodes.push({freq:list[j], band:b, a, arc:dth, R, x:R*Math.cos(a), y:R*Math.sin(a)}); }
    } else if (angleMode === "kolakEven"){
      let dth = 2*Math.PI/N;
      let order = kolakoski(N).map((_,i)=>i);
      for (let j=0;j<N;j++){ let a=j*dth; nodes.push({freq:list[order[j]], band:b, a, arc:dth, R, x:R*Math.cos(a), y:R*Math.sin(a)}); }
    } else {
      let seq = kolakoski(N);
      let totalUnits = 0; for (let s of seq) totalUnits += (s===1?1:2);
      let unit = 2*Math.PI / totalUnits;
      let a=0;
      for (let j=0;j<N;j++){
        let step = (seq[j]===1?1:2)*unit;
        nodes.push({freq:list[j], band:b, a:a%(2*Math.PI), arc:step, R, x:R*Math.cos(a), y:R*Math.sin(a)});
        a += step;
      }
    }
  }
}

/* ===== Draw ===== */
function draw(){
  ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr); ctx.clearRect(0,0,canvas.width/dpr,canvas.height/dpr);
  ctx.translate(tx,ty); ctx.scale(scale,scale);
  const showRanges = document.getElementById("showRanges").checked;
  const use24 = (document.getElementById("quantMode").value==="24");
  // colored rings & labels
  let cols=["#0a2a6b","#0b3d91","#0c4da4","#115bb6","#1565c0","#1b73d0","#1e82df"];
  for(let i=0;i<6;i++){
    let R = baseR+i*gap;
    ctx.strokeStyle=cols[i%cols.length]; ctx.lineWidth=1.5/Math.max(1,scale);
    ctx.beginPath(); ctx.arc(0,0,R,0,2*Math.PI); ctx.stroke();
    if (showRanges){
      let inBand = nodes.filter(n=>n.band===i).map(n=>n.freq);
      if(inBand.length){
        let lo = Math.min.apply(null, inBand), hi = Math.max.apply(null, inBand);
        let label = (use24? label24_pc_oct(lo) : label12_full(lo)) + " – " + (use24? label24_pc_oct(hi) : label12_full(hi));
        ctx.save();
        ctx.fillStyle = cols[i%cols.length];
        ctx.textAlign="center"; ctx.textBaseline="bottom";
        ctx.font = (22/Math.max(1,scale)).toFixed(2) + "px sans-serif"; // larger label font
        ctx.fillText(label, 0, -R - 10/Math.max(1,scale));
        ctx.restore();
      }
    }
  }
  // dots
  hoverDots=[];
  let seq = kolakoski(nodes.length);
  for(let i=0;i<nodes.length;i++){
    let nd = nodes[i];
    let col = (seq[i]===1 ? "#fbbf24" : "#f87171");
    if (voices[i]) col = voices[i].sticky? "#34d399" : "#7dd3fc";
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(nd.x, nd.y, 5/Math.max(1,scale), 0, 2*Math.PI); ctx.fill();
    hoverDots.push({i, x:nd.x, y:nd.y});
  }
}

/* ===== Hit test & tooltip ===== */
function screenToWorld(mx,my){ let r=canvas.getBoundingClientRect(); let lx=mx-r.left, ly=my.top; return {x:(lx-tx)/scale, y:(ly-ty)/scale}; }
function hitDot(mx,my){ let p=screenToWorld(mx,my); let best=-1, bd=1e9;
  for(let d of hoverDots){ let dx=p.x-d.x, dy=p.y-d.y; let dd=dx*dx+dy*dy; if(dd<bd){ bd=dd; best=d.i; } }
  if(best>=0 && bd < (49/(scale*scale))) return best; return -1;
}
const tooltip=document.getElementById("tooltip");
function labelForTooltip(f){ return (document.getElementById("quantMode").value==="24")? label24_pc_oct(f) : label12_pc(f); }
canvas.addEventListener("mousemove", e=>{
  ensureAudio();
  let idx = hitDot(e.clientX, e.clientY);
  if(idx>=0){
    let f = nodes[idx].freq;
    tooltip.textContent = labelForTooltip(f) + " — " + f.toFixed(2) + " Hz";
    tooltip.style.left = (e.clientX+12)+"px"; tooltip.style.top = (e.clientY+12)+"px"; tooltip.style.display="block";
    if(!voices[idx]){
      if(!e.shiftKey){ for(const k in voices){ if(!voices[k].sticky) stopVoice(parseInt(k,10), true); } }
      startVoice(idx, !!e.shiftKey); draw();
    }
    canvas.style.cursor="pointer";
  } else {
    tooltip.style.display="none"; canvas.style.cursor="default";
  }
});
canvas.addEventListener("click", e=>{
  let idx = hitDot(e.clientX, e.clientY);
  if(idx>=0 && voices[idx]){ stopVoice(idx, true); draw(); }
});

/* ===== WebAudio ===== */
let voices={}, _ac=null, _master=null;
function ensureAudio(){
  if(!_ac){
    try{
      _ac = new (window.AudioContext||window.webkitAudioContext)();
      _master = _ac.createGain();
      _master.gain.value = parseFloat(document.getElementById("gain").value);
      _master.connect(_ac.destination);
    }catch(e){}
  } else if (_ac.state==="suspended"){ _ac.resume(); }
}
document.getElementById("audioInit").addEventListener("click", ()=>{ ensureAudio(); });
document.getElementById("gain").addEventListener("input", ()=>{ if(_master) _master.gain.value=parseFloat(document.getElementById("gain").value); });
document.getElementById("testBeep").addEventListener("click", ()=>{
  ensureAudio(); if(!_ac) return;
  let now=_ac.currentTime, osc=_ac.createOscillator(), g=_ac.createGain();
  osc.type=document.getElementById("wave").value; osc.frequency.value=440; g.gain.value=0.0001;
  osc.connect(g).connect(_master); osc.start(now);
  g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(1.0, now+0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now+0.35); osc.stop(now+0.4);
});
function startVoice(i, sticky){
  ensureAudio(); if(!_ac) return;
  if(voices[i]){ if(sticky) voices[i].sticky=true; return; }
  const nd=nodes[i]; if(!nd) return;
  const osc=_ac.createOscillator(), g=_ac.createGain();
  osc.type=document.getElementById("wave").value; osc.frequency.value=nd.freq; g.gain.value=0.0001;
  osc.connect(g).connect(_master); let now=_ac.currentTime, a=parseFloat(document.getElementById("attack").value)||0.01;
  g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(1.0, now+a);
  osc.start(now);
  voices[i]={osc,g,sticky:!!sticky};
}
function stopVoice(i, immediate){
  const v=voices[i]; if(!v) return; let now=_ac.currentTime;
  if(immediate){ try{ v.osc.stop(now); }catch(_){ } }
  else { v.gain.gain.setTargetAtTime(0.0001, now, 0.08); try{ v.osc.stop(now+0.25); }catch(_){ } }
  delete voices[i];
}
document.getElementById("stopAll").addEventListener("click", ()=>{ for(const k in voices) stopVoice(parseInt(k,10), true); draw(); });
document.getElementById("stopAudio").addEventListener("click", ()=>{
  for(const k in voices) stopVoice(parseInt(k,10), true);
  if(_ac && _ac.state==="running"){ _ac.suspend(); }
});

/* ===== Exports ===== */
function vlq(n){ var b=[]; do{ b.unshift(n&0x7F); n>>=7; } while(n>0); for(var i=0;i<b.length-1;i++) b[i]|=0x80; return b; }
function freqToMidi(f){ return clamp(Math.round(69 + 12*log2(f/440)),0,127); }
document.getElementById("downloadMidi").addEventListener("click", ()=>{
  if(!nodes.length) return;
  var circleTime = +document.getElementById("circleTime").value;
  var bpm = +document.getElementById("bpm").value || 60;
  var usPerQuarter = Math.round(60000000 / bpm);
  var TPQ = 480;
  var bytes=[]; function push(){ for(var i=0;i<arguments.length;i++) bytes.push(arguments[i]); }
  push(0x00, 0xFF, 0x51, 0x03, (usPerQuarter>>16)&255, (usPerQuarter>>8)&255, usPerQuarter&255);
  push(0x00, 0xC0, 0x00);
  for (var i=0;i<nodes.length;i++){
    var nd = nodes[i];
    var m=freqToMidi(nd.freq);
    var durSec = (nd.arc? (nd.arc/(2*Math.PI))*circleTime : (1/nodes.length)*circleTime);
    var durTicks = Math.max(1, Math.round(durSec * TPQ * bpm / 60));
    bytes.push.apply(bytes, vlq(0)); push(0x90, m, 96);
    bytes.push.apply(bytes, vlq(durTicks)); push(0x80, m, 0);
  }
  push(0x00, 0xFF, 0x2F, 0x00);
  var header = new Uint8Array([0x4D,0x54,0x68,0x64, 0x00,0x00,0x00,0x06, 0x00,0x00, 0x00,0x01, (TPQ>>8)&255, TPQ&255]);
  var len = bytes.length;
  var lenBytes = new Uint8Array([ (len>>>24)&255, (len>>>16)&255, (len>>>8)&255, len&255 ]);
  var mtrkHead = new Uint8Array([0x4D,0x54,0x72,0x6B]);
  var blob = new Blob([header, mtrkHead, lenBytes, new Uint8Array(bytes)], {type:"audio/midi"});
  var a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="kolakoski_angular.mid"; a.click();
});

document.getElementById("downloadCsv").addEventListener("click", ()=>{
  if(!nodes.length) return;
  var circleTime = +document.getElementById("circleTime").value;
  var out = "index,band,freq_hz,angle_rad,arc_rad,duration_sec\n";
  for (var i=0;i<nodes.length;i++){
    var nd = nodes[i];
    var dur = (nd.arc? (nd.arc/(2*Math.PI))*circleTime : (1/nodes.length)*circleTime);
    out += (i+1)+","+(nd.band)+","+nd.freq+","+( (nd.a||0) )+","+(nd.arc||0)+","+dur+"\n";
  }
  var blob = new Blob([out], {type:"text/csv"});
  var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "mapping_with_durations.csv"; a.click();
});

function pitchXML_24TET(f){
  var q = quantize24Pitch(f);
  var step=q.step, alter=q.alter||0, octave=q.octave;
  var accidental = null;
  if (alter===0.5) accidental="quarter-sharp";
  else if (alter===-0.5) accidental="quarter-flat";
  else if (alter===1.5) accidental="three-quarters-sharp";
  else if (alter===-1.5) accidental="three-quarters-flat";
  else if (alter===1) accidental="sharp";
  else if (alter===-1) accidental="flat";
  var p = `<pitch><step>${step}</step>${alter?`<alter>${alter}</alter>`:""}<octave>${octave}</octave></pitch>`;
  if (accidental) p += `<accidental>${accidental}</accidental>`;
  return p;
}
function buildDurationsQuarters(){
  var circleTime = +document.getElementById("circleTime").value;
  var bpm = +document.getElementById("bpm").value || 60;
  var out=[];
  for (var i=0;i<nodes.length;i++){
    var nd = nodes[i];
    var durSec = (nd.arc? (nd.arc/(2*Math.PI))*circleTime : (1/nodes.length)*circleTime);
    var q = durSec * bpm / 60.0;
    out.push(q);
  }
  return out;
}
function quantizeNotated(dursQ){
  var allowed = [];
  for (var k=1;k<=32;k++) allowed.push(k/32);
  [3,5,6,7].forEach(n=>{ for (var m=1;m<=8;m++) allowed.push(m/n); });
  allowed = Array.from(new Set(allowed)).filter(x=>x>0).sort((a,b)=>a-b);
  return dursQ.map(q => {
    var best=allowed[0], bd=Math.abs(q-best);
    for (var i=1;i<allowed.length;i++){ var d=Math.abs(q-allowed[i]); if (d<bd){ bd=d; best=allowed[i]; } }
    return best;
  });
}
function chooseTypeFromQuarter(q){
  if (q>=1.5) return "half";
  if (q>=0.75) return "quarter";
  if (q>=0.375) return "eighth";
  if (q>=0.1875) return "16th";
  return "32nd";
}
document.getElementById("downloadMusicXML").addEventListener("click", ()=>{
  if(!nodes.length) return;
  var mode = (document.getElementById("xmlMode").value || "perf");
  var dursQ = buildDurationsQuarters();
  var divisions = 960;
  var bpm = +document.getElementById("bpm").value || 60;
  if (mode === "notated") dursQ = quantizeNotated(dursQ);
  var xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Kolakoski</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>${divisions}</divisions>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <sound tempo="${bpm}"/>
`;
  var curBeatsQ = 0;
  for (var i=0;i<nodes.length;i++){
    var f = nodes[i].freq;
    var q = dursQ[i];
    var dur = Math.max(1, Math.round(q*divisions));
    var type = chooseTypeFromQuarter(q);
    if (curBeatsQ + q > 4){
      xml += `      <barline location="right"><bar-style>light-heavy</bar-style></barline>
    </measure>
    <measure number="${i+1}">
`;
      curBeatsQ = 0;
    }
    xml += `      <note>
        ${pitchXML_24TET(f)}
        <duration>${dur}</duration>
        <type>${type}</type>
      </note>
`;
    curBeatsQ += q;
  }
  xml += `      <barline location="right"><bar-style>light-heavy</bar-style></barline>
    </measure>
  </part>
</score-partwise>`;
  var blob = new Blob([xml], {type:"application/vnd.recordare.musicxml+xml"});
  var a = document.createElement("a"); a.href=URL.createObjectURL(blob); a.download = (mode==="notated"?"kolakoski_notated.xml":"kolakoski_performance.xml"); a.click();
});

/* ===== Boot (robust) ===== */
function bootOnce(){
  initCanvas(); fit(); buildNodes(); draw();
  if (!nodes.length){
    setTimeout(()=>{ initCanvas(); fit(); buildNodes(); draw(); }, 50);
  }
}
if (document.readyState === "complete" || document.readyState === "interactive"){
  requestAnimationFrame(()=>{ requestAnimationFrame(bootOnce); });
} else {
  document.addEventListener("DOMContentLoaded", ()=>{ requestAnimationFrame(()=>{ requestAnimationFrame(bootOnce); }); });
}
try{
  const ro = new ResizeObserver(entries=>{
    for (const e of entries){
      if (e.target === canvas){
        initCanvas(); fit(); draw();
      }
    }
  });
  ro.observe(canvas);
}catch(_){}
