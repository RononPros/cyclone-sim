const test=require('node:test');
const assert=require('node:assert/strict');
const {loadSimulation}=require('./helpers/simulation');

function fixture(){
    const s=loadSimulation(),a=s.api,b=a.makeBasin(8);
    a.setLand(()=>0.51);b.windImpacts=a.WindImpacts.create(0);
    b.mainSubBasin=0;b.forSubBasinChain=()=>[0];
    s.context.testBasin=b;
    s.evaluate('defineColors();UI.init();UI.viewBasin=testBasin;viewTick=testBasin.tick;land.drawn=true;');
    return {s,a,b};
}

test('hiding cities clears labels, clicks and the card while impacts continue',()=>{
    const {a,b}=fixture();
    b.activeSystems.push(a.makeSystem(b,139.75,35.68,{windSize:1,windSpeed:200}));
    a.CityOverlay.drawCities();const label=a.CityOverlay.labels.find(l=>l.city.name==='Tokyo');
    assert.ok(label);assert.equal(a.CityOverlay.pick(label.x+1,label.y+1).id,label.city.id);
    a.CityOverlay.card.show();a.setSettings({showCityWinds:false});
    a.CityOverlay.drawCities();
    assert.equal(a.CityOverlay.labels.length,0);
    assert.equal(a.CityOverlay.pick(label.x+1,label.y+1),null);
    assert.equal(a.CityOverlay.card.showing,false);
    a.WindImpacts.advance(b);
    assert.ok(b.activeSystems[0].storm.damage>0);
    assert.ok(a.WindImpacts.cityAt(b,label.city.id).wind>0);
    a.setSettings({showCityWinds:true});a.CityOverlay.drawCities();
    assert.ok(a.CityOverlay.labels.some(l=>l.city.id===label.city.id));
});

test('the optional heatmap uses shared local winds and refreshes paused edits without recording impacts',()=>{
    const {s,a,b}=fixture();
    b.activeSystems.push(a.makeSystem(b,139.75,35.68,{windSize:1,windSpeed:150}));
    const state=JSON.stringify(a.WindImpacts.serialize(b));
    a.CycloneWindOverlay.draw();assert.equal(a.CycloneWindOverlay.cells.length,0);
    a.setSettings({showWindField:true});a.CycloneWindOverlay.draw();
    const first=a.CycloneWindOverlay.cells,profiles=a.WindField.profiles(b);
    assert.ok(first.length>100);
    for(const cell of first){
        assert.equal(cell.wind,a.WindField.strongest(profiles,cell.coord,cell.terrain).wind);
        assert.ok(cell.wind>=17);
    }
    a.CycloneWindOverlay.draw();assert.equal(a.CycloneWindOverlay.cells,first,'unchanged frames reuse the buffer');
    b.activeSystems[0].windSpeed=50;a.CycloneWindOverlay.draw();
    assert.ok(a.CycloneWindOverlay.cells.length<first.length);
    b.activeSystems[0].kill=true;a.CycloneWindOverlay.draw();
    assert.equal(a.CycloneWindOverlay.cells.length,0,'paused storm deletion clears the heatmap');
    assert.equal(JSON.stringify(a.WindImpacts.serialize(b)),state);
    assert.equal(b.activeSystems[0].storm.damage,0);
    s.context.drawCalls.length=0;a.setSettings({showWindField:false});a.CycloneWindOverlay.draw();
    assert.equal(s.context.drawCalls.length,0);
});

test('new visibility settings migrate older settings and persist independently',async()=>{
    const s=loadSimulation();
    s.evaluate(`
        waitingFor=0;waitingDescs={lowestAvailable:0,maxIndex:-1};
        globalThis.savedSettings=null;
        globalThis.oldOrder=Settings.order().filter(k=>!['cityWindMode','windFieldGusts','showCityWinds','showWindField'].includes(k));
        globalThis.oldValues=oldOrder.map((k,i)=>i+10);
        db={settings:{get:()=>Promise.resolve(oldValues.slice()),put:value=>{
            savedSettings=value.slice();return Promise.resolve();
        }}};
        simSettings=new Settings();
    `);
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(s.evaluate('simSettings.showCityWinds'),true);
    assert.equal(s.evaluate('simSettings.showWindField'),false);
    assert.equal(s.evaluate('simSettings.cityWindMode'),2);
    assert.equal(s.evaluate('simSettings.windFieldGusts'),false);
    assert.equal(s.evaluate('oldOrder.every((k,i)=>simSettings[k]===oldValues[i])'),true);
    s.evaluate('simSettings.setShowCityWinds(false);simSettings.setShowWindField(true);simSettings.setCityWindMode(1);simSettings.setWindFieldGusts(true);db.settings.get=()=>Promise.resolve(savedSettings.slice());simSettings=new Settings();');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(s.evaluate('simSettings.showCityWinds'),false);
    assert.equal(s.evaluate('simSettings.showWindField'),true);
    assert.equal(s.evaluate('simSettings.cityWindMode'),1);
    assert.equal(s.evaluate('simSettings.windFieldGusts'),true);
    assert.equal(s.evaluate('oldOrder.every((k,i)=>simSettings[k]===oldValues[i])'),true);
});

test('heatmap resolves the core more finely, shows extreme bands, and refreshes a paused motion change',()=>{
    const {a,b}=fixture();
    const sys=a.makeSystem(b,139.75,30,{windSize:1,windSpeed:250,windMotionEast:-25,windMotionNorth:0});
    b.activeSystems.push(sys);a.setSettings({showWindField:true});a.CycloneWindOverlay.draw();
    const first=a.CycloneWindOverlay.cells;
    assert.ok(first.some(c=>c.width===1 && c.height===1),'one-pixel cells resolve the eyewall');
    assert.ok(first.some(c=>c.width===8),'distant wind keeps the coarser display grid');
    assert.ok(first.every(c=>c.x-c.width/2>=0 && c.x+c.width/2<=960 && c.y-c.height/2>=0 && c.y+c.height/2<=540));
    assert.ok(first.some(c=>a.CycloneWindOverlay.bandFor(c.wind).minimum>=210),'extreme winds get a distinct high band');
    sys.windMotionEast=25;a.CycloneWindOverlay.draw();
    assert.notEqual(a.CycloneWindOverlay.cells,first,'heading changes invalidate the cached shade');
    assert.notEqual(a.CycloneWindOverlay.bandFor(180),a.CycloneWindOverlay.bandFor(220));
});
