const test=require('node:test');
const assert=require('node:assert/strict');
const {loadSimulation}=require('./helpers/simulation');

test('representative Earth cities retain real locations, spacing and unique IDs',()=>{
    const s=loadSimulation(),a=s.api;a.setLand(()=>0.51);
    const b=a.makeBasin(8),cities=a.CityLocations.context(b).cities;
    assert.ok(cities.length>20 && cities.length<=85);
    assert.equal(new Set(cities.map(c=>c.id)).size,cities.length);
    const tokyo=cities.find(c=>c.name==='Tokyo');assert.ok(tokyo);
    assert.ok(Math.abs(tokyo.coord.longitude-139.75)<0.1 && Math.abs(tokyo.coord.latitude-35.68)<0.1);
    for(const c of cities){assert.ok(c.x>=0 && c.x<960 && c.y>=30 && c.y<510);}
});

test('synthetic maps place unnamed settlements on their own land',()=>{
    const s=loadSimulation(),a=s.api;a.setLand(c=>c.longitude>-60?0.51:0);
    const cities=a.CityLocations.context(a.makeBasin(0)).cities;
    assert.ok(cities.length>0);
    for(const c of cities){assert.ok(c.coord.longitude>-60);assert.ok(c.name.startsWith('Settlement '));}
});

test('China labels are substantially sparser without removing exposure cities or other countries',()=>{
    const s=loadSimulation(),a=s.api;a.setLand(()=>0.51);
    const b=a.makeBasin(8),context=a.CityLocations.context(b);
    const before=context.cities.map(c=>c.id),china=s.evaluate('CITY_CHINA_IDS');
    const visible=a.CityLocations.visibleCities(b);
    const dense=context.cities.filter(c=>china.has(c.id)),sparse=visible.filter(c=>china.has(c.id));
    assert.ok(dense.length>30);
    assert.ok(sparse.length<=dense.length/2,`${sparse.length} visible of ${dense.length}`);
    for(let i=0;i<sparse.length;i++)for(let j=0;j<i;j++)
        assert.ok(Math.hypot(sparse[i].x-sparse[j].x,sparse[i].y-sparse[j].y)>=36);
    assert.ok(visible.some(c=>c.name==='Shanghai'));
    assert.ok(visible.some(c=>c.name==='Beijing'));
    assert.ok(visible.some(c=>c.name==='Guangzhou'));
    for(const city of context.cities.filter(c=>!china.has(c.id)))assert.ok(visible.includes(city));
    assert.deepEqual(context.cities.map(c=>c.id),before);
    assert.equal(a.CityLocations.context(b),context);
});

test('cities show ordinary background winds without cyclones and drawing cannot create impacts',()=>{
    const s=loadSimulation(),a=s.api;a.setLand(()=>0.51);
    const b=a.makeBasin(8);s.context.noiseSeed(b.seed);
    b.env=new a.Environment(b);b.env.init();b.windImpacts=a.WindImpacts.create(b.tick);
    s.context.testBasin=b;
    s.evaluate('defineColors();UI.init();UI.viewBasin=testBasin;viewTick=testBasin.tick;land.drawn=true;drawCalls.length=0;');
    const before=JSON.stringify(b.windImpacts);
    a.CityOverlay.drawCities();
    const cities=a.CityLocations.visibleCities(b),labels=a.CityOverlay.labels;
    assert.equal(labels.length,cities.length);
    assert.ok(labels.every(l=>l.wind>0 && /^\d+$/.test(l.text)));
    assert.equal(s.context.drawCalls.filter(c=>/^\d+$/.test(c.value)).length,cities.length);
    assert.ok(!s.context.drawCalls.some(c=>cities.some(city=>city.name===c.value)),'names are not map labels');
    a.CityOverlay.drawCities();assert.equal(JSON.stringify(b.windImpacts),before);
    for(const label of labels){assert.ok(label.x>=0 && label.x+label.width<=960);assert.ok(label.y>=30 && label.y+label.height<=510);}
});

test('wind numbers follow the selected unit and labels remain selectable',()=>{
    const s=loadSimulation(),a=s.api;
    a.setSettings({speedUnit:2});assert.equal(a.CityOverlay.number(100),185);assert.equal(a.CityOverlay.unitName(),'km/h');
    a.setSettings({speedUnit:1});assert.equal(a.CityOverlay.number(100),115);
    a.setLand(()=>0.51);const b=a.makeBasin(8);s.context.testBasin=b;
    s.evaluate('defineColors();UI.init();UI.viewBasin=testBasin;viewTick=testBasin.tick;land.drawn=true;');
    a.CityOverlay.drawCities();const label=a.CityOverlay.labels[0];
    assert.equal(a.CityOverlay.pick(label.x+2,label.y+2).id,label.city.id);
});

test('historical city labels use recorded hourly observations after tracking began',()=>{
    const s=loadSimulation(),a=s.api;a.setLand(()=>0.51);
    const b=a.makeBasin(8);b.tick=2;b.windImpacts=a.WindImpacts.create(0);
    const city=a.CityLocations.context(b).cities[0];
    b.windImpacts.cities[city.id]={peakWind:80,hours:1,damage:10,deaths:0,lastWind:0,
        records:[[1,80,80,1,10,0],[2,0,80,1,10,0]]};
    s.context.testBasin=b;s.evaluate('defineColors();UI.init();UI.viewBasin=testBasin;viewTick=1;land.drawn=true;');
    a.CityOverlay.drawCities();assert.equal(a.CityOverlay.labels.find(l=>l.city.id===city.id).wind,80);
    s.evaluate('viewTick=2;');a.CityOverlay.drawCities();
    assert.equal(a.CityOverlay.labels.find(l=>l.city.id===city.id).wind,0);
});

test('Human Risk uses exactly the same land-cell winds as the impact engine',()=>{
    const s=loadSimulation(),a=s.api,b=a.makeBasin(8);a.setLand(()=>0.51);
    b.activeSystems.push(a.makeSystem(b,140,35,{windSize:1,windSpeed:200}));
    s.context.testBasin=b;s.evaluate('defineColors();UI.init();UI.viewBasin=testBasin;viewTick=testBasin.tick;land.drawn=true;');
    s.context.__raptorHumanRiskOverlay.rebuild();
    const profiles=a.WindField.profiles(b),grid=a.CityLocations.context(b);
    const cell=grid.cells.find(c=>s.context.__raptorHumanRiskOverlay.getCellRisk(c.x,c.y));assert.ok(cell);
    const local=a.WindField.strongest(profiles,cell.coord,cell.terrain).wind;
    const hazard=Math.max(0,Math.min(1,(local-25)/130));
    const expected=hazard**1.3*cell.exposure**0.62;
    assert.ok(Math.abs(s.context.__raptorHumanRiskOverlay.getCellRisk(cell.x,cell.y).risk-expected)<1e-12);
    assert.equal(b.activeSystems[0].storm.damage,0,'drawing risk is not an impact update');
});
