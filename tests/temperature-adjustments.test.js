const test=require('node:test');
const assert=require('node:assert/strict');
const {loadSimulation}=require('./helpers/simulation');
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);

function environment(s,mapType=8,mode=s.api.normal,southern=false){
    const a=s.api;
    s.context.noiseSeed(5599);
    const basin=a.makeBasin(mapType,mode,5599);
    basin.tick=0;basin.SHem=southern;
    basin.temperatureAdjustments=a.TemperatureAdjustments.create();
    basin.env=new a.Environment(basin);basin.env.init();
    return basin;
}

test('zero adjustment preserves the existing fields; the global offset applies exactly once in every mode',()=>{
    const s=loadSimulation(),a=s.api,A=a.TemperatureAdjustments;
    for(let mode=0;mode<a.modes.length;mode++)for(const mapType of [0,6,7,8,10,14]){
        const b=environment(s,mapType,mode,mapType===10);
        for(const [x,y] of [[100,100],[400,350],[800,450]]){
            const plainSST=b.env.get('SST',x,y,0),plainAnomaly=b.env.get('SSTAnomaly',x,y,0);
            delete b.temperatureAdjustments;
            assert.equal(b.env.get('SST',x,y,0),plainSST);
            assert.equal(b.env.get('SSTAnomaly',x,y,0),plainAnomaly);
            b.temperatureAdjustments=A.create(2.3);
            close(b.env.get('SST',x,y,0)-plainSST,2.3);
            close(b.env.get('SSTAnomaly',x,y,0)-plainAnomaly,2.3);
            b.temperatureAdjustments=A.create();
        }
    }
});

test('bubbles have their specified centre strength, smooth half-radius falloff and zero outside',()=>{
    const s=loadSimulation(),a=s.api,A=a.TemperatureAdjustments,b=environment(s);
    const centre=a.Coordinate.convertFromXY(8,450,350);
    A.addBubble(b,centre,4,500);
    close(A.offsetAt(b,450,350,0),4);
    for(const [distance,expected] of [[250,2],[500,0],[600,0]]){
        const c=a.TemperatureEditor.destination(centre,distance,Math.PI/2);
        const p=a.Coordinate.convertToXY(8,c.longitude,c.latitude);
        close(A.offsetAt(b,p.x,p.y,0),expected);
    }
});

test('overlapping warm and cold bubbles add to the global adjustment and both SST layers agree',()=>{
    const s=loadSimulation(),a=s.api,A=a.TemperatureAdjustments,b=environment(s);
    const x=450,y=350,centre=a.Coordinate.convertFromXY(8,x,y);
    const baseSST=b.env.get('SST',x,y,0),baseAnomaly=b.env.get('SSTAnomaly',x,y,0);
    A.setGlobal(b,1);A.addBubble(b,centre,2,500);A.addBubble(b,centre,-4,500);
    close(A.offsetAt(b,x,y,0),-1);
    close(b.env.get('SST',x,y,0)-baseSST,-1);
    close(b.env.get('SSTAnomaly',x,y,0)-baseAnomaly,-1);
});

test('local adjustments use map coordinates correctly in both hemispheres and across the dateline',()=>{
    const s=loadSimulation(),a=s.api,A=a.TemperatureAdjustments;
    for(const [mapType,southern] of [[8,false],[10,true],[11,true],[0,true]]){
        const b=environment(s,mapType,a.normal,southern),x=600,y=350;
        const c=a.Coordinate.convertFromXY(mapType,x,y);
        const beforeSST=b.env.get('SST',x,y,0),beforeAnomaly=b.env.get('SSTAnomaly',x,y,0);
        A.addBubble(b,c,3,500);
        close(b.env.get('SST',x,y,0)-beforeSST,3);
        close(b.env.get('SSTAnomaly',x,y,0)-beforeAnomaly,3);
    }
    const across=A.distanceKm({longitude:179.8,latitude:15},{longitude:-179.8,latitude:15});
    assert.ok(across>42 && across<44,'the dateline gap is about 43 km, not almost a whole circumference');
    const b=environment(s);
    A.addBubble(b,{longitude:179.8,latitude:15},3,500);
    const p=a.Coordinate.convertToXY(8,-179.8,15);
    assert.ok(A.offsetAt(b,p.x,p.y,0)>2.9);
});

