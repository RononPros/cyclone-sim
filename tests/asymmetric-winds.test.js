const test=require('node:test');
const assert=require('node:assert/strict');
const {loadSimulation}=require('./helpers/simulation');
const close=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

function fixture(south=false){
    const s=loadSimulation(),a=s.api,b=a.makeBasin(south?11:8);
    b.SHem=south;a.setLand(()=>0);
    const sys=a.makeSystem(b,south?170:140,south?-25:25,{windSize:1,windSpeed:150});
    b.activeSystems.push(sys);
    return {s,a,b,sys};
}
const point=(a,p,km,bearing)=>a.TemperatureEditor.destination(p.coord,km,bearing);

test('outer winds keep strengthening above 200 km/h for the same storm size',()=>{
    for(const size of [0.75,1,1.4]){
        const {a,sys}=fixture();sys.windSize=size;
        const previous=new Map();
        for(const maximum of [200,250,300,350,375,400,500,700]){
            sys.windSpeed=maximum/1.852;const p=a.WindField.profile(sys,sys.storm);
            for(const km of [100,150,300,700,1200,1800,2500]){
                const wind=a.WindField.windAt(p,point(a,p,km,0));
                assert.ok(wind>=(previous.get(km)||0)-1e-9,`${size}, ${maximum}, ${km}`);
                previous.set(km,wind);
            }
        }
        sys.windSpeed=350/1.852;const p350=a.WindField.profile(sys,sys.storm);
        const wind350=a.WindField.windAt(p350,point(a,p350,150,0));
        sys.windSpeed=400/1.852;const p400=a.WindField.profile(sys,sys.storm);
        assert.ok(a.WindField.windAt(p400,point(a,p400,150,0))>wind350*1.13);
    }
});

test('motion favours the correct side for every cardinal heading and hemisphere',()=>{
    const bearings={north:0,east:Math.PI/2,south:Math.PI,west:3*Math.PI/2};
    for(const south of [false,true])for(const [east,north,strong,weak] of [
        [-25,0,'north','south'],[25,0,'south','north'],[0,-25,'west','east'],[0,25,'east','west']
    ]){
        const {a,sys}=fixture(south);sys.windMotionEast=east;sys.windMotionNorth=north;
        const p=a.WindField.profile(sys,sys.storm);
        const favoured=a.WindField.windAt(p,point(a,p,250,bearings[south?weak:strong]));
        const opposite=a.WindField.windAt(p,point(a,p,250,bearings[south?strong:weak]));
        assert.ok(favoured>opposite*1.1,`${south}, ${east}, ${north}: ${favoured}, ${opposite}`);
    }
});

test('motion changes shape without exceeding the reported peak, including the far-field taper',()=>{
    const {a,sys}=fixture();sys.windMotionEast=-45;sys.windMotionNorth=-15;
    const p=a.WindField.profile(sys,sys.storm);let peak=0;
    for(let bearing=0;bearing<360;bearing+=2)for(const radius of [0,p.rmw/2,p.rmw,p.rmw*2,p.outer*0.9,p.outer]){
        const coord=point(a,p,radius,bearing*Math.PI/180),v=a.WindField.vectorAt(p,coord);
        assert.ok(Number.isFinite(v.wind) && v.wind>=0 && v.wind<=p.maximum+1e-7);
        close(v.wind,Math.hypot(v.east,v.north));
        if(radius===p.rmw)peak=Math.max(peak,v.wind);
        if(radius===p.outer)assert.ok(v.wind<1e-8);
    }
    assert.ok(peak>p.maximum*0.9999,'the reported maximum is attainable on the favoured side');
});

test('geographic displacement supplies physical motion speed and wraps the dateline',()=>{
    const {a}=fixture();
    const origin=new a.Coordinate(140,25),north=a.WindShelter.destination(origin,37.04,0);
    const m=a.WindField.motionBetween(origin,north);
    close(m.east,0);close(m.north,20);
    const from=new a.Coordinate(179.95,-20),to=a.WindShelter.destination(from,37.04,Math.PI/2);
    assert.ok(to.longitude<0);
    const crossing=a.WindField.motionBetween(from,to);
    close(crossing.east,20);close(crossing.north,0);
    const veryFast=a.WindField.motionBetween(origin,a.WindShelter.destination(origin,1000,0));
    close(Math.hypot(veryFast.east,veryFast.north),100);
});

