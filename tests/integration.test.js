const test = require('node:test');
const assert = require('node:assert/strict');
const {loadSimulation} = require('./helpers/simulation');

test('the actual hourly update loop advances land exposure once per simulated hour',()=>{
    const s=loadSimulation(),a=s.api;
    a.setLand(c=>c.longitude>=-50?0.52:0);
    const basin=a.makeBasin(),sys=a.makeSystem(basin,-50.1,20);
    a.fixedEnvironment(sys);
    basin.env.wobble=()=>{};
    basin.env.record=()=>{};
    basin.naturalSpawningEnabled=false;
    basin.activeSystems.push(sys);
    s.context.testBasin=basin;
    s.evaluate('viewTick=testBasin.tick;');
    for(let i=0;i<12;i++) basin.advanceSimOneStep();
    assert.equal(basin.tick,13);
    assert.equal(sys.landExposureHours,12);
    assert.ok(Number.isFinite(sys.pressure) && Number.isFinite(sys.windSpeed));
});

test('UI initialization displays the current build with the correct historical release dates',()=>{
    const s=loadSimulation();
    s.evaluate('defineColors(); UI.init();');
    assert.equal(s.context.RAPTOR_MOD_BUILD,'0.24.0');
    const releases=s.context.RAPTOR_MOD_CHANGELOG;
    assert.equal(releases[0].build,'0.24.0');
    assert.equal(releases[0].date,'25 Oct 2026');
    assert.equal(releases.find(r=>r.build==='0.23.0').date,'25 Oct 2026');
    assert.equal(releases.find(r=>r.build==='0.22.0').date,'25 Oct 2026');
    assert.equal(releases.find(r=>r.build==='0.21.1').date,'25 Oct 2026');
    assert.equal(releases.find(r=>r.build==='0.21.0').date,'25 Oct 2026');
    assert.equal(releases.find(r=>r.build==='0.20.0').date,'25 Oct 2026');
    assert.equal(releases.find(r=>r.build==='0.19.0').date,'24 Oct 2026');
    assert.equal(releases.find(r=>r.build==='0.18.1').date,'24 Oct 2026');
    assert.equal(releases.find(r=>r.build==='0.18.0').date,'23 Oct 2026');
    for(const version of ['0.17.0','0.17.1','0.17.2','0.17.3'])
        assert.equal(releases.find(r=>r.build===version).date,'9 Sep 2026');
    assert.equal(releases.filter(r=>r.build==='0.18.0').length,1);
});

test('selected-storm debug shows land diagnostics within the existing panel',()=>{
    const s=loadSimulation(),a=s.api;
    a.setLand(c=>c.longitude>=-50?0.52:0);
    const sys=a.makeSystem(a.makeBasin(),-50.1,20);
    a.fixedEnvironment(sys);
    a.LandInteraction.advance(sys);
    s.context.testSystem=sys;
    s.evaluate(`
        defineColors(); UI.init();
        selectedStorm=testSystem.storm;
        selectedStorm.getFullNameByTick=function(){return 'Coastal test';};
        UI.viewBasin=testSystem.basin;
        viewTick=testSystem.basin.tick;
        simSettings.stormDebugMode=true;
        const panel=primaryWrapper.children.find(u=>u.renderFunc && u.renderFunc.toString().includes('Inner / middle / outer'));
        drawCalls.length=0;
        panel.renderFunc.call(panel,panel.schematics());
    `);
    const calls=s.context.drawCalls;
    for(const label of ['Land coverage / influence','Inner / middle / outer','Land exposure','Ocean / land potential'])
        assert.ok(calls.some(call=>call.value===label),label);
    for(const call of calls){
        assert.ok(Number.isFinite(call.x) && Number.isFinite(call.y),call.value);
        assert.ok(call.y>=0 && call.y+call.size<=464,`vertical overflow: ${call.value}`);
        const width=call.value.length*call.size*0.6;
        const left=call.align==='right'?call.x-width:call.x;
        const right=call.align==='right'?call.x:call.x+width;
        assert.ok(left>=0 && right<=635,`horizontal overflow: ${call.value}`);
    }
    assert.equal(sys.landExposureHours,1,'drawing must not advance the exposure timer');
});
