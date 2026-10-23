const test = require('node:test');
const assert = require('node:assert/strict');
const {loadSimulation} = require('./helpers/simulation');
const LAT = 20;
const COAST = -50;
const longitudeAt = km=>COAST-km/(111.195*Math.cos(LAT*Math.PI/180));
const close = (actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} != ${expected}`);

test('open ocean and extensive inland land coverage have the correct limits',()=>{
    const {api:a} = loadSimulation();
    const sys = a.makeSystem(a.makeBasin());
    a.setLand(()=>0);
    let state = a.LandInteraction.read(sys);
    assert.equal(state.coverage,0);
    assert.equal(state.oceanSupport,1);
    a.setLand(()=>0.52);
    state = a.LandInteraction.read(sys);
    close(state.coverage,1);
    close(state.oceanSupport,0);
    close(a.LandInteraction.pressurePotential(30,state),1010);
});

test('coverage increases before the centre crosses a coastline',()=>{
    const {api:a} = loadSimulation();
    a.setLand(c=>c.longitude>=COAST?0.52:0);
    const basin = a.makeBasin();
    const values = [250,150,75,40,20,0,-40,-250].map(distance=>
        a.LandInteraction.read(a.makeSystem(basin,longitudeAt(distance),LAT)).coverage);
    assert.equal(values[0],0);
    assert.ok(values[1]>0 && values[1]<0.03,'only weak outer-ring exposure at 150 km');
    assert.ok(values[3]>0.1 && values[3]<0.3,'substantial coverage with centre still offshore');
    close(values[5],0.5,0.03);
    for(let i=1;i<values.length;i++) assert.ok(values[i]>=values[i-1]);
});

test('a small island carries much less influence than a continental footprint',()=>{
    const {api:a} = loadSimulation();
    const sys = a.makeSystem(a.makeBasin());
    a.setLand(c=>Math.hypot((c.longitude+50)*111.195*Math.cos(LAT*Math.PI/180),(c.latitude-LAT)*111.195)<12?0.52:0);
    const island = a.LandInteraction.read(sys);
    assert.ok(island.coverage>0 && island.coverage<0.06);
    assert.ok(island.oceanSupport>0.98);
    a.setLand(()=>0.52);
    assert.ok(a.LandInteraction.read(sys).coverage>island.coverage*10);
});

test('land influence builds with exposure, updates once per hour, and eases offshore',()=>{
    const {api:a} = loadSimulation();
    a.setLand(c=>c.longitude>=COAST?0.52:0);
    const basin = a.makeBasin();
    const sys = a.makeSystem(basin,longitudeAt(250),LAT);
    assert.equal(a.LandInteraction.advance(sys).influence,0);
    a.move(sys,longitudeAt(20),LAT);
    basin.tick++;
    const first = a.LandInteraction.advance(sys);
    assert.ok(first.influence>0 && first.influence<first.coverage);
    a.LandInteraction.advance(sys);
    a.LandInteraction.read(sys);
    assert.equal(sys.landExposureHours,1,'diagnostics must not advance the clock');
    for(let i=0;i<6;i++){basin.tick++;a.LandInteraction.advance(sys);}
    assert.equal(sys.landExposureHours,7);
    assert.ok(sys.landInfluence>first.influence);
    const coastalInfluence = sys.landInfluence;
    a.move(sys,longitudeAt(250),LAT);
    basin.tick++;
    const departed = a.LandInteraction.advance(sys);
    assert.equal(departed.coverage,0);
    assert.ok(departed.influence>0 && departed.influence<coastalInfluence);
    assert.equal(sys.landExposureHours,0);
    for(let i=0;i<30;i++){basin.tick++;a.LandInteraction.advance(sys);}
    assert.equal(sys.landInfluence,0);
});

test('new inland systems initialize from their footprint without ocean-fuel immunity',()=>{
    const {api:a} = loadSimulation();
    a.setLand(()=>0.52);
    const sys = a.makeSystem(a.makeBasin());
    const state = a.LandInteraction.advance(sys);
    close(state.influence,1);
    close(state.oceanSupport,0);
    assert.equal(sys.landExposureHours,1);
});

test('nearshore physics can weaken an intense cyclone while its centre remains over water',()=>{
    const s = loadSimulation(), a=s.api;
    a.setLand(c=>c.longitude>=COAST?0.52:0);
    const run = distance=>{
        const sys = a.makeSystem(a.makeBasin(),longitudeAt(distance),LAT,{pressure:900,windSpeed:160,organization:1,depth:0.8});
        const u = a.fixedEnvironment(sys,{SST:31,moisture:0.7});
        s.context.randomSeed(123);
        a.algorithms[a.normal].core(sys,u);
        return sys;
    };
    const ocean = run(250), coast = run(10);
    assert.ok(ocean.pressure<900 && ocean.windSpeed>160);
    assert.ok(coast.pressure>900 && coast.windSpeed<160);
    assert.equal(a.readDebug(coast).onLand,false);
});

test('favorable conditions can still strengthen a storm with modest coastal overlap',()=>{
    const {api:a} = loadSimulation();
    a.setLand(c=>c.longitude>=COAST?0.52:0);
    const sys = a.makeSystem(a.makeBasin(),longitudeAt(40),LAT,{pressure:980,windSpeed:45,organization:0.8});
    const u = a.fixedEnvironment(sys,{SST:30,moisture:0.7});
    a.algorithms[a.normal].core(sys,u);
    assert.ok(sys.landInfluence>0);
    assert.ok(sys.pressure<980 && sys.windSpeed>45);
});

test('longer coastal residence produces a larger cumulative intensity effect',()=>{
    const s = loadSimulation(), a=s.api;
    a.setLand(c=>c.longitude>=COAST?0.52:0);
    const run = coastalHours=>{
        const sys=a.makeSystem(a.makeBasin(),longitudeAt(250),LAT,{pressure:900,windSpeed:160,organization:1,depth:0.8});
        const u=a.fixedEnvironment(sys,{SST:31,moisture:0.7});
        a.LandInteraction.advance(sys);
        for(let i=0;i<12;i++){
            a.move(sys,longitudeAt(i<coastalHours?10:250),LAT);
            sys.basin.tick++;
            s.context.randomSeed(123+i);
            a.algorithms[a.normal].core(sys,u);
        }
        return sys;
    };
    const brush=run(1),residence=run(12);
    assert.ok(residence.pressure>brush.pressure);
    assert.ok(residence.windSpeed<brush.windSpeed);
});

test('recovery and manual-low assistance do not bypass extensive land exposure',()=>{
    const s=loadSimulation(),a=s.api;
    a.setLand(()=>0.52);
    const run = (tc,manualHours)=>{
        const sys=a.makeSystem(a.makeBasin(),-50,LAT,{pressure:1005,windSpeed:30,organization:0.5,type:a.TROPWAVE,manualGenesisAssistHours:manualHours});
        sys.storm.TC=tc;
        sys.storm.record.push({windSpeed:90,type:a.TROP,pressure:960});
        const u=a.fixedEnvironment(sys,{SST:30,moisture:0.75});
        s.context.randomSeed(321);
        a.algorithms[a.normal].core(sys,u);
        return sys;
    };
    const ordinary=run(false,0),recovery=run(true,0),manual=run(false,36);
    close(recovery.pressure,ordinary.pressure);
    close(recovery.windSpeed,ordinary.windSpeed);
    close(recovery.organization,ordinary.organization);
    close(manual.pressure,ordinary.pressure);
    close(manual.organization,ordinary.organization);
    assert.equal(manual.manualGenesisAssistHours,35);
});

test('all simulation modes receive land exposure without non-finite intensity values',()=>{
    const {api:a}=loadSimulation();
    a.setLand(c=>c.longitude>=COAST?0.52:0);
    for(let mode=0;mode<a.modes.length;mode++){
        const sys=a.makeSystem(a.makeBasin(6,mode),longitudeAt(20),LAT);
        const u=a.fixedEnvironment(sys);
        a.algorithms[mode].core(sys,u);
        assert.ok(sys.landInteractionInitialized,a.modes[mode]);
        assert.ok(Number.isFinite(sys.pressure) && Number.isFinite(sys.windSpeed),a.modes[mode]);
        assert.ok(sys.organization>=0 && sys.organization<=1,a.modes[mode]);
    }
});

test('actual active-state serialization preserves exposure in every mode',()=>{
    const {api:a}=loadSimulation();
    a.setLand(c=>c.longitude>=COAST?0.52:0);
    for(let mode=0;mode<a.modes.length;mode++){
        const sys=a.makeSystem(a.makeBasin(6,mode),longitudeAt(20),LAT);
        a.LandInteraction.advance(sys);
        const saved=JSON.parse(JSON.stringify(sys.save()));
        const loaded=new a.ActiveSystem(sys.basin,new a.LoadData(a.SAVE_FORMAT,saved));
        close(loaded.landInfluence,sys.landInfluence);
        assert.equal(loaded.landExposureHours,1);
        assert.equal(loaded.landInteractionInitialized,1);
    }
});

test('pre-feature saves initialize safely from their current position',()=>{
    const {api:a}=loadSimulation();
    a.setLand(()=>0.52);
    const sys=a.makeSystem(a.makeBasin());
    const saved=JSON.parse(JSON.stringify(sys.save()));
    for(const key of ['landInfluence','landExposureHours','landInteractionInitialized']) delete saved[key];
    const loaded=new a.ActiveSystem(sys.basin,new a.LoadData(a.SAVE_FORMAT,saved));
    close(a.LandInteraction.advance(loaded).influence,1);
});

test('spherical sampling wraps the dateline and supports southern basins',()=>{
    const {api:a}=loadSimulation();
    let wrapped=false;
    a.setLand(c=>{
        assert.ok(c.longitude>=-180 && c.longitude<180);
        if(c.longitude<-179.5)wrapped=true;
        return c.longitude<-179.5?0.52:0;
    });
    const dateline=a.makeSystem(a.makeBasin(8),179.9,20);
    assert.ok(a.LandInteraction.read(dateline).coverage>0);
    assert.ok(wrapped);
    a.setLand(c=>c.longitude>=110?0.52:0);
    const southern=a.makeSystem(a.makeBasin(10),110,-20);
    close(a.LandInteraction.read(southern).coverage,0.5,0.03);
});

test('synthetic map edges do not repeat clamped terrain outside the sector',()=>{
    const {api:a}=loadSimulation();
    let queries=0;
    a.setLand(c=>{
        queries++;
        assert.ok(c.longitude>=-102.67 && c.longitude<=3);
        assert.ok(c.latitude>=0 && c.latitude<=59.45);
        return 0;
    });
    const sys=a.makeSystem(a.makeBasin(0),-102.66,59.44);
    assert.equal(a.LandInteraction.read(sys).coverage,0);
    assert.ok(queries>0 && queries<145);
});

test('diagnostics are read-only and reuse bounded per-tick sampling',()=>{
    const {api:a}=loadSimulation();
    let calls=0;
    a.setLand(()=>{calls++;return 0;});
    const sys=a.makeSystem(a.makeBasin());
    a.LandInteraction.read(sys);
    assert.equal(calls,145);
    for(let i=0;i<100;i++) a.LandInteraction.read(sys);
    assert.equal(calls,145);
    assert.equal(sys.landInteractionInitialized,0);
    assert.equal(sys.landExposureHours,0);
    sys.basin.tick++;
    a.LandInteraction.read(sys);
    assert.equal(calls,290);
});
