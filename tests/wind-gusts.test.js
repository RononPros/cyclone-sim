const test=require('node:test');
const assert=require('node:assert/strict');
const {loadSimulation}=require('./helpers/simulation');

function fixture(){
    const s=loadSimulation(),a=s.api,b=a.makeBasin(8);
    a.setLand(()=>0.51);b.tick=0;b.windImpacts=a.WindImpacts.create(0);
    b.mainSubBasin=0;b.forSubBasinChain=()=>[0];
    const sys=a.makeSystem(b,139.5,35.5,{windSpeed:150,windSize:1});b.activeSystems.push(sys);
    const grid=a.CityLocations.context(b),coord=new a.Coordinate(139.75,35.68),p=a.Coordinate.convertToXY(8,coord);
    grid.cities=[{id:'test',name:'Test city',coord,x:p.x,y:p.y,terrain:0.51}];
    grid.cells=[{key:'411,300',coord,terrain:0.51,cityId:'test',sub:0,population:10000,assets:1e9}];
    s.context.testBasin=b;
    s.evaluate('defineColors();UI.init();UI.viewBasin=testBasin;viewTick=testBasin.tick;land.drawn=true;tracks=createGraphics(960,540);forecastTracks=createGraphics(960,540);');
    return {s,a,b,sys,city:grid.cities[0],grid};
}

test('gust estimates stay above sustained wind and within their land/water exposure bounds',()=>{
    const s=loadSimulation(),a=s.api;
    for(const seed of [0,1,42,5599,0xffffffff]){
        const b=a.makeBasin(8,a.normal,seed);
        for(const coord of [new a.Coordinate(0,0),new a.Coordinate(139,35),new a.Coordinate(-179,-20),new a.Coordinate(40,89)])
            for(const tick of [0,1,96,8760,876000])for(const terrain of [0,0.51,1]){
                const factor=a.WindField.gustFactor(b,coord,terrain,tick);
                assert.ok(factor>=(terrain?1.25:1.15)&&factor<=(terrain?1.45:1.30));
                for(const wind of [0,1,25,100,250,1000]){
                    const gust=a.WindField.gustFromWind(b,wind,coord,terrain,tick);
                    assert.ok(Number.isFinite(gust)&&gust>=wind&&gust<=wind*1.45+1e-8);
                    if(!wind)assert.equal(gust,0);
                }
            }
    }
    assert.equal(a.WindField.gustFromWind(a.makeBasin(),NaN,new a.Coordinate(0,0)),null);
});

test('gust variation is smooth, reproducible, seeded and continuous at the dateline',()=>{
    const s=loadSimulation(),a=s.api,b=a.makeBasin(8,a.normal,0),c=new a.Coordinate(139,35);
    const first=a.WindField.gustFactor(b,c,0.51,100);
    s.context.randomSeed(42);const expected=s.context.random();s.context.randomSeed(42);
    for(let i=0;i<100;i++)assert.equal(a.WindField.gustFactor(b,c,0.51,100),first);
    assert.equal(s.context.random(),expected);
    assert.notEqual(a.WindField.gustFactor(a.makeBasin(8,a.normal,42),c,0.51,100),first);
    assert.notEqual(a.WindField.gustFactor(b,c,0.51,112),first);
    const nearby=a.WindField.gustFactor(b,new a.Coordinate(139.001,35.001),0.51,100.001);
    assert.ok(Math.abs(first-nearby)<0.001);
    const west=a.WindField.gustFactor(b,new a.Coordinate(-179.999999,20),0.51,100);
    const east=a.WindField.gustFactor(b,new a.Coordinate(179.999999,20),0.51,100);
    assert.ok(Math.abs(west-east)<1e-7);
    assert.equal(a.WindField.gustFactor(b,c,0.51,100),a.WindField.gustFactor(b,c,1,100),'elevation is not roughness');
});

test('city gusts use the actual sheltered local cyclone wind, with background gusts between storms',()=>{
    const {a,b,city}=fixture(),profiles=a.WindField.profiles(b);
    const sample=a.WindField.sample(b,profiles,city.coord,city.terrain);
    assert.equal(sample.gust,a.WindField.gustFromWind(b,sample.wind,city.coord,city.terrain));
    assert.ok(sample.gust>sample.wind);
    b.activeSystems=[];b.env=new a.Environment(b);b.env.init();
    const background=a.WindField.sample(b,[],city.coord,city.terrain);
    assert.ok(background.wind>0&&background.gust>background.wind);
    a.CityOverlay.drawCities();assert.equal(a.CityOverlay.labels[0].gust,background.gust);
});

