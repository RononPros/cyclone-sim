const test=require('node:test');
const assert=require('node:assert/strict');
const {loadSimulation}=require('./helpers/simulation');
const close=(a,b,tolerance=1e-7)=>assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);

function fixture(){
    const s=loadSimulation(),a=s.api,b=a.makeBasin(8);
    b.tick=0;b.mainSubBasin=0;b.windImpacts=a.WindImpacts.create(0);
    b.getScale=()=>({classifications:[]});b.forSubBasinChain=()=>[0];
    const coord=new a.Coordinate(135.1,25);
    a.setLand(c=>c.longitude>=135 && a.TemperatureAdjustments.distanceKm(c,coord)<50?0.51:0);
    const grid=a.CityLocations.context(b),p=a.Coordinate.convertToXY(8,coord);
    grid.cities=[{id:'fixture',name:'Test city',coord,x:p.x,y:p.y,population:1000000,terrain:0.51}];
    grid.cells=[{key:'399,315',coord,terrain:0.51,sub:0,cityId:'fixture',population:1000000,assets:40000000000}];
    const sys=a.makeSystem(b,134.8,25,{windSpeed:250,windSize:1});b.activeSystems.push(sys);
    return {s,a,b,sys,coord,grid};
}

test('wind footprints peak at the RMW, decay smoothly and remain bounded',()=>{
    const {a,sys}=fixture();
    const p=a.WindField.profile(sys,sys.storm);
    const at=km=>a.TemperatureEditor.destination(p.coord,km,Math.PI/2);
    close(a.WindField.windAt(p,p.coord),p.maximum*p.eye);
    close(a.WindField.windAt(p,at(p.rmw)),250);
    assert.ok(a.WindField.windAt(p,at(2*p.rmw))<250);
    close(a.WindField.windAt(p,at(p.outer)),0);
    for(let km=0;km<=2000;km+=10){const wind=a.WindField.windAt(p,at(km));assert.ok(Number.isFinite(wind) && wind>=0 && wind<=250+1e-8);}
});

test('storm size increases distant winds and spherical distance wraps the dateline in southern basins',()=>{
    const {a,sys}=fixture();
    sys.windSize=0.75;const compact=a.WindField.profile(sys,sys.storm);
    sys.windSize=1.4;const large=a.WindField.profile(sys,sys.storm);
    const remote=a.TemperatureEditor.destination(compact.coord,300,0);
    assert.ok(a.WindField.windAt(large,remote)>a.WindField.windAt(compact,remote));
    const b=a.makeBasin(11);b.SHem=true;
    const storm=a.makeSystem(b,179.7,-20,{windSize:1,windSpeed:150});
    const p=a.WindField.profile(storm,storm.storm);
    assert.ok(a.WindField.windAt(p,new a.Coordinate(-179.7,-20))>30);
});

test('the broader outer circulation reaches distant cities without raising peak wind',()=>{
    const {a,sys}=fixture();sys.windSpeed=150;sys.windSize=1;
    const p=a.WindField.profile(sys,sys.storm);
    const distant=a.TemperatureEditor.destination(p.coord,600,0);
    assert.ok(a.WindField.windAt(p,distant)>=34,'storm-force winds reach 600 km offshore');
    assert.ok(a.WindField.windAt(p,distant,0.51)>25,'land friction still permits substantial distant winds');
    close(a.WindField.windAt(p,a.TemperatureEditor.destination(p.coord,p.rmw,0)),150);
    for(const km of [p.outer-1,p.outer,p.outer+1])
        assert.ok(a.WindField.windAt(p,a.TemperatureEditor.destination(p.coord,km,0))<0.001);
});

test('terrain is substantially gentler in lowlands and remains bounded and ordered with elevation',()=>{
    const {a}=fixture(),factor=a.WindField.terrainFactor;
    assert.equal(factor(0),1);
    assert.ok(factor(0.501)>=0.94,'lowest land retains at least 94% of open-terrain wind');
    assert.ok(factor(0.6)>=0.9,'low terrain avoids the old steep initial reduction');
    assert.ok(factor(1)>=0.64 && factor(1)<=0.66,'highest terrain retains about 65%');
    let previous=1;
    for(let i=0;i<=100;i++){
        const terrain=0.5+i/200,current=factor(terrain);
        const previousRelease=0.82*(1-0.3*i/100);
        assert.ok(Number.isFinite(current) && current>=0.65-1e-12 && current<1);
        assert.ok(current<=previous+1e-12,'higher terrain cannot increase wind in this model');
        assert.ok(current>previousRelease,'every land elevation receives a gentler reduction');
        previous=current;
    }
});

