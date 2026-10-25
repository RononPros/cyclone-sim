const test=require('node:test');
const assert=require('node:assert/strict');
const {loadSimulation}=require('./helpers/simulation');

function basin(s,seed=5599,mapType=6,mode=s.api.normal,tick=0,saved){
    const a=s.api;s.context.noiseSeed(seed);
    const b=a.makeBasin(mapType,mode,seed);b.tick=tick;
    b.env=new a.Environment(b);
    b.env.init(saved&&new a.LoadData(a.SAVE_FORMAT,saved));
    return b;
}
function steering(s,b,lon,lat,tick=b.tick,depth=0.7){
    const p=s.api.Coordinate.convertToXY(b.mapType,lon,lat);
    const ll=b.env.get('LLSteering',p.x,p.y,tick).copy();
    const ul=b.env.get('ULSteering',p.x,p.y,tick).copy();
    const d=Math.sqrt(depth);
    return {x:ll.x+(ul.x-ll.x)*d,y:ll.y+(ul.y-ll.y)*d};
}
function savedFields(b){
    const fields={};
    for(const name of b.env.fieldList){
        const f=b.env.fields[name];
        fields[name]={version:f.version,accurateAfter:f.accurateAfter,noiseData:f.noise.map(c=>c.save())};
    }
    return JSON.parse(JSON.stringify(fields));
}

test('Gulf weather supports westward and northeastward steering across seasons, seeds and storm depths',()=>{
    const s=loadSimulation(),counts={};
    for(const seed of [1,42,2026,5599,12345]){
        const b=basin(s,seed);
        for(let hour=0;hour<8016;hour++){
            b.tick=hour;if(hour)b.env.wobble();
            if(hour%24||hour<151*24)continue;
            const season=hour<212*24?'early':hour<273*24?'peak':'late';
            for(const depth of [0.2,0.7,1]){
                const c=counts[season+':'+depth]??={total:0,west:0,north:0,northeast:0};
                for(const lon of [-95,-90,-85])for(const lat of [22,26,29]){
                    const v=steering(s,b,lon,lat,hour,depth);
                    assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y));
                    assert.ok(Math.hypot(v.x,v.y)<8,'Gulf steering must stay bounded');
                    c.total++;if(v.x<0)c.west++;if(v.y<0)c.north++;
                    if(v.x>0&&v.y<0)c.northeast++;
                }
            }
        }
    }
    for(const [label,c] of Object.entries(counts)){
        assert.ok(c.west/c.total>0.12,`${label}: westward routes must remain possible`);
        assert.ok(c.northeast/c.total>0.12,`${label}: northeastward turns must be available`);
        assert.ok(c.north/c.total>0.75,`${label}: predominantly poleward flow`);
    }
    const early=counts['early:0.7'],late=counts['late:0.7'];
    assert.ok(late.northeast/late.total>early.northeast/early.total,'stronger autumn trough influence');
});

test('tropical Caribbean trade winds retain their westward component',()=>{
    const s=loadSimulation();
    for(const seed of [0,42,2026,5599]){
        const b=basin(s,seed);let west=0,total=0;
        for(let day=151;day<334;day+=3){
            for(const lon of [-80,-72,-62])for(const lat of [12,16]){
                const v=steering(s,b,lon,lat,day*24);total++;if(v.x<0)west++;
            }
        }
        assert.ok(west/total>0.95,`seed ${seed}: tropical trades lost`);
    }
});

test('weather remains continuous through geographical fades and synoptic event rollovers',()=>{
    const s=loadSimulation(),b=basin(s,0);
    for(const [lon,lat] of [[-99,26],[-63,26],[-53,26],[-90,17],[-90,23],[-90,35],[-90,43]]){
        for(const tick of [0,4320,7200,8766]){
            const before=steering(s,b,lon-1e-5,lat-1e-5,tick);
            const after=steering(s,b,lon+1e-5,lat+1e-5,tick);
            assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<0.001);
        }
    }
    for(const seed of [0,42,5599]){
        const b=basin(s,seed);
        // Isolate the new synoptic evolution from the stock procedural jet,
        // whose steep noise-driven troughs can change faster than this bound.
        for(const name of ['jetstream','LLSteering','ULSteering'])
            for(const channel of b.env.fields[name].noise)channel.get=()=>0.5;
        let previous=steering(s,b,-90,26,0);
        for(let hour=1;hour<=8766;hour++){
            const next=steering(s,b,-90,26,hour);
            assert.ok(Math.hypot(next.x-previous.x,next.y-previous.y)<0.2,`weather jumped at ${seed}/${hour}`);
            previous=next;
        }
    }
});

