const test = require('node:test');
const assert = require('node:assert/strict');
const {loadSimulation} = require('./helpers/simulation');

function environment(s,mapType,seed,mode=s.api.normal){
    s.context.randomSeed(seed);
    s.context.noiseSeed(seed);
    const basin=s.api.makeBasin(mapType,mode);
    basin.tick=0;
    basin.env=new s.api.Environment(basin);
    basin.env.init();
    return basin.env;
}

test('Pacific tropical-belt shear has approximately Atlantic seasonal magnitudes on independent seeds',()=>{
    const s=loadSimulation(),means=[];
    for(const mapType of [6,7,8]){
        const months=[];
        for(let month=0;month<12;month++){
            let sum=0,count=0;
            for(const seed of [7,101,503,991,2026,8401]){
                const env=environment(s,mapType,seed);
                for(const lat of [8,11,14,17,20,23,26]){
                    const y=s.api.Coordinate.convertToXY(mapType,0,lat).y;
                    for(let i=0;i<15;i++){
                        sum+=env.get('shear',960*(0.1+0.8*i/14),y,365.2425*24*(month+0.5)/12).mag();
                        count++;
                    }
                }
            }
            months.push(sum/count);
        }
        means.push(months);
    }
    for(let basin=1;basin<3;basin++){
        const annualRatio=means[basin].reduce((a,b)=>a+b,0)/means[0].reduce((a,b)=>a+b,0);
        assert.ok(annualRatio>0.70 && annualRatio<1.15,`annual Pacific/Atlantic ratio ${annualRatio}`);
        for(let month=0;month<12;month++){
            const ratio=means[basin][month]/means[0][month];
            assert.ok(ratio>0.55 && ratio<1.40,`month ${month+1}: ratio ${ratio}`);
        }
    }
});

test('Pacific tuning reduces magnitude while preserving direction and LL/UL steering',()=>{
    const s=loadSimulation();
    for(const mapType of [7,8]){
        const env=environment(s,mapType,41);
        const x=480,y=s.api.Coordinate.convertToXY(mapType,0,18).y,t=24*210;
        const ll=env.get('LLSteering',x,y,t).copy(),ul=env.get('ULSteering',x,y,t).copy();
        const raw=ul.copy().sub(ll),tuned=env.get('shear',x,y,t).copy();
        assert.ok(tuned.mag()<raw.mag());
        assert.ok(Math.abs(tuned.x*raw.y-tuned.y*raw.x)<1e-9);
        assert.ok(tuned.x*raw.x+tuned.y*raw.y>=0);
        assert.deepEqual(env.get('LLSteering',x,y,t),ll);
        assert.deepEqual(env.get('ULSteering',x,y,t),ul);
    }
});

test('Atlantic and non-Pacific shear stay equal to their own steering difference',()=>{
    const s=loadSimulation();
    for(const mapType of [0,6,9,10,14]){
        const env=environment(s,mapType,83);
        const x=480,y=350,t=24*210;
        const ll=env.get('LLSteering',x,y,t).copy(),ul=env.get('ULSteering',x,y,t).copy();
        const raw=ul.sub(ll),actual=env.get('shear',x,y,t).copy();
        assert.ok(Math.abs(raw.x-actual.x)<1e-9 && Math.abs(raw.y-actual.y)<1e-9);
    }
});

test('Pacific subtropical jet shear is retained north of the correction',()=>{
    const s=loadSimulation();
    for(const mapType of [7,8]){
        const env=environment(s,mapType,83);
        const x=480,y=s.api.Coordinate.convertToXY(mapType,0,48).y,t=24*210;
        const raw=env.get('ULSteering',x,y,t).copy().sub(env.get('LLSteering',x,y,t));
        const tuned=env.get('shear',x,y,t);
        assert.ok(Math.abs(raw.mag()-tuned.mag())<1e-9);
    }
});

test('Calm applies its 10 percent penalty to the corrected Pacific shear',()=>{
    const s=loadSimulation();
    for(const mapType of [7,8]){
        const normal=environment(s,mapType,83,s.api.normal);
        const calm=environment(s,mapType,83,s.api.calm);
        const x=480,y=350,t=24*210;
        assert.ok(Math.abs(calm.get('shear',x,y,t).mag()/normal.get('shear',x,y,t).mag()-1.1)<1e-9);
    }
});