test('a 200 km/h cyclone gives about 100 km/h at the reported lowland distance',()=>{
    const {a,sys}=fixture();sys.windSpeed=200/1.852;sys.windSize=1;
    const profile=a.WindField.profile(sys,sys.storm);
    const city=a.TemperatureEditor.destination(profile.coord,150,0);
    const local=a.WindField.windAt(profile,city,0.51)*1.852;
    assert.ok(local>=99 && local<=101,`lowland wind: ${local} km/h`);
    const eyewall=a.TemperatureEditor.destination(profile.coord,profile.rmw,0);
    const eyewallWind=a.WindField.windAt(profile,eyewall,0.51)*1.852;
    assert.ok(eyewallWind>=188 && eyewallWind<=191,'lowland eyewall winds stay close to the storm maximum');
});

test('size initialization does not consume gameplay randomness and persists in active/advisory data',()=>{
    const {s,a,sys,b}=fixture();
    delete sys.windSize;
    s.context.randomSeed(42);const expected=s.context.random();
    s.context.randomSeed(42);const size=a.WindField.ensure(sys);assert.equal(s.context.random(),expected);
    assert.equal(a.WindField.ensure(sys),size);
    const saved=JSON.parse(JSON.stringify(sys.save()));
    const restored=new a.ActiveSystem(b,new a.LoadData(a.SAVE_FORMAT,saved));
    assert.equal(restored.windSize,size);
    const data=new a.StormData(b,400,350,950,100,a.TROP);data.windSize=size;
    const array=a.StormData.saveArr([data]);
    const loaded=a.StormData.loadArr(b,new a.LoadData(a.SAVE_FORMAT,array));
    close(loaded[0].windSize,size,1e-6);
    delete array.windSize;
    const legacy=a.StormData.loadArr(b,new a.LoadData(a.SAVE_FORMAT,array));
    assert.ok(Number.isFinite(a.WindField.profile(legacy[0],sys.storm).size));
});

test('offshore cyclones cause damage and deaths with zero landfalls, exactly once per hour',()=>{
    const {a,b,sys}=fixture();
    for(let hour=1;hour<=12;hour++){b.tick=hour;a.WindImpacts.advance(b);}
    assert.ok(sys.storm.damage>0);assert.ok(sys.storm.deaths>0);assert.equal(sys.storm.landfalls,0);
    const before=JSON.stringify(a.WindImpacts.serialize(b));
    const damage=sys.storm.damage;a.WindImpacts.advance(b);
    assert.equal(sys.storm.damage,damage);assert.equal(JSON.stringify(a.WindImpacts.serialize(b)),before);
    const city=a.WindImpacts.cityAt(b,'fixture');
    assert.equal(city.damage,sys.storm.damage);assert.equal(city.deaths,sys.storm.deaths);
    assert.equal(city.hours,12);
    assert.equal(b.fetchSeason().stats(0).damage,sys.storm.damage);
    assert.equal(b.fetchSeason().stats(0).deaths,sys.storm.deaths);
});

test('overlapping cyclones share one cell impact instead of stacking full damage',()=>{
    const first=fixture();first.b.tick=1;first.a.WindImpacts.advance(first.b);
    const second=fixture();
    const duplicate=second.a.makeSystem(second.b,134.8,25,{windSpeed:250,windSize:1});second.b.activeSystems.push(duplicate);
    second.b.tick=1;second.a.WindImpacts.advance(second.b);
    assert.equal(second.sys.storm.damage,first.sys.storm.damage);
    assert.equal(duplicate.storm.damage,0);
    assert.equal(second.b.fetchSeason().stats(0).damage,first.sys.storm.damage);
});

