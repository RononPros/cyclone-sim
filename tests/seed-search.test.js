const test=require('node:test');
const assert=require('node:assert/strict');
const {scanSeeds,finalists}=require('../scripts/find-hot-seeds');
const {loadSimulation}=require('./helpers/simulation');
const grid=require('../scripts/data/wpac-ocean-grid.json');

test('the first-year scanner matches full environment evolution at its reported peaks',()=>{
    const [row]=scanSeeds([12345],2190,2026);
    const s=loadSimulation(),a=s.api;
    s.context.noiseSeed(12345);
    const basin=a.makeBasin(8,a.normal,12345);
    basin.tick=0;basin.env=new a.Environment(basin);basin.env.init();
    const peaks=[row.peak,row.tropicalPeak];
    for(let hour=0;hour<8760;hour++){
        basin.tick=hour;
        if(hour)basin.env.wobble();
        for(const p of peaks){
            assert.ok(p.hour>=0 && p.hour<8760);
            if(p.hour!==hour)continue;
            assert.ok(Math.abs(basin.env.get('SSTAnomaly',p.x,p.y,hour)-p.anomaly)<1e-9);
            assert.ok(Math.abs(basin.env.get('SST',p.x,p.y,hour)-p.SST)<1e-9);
            assert.ok(p.dateUTC.startsWith('2026-'));
        }
    }
    assert.ok(row.tropicalPeak.latitude>=5 && row.tropicalPeak.latitude<=30);
});

test('a leap-year scan stops before the second year begins',()=>{
    const [row]=scanSeeds([1],10000,2028);
    for(const p of [row.peak,row.tropicalPeak]){
        assert.ok(p.hour===0 || p.hour===8783);
        assert.ok(p.dateUTC.startsWith('2028-'));
    }
});

test('the ocean grid is unique and aligned with actual display cell centres',()=>{
    assert.equal(grid.mapType,8);
    assert.equal(new Set(grid.points.map(p=>p.join(','))).size,grid.points.length);
    for(const [x,y] of grid.points){
        assert.ok(x>=10 && x<960 && y>=10 && y<540);
        assert.equal((x-10)%20,0);assert.equal((y-10)%20,0);
    }
});

test('candidate refinement retains both overall and tropical contenders without duplicates',()=>{
    const rows=[{seed:1,peak:{anomaly:10},tropicalPeak:{anomaly:1}},
        {seed:2,peak:{anomaly:5},tropicalPeak:{anomaly:9}},
        {seed:3,peak:{anomaly:1},tropicalPeak:{anomaly:1}}];
    assert.deepEqual(finalists(rows,1),[1,2]);
});
