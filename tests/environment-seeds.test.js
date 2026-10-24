const test = require('node:test');
const assert = require('node:assert/strict');
const {loadSimulation} = require('./helpers/simulation');

function makeEnvironment(s,seed,tick=0,saved){
    s.context.noiseSeed(seed);
    const basin=s.api.makeBasin(8,s.api.normal,seed);
    basin.tick=tick;
    basin.env=new s.api.Environment(basin);
    basin.env.init(saved && new s.api.LoadData(s.api.SAVE_FORMAT,saved));
    return basin;
}

function snapshot(basin){
    const data={};
    for(const name of basin.env.fieldList){
        const field=basin.env.fields[name];
        data[name]={version:field.version,accurateAfter:field.accurateAfter,noiseData:field.noise.map(n=>n.save())};
    }
    return JSON.parse(JSON.stringify(data));
}

test('same basin seed initializes the same environment regardless of global randomness',()=>{
    const s=loadSimulation();
    s.context.randomSeed(11);
    const first=makeEnvironment(s,12345);
    for(let i=0;i<1000;i++)s.context.random();
    s.context.randomSeed(98765);
    const second=makeEnvironment(s,12345);
    assert.deepEqual(snapshot(first),snapshot(second));
    assert.equal(first.env.get('SSTAnomaly',400,350,0),second.env.get('SSTAnomaly',400,350,0));
    assert.notDeepEqual(snapshot(first),snapshot(makeEnvironment(s,54321)));
});

test('the full first-year environment repeats with independent gameplay RNG consumption',()=>{
    const s=loadSimulation(),first=makeEnvironment(s,12345),second=makeEnvironment(s,12345);
    for(let hour=1;hour<8760;hour++){
        first.tick=second.tick=hour;
        first.env.wobble();
        for(let i=0;i<hour%7;i++)s.context.random();
        second.env.wobble();
    }
    assert.deepEqual(snapshot(first),snapshot(second));
    assert.equal(first.tick,8759);
    assert.equal(first.env.get('SSTAnomaly',400,350,8759),second.env.get('SSTAnomaly',400,350,8759));
});

test('saved channel RNG resumes the same evolution as an uninterrupted environment',()=>{
    const s=loadSimulation(),first=makeEnvironment(s,2026);
    for(let hour=1;hour<=500;hour++){first.tick=hour;first.env.wobble();}
    const saved=snapshot(first),resumed=makeEnvironment(s,2026,500,saved);
    assert.deepEqual(snapshot(first),snapshot(resumed));
    for(let hour=501;hour<=1000;hour++){
        first.tick=resumed.tick=hour;
        first.env.wobble();resumed.env.wobble();
    }
    assert.deepEqual(snapshot(first),snapshot(resumed));
});

test('older saves preserve their offsets and wobble vectors during RNG migration',()=>{
    const s=loadSimulation(),original=makeEnvironment(s,42);
    for(let hour=1;hour<=48;hour++){original.tick=hour;original.env.wobble();}
    const legacy=snapshot(original);
    for(const field of Object.values(legacy))for(const n of field.noiseData)delete n.randomState;
    const migrated=makeEnvironment(s,42,48,legacy),again=makeEnvironment(s,42,48,legacy);
    for(const name of migrated.env.fieldList){
        const channels=migrated.env.fields[name].noise;
        channels.forEach((n,i)=>{
            const previous=legacy[name].noiseData[i];
            assert.equal(n.xOff,previous.xOff);assert.equal(n.yOff,previous.yOff);assert.equal(n.zOff,previous.zOff);
            assert.equal(n.wobbleVector.x,previous.wobbleVector.x);assert.equal(n.wobbleVector.y,previous.wobbleVector.y);
        });
    }
    migrated.tick++;again.tick++;migrated.env.wobble();again.env.wobble();
    assert.deepEqual(snapshot(migrated),snapshot(again));
});

test('zero seeds and zero-valued saved offsets/state remain valid',()=>{
    const s=loadSimulation(),first=makeEnvironment(s,0),second=makeEnvironment(s,0);
    assert.deepEqual(snapshot(first),snapshot(second));
    const saved=snapshot(first);
    Object.assign(saved.SSTAnomaly.noiseData[0],{xOff:0,yOff:0,zOff:0,randomState:0});
    const restored=makeEnvironment(s,0,0,saved).env.fields.SSTAnomaly.noise[0];
    assert.equal(restored.xOff,0);assert.equal(restored.yOff,0);assert.equal(restored.zOff,0);assert.equal(restored.randomState,0);
    restored.wobble();assert.notEqual(restored.randomState,0);
    const legacy=new s.api.EnvNoiseChannel(first,'SSTAnomaly',0,new s.api.LoadData(1,'04000000'));
    assert.equal(legacy.xOff,0);assert.equal(legacy.yOff,0);assert.equal(legacy.zOff,0);
    const constructors=s.evaluate(`
        Basin.deleteSave=function(){return Promise.resolve();};
        Land=class{constructor(){}};
        const zeroBasin=new Basin(false,{mapType:0,actMode:SIM_MODE_NORMAL,seed:0,hem:false,year:2026});
        const generatedBasin=new Basin(false,{mapType:0,actMode:SIM_MODE_NORMAL,hem:false,year:2026});
        ({zero:zeroBasin.seed,generated:generatedBasin.seed});
    `);
    assert.equal(constructors.zero,0);
    assert.ok(Number.isFinite(constructors.generated) && constructors.generated>0);
});

test('advancing another field cannot alter the SST channel stream',()=>{
    const s=loadSimulation(),first=makeEnvironment(s,83),second=makeEnvironment(s,83);
    const a=first.env.fields.SSTAnomaly.noise[0],b=second.env.fields.SSTAnomaly.noise[0];
    for(let hour=1;hour<=72;hour++){
        a.wobble();
        for(let i=0;i<10;i++)second.env.fields.moisture.noise[0].wobble();
        b.wobble();
    }
    assert.deepEqual(JSON.parse(JSON.stringify(a.save())),JSON.parse(JSON.stringify(b.save())));
});