test('finite assets/population and thresholds prevent unbounded repeated destruction',()=>{
    const {a}=fixture();const cell={assets:1000000,population:1000};
    let old={damage:0,fatalities:0},deaths=0;
    assert.equal(a.WindImpacts.loss(cell,old,33.9).damage,0);
    for(let hour=0;hour<20000;hour++){
        const delta=a.WindImpacts.loss(cell,old,1000);
        old={damage:old.damage+delta.damage,fatalities:delta.fatalities};deaths+=delta.deaths;
    }
    assert.ok(old.damage<=cell.assets+1e-6);assert.ok(deaths<=cell.population);
    assert.ok(old.damage>0 && deaths>0);
});

test('save/resume retains depletion, history and exact subsequent impact increments',()=>{
    const first=fixture(),second=fixture();
    for(let hour=1;hour<=6;hour++){first.b.tick=hour;first.a.WindImpacts.advance(first.b);}
    const saved=JSON.parse(JSON.stringify(first.a.WindImpacts.serialize(first.b)));
    second.b.tick=6;second.b.windImpacts=second.a.WindImpacts.normalize(saved,6);
    second.sys.storm.damage=first.sys.storm.damage;second.sys.storm.deaths=first.sys.storm.deaths;
    for(let hour=7;hour<=12;hour++){
        first.b.tick=second.b.tick=hour;first.a.WindImpacts.advance(first.b);second.a.WindImpacts.advance(second.b);
    }
    assert.equal(first.sys.storm.damage,second.sys.storm.damage);assert.equal(first.sys.storm.deaths,second.sys.storm.deaths);
    assert.deepEqual(JSON.parse(JSON.stringify(first.a.WindImpacts.serialize(first.b))),JSON.parse(JSON.stringify(second.a.WindImpacts.serialize(second.b))));
    const earlier=first.a.WindImpacts.cityAt(first.b,'fixture',3);
    assert.ok(earlier.damage<first.a.WindImpacts.cityAt(first.b,'fixture').damage);
    const migrated=first.a.WindImpacts.normalize(undefined,120);
    assert.equal(migrated.startTick,120);first.b.windImpacts=migrated;
    assert.equal(first.a.WindImpacts.cityAt(first.b,'fixture',119),null);
});

test('the actual hourly loop records offshore impacts and only counts a landfall on centre crossing',()=>{
    const {s,a,b,sys,coord}=fixture();a.fixedEnvironment(sys);b.env.wobble=()=>{};b.env.record=()=>{};
    b.naturalSpawningEnabled=false;
    a.algorithms[a.normal].steering=(_,v)=>v.set(0,0);
    a.algorithms[a.normal].core=()=>{};a.algorithms[a.normal].typeDetermination=()=>a.TROP;
    s.context.testBasin=b;s.evaluate('viewTick=testBasin.tick;');
    b.advanceSimOneStep();assert.ok(sys.storm.damage>0);assert.equal(sys.storm.landfalls,0);
    const target=a.Coordinate.convertToXY(8,coord);
    a.algorithms[a.normal].steering=(_,v)=>v.set(target.x-sys.pos.x,target.y-sys.pos.y);
    b.advanceSimOneStep();assert.equal(sys.storm.landfalls,1);
    a.algorithms[a.normal].steering=(_,v)=>v.set(0,0);
    b.advanceSimOneStep();assert.equal(sys.storm.landfalls,1);
});

test('formation of a tropical cyclone preserves impacts accumulated before classification',()=>{
    const s=loadSimulation();
    const result=s.evaluate(`
        Basin.deleteSave=function(){return Promise.resolve();};
        Land=class{constructor(){this.get=()=>0;this.getSubBasin=()=>0;}};
        const basin=new Basin(false,{mapType:0,actMode:SIM_MODE_NORMAL,seed:42,hem:false,year:2026});
        const p=Coordinate.convertToXY(0,-50,20);
        const system=new ActiveSystem(basin,{x:p.x,y:p.y,type:TROPWAVE,windSpeed:20,pressure:1010});
        const storm=system.fetchStorm();
        storm.damage=123456;storm.deaths=7;storm.landfalls=1;
        storm.updateStats(new StormData(basin,p.x,p.y,990,70,TROP));
        ({damage:storm.damage,deaths:storm.deaths,landfalls:storm.landfalls,inBasin:storm.inBasinTC});
    `);
    assert.equal(result.inBasin,true);assert.equal(result.damage,123456);assert.equal(result.deaths,7);assert.equal(result.landfalls,1);
});