test('the actual update records motion and active/advisory saves preserve it',()=>{
    const {s,a,b,sys}=fixture();a.fixedEnvironment(sys);
    a.algorithms[a.normal].steering=(_,v)=>v.set(-2,1);
    a.algorithms[a.normal].core=()=>{};a.algorithms[a.normal].typeDetermination=()=>a.TROP;
    const previous=sys.coord();sys.update();
    const expected=a.WindField.motionBetween(previous,sys.coord());
    close(sys.windMotionEast,expected.east);close(sys.windMotionNorth,expected.north);
    assert.ok(sys.windMotionEast<0 && sys.windMotionNorth<0);
    const restored=new a.ActiveSystem(b,new a.LoadData(a.SAVE_FORMAT,JSON.parse(JSON.stringify(sys.save()))));
    close(restored.windMotionEast,sys.windMotionEast);close(restored.windMotionNorth,sys.windMotionNorth);
    sys.doTrackForecast=()=>{};sys.storm.updateStats=()=>{};s.context.testSystem=sys;
    s.evaluate('ActiveSystem.prototype.advisory.call(testSystem);');
    const advisory=sys.storm.record.at(-1);
    close(advisory.windMotionEast,sys.windMotionEast);close(advisory.windMotionNorth,sys.windMotionNorth);
    const array=a.StormData.saveArr([advisory]);
    const loaded=a.StormData.loadArr(b,new a.LoadData(a.SAVE_FORMAT,array))[0];
    close(loaded.windMotionEast,sys.windMotionEast,1e-5);close(loaded.windMotionNorth,sys.windMotionNorth,1e-5);
});

test('legacy advisories derive motion from track segments and preserve unknown versus stationary data',()=>{
    const {a,b,sys}=fixture();
    const p=a.Coordinate.convertToXY(8,140,25),q=a.Coordinate.convertToXY(8,139.5,25);
    const first=new a.StormData(b,p.x,p.y,950,150,a.TROP),second=new a.StormData(b,q.x,q.y,950,150,a.TROP);
    const saved=a.StormData.saveArr([first,second]);delete saved.windMotionEast;delete saved.windMotionNorth;
    const loaded=a.StormData.loadArr(b,new a.LoadData(a.SAVE_FORMAT,saved));sys.storm.record=loaded;
    assert.equal(loaded[0].windMotionEast,undefined);
    assert.equal(a.WindField.profile(loaded[0],sys.storm).motion.east,0);
    assert.ok(a.WindField.profile(loaded[1],sys.storm).motion.east<0);
    second.windMotionEast=0;second.windMotionNorth=0;
    const mixed=a.StormData.loadArr(b,new a.LoadData(a.SAVE_FORMAT,a.StormData.saveArr([first,second])));
    assert.equal(mixed[0].windMotionEast,undefined);assert.equal(mixed[1].windMotionEast,0);
    assert.equal(a.WindField.profile(mixed[1],sys.storm).motion.east,0);
});

test('upwind ridges shelter lowlands and coastal water while equal-height plains remain exposed',()=>{
    const {a,b}=fixture(),city=new a.Coordinate(140,25);
    const ridge=a.WindShelter.destination(city,20,3*Math.PI/2);
    a.setLand(c=>a.TemperatureAdjustments.distanceKm(c,ridge)<7?1:0.51);
    const sheltered=a.WindShelter.factor(b,city,0.51,20,0);
    const exposed=a.WindShelter.factor(b,city,0.51,-20,0);
    assert.ok(sheltered>=0.62 && sheltered<0.8);assert.equal(exposed,1);
    assert.ok(a.WindShelter.factor(b,city,0,20,0)<0.8,'shelter can extend offshore downwind of an island');
    a.setLand(()=>0.51);
    assert.equal(a.WindShelter.factor(b,city,0.51,20,0),1);
});