test('synoptic phases vary by seed without consuming random draws or altering saved channel state',()=>{
    const s=loadSimulation();
    const fixed=seed=>{
        const b=basin(s,seed);
        // Hold the stock random weather constant to isolate the seeded ridge / trough phases.
        for(const name of ['jetstream','LLSteering','ULSteering'])
            for(const channel of b.env.fields[name].noise)channel.get=()=>0.5;
        return b;
    };
    const zero=fixed(0),other=fixed(42),tick=7200;
    const initial=steering(s,zero,-90,26,tick);
    assert.notDeepEqual(initial,steering(s,other,-90,26,tick));
    const state=savedFields(zero);
    s.context.randomSeed(121);const expected=s.context.random();s.context.randomSeed(121);
    for(let i=0;i<100;i++)steering(s,zero,-90,26,tick+i);
    assert.equal(s.context.random(),expected);
    assert.deepEqual(savedFields(zero),state);
    for(let i=0;i<1000;i++)s.context.random();
    assert.deepEqual(steering(s,zero,-90,26,tick),initial);
});

test('Atlantic steering and forecasts resume the same weather after saving',()=>{
    const s=loadSimulation(),a=s.api,original=basin(s,5599);
    for(let hour=1;hour<=4600;hour++){original.tick=hour;original.env.wobble();}
    const restored=basin(s,5599,6,a.normal,original.tick,savedFields(original));
    const positions=[[-95,22],[-90,26],[-85,29],[-65,32]];
    for(let hour=4600;hour<=4672;hour++){
        original.tick=restored.tick=hour;
        if(hour>4600){original.env.wobble();restored.env.wobble();}
        for(const [lon,lat] of positions)
            assert.deepEqual(steering(s,restored,lon,lat),steering(s,original,lon,lat));
    }
    const first=a.makeSystem(original,-90,26),second=a.makeSystem(restored,-90,26);
    first.doTrackForecast();second.doTrackForecast();
    assert.deepEqual(second.trackForecast,first.trackForecast);
});

test('hourly storm movement and the six-hour forecast use the same turning winds',()=>{
    const s=loadSimulation(),a=s.api,b=basin(s,5599,6,a.normal,180*24);
    const sys=a.makeSystem(b,-90,26),start=sys.pos.copy();
    sys.doTrackForecast();const expected=sys.trackForecast[0];
    assert.ok(expected.x>start.x&&expected.y<start.y,'northeastward forecast');
    // Hold intensity/depth and noise offsets fixed, as the stock track forecast does.
    // The real hourly update still reads and applies the evolving steering fields.
    a.algorithms[a.normal].core=()=>{};
    a.algorithms[a.normal].typeDetermination=()=>{};
    for(let hour=0;hour<6;hour++){sys.update();b.tick++;}
    assert.ok(Math.abs(sys.pos.x-expected.x)<1e-9&&Math.abs(sys.pos.y-expected.y)<1e-9);
    assert.ok(sys.windMotionEast>0&&sys.windMotionNorth>0);
});

test('Calm inherits Atlantic steering while retaining its own shear penalty',()=>{
    const s=loadSimulation(),a=s.api,normal=basin(s,42),calm=basin(s,42,6,a.calm);
    for(const tick of [0,4320,5760,7200])for(const [lon,lat] of [[-95,22],[-90,26],[-85,29]]){
        assert.deepEqual(steering(s,normal,lon,lat,tick),steering(s,calm,lon,lat,tick));
        const p=a.Coordinate.convertToXY(6,lon,lat);
        const n=normal.env.get('shear',p.x,p.y,tick).mag();
        const c=calm.env.get('shear',p.x,p.y,tick).mag();
        assert.ok(Math.abs(c-n*1.1)<1e-9);
    }
});

test('non-Atlantic maps still use their unmodified stock steering and jet',()=>{
    const s=loadSimulation(),a=s.api;
    for(const mapType of [0,7,8,9,10,14]){
        const b=basin(s,42,mapType);
        const samples=[0,4320,7200].map(t=>steering(s,b,120,25,t));
        const jet=b.env.get('jetstream',480,0,4320);
        for(const name of ['jetstream','LLSteering','ULSteering'])
            b.env.fields[name].mapFunc=a.envDefs.defaults[name].mapFunc;
        assert.deepEqual([0,4320,7200].map(t=>steering(s,b,120,25,t)),samples);
        assert.equal(b.env.get('jetstream',480,0,4320),jet);
    }
});

test('older steering versions mark their reconstructed environment as changed on load',()=>{
    const s=loadSimulation(),a=s.api,b=basin(s,1),saved=savedFields(b);
    saved.LLSteering.version=2;saved.ULSteering.version=2;
    const restored=basin(s,1,6,a.normal,4320,saved);
    assert.equal(restored.env.fields.LLSteering.accurateAfter,4320);
    assert.equal(restored.env.fields.ULSteering.accurateAfter,4320);
    const v=steering(s,restored,-90,26);
    assert.ok(Number.isFinite(v.x)&&Number.isFinite(v.y));
});