test('missing historical weather does not invent a gust estimate',()=>{
    const {a,b,city}=fixture();b.activeSystems=[];b.tick=120;b.env=new a.Environment(b);b.env.init();
    const sample=a.WindField.sample(b,[],city.coord,city.terrain,0);
    assert.equal(sample.backgroundKnown,false);assert.equal(sample.gust,null);
});

test('hourly gust records, earlier peaks and subsequent evolution survive save/resume',()=>{
    const first=fixture(),second=fixture();
    const observations=[];
    for(let tick=1;tick<=12;tick++){
        first.b.tick=tick;first.a.WindImpacts.advance(first.b);
        observations.push({...first.a.WindImpacts.cityAt(first.b,'test')});
    }
    assert.ok(observations.every(v=>v.gust>v.wind&&v.peakGust>=v.gust));
    assert.equal(first.a.WindImpacts.cityAt(first.b,'test',3).gust,observations[2].gust);
    assert.equal(first.a.WindImpacts.cityAt(first.b,'test',3).peakGust,observations[2].peakGust);
    second.b.tick=12;second.b.windImpacts=second.a.WindImpacts.normalize(JSON.parse(JSON.stringify(first.a.WindImpacts.serialize(first.b))),12);
    second.sys.storm.damage=first.sys.storm.damage;second.sys.storm.deaths=first.sys.storm.deaths;
    for(let tick=13;tick<=24;tick++){
        first.b.tick=second.b.tick=tick;first.a.WindImpacts.advance(first.b);second.a.WindImpacts.advance(second.b);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(first.a.WindImpacts.serialize(first.b))),JSON.parse(JSON.stringify(second.a.WindImpacts.serialize(second.b))));
    const saved=JSON.stringify(first.a.WindImpacts.serialize(first.b));
    first.a.WindImpacts.advance(first.b);assert.equal(JSON.stringify(first.a.WindImpacts.serialize(first.b)),saved);
});

test('version-1 impact saves retain losses and six-column history without fabricating old gust peaks',()=>{
    const {a,b,city}=fixture();b.tick=10;
    const old={version:1,startTick:0,lastTick:10,cells:{'411,300':{damage:500,fatalities:0.4}},
        cities:{test:{lastWind:80,peakWind:120,hours:8,damage:500,deaths:0,records:[[1,120,120,1,100,0],[10,80,120,8,500,0]]}}};
    b.windImpacts=a.WindImpacts.normalize(old,10);
    assert.equal(b.windImpacts.version,2);assert.equal(b.windImpacts.cells['411,300'].damage,500);
    const past=a.WindImpacts.cityAt(b,city.id,1);
    assert.equal(past.wind,120);assert.equal(past.damage,100);assert.equal(past.gust,null);assert.equal(past.peakGust,null);
    assert.equal(a.WindImpacts.cityAt(b,city.id).peakGust,null);
    b.tick=11;a.WindImpacts.advance(b);
    assert.ok(a.WindImpacts.cityAt(b,city.id).peakGust>0);
    assert.equal(a.WindImpacts.cityAt(b,city.id,10).gust,null);
    const roundtrip=a.WindImpacts.normalize(JSON.parse(JSON.stringify(a.WindImpacts.serialize(b))),11);
    assert.equal(roundtrip.cities.test.records[0].length,6);
    assert.equal(roundtrip.cities.test.records.at(-1).length,8);
});

test('compact city labels show Wind, Gusts or Both in the selected units and remain selectable',()=>{
    const {s,a,b,city}=fixture();a.setSettings({speedUnit:2});
    const values=a.WindField.sample(b,a.WindField.profiles(b),city.coord,city.terrain);
    const w=String(Math.round(values.wind*1.852)),g=String(Math.round(values.gust*1.852));
    const before=JSON.stringify(a.WindImpacts.serialize(b));
    for(const [mode,text] of [[0,w],[1,'G'+g],[2,w+' G'+g]]){
        a.setSettings({cityWindMode:mode});s.context.drawCalls.length=0;a.CityOverlay.drawCities();
        const label=a.CityOverlay.labels[0];assert.equal(label.text,text);assert.equal(label.height,12);
        assert.ok(s.context.drawCalls.some(c=>c.value===text&&c.size===9));
        assert.equal(a.CityOverlay.pick(label.x+1,label.y-1).id,city.id,'padded tag target');
        assert.equal(a.CityOverlay.pick(city.x,city.y).id,city.id,'city dot target');
    }
    assert.equal(JSON.stringify(a.WindImpacts.serialize(b)),before,'drawing and modes cannot record impacts');
});

