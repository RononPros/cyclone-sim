const test=require('node:test');
const assert=require('node:assert/strict');
const {loadSimulation}=require('./helpers/simulation');

function environment(s,seed=5599,tick=0,saved){
    const a=s.api;s.context.noiseSeed(seed);
    const b=a.makeBasin(8,a.normal,seed);b.tick=tick;
    b.env=new a.Environment(b);b.env.init(saved&&new a.LoadData(a.SAVE_FORMAT,saved));
    return b;
}
function snapshot(b){
    const fields={};
    for(const name of b.env.fieldList){const f=b.env.fields[name];fields[name]={version:f.version,accurateAfter:f.accurateAfter,noiseData:f.noise.map(c=>c.save())};}
    return JSON.parse(JSON.stringify(fields));
}

test('background weather varies by location and time, remains finite and stays below damaging force',()=>{
    const s=loadSimulation(),a=s.api,b=environment(s);
    const points=[{longitude:139.75,latitude:35.68},{longitude:121.47,latitude:31.23},{longitude:120.98,latitude:14.6}];
    const before=points.map(c=>a.WindField.backgroundAt(b,c,0.51));
    assert.ok(before.every(w=>w>0 && w<=25));
    assert.ok(new Set(before.map(w=>w.toFixed(3))).size>1);
    for(let hour=1;hour<=72;hour++){b.tick=hour;b.env.wobble();}
    const after=points.map(c=>a.WindField.backgroundAt(b,c,0.51));
    assert.notDeepEqual(before,after);
    assert.ok(after.every(w=>w>0 && w<=25));
    assert.equal(a.WindField.sample(b,[],points[0],0.51).wind,after[0]);
});

test('surface winds receive a modest boost near the jet corridor at otherwise identical weather',()=>{
    const s=loadSimulation(),a=s.api,b=a.makeBasin(8);
    const field=a.envDefs.defaults.surfaceWind;
    let jet=200;
    const u={basin:b,coord:{latitude:35,longitude:140},modifiers:{strength:1},noise:()=>0.4,
        vec:s.context.createVector(),field:name=>name==='jetstream'?jet:s.context.createVector(1,0)};
    const speed=()=>{const v=field.mapFunc(u,500,200,0);return Math.hypot(v.x,v.y);};
    const near=speed();jet=250;const nearby=speed();jet=-700;const far=speed();
    assert.ok(near>nearby && nearby>far);
    assert.ok(near-far>2 && near-far<=6);
    assert.ok(near<25);
});

test('background wind state survives save/resume with the same subsequent evolution',()=>{
    const s=loadSimulation(),a=s.api,first=environment(s);
    for(let hour=1;hour<=48;hour++){first.tick=hour;first.env.wobble();}
    const resumed=environment(s,5599,48,snapshot(first)),coord={longitude:139.75,latitude:35.68};
    assert.equal(a.WindField.backgroundAt(first,coord,0.51),a.WindField.backgroundAt(resumed,coord,0.51));
    for(let hour=49;hour<=96;hour++){first.tick=resumed.tick=hour;first.env.wobble();resumed.env.wobble();}
    assert.equal(a.WindField.backgroundAt(first,coord,0.51),a.WindField.backgroundAt(resumed,coord,0.51));
});

test('strong cyclone winds dominate the background without scalar addition or archive invention',()=>{
    const s=loadSimulation(),a=s.api,b=environment(s),coord=new a.Coordinate(140,35);
    const sys=a.makeSystem(b,139.6,35,{windSpeed:200,windSize:1});b.activeSystems.push(sys);
    const profiles=a.WindField.profiles(b);
    const cyclone=a.WindField.strongest(profiles,coord,0.51).wind;
    assert.ok(cyclone>25);
    assert.equal(a.WindField.sample(b,profiles,coord,0.51).wind,cyclone);
    const legacy=environment(s,5599,120);
    assert.equal(a.WindField.backgroundAt(legacy,coord,0.51,0),null);
    const unavailable=a.WindField.sample(legacy,[],coord,0.51,0);
    assert.equal(unavailable.backgroundKnown,false);
});
