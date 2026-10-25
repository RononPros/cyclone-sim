// Once-per-hour, land-cell wind exposure. Each cell is attributed to its strongest
// local storm, and city-area results are allocations of the same impact totals.
const WindImpacts = (()=>{
    const money=value=>Math.round(value*100)/100;
    const nonnegative=value=>Number.isFinite(value)?Math.max(0,value):0;
    const create=(tick=0)=>({version:1,startTick:tick,lastTick:tick,cells:Object.create(null),cities:Object.create(null)});
    function normalize(value,tick){
        if(!value || value.version!==1)return create(tick);
        const data=create(Math.min(tick,nonnegative(value.startTick)));
        data.lastTick=Math.min(tick,Math.max(data.startTick,nonnegative(value.lastTick)));
        for(const [key,c] of Object.entries(value.cells||{}))if(c && /^\d+,\d+$/.test(key))
            data.cells[key]={damage:nonnegative(c.damage),fatalities:nonnegative(c.fatalities)};
        for(const [id,c] of Object.entries(value.cities||{}))if(c){
            const records=new Map();
            for(const row of Array.isArray(c.records)?c.records:[])
                if(Array.isArray(row) && row.length===6 && row.every(Number.isFinite) && row[0]>=data.startTick && row[0]<=tick)
                    records.set(row[0],row.map(nonnegative));
            data.cities[id]={peakWind:nonnegative(c.peakWind),hours:nonnegative(c.hours),damage:nonnegative(c.damage),
                deaths:Math.floor(nonnegative(c.deaths)),lastWind:nonnegative(c.lastWind),
                records:Array.from(records.values()).sort((a,b)=>a[0]-b[0])};
        }
        return data;
    }
    const cityState=(data,id)=>data.cities[id] || (data.cities[id]={peakWind:0,hours:0,damage:0,deaths:0,lastWind:0,records:[]});
    function loss(cell,old,wind){
        if(wind<34 || !cell.population)return {damage:0,deaths:0,fatalities:old.fatalities};
        const bounded=Math.min(wind,400);
        const damageRate=Math.min(0.12,0.0005*Math.pow(Math.max(0,(bounded-25)/35),3));
        const deathRate=Math.min(0.001,0.0000002*Math.pow(Math.max(0,(bounded-50)/35),3));
        const damage=money(Math.max(0,cell.assets-old.damage)*damageRate);
        const previousFatalities=Math.min(cell.population,old.fatalities);
        const fatalities=Math.min(cell.population,previousFatalities+Math.max(0,cell.population-previousFatalities)*deathRate);
        return {damage,deaths:Math.max(0,Math.floor(fatalities)-Math.floor(previousFatalities)),fatalities};
    }
    function credit(basin,storm,cell,damage,deaths){
        if(!damage && !deaths)return;
        storm.damage=money(storm.damage+damage);storm.deaths+=deaths;
        const season=basin.fetchSeason(-1,true,true);
        for(const sub of new Set(basin.forSubBasinChain(cell.sub)))if(basin.subInBasin(sub)){
            const stats=season.stats(sub);stats.damage=money(stats.damage+damage);stats.deaths+=deaths;
        }
        season.modified=true;
        const origin=basin.fetchSeason(storm.originSeason());if(origin)origin.modified=true;
    }
    function advance(basin){
        if(!basin.windImpacts)basin.windImpacts=create(Math.max(0,basin.tick-1));
        const data=basin.windImpacts;
        if(basin.tick<=data.lastTick)return;
        const grid=CityLocations.context(basin),profiles=WindField.profiles(basin);
        const changed=new Set();
        for(const city of grid.cities){
            const c=cityState(data,city.id),before=JSON.stringify([c.lastWind,c.peakWind,c.hours]);
            const localWind=WindField.sample(basin,profiles,city.coord,city.terrain).wind;
            c.lastWind=Math.round(localWind*10)/10;
            c.peakWind=Math.max(c.peakWind,c.lastWind);
            if(localWind>=34)c.hours++;
            if(before!==JSON.stringify([c.lastWind,c.peakWind,c.hours]))changed.add(city.id);
        }
        for(const cell of grid.cells){
            if(!basin.subInBasin(cell.sub))continue;
            const sample=WindField.strongest(profiles,cell.coord,cell.terrain);
            if(sample.wind<34 || !sample.source)continue;
            const old=data.cells[cell.key] || {damage:0,fatalities:0};
            const delta=loss(cell,old,sample.wind);
            data.cells[cell.key]={damage:money(old.damage+delta.damage),fatalities:delta.fatalities};
            credit(basin,sample.source.storm,cell,delta.damage,delta.deaths);
            if(cell.cityId && (delta.damage || delta.deaths)){
                const c=cityState(data,cell.cityId);c.damage=money(c.damage+delta.damage);c.deaths+=delta.deaths;
                changed.add(cell.cityId);
            }
        }
        for(const id of changed){
            const c=data.cities[id];c.records.push([basin.tick,c.lastWind,c.peakWind,c.hours,c.damage,c.deaths]);
        }
        data.lastTick=basin.tick;
    }
    function cityAt(basin,id,tick=basin.tick){
        const data=basin.windImpacts;
        if(!data || tick<data.startTick)return null;
        const c=data.cities[id];
        if(!c)return {wind:0,peakWind:0,hours:0,damage:0,deaths:0};
        if(tick===basin.tick)return {wind:c.lastWind,peakWind:c.peakWind,hours:c.hours,damage:c.damage,deaths:c.deaths};
        let low=0,high=c.records.length;
        while(low<high){const middle=(low+high)>>>1;if(c.records[middle][0]<=tick)low=middle+1;else high=middle;}
        const row=low?c.records[low-1]:[0,0,0,0,0,0];
        return {wind:row[1],peakWind:row[2],hours:row[3],damage:row[4],deaths:row[5]};
    }
    return {create,normalize,advance,loss,cityAt,serialize:basin=>normalize(basin.windImpacts,basin.tick)};
})();