test('historical city gusts and the city card use recorded values and expose unknown legacy gusts',()=>{
    const {s,a,b,city}=fixture();b.tick=3;
    b.windImpacts.cities.test={lastWind:30,peakWind:80,lastGust:40,peakGust:110,hours:1,damage:5,deaths:0,
        records:[[1,80,80,1,5,0],[2,50,80,1,5,0,70,110],[3,30,80,1,5,0,40,110]]};
    a.setSettings({cityWindMode:2});s.evaluate('viewTick=1;');a.CityOverlay.drawCities();
    assert.equal(a.CityOverlay.labels[0].text,'80 G—');
    s.evaluate('viewTick=2;');a.CityOverlay.drawCities();assert.equal(a.CityOverlay.labels[0].text,'50 G70');
    a.CityOverlay.card.show();
    // The normal map click opens the selected city's card.
    s.context.hitX=city.x;s.context.hitY=city.y;
    s.evaluate('getMouseX=()=>hitX;getMouseY=()=>hitY;primaryWrapper.clickFunc();drawCalls.length=0;');
    a.CityOverlay.card.renderFunc.call(a.CityOverlay.card,a.CityOverlay.card.schematics());
    for(const text of ['Local wind (1-min)','Gust (est. 3-sec)','Peak recorded wind','Peak recorded gust'])
        assert.ok(s.context.drawCalls.some(c=>c.value===text));
    assert.ok(s.context.drawCalls.some(c=>c.value==='110 kt'));
    assert.ok(s.context.drawCalls.every(c=>c.y>=0&&c.y+c.size<=a.CityOverlay.card.height));
    b.activeSystems[0].windSpeed=1000;s.evaluate('viewTick=3;drawCalls.length=0;');
    a.CityOverlay.card.renderFunc.call(a.CityOverlay.card,a.CityOverlay.card.schematics());
    assert.ok(s.context.drawCalls.some(c=>c.value==='110 kt'),'paused edits cannot invent a recorded gust peak');
});

test('gust heatmap shares the local gust sampler, refreshes paused toggles and leaves observations unchanged',()=>{
    const {a,b}=fixture();a.setSettings({showWindField:true});
    a.CycloneWindOverlay.draw();const sustained=a.CycloneWindOverlay.cells;
    const state=JSON.stringify(a.WindImpacts.serialize(b));
    a.setSettings({windFieldGusts:true});a.CycloneWindOverlay.draw();
    const gusts=a.CycloneWindOverlay.cells;assert.notEqual(gusts,sustained);assert.ok(gusts.length>sustained.length);
    for(const c of gusts){
        assert.equal(c.gust,a.WindField.gustFromWind(b,c.wind,c.coord,c.terrain));
        assert.equal(c.value,c.gust);assert.ok(c.value>=17);
    }
    a.CycloneWindOverlay.draw();assert.equal(a.CycloneWindOverlay.cells,gusts,'unchanged frames reuse shade');
    a.setSettings({windFieldGusts:false});a.CycloneWindOverlay.draw();
    assert.ok(a.CycloneWindOverlay.cells.every(c=>c.value===c.wind));
    assert.equal(JSON.stringify(a.WindImpacts.serialize(b)),state);
});

test('gusts above tropical-storm force do not change the sustained-wind damage threshold',()=>{
    const {a,b,sys,city,grid}=fixture();sys.windSpeed=33;
    const profile=a.WindField.profile(sys,sys.storm),coord=a.WindShelter.destination(profile.coord,profile.rmw,0);
    city.coord=coord;grid.cells[0].coord=coord;
    const sample=a.WindField.sample(b,[profile],coord,0.51);
    assert.ok(sample.wind<34&&sample.gust>34);
    b.tick=1;a.WindImpacts.advance(b);
    assert.equal(sys.storm.damage,0);assert.equal(sys.storm.deaths,0);assert.equal(a.WindImpacts.cityAt(b,'test').hours,0);
});

test('0.23 settings migrate without shifting visibility or existing preferences',async()=>{
    const s=loadSimulation();
    s.evaluate(`
        waitingFor=0;waitingDescs={lowestAvailable:0,maxIndex:-1};
        const order=Settings.order().filter(k=>!['cityWindMode','windFieldGusts'].includes(k));
        globalThis.legacyValues=order.map(k=>k==='showCityWinds'?false:k==='showWindField'?true:0);
        db={settings:{get:()=>Promise.resolve(legacyValues.slice()),put:()=>Promise.resolve()}};
        simSettings=new Settings();
    `);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(s.evaluate('simSettings.cityWindMode'),2);assert.equal(s.evaluate('simSettings.windFieldGusts'),false);
    assert.equal(s.evaluate('simSettings.showCityWinds'),false);assert.equal(s.evaluate('simSettings.showWindField'),true);
});