test('cyclone shelter follows circulating local wind rather than a radial line to the centre',()=>{
    const {a,b,sys}=fixture(),p=a.WindField.profile(sys,sys.storm);
    const city=point(a,p,150,0),clear=a.WindField.vectorAt(p,city,0.51);
    const upwind=Math.atan2(-clear.east,-clear.north);
    const ridge=a.WindShelter.destination(city,20,upwind);
    a.setLand(c=>a.TemperatureAdjustments.distanceKm(c,ridge)<10?1:0.51);
    const lee=a.WindField.windAt(p,city,0.51);
    assert.ok(lee<clear.wind*0.85);
    const radialRidge=a.WindShelter.destination(city,20,Math.PI);
    a.setLand(c=>a.TemperatureAdjustments.distanceKm(c,radialRidge)<7?1:0.51);
    assert.ok(a.WindField.windAt(p,city,0.51)>lee*1.1);
});

test('shelter wraps the dateline and changes smoothly through direction-bin boundaries',()=>{
    const {a,b}=fixture(true),city=new a.Coordinate(-179.95,-20);
    const ridge=a.WindShelter.destination(city,20,3*Math.PI/2);
    assert.ok(ridge.longitude>179);
    a.setLand(c=>a.TemperatureAdjustments.distanceKm(c,ridge)<9?1:0.51);
    assert.ok(a.WindShelter.factor(b,city,0.51,20,0)<0.85);
    const direction=3*Math.PI/2;
    const values=[-1e-5,0,1e-5].map(delta=>{
        const angle=direction+delta;
        return a.WindShelter.factor(b,city,0.51,-Math.sin(angle),-Math.cos(angle));
    });
    assert.ok(Math.max(...values)-Math.min(...values)<0.0001);
});

test('background surface winds use the same directional shelter and refresh after terrain replacement',()=>{
    const {a,b}=fixture(),city=new a.Coordinate(140,25);
    b.env={fields:{surfaceWind:{}},get:()=>({x:20,y:0})};
    a.setLand(()=>0.51);const exposed=a.WindField.backgroundAt(b,city,0.51);
    const ridge=a.WindShelter.destination(city,20,3*Math.PI/2);
    a.setLand(c=>a.TemperatureAdjustments.distanceKm(c,ridge)<8?1:0.51);
    const sheltered=a.WindField.backgroundAt(b,city,0.51);
    assert.ok(sheltered<exposed*0.85);
    b.tick++;b.env.get=()=>({x:-20,y:0});
    close(a.WindField.backgroundAt(b,city,0.51),exposed);
});

test('sheltered city and land-cell winds produce smaller shared hourly impacts',()=>{
    function run(blocked){
        const {a,b,sys}=fixture();b.mainSubBasin=0;b.forSubBasinChain=()=>[0];
        b.windImpacts=a.WindImpacts.create(0);
        const p=a.WindField.profile(sys,sys.storm),coord=point(a,p,150,0);
        const flow=a.WindField.vectorAt(p,coord,0.51);
        const ridge=a.WindShelter.destination(coord,20,Math.atan2(-flow.east,-flow.north));
        a.setLand(c=>blocked && a.TemperatureAdjustments.distanceKm(c,ridge)<10?1:0.51);
        const city={id:'shelter-test',name:'Shelter city',coord,terrain:0.51};
        const cell={key:'399,315',coord,terrain:0.51,sub:0,cityId:city.id,population:1000000,assets:40000000000};
        a.CityLocations.context=()=>({cities:[city],cells:[cell]});
        const expected=a.WindField.strongest(a.WindField.profiles(b),coord,0.51).wind;
        a.WindImpacts.advance(b);
        const observed=a.WindImpacts.cityAt(b,city.id);
        close(observed.wind,Math.round(expected*10)/10);
        assert.equal(observed.damage,sys.storm.damage);
        return {wind:observed.wind,damage:sys.storm.damage};
    }
    const clear=run(false),sheltered=run(true);
    assert.ok(sheltered.wind<clear.wind*0.85);
    assert.ok(sheltered.damage>0 && sheltered.damage<clear.damage);
});