test('past revisions remain immutable when bubbles are changed, deleted or undone later',()=>{
    const s=loadSimulation(),a=s.api,A=a.TemperatureAdjustments,b=environment(s);
    const c=a.Coordinate.convertFromXY(8,450,350);
    A.setGlobal(b,1);
    b.tick=12;const id=A.addBubble(b,c,3,500);
    const at12=JSON.stringify(A.stateAt(b,12));
    b.tick=18;A.updateBubble(b,id,{anomaly:-2,radiusKm:1000});
    assert.equal(JSON.stringify(A.stateAt(b,12)),at12);
    close(A.offsetAt(b,450,350,6),1);
    close(A.offsetAt(b,450,350,12),4);
    close(A.offsetAt(b,450,350,18),-1);
    b.tick=24;A.removeBubble(b,id);
    b.tick=30;assert.equal(A.undo(b),true);
    close(A.offsetAt(b,450,350,24),1);
    close(A.offsetAt(b,450,350,30),-1);
    assert.equal(JSON.stringify(A.stateAt(b,12)),at12);
    b.tick=12;assert.equal(A.setGlobal(b,4),false,'cannot insert an edit behind recorded history');
});

test('same-hour edits and undo do not create duplicate revision timestamps',()=>{
    const s=loadSimulation(),a=s.api,A=a.TemperatureAdjustments,b=environment(s);
    A.setGlobal(b,2);A.setGlobal(b,3);A.undo(b);
    close(A.stateAt(b).globalOffset,2);
    assert.equal(b.temperatureAdjustments.revisions.length,1);
    b.tick=6;A.setGlobal(b,4);A.setGlobal(b,5);
    assert.deepEqual(Array.from(b.temperatureAdjustments.revisions,r=>r.tick),[0,6]);
    close(A.stateAt(b,0).globalOffset,2);
});

test('hiding bubble outlines never changes actual SST or anomaly values',()=>{
    const s=loadSimulation(),a=s.api,A=a.TemperatureAdjustments,b=environment(s);
    A.addBubble(b,a.Coordinate.convertFromXY(8,450,350),4,700);
    const before=[b.env.get('SST',450,350,0),b.env.get('SSTAnomaly',450,350,0)];
    A.setVisible(b,false);
    assert.deepEqual([b.env.get('SST',450,350,0),b.env.get('SSTAnomaly',450,350,0)],before);
    assert.equal(b.temperatureAdjustments.showBubbles,false);
    assert.equal(b.lastSaved,-1);
});

test('serialized revisions resume identically and old or malformed saves migrate safely',()=>{
    const s=loadSimulation(),a=s.api,A=a.TemperatureAdjustments,b=environment(s);
    A.setGlobal(b,2);b.tick=12;
    A.addBubble(b,a.Coordinate.convertFromXY(8,450,350),-3,750);A.setVisible(b,false);
    const saved=JSON.parse(JSON.stringify(A.serialize(b)));
    const restored=environment(s);restored.tick=12;restored.temperatureAdjustments=A.normalize(saved,12);
    for(const tick of [0,6,12,100])close(A.offsetAt(b,450,350,tick),A.offsetAt(restored,450,350,tick));
    assert.equal(restored.temperatureAdjustments.showBubbles,false);
    saved.revisions[0].globalOffset=99;
    close(A.stateAt(b,0).globalOffset,2,'serialized records must not share mutable state');
    for(const old of [undefined,null,{}, {version:99,revisions:[]}]){
        const migrated=A.normalize(old);
        assert.equal(migrated.revisions[0].globalOffset,0);
        assert.equal(migrated.revisions[0].bubbles.length,0);
    }
    const malformed=A.normalize({version:1,revisions:[null,{tick:-1},{tick:100},
        {tick:0,globalOffset:99,bubbles:[null,{id:1,longitude:Infinity},
            {id:2,longitude:540,latitude:100,anomaly:-99,radiusKm:-4}]}]},12);
    assert.equal(malformed.revisions.length,1);
    assert.equal(malformed.revisions[0].globalOffset,5);
    const bubble=malformed.revisions[0].bubbles[0];
    assert.equal(bubble.longitude,-180);assert.equal(bubble.latitude,90);
    assert.equal(bubble.anomaly,-10);assert.equal(bubble.radiusKm,100);
});

test('temperature bubbles reach the existing storm pressure-potential calculation',()=>{
    const s=loadSimulation(),a=s.api,A=a.TemperatureAdjustments,b=environment(s);
    const x=450,y=450,c=a.Coordinate.convertFromXY(8,x,y);
    const exposure={oceanSupport:1};
    const before=a.LandInteraction.pressurePotential(b.env.get('SST',x,y,0),exposure);
    A.addBubble(b,c,3,500);
    const warmer=a.LandInteraction.pressurePotential(b.env.get('SST',x,y,0),exposure);
    assert.ok(warmer<before);
    A.updateBubble(b,A.stateAt(b).bubbles[0].id,{anomaly:-3});
    const cooler=a.LandInteraction.pressurePotential(b.env.get('SST',x,y,0),exposure);
    assert.ok(cooler>before);
});
